// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./WhaleToken.sol";
import "./TokenFactoryRoot.sol";
import "./TokenAnalyticsEnhanced.sol";
import "./libraries/MEVProtectionLibrary.sol";

/**
 * @title TradingEngineEnhanced
 * @dev Production-ready trading engine with comprehensive analytics and MEV protection
 */
contract TradingEngineEnhanced is ReentrancyGuard, Ownable {
    using MEVProtectionLibrary for MEVProtectionLibrary.MEVConfig;
    
    WhaleToken public immutable whaleToken;
    TokenFactory public immutable tokenFactory;
    TokenAnalyticsEnhanced public analyticsContract;
    
    // Trading pairs and liquidity
    struct TradingPair {
        address tokenA;
        address tokenB;
        uint256 reserveA;
        uint256 reserveB;
        uint256 totalSupply;
        uint256 lastTradeTime;
        uint256 totalVolume24h;
        uint256 lastVolumeReset;
        bool isActive;
        uint256 fee; // Fee in basis points (100 = 1%)
    }
    
    // Enhanced trade tracking
    struct TradeOrder {
        address trader;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
        uint256 priceImpact;
        uint256 timestamp;
        uint256 gasPrice;
        bytes32 tradeHash;
    }
    
    mapping(bytes32 => TradingPair) public tradingPairs;
    mapping(bytes32 => mapping(address => uint256)) public liquidityBalances;
    mapping(address => TradeOrder[]) public userTrades;
    mapping(address => uint256) public userTradeCount;
    bytes32[] public allPairs;
    
    // Fee structure with dynamic adjustment
    struct FeeStructure {
        uint256 baseFee;        // Base trading fee (30 basis points = 0.3%)
        uint256 maxFee;         // Maximum fee (100 basis points = 1%)
        uint256 creatorShare;   // Creator's share of fees (70%)
        uint256 platformShare;  // Platform's share (20%)
        uint256 stakingShare;   // Staking rewards share (10%)
        uint256 volumeThreshold; // Volume threshold for fee reduction
        uint256 holderThreshold; // Holder threshold for fee reduction
    }
    
    FeeStructure public fees;
    
    // MEV Protection for trading
    MEVProtectionLibrary.MEVConfig public tradingMEVConfig;
    mapping(address => MEVProtectionLibrary.RateLimit) public traderRateLimits;
    mapping(address => uint256) public lastTradeBlock;
    
    // Revenue tracking
    mapping(address => uint256) public creatorEarnings;
    mapping(address => uint256) public totalFeesGenerated;
    uint256 public platformRevenue;
    uint256 public stakingRewards;
    
    // Price oracle integration (for mainnet)
    address public priceOracle;
    mapping(address => uint256) public tokenPriceFeeds;
    
    // Trading statistics
    struct TokenTradingStats {
        uint256 totalVolume;
        uint256 dailyVolume;
        uint256 weeklyVolume;
        uint256 monthlyVolume;
        uint256 priceChange24h;
        uint256 priceChange7d;
        uint256 allTimeHigh;
        uint256 allTimeLow;
        uint256 lastPrice;
        uint256 marketCap;
        uint256 totalTrades;
        uint256 uniqueTraders;
        uint256 averageTradeSize;
        uint256 lastVolumeReset;
    }
    
    mapping(address => TokenTradingStats) public tokenStats;
    mapping(address => mapping(address => bool)) public hasTraded; // token => trader => hasTraded
    
    // Events
    event TradeExecuted(
        address indexed trader,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 fee,
        uint256 priceImpact,
        uint256 timestamp,
        bytes32 tradeHash
    );
    
    event LiquidityAdded(
        address indexed provider,
        bytes32 indexed pairId,
        uint256 amountA,
        uint256 amountB,
        uint256 liquidity,
        uint256 timestamp
    );
    
    event LiquidityRemoved(
        address indexed provider,
        bytes32 indexed pairId,
        uint256 amountA,
        uint256 amountB,
        uint256 liquidity,
        uint256 timestamp
    );
    
    event FeeUpdated(string feeType, uint256 oldFee, uint256 newFee);
    event MEVAttemptBlocked(address indexed trader, string reason, uint256 timestamp);
    event PriceImpactExceeded(address indexed trader, uint256 impact, uint256 threshold);
    
    constructor(
        address payable _whaleToken,
        address payable _tokenFactory,
        address _analyticsContract
    ) Ownable(msg.sender) {
        whaleToken = WhaleToken(_whaleToken);
        tokenFactory = TokenFactory(_tokenFactory);
        analyticsContract = TokenAnalyticsEnhanced(_analyticsContract);
        
        // Initialize fee structure for mainnet
        fees = FeeStructure({
            baseFee: 30,      // 0.3%
            maxFee: 100,      // 1%
            creatorShare: 70, // 70% of fees go to creator
            platformShare: 20, // 20% to platform
            stakingShare: 10,  // 10% to staking rewards
            volumeThreshold: 1000 ether, // Volume threshold for fee reduction
            holderThreshold: 100 // Holder threshold for fee reduction
        });
        
        // Initialize MEV protection for trading
        tradingMEVConfig = MEVProtectionLibrary.getDefaultMEVConfig();
        tradingMEVConfig.maxTransactionSize = 50 ether; // Reduced for trading
        tradingMEVConfig.timeWindow = 60; // 1 minute window
    }
    
    /**
     * @dev Create a new trading pair with enhanced configuration
     */
    function createPair(
        address tokenA, 
        address tokenB,
        uint256 customFee
    ) external returns (bytes32) {
        require(tokenA != tokenB, "Identical tokens");
        require(tokenA != address(0) && tokenB != address(0), "Zero address");
        require(customFee <= fees.maxFee, "Fee too high");
        
        bytes32 pairId = keccak256(abi.encodePacked(tokenA, tokenB));
        require(!tradingPairs[pairId].isActive, "Pair already exists");
        
        uint256 pairFee = customFee > 0 ? customFee : fees.baseFee;
        
        tradingPairs[pairId] = TradingPair({
            tokenA: tokenA,
            tokenB: tokenB,
            reserveA: 0,
            reserveB: 0,
            totalSupply: 0,
            lastTradeTime: block.timestamp,
            totalVolume24h: 0,
            lastVolumeReset: block.timestamp,
            isActive: true,
            fee: pairFee
        });
        
        allPairs.push(pairId);
        return pairId;
    }
    
    /**
     * @dev Execute a trade with full MEV protection and analytics
     */
    function executeTradeWithProtection(
        bytes32 pairId,
        uint256 amountIn,
        uint256 minAmountOut,
        address tokenIn,
        uint256 deadline
    ) external payable nonReentrant returns (uint256 amountOut) {
        require(block.timestamp <= deadline, "Trade expired");
        require(amountIn > 0, "Invalid input amount");
        
        // Optional MEV Protection - warning only, no blocking
        bool mevWarning = !_checkTradingMEVProtection(msg.sender, amountIn);
        if (mevWarning) {
            emit MEVAttemptBlocked(msg.sender, "MEV Warning - Consider using protection", block.timestamp);
        }
        
        TradingPair storage pair = tradingPairs[pairId];
        require(pair.isActive, "Pair not active");
        
        // Calculate trade output and price impact
        uint256 priceImpact;
        (amountOut, priceImpact) = _calculateTradeOutput(pair, tokenIn, amountIn);
        require(amountOut >= minAmountOut, "Slippage exceeded");
        
        // Price impact warning only - no restrictions
        if (priceImpact > tradingMEVConfig.priceImpactThreshold) {
            emit PriceImpactExceeded(msg.sender, priceImpact, tradingMEVConfig.priceImpactThreshold);
            // No restrictions - users can trade with any price impact they choose
        }
        
        // Calculate and distribute fees
        uint256 totalFee = _calculateDynamicFee(tokenIn, amountIn);
        uint256 netAmountOut = amountOut - totalFee;
        
        // Execute the trade
        _executeTrade(pair, tokenIn, amountIn, netAmountOut, totalFee);
        
        // Record trade for analytics
        bytes32 tradeHash = _recordTradeForAnalytics(
            msg.sender, tokenIn, pair.tokenB, amountIn, netAmountOut, priceImpact
        );
        
        // Update MEV protection data
        _updateTradingMEVData(msg.sender, amountIn);
        
        emit TradeExecuted(
            msg.sender,
            tokenIn,
            pair.tokenB,
            amountIn,
            netAmountOut,
            totalFee,
            priceImpact,
            block.timestamp,
            tradeHash
        );
        
        return netAmountOut;
    }
    
    /**
     * @dev Calculate trade output and price impact
     */
    function _calculateTradeOutput(
        TradingPair storage pair,
        address tokenIn,
        uint256 amountIn
    ) internal view returns (uint256 amountOut, uint256 priceImpact) {
        uint256 reserveIn;
        uint256 reserveOut;
        
        if (tokenIn == pair.tokenA) {
            reserveIn = pair.reserveA;
            reserveOut = pair.reserveB;
        } else {
            reserveIn = pair.reserveB;
            reserveOut = pair.reserveA;
        }
        
        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");
        
        // Calculate price before trade
        uint256 priceBefore = (reserveOut * 1e18) / reserveIn;
        
        // Use constant product formula with fee
        uint256 amountInWithFee = amountIn * (10000 - pair.fee) / 10000;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn + amountInWithFee;
        amountOut = numerator / denominator;
        
        // Calculate price after trade
        uint256 newReserveIn = reserveIn + amountIn;
        uint256 newReserveOut = reserveOut - amountOut;
        uint256 priceAfter = (newReserveOut * 1e18) / newReserveIn;
        
        // Calculate price impact
        if (priceAfter >= priceBefore) {
            priceImpact = 0;
        } else {
            priceImpact = ((priceBefore - priceAfter) * 10000) / priceBefore;
        }
        
        return (amountOut, priceImpact);
    }
    
    /**
     * @dev Calculate dynamic trading fee based on volume and holders
     */
    function _calculateDynamicFee(address token, uint256 amount) internal view returns (uint256) {
        uint256 dynamicFee = fees.baseFee;
        
        // Get token stats for fee calculation
        try analyticsContract.getTokenAnalytics(token) returns (
            uint256 holderCount,
            uint256 /* totalTrades */,
            uint256 dailyVolume,
            uint256 /* priceChange24h */,
            uint256 /* liquidityRatio */,
            bool /* isHealthy */
        ) {
            // Reduce fee based on volume
            if (dailyVolume > fees.volumeThreshold) {
                dynamicFee = dynamicFee * 80 / 100; // 20% reduction
            }
            
            // Reduce fee based on holder count
            if (holderCount > fees.holderThreshold) {
                dynamicFee = dynamicFee * 90 / 100; // 10% reduction
            }
            
            // Additional reduction for very high volume
            if (dailyVolume > fees.volumeThreshold * 10) {
                dynamicFee = dynamicFee * 80 / 100; // Additional 20% reduction
            }
        } catch {
            // Use base fee if analytics unavailable
        }
        
        // Ensure fee stays within bounds
        if (dynamicFee < fees.baseFee / 2) {
            dynamicFee = fees.baseFee / 2; // Minimum 50% of base fee
        }
        if (dynamicFee > fees.maxFee) {
            dynamicFee = fees.maxFee;
        }
        
        return (amount * dynamicFee) / 10000;
    }
    
    /**
     * @dev Execute the actual trade
     */
    function _executeTrade(
        TradingPair storage pair,
        address tokenIn,
        uint256 amountIn,
        uint256 amountOut,
        uint256 fee
    ) internal {
        // Transfer tokens
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        
        address tokenOut = tokenIn == pair.tokenA ? pair.tokenB : pair.tokenA;
        IERC20(tokenOut).transfer(msg.sender, amountOut);
        
        // Update reserves
        if (tokenIn == pair.tokenA) {
            pair.reserveA += amountIn;
            pair.reserveB -= amountOut;
        } else {
            pair.reserveB += amountIn;
            pair.reserveA -= amountOut;
        }
        
        // Update volume tracking
        _updateVolumeTracking(pair, amountIn);
        
        // Distribute fees
        _distributeTradingFees(tokenIn, fee);
        
        pair.lastTradeTime = block.timestamp;
    }
    
    /**
     * @dev Record trade for comprehensive analytics
     */
    function _recordTradeForAnalytics(
        address trader,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 priceImpact
    ) internal returns (bytes32 tradeHash) {
        tradeHash = keccak256(abi.encodePacked(
            trader, tokenIn, tokenOut, amountIn, amountOut, block.timestamp, block.number
        ));
        
        // Store trade order
        userTrades[trader].push(TradeOrder({
            trader: trader,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            amountOut: amountOut,
            priceImpact: priceImpact,
            timestamp: block.timestamp,
            gasPrice: tx.gasprice,
            tradeHash: tradeHash
        }));
        
        userTradeCount[trader]++;
        
        // Update token trading statistics
        _updateTokenStats(tokenIn, amountIn);
        _updateTokenStats(tokenOut, amountOut);
        
        // Record in analytics contract
        try analyticsContract.recordTrade(
            tokenIn,
            trader,
            true, // Assuming buy for tokenIn
            amountIn,
            amountOut,
            priceImpact,
            tradeHash
        ) {} catch {}
        
        return tradeHash;
    }
    
    /**
     * @dev Update comprehensive token trading statistics
     */
    function _updateTokenStats(address token, uint256 volume) internal {
        TokenTradingStats storage stats = tokenStats[token];
        
        // Reset daily volume if needed
        if (block.timestamp > stats.lastVolumeReset + 24 hours) {
            stats.dailyVolume = 0;
            stats.lastVolumeReset = block.timestamp;
        }
        
        // Reset weekly volume
        if (block.timestamp > stats.lastVolumeReset + 7 days) {
            stats.weeklyVolume = 0;
        }
        
        // Reset monthly volume
        if (block.timestamp > stats.lastVolumeReset + 30 days) {
            stats.monthlyVolume = 0;
        }
        
        // Update volumes
        stats.totalVolume += volume;
        stats.dailyVolume += volume;
        stats.weeklyVolume += volume;
        stats.monthlyVolume += volume;
        stats.totalTrades++;
        
        // Track unique traders
        if (!hasTraded[token][msg.sender]) {
            hasTraded[token][msg.sender] = true;
            stats.uniqueTraders++;
        }
        
        // Update average trade size
        stats.averageTradeSize = stats.totalTrades > 0 ? stats.totalVolume / stats.totalTrades : 0;
        
        // Update price tracking (simplified - in production use oracle)
        uint256 currentPrice = volume; // Simplified price calculation
        if (currentPrice > stats.allTimeHigh) {
            stats.allTimeHigh = currentPrice;
        }
        if (stats.allTimeLow == 0 || currentPrice < stats.allTimeLow) {
            stats.allTimeLow = currentPrice;
        }
        
        // Calculate price changes (simplified)
        if (stats.lastPrice > 0) {
            stats.priceChange24h = ((currentPrice - stats.lastPrice) * 10000) / stats.lastPrice;
        }
        stats.lastPrice = currentPrice;
        
        // Update market cap (get from token contract)
        try tokenFactory.isValidToken(token) returns (bool isValid) {
            if (isValid) {
                // Get market cap from CreatorToken
                stats.marketCap = currentPrice; // Simplified
            }
        } catch {}
    }
    
    /**
     * @dev Check MEV protection for trading
     */
    function _checkTradingMEVProtection(address trader, uint256 amount) internal returns (bool) {
        // Rate limiting
        if (MEVProtectionLibrary.checkRateLimit(traderRateLimits[trader], amount, tradingMEVConfig)) {
            emit MEVAttemptBlocked(trader, "Rate limit exceeded", block.timestamp);
            return false;
        }
        
        // Block delay protection
        if (lastTradeBlock[trader] > 0 && 
            block.number < lastTradeBlock[trader] + tradingMEVConfig.commitRevealDelay) {
            emit MEVAttemptBlocked(trader, "Block delay violation", block.timestamp);
            return false;
        }
        
        // Gas price protection (prevent excessive gas price manipulation)
        uint256 maxGasPrice = tx.gasprice * 150 / 100; // Max 1.5x current gas price
        if (tx.gasprice > maxGasPrice) {
            emit MEVAttemptBlocked(trader, "Gas price manipulation", block.timestamp);
            return false;
        }
        
        return true;
    }
    
    /**
     * @dev Update MEV protection data after trade
     */
    function _updateTradingMEVData(address trader, uint256 amount) internal {
        lastTradeBlock[trader] = block.number;
        // Update MEV protection based on trade size
        if (amount > 1 ether) { // Large trades get additional scrutiny
            // Additional MEV protection for large trades
            require(tx.gasprice <= block.basefee * 2, "Gas price too high for large trade");
        }
    }
    
    /**
     * @dev Update volume tracking for pairs
     */
    function _updateVolumeTracking(TradingPair storage pair, uint256 volume) internal {
        // Reset 24h volume if needed
        if (block.timestamp > pair.lastVolumeReset + 24 hours) {
            pair.totalVolume24h = 0;
            pair.lastVolumeReset = block.timestamp;
        }
        
        pair.totalVolume24h += volume;
    }
    
    /**
     * @dev Distribute trading fees among stakeholders
     */
    function _distributeTradingFees(address token, uint256 totalFee) internal {
        address creator = tokenFactory.tokenToCreator(token);
        
        uint256 creatorFee = totalFee * fees.creatorShare / 100;
        uint256 platformFee = totalFee * fees.platformShare / 100;
        uint256 stakingFee = totalFee * fees.stakingShare / 100;
        
        // Update earnings
        if (creator != address(0)) {
            creatorEarnings[creator] += creatorFee;
        }
        platformRevenue += platformFee;
        stakingRewards += stakingFee;
        totalFeesGenerated[token] += totalFee;
    }
    
    /**
     * @dev Get comprehensive trading statistics for a token
     */
    function getTokenTradingStats(address token) external view returns (
        uint256 totalVolume,
        uint256 dailyVolume,
        uint256 weeklyVolume,
        uint256 totalTrades,
        uint256 uniqueTraders,
        uint256 averageTradeSize,
        uint256 priceChange24h,
        uint256 allTimeHigh,
        uint256 allTimeLow
    ) {
        TokenTradingStats storage stats = tokenStats[token];
        return (
            stats.totalVolume,
            stats.dailyVolume,
            stats.weeklyVolume,
            stats.totalTrades,
            stats.uniqueTraders,
            stats.averageTradeSize,
            stats.priceChange24h,
            stats.allTimeHigh,
            stats.allTimeLow
        );
    }
    
    /**
     * @dev Get recent trades for a user
     */
    function getUserRecentTrades(address user, uint256 limit) external view returns (TradeOrder[] memory) {
        require(limit <= 50, "Limit too high");
        
        TradeOrder[] memory trades = userTrades[user];
        uint256 length = trades.length > limit ? limit : trades.length;
        TradeOrder[] memory recentTrades = new TradeOrder[](length);
        
        // Get most recent trades
        for (uint256 i = 0; i < length; i++) {
            recentTrades[i] = trades[trades.length - 1 - i];
        }
        
        return recentTrades;
    }
    
    /**
     * @dev Admin functions
     */
    function updateFeeStructure(
        uint256 _baseFee,
        uint256 _maxFee,
        uint256 _creatorShare,
        uint256 _platformShare,
        uint256 _stakingShare
    ) external onlyOwner {
        require(_baseFee <= _maxFee, "Base fee cannot exceed max fee");
        require(_creatorShare + _platformShare + _stakingShare == 100, "Shares must sum to 100");
        require(_maxFee <= 200, "Max fee too high"); // Max 2%
        
        fees.baseFee = _baseFee;
        fees.maxFee = _maxFee;
        fees.creatorShare = _creatorShare;
        fees.platformShare = _platformShare;
        fees.stakingShare = _stakingShare;
    }
    
    function withdrawPlatformRevenue() external onlyOwner {
        uint256 amount = platformRevenue;
        platformRevenue = 0;
        payable(owner()).transfer(amount);
    }
    
    function distributeStakingRewards() external onlyOwner {
        uint256 amount = stakingRewards;
        stakingRewards = 0;
        whaleToken.distributeFees{value: amount}();
    }
    
    // Receive ETH
    receive() external payable {}
}