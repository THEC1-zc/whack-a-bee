// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title BFPayout
 * @notice Whack-a-Butterfly prize claim contract.
 *
 * Flow:
 *   1. Game server signs a claim: (player, bfAmount, nonce, expiry)
 *   2. Player calls claimPrize() on-chain — pays their own gas
 *   3. Contract verifies the signature, then transfers BF from the vault
 *
 * The vault (PRIZE_WALLET) must approve this contract to spend its BF:
 *   BF.approve(address(BFPayout), type(uint256).max)  ← one-time setup
 *
 * Security:
 *   - Each claim has a unique nonce → no replay
 *   - Claims expire after `expiry` timestamp → no stale claims
 *   - Only the designated signer (server key) can authorize claims
 *   - Owner can rotate signer, pause, or emergency-withdraw
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract BFPayout {

    // ── State ────────────────────────────────────────────────────────────────

    address public owner;
    address public signer;       // server-side signing key
    address public vault;        // PRIZE_WALLET — holds the BF tokens
    IERC20  public bfToken;

    bool public paused;

    // nonce → claimed
    mapping(bytes32 => bool) public usedNonces;

    // ── Events ───────────────────────────────────────────────────────────────

    event PrizeClaimed(address indexed player, uint256 bfAmount, bytes32 nonce);
    event SignerUpdated(address indexed oldSigner, address indexed newSigner);
    event VaultUpdated(address indexed oldVault, address indexed newVault);
    event Paused(bool paused);
    event EmergencyWithdraw(address indexed to, uint256 amount);

    // ── Errors ───────────────────────────────────────────────────────────────

    error NotOwner();
    error NotSigner();
    error InvalidSignature();
    error NonceUsed();
    error ClaimExpired();
    error ZeroAmount();
    error ContractPaused();
    error InsufficientVaultBalance();
    error TransferFailed();

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(address _bfToken, address _vault, address _signer) {
        owner   = msg.sender;
        bfToken = IERC20(_bfToken);
        vault   = _vault;
        signer  = _signer;
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
     * @notice Claim a BF prize.
     * @param player     Recipient address (must match msg.sender)
     * @param bfAmount   Amount of BF tokens (18 decimals)
     * @param nonce      Unique claim ID (generated server-side, e.g. keccak of gameId)
     * @param expiry     Unix timestamp after which the claim is invalid
     * @param signature  ECDSA signature from the trusted signer
     */
    function claimPrize(
        address player,
        uint256 bfAmount,
        bytes32 nonce,
        uint256 expiry,
        bytes calldata signature
    ) external whenNotPaused {
        // Basic checks
        if (bfAmount == 0)                    revert ZeroAmount();
        if (block.timestamp > expiry)         revert ClaimExpired();
        if (usedNonces[nonce])                revert NonceUsed();
        if (msg.sender != player)             revert InvalidSignature(); // player must self-claim

        // Verify signature
        bytes32 messageHash = _buildHash(player, bfAmount, nonce, expiry);
        address recovered   = _recover(messageHash, signature);
        if (recovered != signer)              revert InvalidSignature();

        // Check vault has enough
        if (bfToken.balanceOf(vault) < bfAmount) revert InsufficientVaultBalance();

        // Mark nonce used before transfer (re-entrancy safety)
        usedNonces[nonce] = true;

        // Transfer BF from vault → player
        bool ok = bfToken.transferFrom(vault, player, bfAmount);
        if (!ok) revert TransferFailed();

        emit PrizeClaimed(player, bfAmount, nonce);
    }

    // ── View: check if a claim is still valid ────────────────────────────────

    function isClaimValid(
        address player,
        uint256 bfAmount,
        bytes32 nonce,
        uint256 expiry,
        bytes calldata signature
    ) external view returns (bool valid, string memory reason) {
        if (paused)                              return (false, "paused");
        if (bfAmount == 0)                       return (false, "zero amount");
        if (block.timestamp > expiry)            return (false, "expired");
        if (usedNonces[nonce])                   return (false, "nonce used");
        if (bfToken.balanceOf(vault) < bfAmount) return (false, "insufficient vault balance");

        bytes32 messageHash = _buildHash(player, bfAmount, nonce, expiry);
        address recovered   = _recover(messageHash, signature);
        if (recovered != signer)                 return (false, "invalid signature");

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

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    /// @notice Emergency: pull BF directly out of the contract (not the vault)
    function emergencyWithdraw(address to, uint256 amount) external onlyOwner {
        bool ok = bfToken.transfer(to, amount);
        if (!ok) revert TransferFailed();
        emit EmergencyWithdraw(to, amount);
    }

    // ── Internal: EIP-191 signing ────────────────────────────────────────────

    function _buildHash(
        address player,
        uint256 bfAmount,
        bytes32 nonce,
        uint256 expiry
    ) internal view returns (bytes32) {
        // EIP-191: "\x19Ethereum Signed Message:\n32" prefix
        bytes32 raw = keccak256(
            abi.encodePacked(
                block.chainid,   // replay protection across chains
                address(this),   // replay protection across contract instances
                player,
                bfAmount,
                nonce,
                expiry
            )
        );
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
