// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./X402Token.sol";

/**
 * @title X402DashboardDataProvider
 * @dev Provides analytics and data for X402 tokens
 */
contract X402DashboardDataProvider {
    // Token data structure
    struct TokenData {
        string name;
        string symbol;
        uint8 decimals;
        address tokenAddress;
        address creator;
        uint256 totalSupply;
        uint256 circulatingSupply;
        uint256 holdersCount;
        uint256 totalTransfers;
        uint256 creationTime;
        bool isX402Token;
    }
    
    // Holder data structure
    struct HolderData {
        address holder;
        uint256 balance;
        uint256 percentage;
        bool isContract;
    }
    
    // Trade data structure
    struct TradeData {
        address trader;
        bool isBuy;
        uint256 amountToken;
        uint256 amountETH;
        uint256 pricePerToken;
        uint256 timestamp;
        bytes32 txHash;
    }
    
    // Token metrics
    struct TokenMetrics {
        uint256 marketCap;          // Total supply * price
        uint256 volume24h;          // 24h trading volume
        uint256 liquidity;          // Total liquidity in ETH
        uint256 priceChange24h;     // 24h price change
        uint256 high24h;            // 24h high price
        uint256 low24h;             // 24h low price
        uint256 totalLiquidity;     // Total liquidity in token
        uint256 totalVolume;        // All-time volume
        uint256 totalTrades;        // Total number of trades
    }
    
    // Token analytics
    struct TokenAnalytics {
        TokenData tokenData;
        TokenMetrics metrics;
        HolderData[] topHolders;
        TradeData[] recentTrades;
    }
    
    // State variables
    mapping(address => bool) public isX402Token;
    mapping(address => address) public tokenToFactory;
    
    // Events
    event TokenRegistered(address indexed token, address indexed factory, bool isX402);
    event TokenDataUpdated(address indexed token);
    
    /**
     * @notice Register a token with the dashboard
     */
    function registerToken(
        address token,
        address factory,
        bool isX402
    ) external {
        require(tokenToFactory[token] == address(0), "Token already registered");
        tokenToFactory[token] = factory;
        isX402Token[token] = isX402;
        
        emit TokenRegistered(token, factory, isX402);
    }
    
    /**
     * @notice Get token data
     */
    function getTokenData(address token) external view returns (TokenData memory) {
        try IERC20Metadata(token).name() returns (string memory name) {
            // Token is ERC20
            TokenData memory data;
            data.name = name;
            data.symbol = IERC20Metadata(token).symbol();
            data.decimals = IERC20Metadata(token).decimals();
            data.tokenAddress = token;
            data.totalSupply = IERC20(token).totalSupply();
            data.creationTime = block.timestamp; // In a real implementation, this would be stored
            data.isX402Token = isX402Token[token];
            
            return data;
        } catch {
            // Token is not ERC20 compliant
            revert("Invalid token address");
        }
    }
    
    /**
     * @notice Get token metrics
     */
    function getTokenMetrics(address token) external view returns (TokenMetrics memory) {
        // In a real implementation, this would fetch actual data from oracles and DEXs
        TokenMetrics memory metrics;
        
        // Example data - replace with actual data sources
        metrics.marketCap = IERC20(token).totalSupply();
        metrics.volume24h = 0;
        metrics.liquidity = 0;
        metrics.priceChange24h = 0;
        metrics.high24h = 0;
        metrics.low24h = 0;
        metrics.totalLiquidity = 0;
        metrics.totalVolume = 0;
        metrics.totalTrades = 0;
        
        return metrics;
    }
    
    /**
     * @notice Get top token holders
     */
    function getTopHolders(address token, uint256 limit) external view returns (HolderData[] memory) {
        // In a real implementation, this would fetch from an indexer or subgraph
        HolderData[] memory holders = new HolderData[](0);
        return holders;
    }
    
    /**
     * @notice Get recent trades for a token
     */
    function getRecentTrades(address token, uint256 limit) external view returns (TradeData[] memory) {
        // In a real implementation, this would fetch from an indexer or subgraph
        TradeData[] memory trades = new TradeData[](0);
        return trades;
    }
    
    /**
     * @notice Get complete token analytics
     */
    function getTokenAnalytics(address token) external view returns (TokenAnalytics memory) {
        TokenAnalytics memory analytics;
        
        // Get token data
        analytics.tokenData = this.getTokenData(token);
        
        // Get token metrics
        analytics.metrics = this.getTokenMetrics(token);
        
        // Get top holders (limited to 10)
        analytics.topHolders = this.getTopHolders(token, 10);
        
        // Get recent trades (limited to 50)
        analytics.recentTrades = this.getRecentTrades(token, 50);
        
        return analytics;
    }
    
    /**
     * @notice Check if an address is a contract
     */
    function _isContract(address addr) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(addr)
        }
        return size > 0;
    }
}
