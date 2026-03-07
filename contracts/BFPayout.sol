// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title BFPayout
 * @notice Whack-a-Butterfly prize claim contract.
 *
 * Flow:
 *   1. Game server signs a claim: (player, bfGross, nonce, expiry)
 *   2. Player calls claimPrize() on-chain — pays their own gas
 *   3. Contract splits automatically:
 *        94.5% → player
 *         4.5% → potWallet  (weekly pot, 0x...88e0)
 *         1.0% → burnWallet (burn address, currently 0x5c29...530F → future: dead address)
 *
 * The vault (PRIZE_WALLET / 0x...92Df) must approve this contract once:
 *   BF.approve(address(BFPayout), type(uint256).max)
 *
 * Wallets:
 *   player     (0x...1cDe) — receives 94.5%
 *   prize/vault (0x...92Df) — holds BF tokens, source of all transfers
 *   pot        (0x...88e0) — receives 4.5%, paid out weekly
 *   burn       (0x5c29...530F) — receives 1%, future burn address
 *
 * Split in basis points (BPS = 10000):
 *   PLAYER_BPS = 9450  (94.5%)
 *   POT_BPS    =  450  ( 4.5%)
 *   BURN_BPS   =  100  ( 1.0%)
 *   Total      = 10000 (100%)
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract BFPayout {

    // ── Constants ────────────────────────────────────────────────────────────

    uint256 public constant BPS        = 10000;
    uint256 public constant PLAYER_BPS = 9450;  // 94.5%
    uint256 public constant POT_BPS    =  450;  //  4.5%
    uint256 public constant BURN_BPS   =  100;  //  1.0%

    // ── State ────────────────────────────────────────────────────────────────

    address public owner;
    address public signer;      // server-side signing key (PAYOUT_SIGNER_KEY) — no funds needed
    address public vault;       // PRIZE_WALLET (0x...92Df) — holds BF, must approve this contract
    address public potWallet;   // POT_WALLET   (0x...88e0) — receives 4.5%, weekly payout
    address public burnWallet;  // BURN_WALLET  (0x5c29...530F) — receives 1%, future burn

    IERC20 public bfToken;
    bool   public paused;

    mapping(bytes32 => bool) public usedNonces;

    // ── Events ───────────────────────────────────────────────────────────────

    event PrizeClaimed(
        address indexed player,
        uint256 playerAmount,
        uint256 potAmount,
        uint256 burnAmount,
        bytes32 nonce
    );
    event SignerUpdated(address indexed oldSigner,  address indexed newSigner);
    event VaultUpdated(address indexed oldVault,    address indexed newVault);
    event PotWalletUpdated(address indexed oldPot,  address indexed newPot);
    event BurnWalletUpdated(address indexed oldBurn, address indexed newBurn);
    event Paused(bool paused);
    event EmergencyWithdraw(address indexed to, uint256 amount);

    // ── Errors ───────────────────────────────────────────────────────────────

    error NotOwner();
    error InvalidSignature();
    error NonceUsed();
    error ClaimExpired();
    error ZeroAmount();
    error ContractPaused();
    error InsufficientVaultBalance();
    error TransferFailed();

    // ── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param _bfToken    BF token address
     * @param _vault      PRIZE_WALLET (0x...92Df) — source of BF
     * @param _potWallet  POT_WALLET   (0x...88e0) — weekly pot
     * @param _burnWallet BURN_WALLET  (0x5c29...530F) — burn destination
     * @param _signer     Server-side signing key public address
     */
    constructor(
        address _bfToken,
        address _vault,
        address _potWallet,
        address _burnWallet,
        address _signer
    ) {
        owner      = msg.sender;
        bfToken    = IERC20(_bfToken);
        vault      = _vault;
        potWallet  = _potWallet;
        burnWallet = _burnWallet;
        signer     = _signer;
    }

    // ── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    // ── Core: claim prize ────────────────────────────────────────────────────

    /**
     * @notice Claim a BF prize. Splits 94.5% / 4.5% / 1% automatically.
     * @param player     Recipient — must be msg.sender
     * @param bfGross    Total BF before split (18 decimals)
     * @param nonce      Unique claim ID (server-generated, e.g. keccak of gameId)
     * @param expiry     Unix timestamp — claim invalid after this (suggest: now + 10 min)
     * @param signature  ECDSA signature from the trusted signer
     */
    function claimPrize(
        address player,
        uint256 bfGross,
        bytes32 nonce,
        uint256 expiry,
        bytes calldata signature
    ) external whenNotPaused {
        if (bfGross == 0)             revert ZeroAmount();
        if (block.timestamp > expiry) revert ClaimExpired();
        if (usedNonces[nonce])        revert NonceUsed();
        if (msg.sender != player)     revert InvalidSignature();

        // Verify server signature
        bytes32 hash      = _buildHash(player, bfGross, nonce, expiry);
        address recovered = _recover(hash, signature);
        if (recovered != signer)      revert InvalidSignature();

        // Calculate split
        uint256 potAmount    = (bfGross * POT_BPS)  / BPS;  //  4.5%
        uint256 burnAmount   = (bfGross * BURN_BPS) / BPS;  //  1.0%
        uint256 playerAmount = bfGross - potAmount - burnAmount; // 94.5%

        // Check vault balance covers full gross
        if (bfToken.balanceOf(vault) < bfGross) revert InsufficientVaultBalance();

        // Mark nonce used BEFORE transfers (re-entrancy safety)
        usedNonces[nonce] = true;

        // Transfer 94.5% → player
        if (!bfToken.transferFrom(vault, player, playerAmount))    revert TransferFailed();
        // Transfer  4.5% → pot
        if (!bfToken.transferFrom(vault, potWallet, potAmount))    revert TransferFailed();
        // Transfer  1.0% → burn
        if (!bfToken.transferFrom(vault, burnWallet, burnAmount))  revert TransferFailed();

        emit PrizeClaimed(player, playerAmount, potAmount, burnAmount, nonce);
    }

    // ── View: validate before submitting ────────────────────────────────────

    function isClaimValid(
        address player,
        uint256 bfGross,
        bytes32 nonce,
        uint256 expiry,
        bytes calldata signature
    ) external view returns (bool valid, string memory reason) {
        if (paused)                                  return (false, "paused");
        if (bfGross == 0)                            return (false, "zero amount");
        if (block.timestamp > expiry)                return (false, "expired");
        if (usedNonces[nonce])                       return (false, "nonce used");
        if (bfToken.balanceOf(vault) < bfGross)      return (false, "insufficient vault balance");
        bytes32 hash      = _buildHash(player, bfGross, nonce, expiry);
        address recovered = _recover(hash, signature);
        if (recovered != signer)                     return (false, "invalid signature");
        return (true, "ok");
    }

    // ── View: split preview ──────────────────────────────────────────────────

    function previewSplit(uint256 bfGross) external pure returns (
        uint256 playerAmount,
        uint256 potAmount,
        uint256 burnAmount
    ) {
        potAmount    = (bfGross * POT_BPS)  / BPS;
        burnAmount   = (bfGross * BURN_BPS) / BPS;
        playerAmount = bfGross - potAmount - burnAmount;
    }

    // ── Admin ────────────────────────────────────────────────────────────────

    function setSigner(address _signer) external onlyOwner {
        emit SignerUpdated(signer, _signer);
        signer = _signer;
    }

    function setVault(address _vault) external onlyOwner {
        emit VaultUpdated(vault, _vault);
        vault = _vault;
    }

    function setPotWallet(address _pot) external onlyOwner {
        emit PotWalletUpdated(potWallet, _pot);
        potWallet = _pot;
    }

    /// @notice Update burn address — use when switching to actual burn address
    function setBurnWallet(address _burn) external onlyOwner {
        emit BurnWalletUpdated(burnWallet, _burn);
        burnWallet = _burn;
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    /// @notice Emergency: pull BF held directly by this contract (not the vault)
    function emergencyWithdraw(address to, uint256 amount) external onlyOwner {
        if (!bfToken.transfer(to, amount)) revert TransferFailed();
        emit EmergencyWithdraw(to, amount);
    }

    // ── Internal: EIP-191 hash ───────────────────────────────────────────────

    function _buildHash(
        address player,
        uint256 bfGross,
        bytes32 nonce,
        uint256 expiry
    ) internal view returns (bytes32) {
        bytes32 raw = keccak256(abi.encodePacked(
            block.chainid,  // anti cross-chain replay
            address(this),  // anti cross-contract replay
            player,
            bfGross,
            nonce,
            expiry
        ));
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", raw));
    }

    function _recover(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8   v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        return ecrecover(hash, v, r, s);
    }
}
