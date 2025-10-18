// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./CreatorToken.sol";
import "./TokenFactoryRoot.sol";
import "./TokenGraduation.sol";

/**
 * @title TokenAnalyticsEnhanced
 * @dev Comprehensive analytics including holders, trades, bonding curve progress, and graduation tracking
 */
contract TokenAnalyticsEnhanced {
    TokenFactory public immutable tokenFactory;
    TokenGraduation public immutable graduationContract;
    
    // Holder analytics
    struct HolderInfo {
        address holder;
        uint256 balance;
        uint256 percentage;
        uint256 firstPurchaseTime;
        uint256 lastTransactionTime;
        uint256 totalPurchases;
        uint256 totalSales;
    }
    
    // Trade data structure
    struct TradeData {
        address trader;
        bool isBuy;
        uint256 amountETH;
        uint256 amountTokens;
        uint256 pricePerToken;
        uint256 priceImpact;
        uint256 timestamp;
        bytes32 txHash;
    }
    
    // Bonding curve progress
    struct BondingCurveProgress {
        uint256 currentSupply;
        uint256 totalSupply;
        uint256 progressPercentage;
        uint256 currentPrice;
        uint256 targetPrice;
        uint256 marketCap;
        uint256 liquidityPool;
        bool isGraduated;
        uint256 graduationThreshold;
    }
    
    // Liquidity pool info
    struct LiquidityInfo {
        uint256 ethReserve;
        uint256 tokenReserve;
        uint256 totalLiquidity;
        uint256 liquidityPercentage;
        address[] liquidityProviders;
        mapping(address => uint256) providerShares;
    }
    
    // Storage
    mapping(address => HolderInfo[]) public tokenHolders;
    mapping(address => mapping(address => uint256)) public holderIndex;
    mapping(address => uint256) public holderCount;
    mapping(address => TradeData[]) public tokenTrades;
    mapping(address => LiquidityInfo) public liquidityPools;
    mapping(address => uint256) public lastTradeIndex;
    
    // Events for real-time updates
    event HolderUpdated(address indexed token, address indexed holder, uint256 newBalance, uint256 percentage);
    event TradeRecorded(address indexed token, address indexed trader, bool isBuy, uint256 ethAmount, uint256 tokenAmount, uint256 priceImpact);
    event BondingCurveProgressUpdated(address indexed token, uint256 progress, uint256 currentPrice, uint256 marketCap);
    event TokenGraduated(address indexed token, uint256 finalMarketCap, uint256 liquidityAdded);
    
    constructor(address _tokenFactory, address _graduationContract) {
        tokenFactory = TokenFactory(payable(_tokenFactory));
        graduationContract = TokenGraduation(_graduationContract);
    }
    
    /**
     * @dev Update holder information after any transfer
     */
    function updateHolderInfo(address token, address holder, uint256 newBalance) external {
        require(tokenFactory.isValidToken(token), "Invalid token");
        
        IERC20 tokenContract = IERC20(token);
        uint256 totalSupply = tokenContract.totalSupply();
        uint256 percentage = totalSupply > 0 ? (newBalance * 10000) / totalSupply : 0; // Basis points
        
        uint256 index = holderIndex[token][holder];
        
        if (index == 0 && newBalance > 0) {
            // New holder
            tokenHolders[token].push(HolderInfo({
                holder: holder,
                balance: newBalance,
                percentage: percentage,
                firstPurchaseTime: block.timestamp,
                lastTransactionTime: block.timestamp,
                totalPurchases: 1,
                totalSales: 0
            }));
            holderIndex[token][holder] = tokenHolders[token].length;
            holderCount[token]++;
        } else if (index > 0) {
            // Existing holder
            HolderInfo storage holderInfo = tokenHolders[token][index - 1];
            uint256 oldBalance = holderInfo.balance;
            
            holderInfo.balance = newBalance;
            holderInfo.percentage = percentage;
            holderInfo.lastTransactionTime = block.timestamp;
            
            if (newBalance > oldBalance) {
                holderInfo.totalPurchases++;
            } else if (newBalance < oldBalance) {
                holderInfo.totalSales++;
            }
            
            // Remove holder if balance is 0
            if (newBalance == 0) {
                _removeHolder(token, holder);
            }
        }
        
        emit HolderUpdated(token, holder, newBalance, percentage);
    }
    
    /**
     * @dev Record trade data
     */
    function recordTrade(
        address token,
        address trader,
        bool isBuy,
        uint256 amountETH,
        uint256 amountTokens,
        uint256 priceImpact,
        bytes32 txHash
    ) external {
        require(tokenFactory.isValidToken(token), "Invalid token");
        
        uint256 pricePerToken = amountTokens > 0 ? (amountETH * 1e18) / amountTokens : 0;
        
        tokenTrades[token].push(TradeData({
            trader: trader,
            isBuy: isBuy,
            amountETH: amountETH,
            amountTokens: amountTokens,
            pricePerToken: pricePerToken,
            priceImpact: priceImpact,
            timestamp: block.timestamp,
            txHash: txHash
        }));
        
        emit TradeRecorded(token, trader, isBuy, amountETH, amountTokens, priceImpact);
    }
    
    /**
     * @dev Get top holders for bubble map visualization
     */
    function getTopHolders(address token, uint256 limit) external view returns (HolderInfo[] memory) {
        require(limit <= 50, "Limit too high"); // Prevent gas issues
        
        HolderInfo[] memory holders = tokenHolders[token];
        if (holders.length == 0) {
            return new HolderInfo[](0);
        }
        
        // Sort by balance (simple bubble sort for small arrays)
        HolderInfo[] memory sortedHolders = new HolderInfo[](holders.length);
        for (uint256 i = 0; i < holders.length; i++) {
            sortedHolders[i] = holders[i];
        }
        
        for (uint256 i = 0; i < sortedHolders.length - 1; i++) {
            for (uint256 j = 0; j < sortedHolders.length - i - 1; j++) {
                if (sortedHolders[j].balance < sortedHolders[j + 1].balance) {
                    HolderInfo memory temp = sortedHolders[j];
                    sortedHolders[j] = sortedHolders[j + 1];
                    sortedHolders[j + 1] = temp;
                }
            }
        }
        
        uint256 resultLength = limit < sortedHolders.length ? limit : sortedHolders.length;
        HolderInfo[] memory result = new HolderInfo[](resultLength);
        for (uint256 i = 0; i < resultLength; i++) {
            result[i] = sortedHolders[i];
        }
        
        return result;
    }
    
    /**
     * @dev Get recent trades for live feed
     */
    function getRecentTrades(address token, uint256 limit, uint256 minSize) external view returns (TradeData[] memory) {
        require(limit <= 100, "Limit too high");
        
        TradeData[] memory trades = tokenTrades[token];
        if (trades.length == 0) {
            return new TradeData[](0);
        }
        
        // Filter trades by minimum size and get recent ones
        TradeData[] memory filteredTrades = new TradeData[](limit);
        uint256 count = 0;
        
        // Start from the most recent trades
        for (uint256 i = trades.length; i > 0 && count < limit; i--) {
            if (trades[i - 1].amountETH >= minSize) {
                filteredTrades[count] = trades[i - 1];
                count++;
            }
        }
        
        // Resize array to actual count
        TradeData[] memory result = new TradeData[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = filteredTrades[i];
        }
        
        return result;
    }
    
    /**
     * @dev Get bonding curve progress
     */
    function getBondingCurveProgress(address token) external view returns (BondingCurveProgress memory) {
        require(tokenFactory.isValidToken(token), "Invalid token");
        
        try CreatorToken(payable(token)).getTokenStats() returns (
            uint256 totalSupply,
            uint256 currentSupply,
            uint256 currentPrice,
            uint256 marketCap,
            uint256 targetPrice,
            uint256 liquidityPool
        ) {
            uint256 progressPercentage = totalSupply > 0 ? (currentSupply * 100) / totalSupply : 0;
            
            // Check if graduated
            bool isGraduated = false;
            uint256 graduationThreshold = 0;
            
            try graduationContract.graduatedTokens(token) returns (bool graduated) {
                isGraduated = graduated;
            } catch {}
            
            try graduationContract.getGraduationThreshold(token) returns (uint256 threshold) {
                graduationThreshold = threshold;
            } catch {
                graduationThreshold = marketCap * 80 / 100; // Default 80% of target
            }
            
            return BondingCurveProgress({
                currentSupply: currentSupply,
                totalSupply: totalSupply,
                progressPercentage: progressPercentage,
                currentPrice: currentPrice,
                targetPrice: targetPrice,
                marketCap: marketCap,
                liquidityPool: liquidityPool,
                isGraduated: isGraduated,
                graduationThreshold: graduationThreshold
            });
        } catch {
            return BondingCurveProgress({
                currentSupply: 0,
                totalSupply: 0,
                progressPercentage: 0,
                currentPrice: 0,
                targetPrice: 0,
                marketCap: 0,
                liquidityPool: 0,
                isGraduated: false,
                graduationThreshold: 0
            });
        }
    }
    
    /**
     * @dev Get liquidity pool information
     */
    function getLiquidityInfo(address token) external view returns (
        uint256 ethReserve,
        uint256 tokenReserve,
        uint256 totalLiquidity,
        uint256 liquidityPercentage,
        uint256 providerCount
    ) {
        LiquidityInfo storage pool = liquidityPools[token];
        
        ethReserve = pool.ethReserve;
        tokenReserve = pool.tokenReserve;
        totalLiquidity = pool.totalLiquidity;
        liquidityPercentage = pool.liquidityPercentage;
        providerCount = pool.liquidityProviders.length;
        
        return (ethReserve, tokenReserve, totalLiquidity, liquidityPercentage, providerCount);
    }
    
    /**
     * @dev Get comprehensive token analytics
     */
    function getTokenAnalytics(address token) external view returns (
        uint256 holderCount_,
        uint256 totalTrades,
        uint256 dailyVolume,
        uint256 priceChange24h,
        uint256 liquidityRatio,
        bool isHealthy
    ) {
        holderCount_ = holderCount[token];
        totalTrades = tokenTrades[token].length;
        
        // Calculate daily volume
        uint256 dayAgo = block.timestamp - 24 hours;
        uint256 volume = 0;
        uint256 startPrice = 0;
        uint256 endPrice = 0;
        
        TradeData[] memory trades = tokenTrades[token];
        for (uint256 i = 0; i < trades.length; i++) {
            if (trades[i].timestamp >= dayAgo) {
                volume += trades[i].amountETH;
                if (startPrice == 0) startPrice = trades[i].pricePerToken;
                endPrice = trades[i].pricePerToken;
            }
        }
        
        dailyVolume = volume;
        priceChange24h = startPrice > 0 ? ((endPrice - startPrice) * 100) / startPrice : 0;
        
        // Calculate liquidity ratio
        try CreatorToken(payable(token)).getTokenStats() returns (
            uint256, uint256, uint256, uint256 marketCap, uint256, uint256 liquidityPool
        ) {
            liquidityRatio = marketCap > 0 ? (liquidityPool * 100) / marketCap : 0;
        } catch {
            liquidityRatio = 0;
        }
        
        // Determine if token is healthy
        isHealthy = holderCount_ >= 10 && dailyVolume > 0.1 ether && liquidityRatio >= 5;
        
        return (holderCount_, totalTrades, dailyVolume, priceChange24h, liquidityRatio, isHealthy);
    }
    
    /**
     * @dev Update liquidity pool information
     */
    function updateLiquidityPool(
        address token,
        uint256 ethReserve,
        uint256 tokenReserve,
        address provider
    ) external {
        require(tokenFactory.isValidToken(token), "Invalid token");
        
        LiquidityInfo storage pool = liquidityPools[token];
        pool.ethReserve = ethReserve;
        pool.tokenReserve = tokenReserve;
        pool.totalLiquidity = ethReserve + tokenReserve;
        
        // Calculate liquidity percentage (simplified)
        uint256 totalMarketValue = ethReserve * 2; // Assume equal value in both tokens
        try CreatorToken(payable(token)).getTokenStats() returns (
            uint256, uint256, uint256, uint256 marketCap, uint256, uint256
        ) {
            pool.liquidityPercentage = marketCap > 0 ? (totalMarketValue * 100) / marketCap : 0;
        } catch {
            pool.liquidityPercentage = 0;
        }
        
        // Add provider if not exists
        bool providerExists = false;
        for (uint256 i = 0; i < pool.liquidityProviders.length; i++) {
            if (pool.liquidityProviders[i] == provider) {
                providerExists = true;
                break;
            }
        }
        
        if (!providerExists && provider != address(0)) {
            pool.liquidityProviders.push(provider);
        }
    }
    
    /**
     * @dev Remove holder from list
     */
    function _removeHolder(address token, address holder) internal {
        uint256 index = holderIndex[token][holder];
        if (index == 0) return;
        
        HolderInfo[] storage holders = tokenHolders[token];
        uint256 lastIndex = holders.length - 1;
        
        if (index - 1 != lastIndex) {
            holders[index - 1] = holders[lastIndex];
            holderIndex[token][holders[lastIndex].holder] = index;
        }
        
        holders.pop();
        delete holderIndex[token][holder];
        holderCount[token]--;
    }
    
    /**
     * @dev Get platform-wide metrics
     */
    function getPlatformMetrics() external view returns (
        uint256 totalTokens,
        uint256 activeTokens,
        uint256 totalVolumeTraded,
        uint256 averageTokenAge,
        uint256 topTokenMarketCap
    ) {
        address[] memory allTokens = tokenFactory.getAllTokens();
        totalTokens = allTokens.length;
        activeTokens = 0;
        totalVolumeTraded = 0;
        uint256 totalAge = 0;
        topTokenMarketCap = 0;
        
        for (uint256 i = 0; i < allTokens.length && i < 50; i++) { // Limit for gas
            address token = allTokens[i];
            
            try CreatorToken(payable(token)).getTokenStats() returns (
                uint256,
                uint256,
                uint256,
                uint256 marketCap,
                uint256,
                uint256
            ) {
                if (marketCap > 0) {
                    activeTokens++;
                    if (marketCap > topTokenMarketCap) {
                        topTokenMarketCap = marketCap;
                    }
                }
            } catch {}
            
            // Calculate age
            try tokenFactory.tokenToLaunchTime(token) returns (uint256 launchTime) {
                totalAge += block.timestamp - launchTime;
            } catch {}
        }
        
        averageTokenAge = totalTokens > 0 ? totalAge / totalTokens : 0;
        
        return (totalTokens, activeTokens, totalVolumeTraded, averageTokenAge, topTokenMarketCap);
    }
    
    /**
     * @dev Get holder distribution for bubble map
     */
    function getHolderDistribution(address token) external view returns (
        address[] memory holders,
        uint256[] memory balances,
        uint256[] memory percentages
    ) {
        HolderInfo[] memory tokenHoldersList = tokenHolders[token];
        uint256 length = tokenHoldersList.length;
        
        holders = new address[](length);
        balances = new uint256[](length);
        percentages = new uint256[](length);
        
        for (uint256 i = 0; i < length; i++) {
            holders[i] = tokenHoldersList[i].holder;
            balances[i] = tokenHoldersList[i].balance;
            percentages[i] = tokenHoldersList[i].percentage;
        }
        
        return (holders, balances, percentages);
    }
}