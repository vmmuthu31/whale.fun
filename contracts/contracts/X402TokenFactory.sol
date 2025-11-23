// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./X402Token.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title X402TokenFactory
 * @dev Factory contract to deploy X402Token contracts
 */
contract X402TokenFactory is Ownable {
    constructor(address initialOwner) Ownable(initialOwner) {}
    
    // Array of all deployed token addresses
    address[] public allTokens;
    
    // Mapping from token address to token details
    struct TokenInfo {
        string name;
        string symbol;
        uint8 decimals;
        uint256 totalSupply;
        address owner;
        uint256 createdAt;
        string imageUrl;
    }
    
    // Token data structure for external consumption
    struct TokenFullData {
        string name;
        string symbol;
        uint8 decimals;
        uint256 totalSupply;
        address owner;
        uint256 createdAt;
        string imageUrl;
        address tokenAddress;
    }
    
    // Mapping from token address to token info
    mapping(address => TokenInfo) public tokenInfo;

    // Events
    event TokenCreated(
        address indexed tokenAddress,
        string name,
        string symbol,
        uint8 decimals,
        uint256 totalSupply,
        address indexed creator
    );

    /**
     * @notice Deploy a new X402Token
     * @param name_ Token name
     * @param symbol_ Token symbol
     * @param decimals_ Number of decimals
     * @param initialSupply Initial token supply
     * @param owner_ Token owner address
     * @param imageUrl_ URL of the token image
     * @return Address of the deployed token
     */
    function createToken(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply,
        address owner_,
        string memory imageUrl_
    ) external returns (address) {
        require(owner_ != address(0), "X402Factory: zero address");
        require(initialSupply > 0, "X402Factory: zero supply");
        
        X402Token token = new X402Token(
            name_,
            symbol_,
            decimals_,
            initialSupply,
            owner_,
            msg.sender, // supplyHolder (Facilitator)
            imageUrl_
        );
        
        address tokenAddress = address(token);
        
        // Store token info
        tokenInfo[tokenAddress] = TokenInfo({
            name: name_,
            symbol: symbol_,
            decimals: decimals_,
            totalSupply: initialSupply,
            owner: owner_,
            createdAt: block.timestamp,
            imageUrl: imageUrl_
        });
        
        allTokens.push(tokenAddress);
        
        emit TokenCreated(
            tokenAddress,
            name_,
            symbol_,
            decimals_,
            initialSupply,
            owner_
        );
        
        return tokenAddress;
    }
    
    /**
     * @notice Get comprehensive data for a specific token
     * @param tokenAddress Address of the token
     * @return Token data including metadata and metrics
     */
    function getTokenData(address tokenAddress) external view returns (TokenFullData memory) {
        require(tokenAddress != address(0), "X402Factory: zero address");
        TokenInfo memory info = tokenInfo[tokenAddress];
        require(bytes(info.name).length > 0, "X402Factory: token not found");
        
        return TokenFullData({
            name: info.name,
            symbol: info.symbol,
            decimals: info.decimals,
            totalSupply: info.totalSupply,
            owner: info.owner,
            createdAt: info.createdAt,
            imageUrl: info.imageUrl,
            tokenAddress: tokenAddress
        });
    }
    
    /**
     * @notice Get data for multiple tokens
     * @param tokenAddresses Array of token addresses
     * @return tokensData Array of token data
     */
    function getMultipleTokenData(address[] calldata tokenAddresses) external view returns (TokenFullData[] memory) {
        TokenFullData[] memory tokensData = new TokenFullData[](tokenAddresses.length);
        
        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            address tokenAddress = tokenAddresses[i];
            TokenInfo memory info = tokenInfo[tokenAddress];
            
            tokensData[i] = TokenFullData({
                name: info.name,
                symbol: info.symbol,
                decimals: info.decimals,
                totalSupply: info.totalSupply,
                owner: info.owner,
                createdAt: info.createdAt,
                imageUrl: info.imageUrl,
                tokenAddress: tokenAddress
            });
        }
        
        return tokensData;
    }
}
