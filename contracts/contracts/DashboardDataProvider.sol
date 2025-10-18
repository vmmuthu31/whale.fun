// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TokenFactoryRoot.sol";
import "./TokenAnalyticsEnhanced.sol";
import "./TradingEngineEnhanced.sol";
import "./TokenGraduation.sol";
import "./CreatorToken.sol";

/**
 * @title DashboardDataProvider
 * @dev Comprehensive data provider for frontend dashboard with all analytics
 */
contract DashboardDataProvider {
    TokenFactory public immutable tokenFactory;
    TokenAnalyticsEnhanced public immutable analyticsContract;
    TradingEngineEnhanced public immutable tradingEngine;
    TokenGraduation public immutable graduationContract;
    
    // Bubble map data structure
    struct BubbleMapData {
        address holder;
        uint256 balance;
        uint256 percentage;
        string displayAddress; // Shortened address for display
        bool isLiquidityPool;
    }
    
    // Trade feed data structure
    struct TradeFeedData {
        address trader;
        string traderDisplay; // Shortened address
        bool isBuy;
        uint256 amountSOL; // ETH amount
        uint256 amountToken;
        uint256 pricePerToken;
        uint256 priceImpact;
        uint256 timestamp;
        string timeAgo; // Human readable time
        bytes32 txHash;
    }
    
    // Comprehensive token dashboard data
    struct TokenDashboardData {
        // Basic info
        string name;
        string symbol;
        address tokenAddress;
        address creator;
        uint256 launchTime;
        
        // Market data
        uint256 currentPrice;
        uint256 marketCap;
        uint256 fullyDilutedMarketCap;
        uint256 priceChange24h;
        uint256 priceChange7d;
        uint256 allTimeHigh;
        uint256 allTimeLow;
        
        // Volume data
        uint256 volume24h;
        uint256 volume7d;
        uint256 volumeTotal;
        
        // Bonding curve data
        uint256 bondingCurveProgress;
        uint256 tokensRemaining;
        uint256 liquidityPool;
        bool isGraduated;
        uint256 graduationThreshold;
        
        // Holder data
        uint256 holderCount;
        uint256 holderConcentration;
        uint256 distributionScore;
        
        // Trading data
        uint256 totalTrades;
        uint256 uniqueTraders;
        uint256 averageTradeSize;
        uint256 maxTradeSize;
        
        // Health metrics
        bool isHealthy;
        uint256 liquidityRatio;
        uint256 volatility;
        uint256 riskScore;
    }
    
    constructor(
        address _tokenFactory,
        address _analyticsContract,
        address _tradingEngine,
        address _graduationContract
    ) {
        tokenFactory = TokenFactory(payable(_tokenFactory));
        analyticsContract = TokenAnalyticsEnhanced(_analyticsContract);
        tradingEngine = TradingEngineEnhanced(payable(_tradingEngine));
        graduationContract = TokenGraduation(_graduationContract);
    }
    
    /**
     * @dev Get bubble map data for token holders visualization
     */
    function getBubbleMapData(address token, uint256 limit) external view returns (BubbleMapData[] memory) {
        require(limit <= 20, "Limit too high for gas efficiency");
        
        try analyticsContract.getTopHolders(token, limit) returns (
            TokenAnalyticsEnhanced.HolderInfo[] memory holders
        ) {
            BubbleMapData[] memory bubbleData = new BubbleMapData[](holders.length + 1);
            
            // Add liquidity pool as first bubble
            uint256 liquidityBalance = token.balance;
            uint256 totalSupply = IERC20(token).totalSupply();
            uint256 liquidityPercentage = totalSupply > 0 ? (liquidityBalance * 10000) / totalSupply : 0;
            
            bubbleData[0] = BubbleMapData({
                holder: address(0),
                balance: liquidityBalance,
                percentage: liquidityPercentage,
                displayAddress: "Liquidity Pool",
                isLiquidityPool: true
            });
            
            // Add top holders
            for (uint256 i = 0; i < holders.length; i++) {
                bubbleData[i + 1] = BubbleMapData({
                    holder: holders[i].holder,
                    balance: holders[i].balance,
                    percentage: holders[i].percentage,
                    displayAddress: _shortenAddress(holders[i].holder),
                    isLiquidityPool: false
                });
            }
            
            return bubbleData;
        } catch {
            return new BubbleMapData[](0);
        }
    }
    
    /**
     * @dev Get trade feed data for real-time trading display
     */
    function getTradeFeedData(
        address token, 
        uint256 limit, 
        uint256 minSizeETH
    ) external view returns (TradeFeedData[] memory) {
        require(limit <= 50, "Limit too high");
        
        try analyticsContract.getRecentTrades(token, limit, minSizeETH) returns (
            TokenAnalyticsEnhanced.TradeData[] memory trades
        ) {
            TradeFeedData[] memory feedData = new TradeFeedData[](trades.length);
            
            for (uint256 i = 0; i < trades.length; i++) {
                uint256 pricePerToken = trades[i].amountTokens > 0 ? 
                    (trades[i].amountETH * 1e18) / trades[i].amountTokens : 0;
                
                feedData[i] = TradeFeedData({
                    trader: trades[i].trader,
                    traderDisplay: _shortenAddress(trades[i].trader),
                    isBuy: trades[i].isBuy,
                    amountSOL: trades[i].amountETH,
                    amountToken: trades[i].amountTokens,
                    pricePerToken: pricePerToken,
                    priceImpact: trades[i].priceImpact,
                    timestamp: trades[i].timestamp,
                    timeAgo: _formatTimeAgo(trades[i].timestamp),
                    txHash: trades[i].txHash
                });
            }
            
            return feedData;
        } catch {
            return new TradeFeedData[](0);
        }
    }
    
    /**
     * @dev Get comprehensive token dashboard data
     */
    function getTokenDashboardData(address token) external view returns (TokenDashboardData memory) {
        TokenDashboardData memory data;
        
        // Basic token info
        try IERC20Metadata(token).name() returns (string memory name) {
            data.name = name;
        } catch {}
        
        try IERC20Metadata(token).symbol() returns (string memory symbol) {
            data.symbol = symbol;
        } catch {}
        
        data.tokenAddress = token;
        data.creator = tokenFactory.tokenToCreator(token);
        data.launchTime = tokenFactory.tokenToLaunchTime(token);
        
        // Market data from CreatorToken
        try CreatorToken(payable(token)).getTokenStats() returns (
            uint256 totalSupply,
            uint256 totalSold,
            uint256 currentPrice,
            uint256 marketCap,
            uint256 holderCount,
            uint256 creatorFees
        ) {
            data.currentPrice = currentPrice;
            data.marketCap = marketCap;
            data.fullyDilutedMarketCap = totalSupply * currentPrice / 1e18;
            data.holderCount = holderCount;
            // Use additional data for enhanced metrics
            data.liquidityPool = address(token).balance; // Use liquidityPool field for contract balance
            // Track token distribution progress
            data.bondingCurveProgress = totalSupply > 0 ? (totalSold * 100) / totalSupply : 0;
            // Estimate creator revenue potential
            data.liquidityRatio = creatorFees > 0 ? (marketCap * 100) / creatorFees : 0;
        } catch {}
        
        // Get token metrics
        try CreatorToken(payable(token)).getTokenMetrics() returns (
            uint256 volume24h,
            uint256 priceChange24h,
            uint256 allTimeHigh,
            uint256 allTimeLow,
            uint256 volatility,
            uint256 liquidityRatio
        ) {
            data.volume24h = volume24h;
            data.priceChange24h = priceChange24h;
            data.allTimeHigh = allTimeHigh;
            data.allTimeLow = allTimeLow;
            data.volatility = volatility;
            data.liquidityRatio = liquidityRatio;
        } catch {}
        
        // Get bonding curve progress
        try CreatorToken(payable(token)).getBondingCurveProgress() returns (
            uint256 progressPercentage,
            uint256 tokensRemaining,
            uint256,
            uint256
        ) {
            data.bondingCurveProgress = progressPercentage;
            data.tokensRemaining = tokensRemaining;
        } catch {}
        
        // Get holder analytics
        try CreatorToken(payable(token)).getHolderAnalytics() returns (
            uint256,
            uint256,
            uint256 holderConcentration,
            uint256 distributionScore
        ) {
            data.holderConcentration = holderConcentration;
            data.distributionScore = distributionScore;
        } catch {}
        
        // Get trading statistics
        try tradingEngine.getTokenTradingStats(token) returns (
            uint256 totalVolume,
            uint256 dailyVolume,
            uint256 weeklyVolume,
            uint256 totalTrades,
            uint256 uniqueTraders,
            uint256 averageTradeSize,
            uint256,
            uint256,
            uint256
        ) {
            data.volumeTotal = totalVolume;
            data.volume24h = dailyVolume; // Use the daily volume
            data.volume7d = weeklyVolume;
            data.totalTrades = totalTrades;
            data.uniqueTraders = uniqueTraders;
            data.averageTradeSize = averageTradeSize;
        } catch {}
        
        // Get graduation info
        try graduationContract.getGraduationInfo(token) returns (
            bool isGraduated,
            uint256 thresholdInUSD,
            uint256,
            uint256,
            bool,
            address
        ) {
            data.isGraduated = isGraduated;
            data.graduationThreshold = thresholdInUSD;
        } catch {}
        
        // Get analytics data
        try analyticsContract.getTokenAnalytics(token) returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            bool isHealthy
        ) {
            data.isHealthy = isHealthy;
        } catch {}
        
        // Calculate risk score
        try CreatorToken(payable(token)).getRiskAssessment() returns (
            SecurityLibrary.RiskLevel,
            uint256 riskScore
        ) {
            data.riskScore = riskScore;
        } catch {}
        
        // Set liquidity pool value
        data.liquidityPool = token.balance;
        
        return data;
    }
    
    /**
     * @dev Get platform overview statistics
     */
    function getPlatformOverview() external view returns (
        uint256 totalTokens,
        uint256 totalVolume24h,
        uint256 totalMarketCap,
        uint256 activeTokens,
        uint256 totalHolders,
        uint256 averageTokenAge,
        uint256 successfulGraduations,
        uint256 platformRevenue
    ) {
        // Get basic factory stats
        (totalTokens, totalVolume24h, , ) = tokenFactory.getFactoryStats();
        
        // Get comprehensive analytics
        try analyticsContract.getPlatformMetrics() returns (
            uint256,
            uint256 activeTokensCount,
            uint256 totalVolumeTraded,
            uint256 avgTokenAge,
            uint256 topTokenMarketCap
        ) {
            activeTokens = activeTokensCount;
            totalVolume24h = totalVolumeTraded;
            averageTokenAge = avgTokenAge;
            // Use top token market cap for platform health metric
            platformRevenue = topTokenMarketCap / 1000; // Estimate revenue as 0.1% of top token
        } catch {}
        
        // Calculate aggregated statistics
        address[] memory allTokens = tokenFactory.getAllTokens();
        uint256 aggregatedMarketCap = 0;
        uint256 aggregatedHolders = 0;
        uint256 graduatedCount = 0;
        
        for (uint256 i = 0; i < allTokens.length && i < 100; i++) { // Limit for gas
            try CreatorToken(payable(allTokens[i])).getTokenStats() returns (
                uint256, uint256, uint256, uint256 marketCap, uint256 holderCount, uint256
            ) {
                aggregatedMarketCap += marketCap;
                aggregatedHolders += holderCount;
            } catch {}
            
            try graduationContract.graduatedTokens(allTokens[i]) returns (bool isGraduated) {
                if (isGraduated) graduatedCount++;
            } catch {}
        }
        
        totalMarketCap = aggregatedMarketCap;
        totalHolders = aggregatedHolders;
        successfulGraduations = graduatedCount;
        
        // Get platform revenue from trading engine
        try tradingEngine.platformRevenue() returns (uint256 revenue) {
            platformRevenue = revenue;
        } catch {}
        
        return (
            totalTokens,
            totalVolume24h,
            totalMarketCap,
            activeTokens,
            totalHolders,
            averageTokenAge,
            successfulGraduations,
            platformRevenue
        );
    }
    
    /**
     * @dev Get trending tokens based on various metrics
     */
    function getTrendingTokens(uint256 limit) external view returns (
        address[] memory tokens,
        uint256[] memory scores
    ) {
        require(limit <= 20, "Limit too high");
        
        address[] memory allTokens = tokenFactory.getAllTokens();
        uint256 tokenCount = allTokens.length > 100 ? 100 : allTokens.length; // Gas limit
        
        // Simple trending score calculation
        tokens = new address[](limit);
        scores = new uint256[](limit);
        
        uint256 resultCount = 0;
        
        for (uint256 i = 0; i < tokenCount && resultCount < limit; i++) {
            uint256 trendingScore = _calculateTrendingScore(allTokens[i]);
            
            if (trendingScore > 0) {
                // Insert in sorted order (simple insertion sort for small arrays)
                uint256 insertIndex = resultCount;
                for (uint256 j = 0; j < resultCount; j++) {
                    if (trendingScore > scores[j]) {
                        insertIndex = j;
                        break;
                    }
                }
                
                // Shift elements
                for (uint256 k = resultCount; k > insertIndex; k--) {
                    if (k < limit) {
                        tokens[k] = tokens[k-1];
                        scores[k] = scores[k-1];
                    }
                }
                
                // Insert new element
                if (insertIndex < limit) {
                    tokens[insertIndex] = allTokens[i];
                    scores[insertIndex] = trendingScore;
                }
                
                if (resultCount < limit) resultCount++;
            }
        }
        
        return (tokens, scores);
    }
    
    /**
     * @dev Calculate trending score for a token
     */
    function _calculateTrendingScore(address token) internal view returns (uint256) {
        uint256 score = 0;
        
        try analyticsContract.getTokenAnalytics(token) returns (
            uint256 holderCount,
            uint256 totalTrades,
            uint256 dailyVolume,
            uint256 priceChange24h,
            uint256,
            bool isHealthy
        ) {
            // Volume score (30% weight)
            score += (dailyVolume / 1e15) * 30; // Scale down for scoring
            
            // Holder growth score (25% weight)
            score += holderCount * 25;
            
            // Trading activity score (25% weight)
            score += totalTrades * 25;
            
            // Price momentum score (20% weight)
            if (priceChange24h > 0) {
                score += (priceChange24h / 100) * 20; // Positive price change
            }
            
            // Health bonus
            if (isHealthy) {
                score += 1000;
            }
        } catch {}
        
        // Age penalty (newer tokens get higher scores)
        uint256 tokenAge = block.timestamp - tokenFactory.tokenToLaunchTime(token);
        if (tokenAge < 24 hours) {
            score = score * 150 / 100; // 50% bonus for new tokens
        } else if (tokenAge < 7 days) {
            score = score * 120 / 100; // 20% bonus for week-old tokens
        }
        
        return score;
    }
    
    /**
     * @dev Helper function to shorten addresses for display
     */
    function _shortenAddress(address addr) internal pure returns (string memory) {
        bytes memory addrBytes = abi.encodePacked(addr);
        bytes memory result = new bytes(10);
        
        // First 4 chars after 0x
        for (uint256 i = 0; i < 4; i++) {
            result[i] = _toHexChar(uint8(addrBytes[i]) >> 4);
            result[i + 1] = _toHexChar(uint8(addrBytes[i]) & 0x0f);
        }
        
        // Add dots
        result[4] = '.';
        result[5] = '.';
        result[6] = '.';
        
        // Last 3 chars
        for (uint256 i = 0; i < 3; i++) {
            result[7 + i] = _toHexChar(uint8(addrBytes[17 + i]) >> 4);
        }
        
        return string(result);
    }
    
    /**
     * @dev Convert byte to hex character
     */
    function _toHexChar(uint8 value) internal pure returns (bytes1) {
        if (value < 10) {
            return bytes1(uint8(48 + value)); // '0' to '9'
        } else {
            return bytes1(uint8(87 + value)); // 'a' to 'f'
        }
    }
    
    /**
     * @dev Format timestamp to human readable "time ago"
     */
    function _formatTimeAgo(uint256 timestamp) internal view returns (string memory) {
        uint256 timeDiff = block.timestamp - timestamp;
        
        if (timeDiff < 60) {
            return string(abi.encodePacked(_toString(timeDiff), "s ago"));
        } else if (timeDiff < 3600) {
            return string(abi.encodePacked(_toString(timeDiff / 60), "m ago"));
        } else if (timeDiff < 86400) {
            return string(abi.encodePacked(_toString(timeDiff / 3600), "h ago"));
        } else {
            return string(abi.encodePacked(_toString(timeDiff / 86400), "d ago"));
        }
    }
    
    /**
     * @dev Convert uint256 to string
     */
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}