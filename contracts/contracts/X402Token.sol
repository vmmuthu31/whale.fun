// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title X402Token
 * @dev ERC-20 token with EIP-2612 permit and EIP-3009 transfer with authorization
 */
contract X402Token is ERC20, ERC20Permit, Ownable {
    using ECDSA for bytes32;
    
    // EIP-3009 constants
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = 
        keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    
    bytes32 public constant APPROVE_WITH_AUTHORIZATION_TYPEHASH = 
        keccak256("ApproveWithAuthorization(address owner,address spender,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    
    bytes32 public constant CANCEL_AUTHORIZATION_TYPEHASH = 
        keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    // EIP-3009 state variables
    mapping(address => mapping(bytes32 => bool)) private _authorizationStates;
    
    // EIP-2612 permit nonces
    mapping(address => uint256) private _nonces;
    
    // Number of decimals
    uint8 private immutable _decimals;
    
    // Token metadata
    string private _imageUrl;

    // Events
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    /**
     * @dev Constructor that initializes the token
     * @param name_ Name of the token
     * @param symbol_ Symbol of the token
     * @param decimals_ Number of decimals
     * @param initialSupply Initial supply of tokens
     * @param owner_ Address that will receive the initial supply and ownership
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply,
        address owner_,
        address supplyHolder_,
        string memory imageUrl_
    ) ERC20(name_, symbol_) ERC20Permit(name_) Ownable(owner_) {
        _decimals = decimals_;
        _imageUrl = imageUrl_;
        _mint(supplyHolder_, initialSupply);
    }
    
    /**
     * @dev Returns the token's image URL
     */
    function imageUrl() public view returns (string memory) {
        return _imageUrl;
    }
    
    /**
     * @dev Updates the token's image URL (only callable by owner)
     * @param newImageUrl The new image URL
     */
    function setImageUrl(string memory newImageUrl) external onlyOwner {
        _imageUrl = newImageUrl;
    }

    /**
     * @dev Returns the number of decimals used
     */
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Returns the state of an authorization
     * @param authorizer    Authorizer's address
     * @param nonce         Nonce of the authorization
     * @return True if the nonce is used
     */
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool) {
        return _authorizationStates[authorizer][nonce];
    }

    /**
     * @notice Execute a transfer with a signed authorization
     * @param from          Payer's address (Authorizer)
     * @param to            Payee's address
     * @param value         Amount to be transferred
     * @param validAfter    The time after which this is valid (unix time)
     * @param validBefore   The time before which this is valid (unix time)
     * @param nonce         Unique nonce
     * @param v             v of the signature
     * @param r             r of the signature
     * @param s             s of the signature
     */
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _requireValidAuthorization(from, nonce, validAfter, validBefore);
        
        bytes32 structHash = keccak256(
            abi.encode(
                TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
                from,
                to,
                value,
                validAfter,
                validBefore,
                nonce
            )
        );
        
        _verifyAuthorization(from, structHash, v, r, s);
        _markAuthorizationAsUsed(from, nonce);
        
        _transfer(from, to, value);
    }

    /**
     * @notice Cancel an authorization
     * @param nonce         Nonce of the authorization
     * @param v             v of the signature
     * @param r             r of the signature
     * @param s             s of the signature
     */
    function cancelAuthorization(
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(!_authorizationStates[msg.sender][nonce], "X402: auth already used");
        
        bytes32 structHash = keccak256(
            abi.encode(
                CANCEL_AUTHORIZATION_TYPEHASH,
                msg.sender,
                nonce
            )
        );
        
        _verifyAuthorization(msg.sender, structHash, v, r, s);
        _markAuthorizationAsUsed(msg.sender, nonce);
        
        emit AuthorizationCanceled(msg.sender, nonce);
    }

    /**
     * @dev Verify a signed authorization
     */
    function _verifyAuthorization(
        address signer,
        bytes32 structHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal view {
        bytes32 hash = _hashTypedDataV4(structHash);
        address recovered = hash.recover(v, r, s);
        require(recovered == signer, "X402: invalid signature");
    }

    /**
     * @dev Ensure the authorization is valid
     */
    function _requireValidAuthorization(
        address authorizer,
        bytes32 nonce,
        uint256 validAfter,
        uint256 validBefore
    ) internal view {
        require(block.timestamp > validAfter, "X402: auth not yet valid");
        require(block.timestamp < validBefore, "X402: auth expired");
        require(!_authorizationStates[authorizer][nonce], "X402: auth already used");
    }

    /**
     * @dev Mark an authorization as used
     */
    function _markAuthorizationAsUsed(address authorizer, bytes32 nonce) internal {
        _authorizationStates[authorizer][nonce] = true;
        emit AuthorizationUsed(authorizer, nonce);
    }

    /**
     * @dev "Consume a nonce": return the current value and increment.
     */
    function _useNonce(address owner) internal virtual override returns (uint256 current) {
        current = _nonces[owner]++;
    }

    /**
     * @dev Returns the current nonce for `owner`.
     */
    function nonces(address owner) public view virtual override returns (uint256) {
        return _nonces[owner];
    }
}