// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title BFPayout
 * @notice Whack-a-Butterfly prize claim contract.
 *
 * Flow:
 *   1. Game server signs a claim: (player, bfGross, nonce, expiry)
 *      where bfGross = full prize BEFORE the 5% pot split
 *   2. Player calls claimPrize() on-chain — pays their own gas
 *   3. Contract splits automatically:
 *        95% → player
 *         5% → potWallet
 *
 * The vault (PRIZE_WALLET / 0xFd...92Df) must approve this contract:
 *   BF.approve(address(BFPayout), type(uint256).max)  ← one-time setup
 *
 * Wallets:
 *   player  (0x...1cDe) — receives 95% of prize
 *   prize   (0x...92Df) — vault holding BF tokens
 *   pot     (0x...88e0) — receives 5%, paid out weekly
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract BFPayout {

    // ── Constants ────────────────────────────────────────────────────────────

    uint256 public constant POT_BPS = 500;   // 5% in basis points
    uint256 public constant BPS     = 10000;

    // ── State ────────────────────────────────────────────────────────────────

    address public owner;
    address public signer;      // server-side signing key (PAYOUT_SIGNER_KEY)
    address public vault;       // PRIZE_WALLET (0x...92Df) — holds BF
    address public potWallet;   // POT_WALLET   (0x...88e0) — receives 5%
    IERC20  public bfToken;

    bool public paused;

    mapping(bytes32 => bool) public usedNonces;

    // ── Events ───────────────────────────────────────────────────────────────

    event PrizeClaimed(
        address indexed player,
        uint256 playerAmount,
        uint256 potAmount,
        bytes32 nonce
    );
    event SignerUpdated(address indexed oldSigner, address indexed newSigner);
    event VaultUpdated(address indexed oldVault, address indexed newVault);
    event PotWalletUpdated(address indexed oldPot, address indexed newPot);
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

    constructor(
        address _bfToken,
        address _vault,
        address _potWallet,
        address _signer
    ) {
        owner     = msg.sender;
        bfToken   = IERC20(_bfToken);
        vault     = _vault;
        potWallet = _potWallet;
        signer    = _signer;
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
     * @notice Claim a BF prize. Splits 95% to player, 5% to pot automatically.
     * @param player     Recipient address (must be msg.sender)
     * @param bfGross    Total BF amount BEFORE split (18 decimals)
     * @param nonce      Unique claim ID (keccak of gameId, server-generated)
     * @param expiry     Unix timestamp — claim invalid after this
     * @param signature  ECDSA signature from the trusted signer
     */
    function claimPrize(
        address player,
        uint256 bfGross,
        bytes32 nonce,
        uint256 expiry,
        bytes calldata signature
    ) external whenNotPaused {
        if (bfGross == 0)                      revert ZeroAmount();
        if (block.timestamp > expiry)          revert ClaimExpired();
        if (usedNonces[nonce])                 revert NonceUsed();
        if (msg.sender != player)              revert InvalidSignature();

        // Verify server signature
        bytes32 messageHash = _buildHash(player, bfGross, nonce, expiry);
        address recovered   = _recover(messageHash, signature);
        if (recovered != signer)               revert InvalidSignature();

        // Calculate split
        uint256 potAmount    = (bfGross * POT_BPS) / BPS;   // 5%
        uint256 playerAmount = bfGross - potAmount;           // 95%

        // Check vault has enough for the full gross amount
        if (bfToken.balanceOf(vault) < bfGross) revert InsufficientVaultBalance();

        // Mark nonce used BEFORE transfers (re-entrancy safety)
        usedNonces[nonce] = true;

        // Transfer 95% → player
        bool ok1 = bfToken.transferFrom(vault, player, playerAmount);
        if (!ok1) revert TransferFailed();

        // Transfer 5% → pot
        bool ok2 = bfToken.transferFrom(vault, potWallet, potAmount);
        if (!ok2) revert TransferFailed();

        emit PrizeClaimed(player, playerAmount, potAmount, nonce);
    }

    // ── View: validate a claim before submitting ─────────────────────────────

    function isClaimValid(
        address player,
        uint256 bfGross,
        bytes32 nonce,
        uint256 expiry,
        bytes calldata signature
    ) external view returns (bool valid, string memory reason) {
        if (paused)                                    return (false, "paused");
        if (bfGross == 0)                              return (false, "zero amount");
        if (block.timestamp > expiry)                  return (false, "expired");
        if (usedNonces[nonce])                         return (false, "nonce used");
        if (bfToken.balanceOf(vault) < bfGross)        return (false, "insufficient vault balance");

        bytes32 messageHash = _buildHash(player, bfGross, nonce, expiry);
        address recovered   = _recover(messageHash, signature);
        if (recovered != signer)                       return (false, "invalid signature");

        return (true, "ok");
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

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    /// @notice Emergency: pull BF held directly by this contract (not the vault)
    function emergencyWithdraw(address to, uint256 amount) external onlyOwner {
        bool ok = bfToken.transfer(to, amount);
        if (!ok) revert TransferFailed();
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
            block.chainid,   // anti cross-chain replay
            address(this),   // anti cross-contract replay
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
