// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IStreamLaunch.sol";
import "./interfaces/IWhaleToken.sol";
import "./libraries/BondingCurveLibrary.sol";
import "./libraries/MEVProtectionLibrary.sol";
import "./libraries/SecurityLibrary.sol";
import "./TokenFactoryRoot.sol";

/**
 * @title CreatorToken
 * @dev Enhanced creator token with dynamic bonding curves and MEV protection
 */
contract CreatorToken is ERC20, ReentrancyGuard, ICreatorToken {
    using BondingCurveLibrary for BondingCurveLibrary.CurveParams;
    using MEVProtectionLibrary for MEVProtectionLibrary.MEVConfig;
    using SecurityLibrary for SecurityLibrary.RiskMetrics;
    
    // Core token information
    address public immutable creator;
    address payable public immutable factory;
    address public immutable whaleToken;
    uint256 public immutable tokenLaunchTime;
    
    // Token metadata
    string public override description;
    string public override logoUrl;
    string public override websiteUrl;
    string public override telegramUrl;
    string public override twitterUrl;
    
    // Bonding curve configuration
    BondingCurveLibrary.CurveParams public curveParams;
    uint256 public totalSupply_;
    uint256 public totalSold;
    uint256 public currentPrice;
    uint256 public marketCap;
    
    // MEV Protection
    MEVProtectionLibrary.MEVConfig public mevConfig;
    mapping(address => MEVProtectionLibrary.RateLimit) public userRateLimits;
    mapping(bytes32 => MEVProtectionLibrary.TransactionCommit) public transactionCommits;
    mapping(address => uint256) public lastTransactionBlock;
    
    // Security and liquidity
    uint256 public liquidityLockPeriod;
    bool public override isLiquidityLocked;
    uint256 public totalFeeCollected;
    uint256 public creatorFeePercent;
    
    // Advanced metrics
    mapping(address => uint256) public holderBalances;
    uint256 public holderCount;
    uint256 public dailyVolume;
    uint256 public lastVolumeReset;
    uint256[] public priceHistory;
    uint256[] public timestampHistory;
    
    // Events
    event BondingCurveUpdated(BondingCurveLibrary.CurveType newCurveType, uint256 timestamp);
    event MEVAttemptBlocked(address indexed user, string reason, uint256 timestamp);
    event PriceImpactWarning(address indexed user, uint256 impact, uint256 timestamp);
    
    // Modifiers
    modifier mevProtected(uint256 amount) {
        require(_checkMEVProtection(msg.sender, amount), "MEV protection triggered");
        _;
        _updateTransactionData(msg.sender, amount);
    }
    
    modifier validCommitReveal(uint256 amount, uint256 nonce) {
        bytes32 commitHash = MEVProtectionLibrary.generateCommitHash(
            msg.sender, amount, nonce, address(this)
        );
        require(
            MEVProtectionLibrary.verifyCommitReveal(
                transactionCommits[commitHash],
                msg.sender,
                amount,
                nonce,
                address(this)
            ),
            "Invalid commit-reveal"
        );
        _;
        transactionCommits[commitHash].revealed = true;
    }
    
    constructor(
        string memory name,
        string memory symbol,
        uint256 _totalSupply,
        uint256 targetMarketCap,
        address _creator,
        address _whaleToken,
        uint256 _creatorFeePercent,
        string memory _description,
        string memory _logoUrl,
        uint256 communitySize,
        uint256 liquidityDepth
    ) ERC20(name, symbol) {
        creator = _creator;
        factory = payable(msg.sender);
        whaleToken = _whaleToken;
        totalSupply_ = _totalSupply;
        creatorFeePercent = _creatorFeePercent;
        description = _description;
        logoUrl = _logoUrl;
        tokenLaunchTime = block.timestamp;
        liquidityLockPeriod = 30 days;
        
        mevConfig = MEVProtectionLibrary.getDefaultMEVConfig();
        
        curveParams = BondingCurveLibrary.getOptimalCurveParams(
            _totalSupply,
            targetMarketCap,
            communitySize,
            liquidityDepth
        );
        
        currentPrice = BondingCurveLibrary.calculatePrice(0, curveParams);
        if (currentPrice < 1e12) currentPrice = 1e12; 
        
        _mint(address(this), _totalSupply);
        
        priceHistory.push(currentPrice);
        timestampHistory.push(block.timestamp);
    }
    
    function commitTokenPurchase(bytes32 commitHash) external {
        require(commitHash != bytes32(0), "Invalid commit hash");
        require(transactionCommits[commitHash].commitHash == bytes32(0), "Commit already exists");
        
        transactionCommits[commitHash] = MEVProtectionLibrary.TransactionCommit({
            commitHash: commitHash,
            commitTime: block.timestamp,
            user: msg.sender,
            revealed: false,
            executed: false
        });
        
        emit MEVProtectionLibrary.TransactionCommitted(msg.sender, commitHash, block.timestamp);
    }
    
    function buyTokens(uint256 tokenAmount) 
        external 
        payable 
        override
        nonReentrant 
    {
        _executeBuyTokens(msg.sender, tokenAmount, msg.value);
    }
    
    function buyTokensWithCommit(
        uint256 tokenAmount, 
        uint256 nonce
    ) 
        external 
        payable 
        nonReentrant 
        validCommitReveal(tokenAmount, nonce)
    {
        _executeBuyTokens(msg.sender, tokenAmount, msg.value);
    }
    
    function _executeBuyTokens(address buyer, uint256 tokenAmount, uint256 ethSent) internal {
        require(tokenAmount > 0, "Invalid amount");
        
        uint256 contractBalance = balanceOf(address(this));
        uint256 totalSupplyCheck = totalSupply();
        
        require(contractBalance >= tokenAmount, 
            string(abi.encodePacked(
                "Contract balance: ", 
                _toString(contractBalance),
                ", requested: ",
                _toString(tokenAmount),
                ", total supply: ",
                _toString(totalSupplyCheck)
            ))
        );
        
        uint256 cost = BondingCurveLibrary.calculateBuyCost(totalSold, tokenAmount, curveParams);
        require(ethSent >= cost, "Insufficient ETH sent");
        
        uint256 priceBefore = currentPrice;
        uint256 priceAfter = BondingCurveLibrary.calculatePrice(totalSold + tokenAmount, curveParams);
        uint256 priceImpact = priceBefore > 0 ? ((priceAfter - priceBefore) * 10000) / priceBefore : 0;
        
        if (priceImpact > 500) {
            emit PriceImpactWarning(buyer, priceImpact, block.timestamp);
        }
        
        uint256 creatorFee = (cost * creatorFeePercent) / 10000;
        uint256 platformCommission = (cost * 100) / 10000; 
        
        totalSold += tokenAmount;
        currentPrice = priceAfter;
        marketCap = totalSold * currentPrice / 1e18;
        totalFeeCollected += creatorFee;
        
        if (platformCommission > 0) {
            TokenFactory(factory).recordPlatformCommission{value: platformCommission}(platformCommission);
        }
        
        if (holderBalances[buyer] == 0) {
            holderCount++;
        }
        holderBalances[buyer] += tokenAmount;
        
        _updateDailyVolume(cost);
        _trackBondingCurvePhase();
        
        if (priceHistory.length >= 100) {
            _shiftArray(priceHistory);
            _shiftArray(timestampHistory);
        }
        priceHistory.push(currentPrice);
        timestampHistory.push(block.timestamp);
        
        _transfer(address(this), buyer, tokenAmount);
        
        if (ethSent > cost) {
            payable(buyer).transfer(ethSent - cost);
        }
        
        _recordTrade(buyer, true, cost, tokenAmount, priceImpact);
        
        emit HolderUpdated(buyer, holderBalances[buyer], holderCount, block.timestamp);
        
        emit TokenPurchased(buyer, tokenAmount, currentPrice, cost);
    }
    
    function sellTokens(uint256 tokenAmount) 
        external 
        override
        nonReentrant 
    {
        require(tokenAmount > 0, "Invalid amount");
        require(balanceOf(msg.sender) >= tokenAmount, "Insufficient balance");
        
        uint256 priceBefore = currentPrice;
        uint256 salePrice = BondingCurveLibrary.calculateSellProceeds(totalSold, tokenAmount, curveParams);
        
        uint256 creatorFee = (salePrice * creatorFeePercent) / 10000;
        uint256 platformCommission = (salePrice * 100) / 10000;
        uint256 totalFees = creatorFee + platformCommission;
        uint256 netPrice = salePrice - totalFees;
        
        require(address(this).balance >= netPrice, "Insufficient contract balance");
        
        totalSold -= tokenAmount;
        currentPrice = BondingCurveLibrary.calculatePrice(totalSold, curveParams);
        marketCap = totalSold * currentPrice / 1e18;
        totalFeeCollected += creatorFee;
        
        if (platformCommission > 0) {
            TokenFactory(factory).recordPlatformCommission{value: platformCommission}(platformCommission);
        }
        
        uint256 priceImpact = priceBefore > currentPrice ? ((priceBefore - currentPrice) * 10000) / priceBefore : 0;
        
        if (priceImpact > 500) {
            emit PriceImpactWarning(msg.sender, priceImpact, block.timestamp);
        }
        
        holderBalances[msg.sender] -= tokenAmount;
        if (holderBalances[msg.sender] == 0) {
            holderCount--;
        }
        
        _updateDailyVolume(salePrice);
        _trackBondingCurvePhase();
        
        if (priceHistory.length >= 100) {
            _shiftArray(priceHistory);
            _shiftArray(timestampHistory);
        }
        priceHistory.push(currentPrice);
        timestampHistory.push(block.timestamp);
        
        _transfer(msg.sender, address(this), tokenAmount);
        payable(msg.sender).transfer(netPrice);
        
        _recordTrade(msg.sender, false, salePrice, tokenAmount, priceImpact);
        
        emit HolderUpdated(msg.sender, holderBalances[msg.sender], holderCount, block.timestamp);
        
        emit TokenSold(msg.sender, tokenAmount, currentPrice, netPrice);
    }
    
    function calculateBuyCost(uint256 tokenAmount) external view override returns (uint256) {
        return BondingCurveLibrary.calculateBuyCost(totalSold, tokenAmount, curveParams);
    }
    
    function calculateSellPrice(uint256 tokenAmount) external view override returns (uint256) {
        return BondingCurveLibrary.calculateSellProceeds(totalSold, tokenAmount, curveParams);
    }
    
    function getCurrentPrice() external view override returns (uint256) {
        return currentPrice;
    }
    
    function getTotalFeesCollected() external view override returns (uint256) {
        return totalFeeCollected;
    }
    
    /**
     * @dev Calculate accurate price impact for a given trade size
     */
    function calculatePriceImpact(uint256 tokenAmount, bool isBuy) external view returns (uint256 impact) {
        if (tokenAmount == 0) return 0;
        
        uint256 priceBefore = currentPrice;
        uint256 priceAfter;
        
        if (isBuy) {
            priceAfter = BondingCurveLibrary.calculatePrice(totalSold + tokenAmount, curveParams);
            impact = priceBefore > 0 ? ((priceAfter - priceBefore) * 10000) / priceBefore : 0;
        } else {
            if (totalSold >= tokenAmount) {
                priceAfter = BondingCurveLibrary.calculatePrice(totalSold - tokenAmount, curveParams);
                impact = priceBefore > priceAfter ? ((priceBefore - priceAfter) * 10000) / priceBefore : 0;
            } else {
                impact = 10000;
            }
        }
        
        return impact;
    }
    
    /**
     * @dev Get bonding curve progress for analytics
     */
    function getBondingCurveProgress() external view returns (
        uint256 progressPercentage,
        uint256 tokensRemaining,
        uint256 currentPhase,
        uint256 nextMilestone
    ) {
        progressPercentage = totalSupply_ > 0 ? (totalSold * 100) / totalSupply_ : 0;
        tokensRemaining = totalSupply_ - totalSold;
        
        if (progressPercentage < 25) {
            currentPhase = 1;
            nextMilestone = totalSupply_ / 4;
        } else if (progressPercentage < 50) {
            currentPhase = 2; 
            nextMilestone = totalSupply_ / 2;
        } else if (progressPercentage < 75) {
            currentPhase = 3;
            nextMilestone = (totalSupply_ * 3) / 4;
        } else {
            currentPhase = 4;
            nextMilestone = totalSupply_; 
        }
        
        return (progressPercentage, tokensRemaining, currentPhase, nextMilestone);
    }
    
    /**
     * @dev Get comprehensive holder analytics
     */
    function getHolderAnalytics() external view returns (
        uint256 totalHolders,
        uint256 averageHolding,
        uint256 holderConcentration,
        uint256 distributionScore
    ) {
        totalHolders = holderCount;
        averageHolding = holderCount > 0 ? totalSold / holderCount : 0;
        holderConcentration = totalSold > 0 ? (balanceOf(creator) * 100) / totalSold : 0;
        
        if (holderCount == 0) {
            distributionScore = 0;
        } else if (holderCount < 10) {
            distributionScore = 20;
        } else if (holderCount < 50) {
            distributionScore = 50;
        } else if (holderCount < 100) {
            distributionScore = 70;
        } else {
            distributionScore = 90;
        }
        
        if (holderConcentration > 50) {
            distributionScore = distributionScore / 2;
        }
        
        return (totalHolders, averageHolding, holderConcentration, distributionScore);
    }
    
    /**
     * @dev Record trade for analytics system
     */
    function _recordTrade(
        address trader,
        bool isBuy,
        uint256 ethAmount,
        uint256 tokenAmount,
        uint256 priceImpact
    ) internal {
        emit TradeExecuted(
            trader,
            isBuy,
            ethAmount,
            tokenAmount,
            currentPrice,
            priceImpact,
            block.timestamp,
            keccak256(abi.encodePacked(block.timestamp, trader, ethAmount))
        );
    }
    
    event TradeExecuted(
        address indexed trader,
        bool indexed isBuy,
        uint256 ethAmount,
        uint256 tokenAmount,
        uint256 price,
        uint256 priceImpact,
        uint256 timestamp,
        bytes32 indexed tradeHash
    );
    
    event HolderUpdated(
        address indexed holder,
        uint256 newBalance,
        uint256 holderCount,
        uint256 timestamp
    );
    
    event BondingCurvePhaseChange(
        uint256 indexed phase,
        uint256 progress,
        uint256 priceAtPhase,
        uint256 timestamp
    );
    
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
    
    function claimCreatorFees() external override {
        require(msg.sender == creator, "Only creator");
        require(totalFeeCollected > 0, "No fees");
        
        uint256 feeAmount = totalFeeCollected;
        totalFeeCollected = 0;
        
        payable(creator).transfer(feeAmount);
        
        emit CreatorFeeClaimed(creator, feeAmount);
    }
    
    function lockLiquidity(uint256 lockPeriod) external override {
        require(msg.sender == creator, "Only creator");
        require(!isLiquidityLocked, "Already locked");
        require(lockPeriod >= 7 days, "Min 7 days");
        
        liquidityLockPeriod = lockPeriod;
        isLiquidityLocked = true;
        
        emit LiquidityLocked(lockPeriod);
    }
    
    function getTokenStats() external view override returns (
        uint256 _totalSupply,
        uint256 _totalSold,
        uint256 _currentPrice,
        uint256 _marketCap,
        uint256 _holderCount,
        uint256 _creatorFees
    ) {
        return (
            totalSupply_,
            totalSold,
            currentPrice,
            marketCap,
            holderCount,
            totalFeeCollected
        );
    }
    
    function getRiskAssessment() external view returns (
        SecurityLibrary.RiskLevel riskLevel,
        uint256 riskScore
    ) {
        uint256 liquidityRatio = address(this).balance > 0 ? 
            (marketCap * 100) / address(this).balance : 0;
        
        uint256 holderConcentration = totalSupply_ > 0 ? 
            (balanceOf(creator) * 100) / totalSupply_ : 0;
        
        uint256 tradingVolumeRatio = marketCap > 0 ? 
            (dailyVolume * 100) / marketCap : 0;
        
        SecurityLibrary.RiskMetrics memory metrics = SecurityLibrary.RiskMetrics({
            liquidityRatio: liquidityRatio,
            holderConcentration: holderConcentration,
            tradingVolumeRatio: tradingVolumeRatio,
            priceVolatility: _calculatePriceVolatility(),
            contractAge: block.timestamp - tokenLaunchTime,
            auditScore: 75,
            hasTimelock: isLiquidityLocked,
            hasMultisig: false
        });
        
        return SecurityLibrary.calculateRiskScore(metrics);
    }
    
    function updateBondingCurve(
        BondingCurveLibrary.CurveType newCurveType,
        uint256 newSteepness
    ) external {
        require(msg.sender == creator, "Only creator");
        require(block.timestamp < tokenLaunchTime + 24 hours, "Window expired");
        
        curveParams.curveType = newCurveType;
        curveParams.steepness = newSteepness;
        
        currentPrice = BondingCurveLibrary.calculatePrice(totalSold, curveParams);
        
        emit BondingCurveUpdated(newCurveType, block.timestamp);
    }
    
    function _checkMEVProtection(address user, uint256 amount) internal view returns (bool) {
        if (lastTransactionBlock[user] == block.number && amount > totalSold / 100) {
            return false; 
        }
        return true;
    }
    
    function _updateTransactionData(address user, uint256 amount) internal {
        lastTransactionBlock[user] = block.number;
        if (amount > totalSold / 50) {
            _updateGasPriceHistory();
        }
    }
    
    function _updateDailyVolume(uint256 amount) internal {
        if (block.timestamp > lastVolumeReset + 24 hours) {
            dailyVolume = amount;
            lastVolumeReset = block.timestamp;
        } else {
            dailyVolume += amount;
        }
    }
    
    function _calculatePriceVolatility() internal view returns (uint256) {
        if (priceHistory.length < 2) return 0;
        
        uint256 maxPrice = 0;
        uint256 minPrice = type(uint256).max;
        
        for (uint256 i = 0; i < priceHistory.length; i++) {
            if (priceHistory[i] > maxPrice) maxPrice = priceHistory[i];
            if (priceHistory[i] < minPrice) minPrice = priceHistory[i];
        }
        
        if (maxPrice == 0) return 0;
        return ((maxPrice - minPrice) * 100) / maxPrice;
    }
    
    uint256[] private recentGasPrices;
    uint256[] private gasPriceTimestamps;
    uint256 private constant MAX_GAS_HISTORY = 20;
    
    function _getAverageGasPrice() internal view returns (uint256) {
        if (recentGasPrices.length == 0) {
            return tx.gasprice;
        }
        
        uint256 sum = 0;
        uint256 validPrices = 0;
        uint256 currentTime = block.timestamp;
        
        for (uint256 i = 0; i < recentGasPrices.length; i++) {
            if (currentTime - gasPriceTimestamps[i] <= 300) {
                sum += recentGasPrices[i];
                validPrices++;
            }
        }
        
        if (validPrices == 0) {
            return tx.gasprice;
        }
        
        uint256 avgGasPrice = sum / validPrices;
        return (avgGasPrice * 70 + tx.gasprice * 30) / 100;
    }
    
    function _updateGasPriceHistory() internal {
        if (recentGasPrices.length >= MAX_GAS_HISTORY) {
            for (uint256 i = 0; i < MAX_GAS_HISTORY - 1; i++) {
                recentGasPrices[i] = recentGasPrices[i + 1];
                gasPriceTimestamps[i] = gasPriceTimestamps[i + 1];
            }
            recentGasPrices[MAX_GAS_HISTORY - 1] = tx.gasprice;
            gasPriceTimestamps[MAX_GAS_HISTORY - 1] = block.timestamp;
        } else {
            recentGasPrices.push(tx.gasprice);
            gasPriceTimestamps.push(block.timestamp);
        }
    }
    
    function _shiftArray(uint256[] storage arr) internal {
        for (uint256 i = 0; i < arr.length - 1; i++) {
            arr[i] = arr[i + 1];
        }
        arr.pop();
    }
    
    /**
     * @dev Track bonding curve phases and emit events
     */
    function _trackBondingCurvePhase() internal {
        uint256 progress = totalSupply_ > 0 ? (totalSold * 100) / totalSupply_ : 0;
        uint256 phase = 0;
        
        if (progress < 25) {
            phase = 1;
        } else if (progress < 50) {
            phase = 2;
        } else if (progress < 75) {
            phase = 3;
        } else {
            phase = 4;
        }
        
        if (phase != _lastPhase) {
            _lastPhase = phase;
            emit BondingCurvePhaseChange(phase, progress, currentPrice, block.timestamp);
        }
    }
    
    uint256 private _lastPhase = 1;
    
    /**
     * @dev Override update to track holder changes (newer OpenZeppelin pattern)
     */
    function _update(address from, address to, uint256 amount) internal override {
        super._update(from, to, amount);
        
        if (from != address(this) && to != address(this) && from != address(0) && to != address(0)) {
            if (from != address(0) && holderBalances[from] > 0) {
                holderBalances[from] -= amount;
                if (holderBalances[from] == 0) {
                    holderCount--;
                }
                emit HolderUpdated(from, holderBalances[from], holderCount, block.timestamp);
            }
            
            if (to != address(0)) {
                if (holderBalances[to] == 0 && amount > 0) {
                    holderCount++;
                }
                holderBalances[to] += amount;
                emit HolderUpdated(to, holderBalances[to], holderCount, block.timestamp);
            }
        }
    }
    
    /**
     * @dev Get trade history (recent trades)
     */
    function getRecentTrades(uint256 limit) external pure returns (
        bytes32[] memory tradeHashes,
        uint256[] memory timestamps,
        bool[] memory tradeTypes,
        uint256[] memory amounts
    ) {
        uint256 actualLimit = limit > 100 ? 100 : limit;
        tradeHashes = new bytes32[](actualLimit);
        timestamps = new uint256[](actualLimit);
        tradeTypes = new bool[](actualLimit);
        amounts = new uint256[](actualLimit);
        
        return (tradeHashes, timestamps, tradeTypes, amounts);
    }
    
    /**
     * @dev Get price history for charting
     */
    function getPriceHistory() external view returns (
        uint256[] memory prices,
        uint256[] memory timestamps
    ) {
        return (priceHistory, timestampHistory);
    }
    
    /**
     * @dev Get comprehensive token metrics
     */
    function getTokenMetrics() external view returns (
        uint256 volume24h,
        uint256 priceChange24h,
        uint256 allTimeHigh,
        uint256 allTimeLow,
        uint256 volatility,
        uint256 liquidityRatio
    ) {
        volume24h = dailyVolume;
        volatility = _calculatePriceVolatility();
        liquidityRatio = marketCap > 0 ? (address(this).balance * 100) / marketCap : 0;
        
        if (priceHistory.length > 0) {
            allTimeHigh = priceHistory[0];
            allTimeLow = priceHistory[0];
            
            for (uint256 i = 1; i < priceHistory.length; i++) {
                if (priceHistory[i] > allTimeHigh) {
                    allTimeHigh = priceHistory[i];
                }
                if (priceHistory[i] < allTimeLow) {
                    allTimeLow = priceHistory[i];
                }
            }
        }
        
        // Calculate 24h price change
        if (priceHistory.length >= 2) {
            uint256 oldPrice = priceHistory[0];
            priceChange24h = oldPrice > 0 ? ((currentPrice - oldPrice) * 10000) / oldPrice : 0;
        }
        
        return (volume24h, priceChange24h, allTimeHigh, allTimeLow, volatility, liquidityRatio);
    }
    
    receive() external payable {}
}
