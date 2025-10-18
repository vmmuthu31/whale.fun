// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./CreatorToken.sol";
import "./TokenFactoryRoot.sol";

/**
 * @title TokenGraduation
 * @dev Handles token graduation to DEX liquidity pools
 */
contract TokenGraduation is ReentrancyGuard, Ownable {
    
    TokenFactory public immutable tokenFactory;
    
    // Token graduation system
    mapping(address => bool) public graduatedTokens;
    mapping(address => uint256) public graduationThreshold;
    mapping(address => address) public graduatedPairs; // token => LP pair
    
    // Graduation configuration
    uint256 public constant DEFAULT_GRADUATION_THRESHOLD = 20e18; // $20 USD worth in ETH
    uint256 public constant MIN_GRADUATION_THRESHOLD = 5e18;      // $5 USD minimum
    uint256 public constant MAX_GRADUATION_THRESHOLD = 1000e18;   // $1000 USD maximum
    
    // Price oracle for USD conversion (simplified - in production use Chainlink)
    uint256 public ethToUsdRate = 2000e18; // $2000 per ETH (18 decimals)
    address public priceOracle; // Future Chainlink oracle integration
    
    // Graduation events
    event TokenGraduated(
        address indexed token,
        address indexed creator,
        uint256 finalMarketCap,
        address liquidityPair,
        uint256 timestamp
    );
    
    event GraduationThresholdUpdated(
        address indexed token,
        uint256 oldThreshold,
        uint256 newThreshold
    );
    
    event DefaultGraduationThresholdsUpdated(
        uint256 marketCapThreshold,
        uint256 volumeThreshold, 
        uint256 holderThreshold
    );
    
    constructor(address _tokenFactory) Ownable(msg.sender) {
        tokenFactory = TokenFactory(payable(_tokenFactory));
    }
    
    /**
     * @dev Set custom graduation threshold for a token
     */
    function setGraduationThreshold(address tokenAddress, uint256 thresholdInUSD) external {
        require(tokenFactory.isValidToken(tokenAddress), "Invalid token");
        require(tokenFactory.tokenToCreator(tokenAddress) == msg.sender || msg.sender == owner(), "Not authorized");
        require(!graduatedTokens[tokenAddress], "Already graduated");
        require(thresholdInUSD >= MIN_GRADUATION_THRESHOLD && thresholdInUSD <= MAX_GRADUATION_THRESHOLD, "Invalid threshold");
        
        uint256 oldThreshold = graduationThreshold[tokenAddress];
        graduationThreshold[tokenAddress] = thresholdInUSD;
        
        emit GraduationThresholdUpdated(tokenAddress, oldThreshold, thresholdInUSD);
    }
    
    /**
     * @dev Get graduation threshold for a token (defaults to $20 if not set)
     */
    function getGraduationThreshold(address tokenAddress) public view returns (uint256) {
        uint256 threshold = graduationThreshold[tokenAddress];
        return threshold > 0 ? threshold : DEFAULT_GRADUATION_THRESHOLD;
    }
    
    /**
     * @dev Convert USD amount to ETH equivalent
     */
    function usdToEth(uint256 usdAmount) public view returns (uint256) {
        require(ethToUsdRate > 0, "Invalid ETH rate");
        return (usdAmount * 1e18) / ethToUsdRate;
    }
    
    /**
     * @dev Check if token is ready for graduation with comprehensive criteria
     */
    function isReadyForGraduation(address tokenAddress) public view returns (bool) {
        if (!tokenFactory.isValidToken(tokenAddress) || graduatedTokens[tokenAddress]) {
            return false;
        }
        
        try CreatorToken(payable(tokenAddress)).getTokenStats() returns (
            uint256, uint256, uint256, uint256 marketCap, uint256 holderCount, uint256
        ) {
            // Check market cap threshold
            uint256 thresholdInUSD = getGraduationThreshold(tokenAddress);
            uint256 thresholdInETH = usdToEth(thresholdInUSD);
            if (marketCap < thresholdInETH) return false;
            
            // Check minimum holder count (community requirement)
            if (holderCount < 50) return false;
            
            // Check bonding curve progress (at least 80% sold)
            try CreatorToken(payable(tokenAddress)).getBondingCurveProgress() returns (
                uint256 progressPercentage, uint256, uint256, uint256
            ) {
                if (progressPercentage < 80) return false;
            } catch {
                return false;
            }
            
            // Check minimum liquidity for graduation
            uint256 contractBalance = tokenAddress.balance;
            if (contractBalance < 1 ether) return false; // Minimum 1 ETH liquidity
            
            // Check token age (minimum 24 hours)
            uint256 tokenAge = block.timestamp - tokenFactory.tokenToLaunchTime(tokenAddress);
            if (tokenAge < 24 hours) return false;
            
            return true;
        } catch {
            return false;
        }
    }
    
    /**
     * @dev Check if token is eligible for graduation
     */
    function isEligibleForGraduation(address token) external view returns (bool) {
        if (!tokenFactory.isValidToken(token) || graduatedTokens[token]) {
            return false;
        }
        
        try CreatorToken(payable(token)).getTokenStats() returns (
            uint256, uint256, uint256, uint256 marketCap, uint256 holderCount, uint256
        ) {
            // Check market cap threshold
            uint256 threshold = graduationThreshold[token] > 0 
                ? graduationThreshold[token] 
                : getGraduationThreshold(token);
            
            if (marketCap < usdToEth(threshold)) return false;
            
            // Check holder count
            if (holderCount < 10) return false; // Minimum 10 holders
            
            return true;
        } catch {
            return false;
        }
    }
    
    /**
     * @dev Graduate token to DEX with real implementation
     */
    function graduateToken(address token, address dexRouter) external nonReentrant returns (address liquidityPair) {
        require(tokenFactory.isValidToken(token), "Invalid token");
        require(!graduatedTokens[token], "Already graduated");
        require(dexRouter != address(0), "Invalid DEX router");
        require(supportedDEXRouters[dexRouter], "DEX not supported");
        
        // Check eligibility
        require(this.isEligibleForGraduation(token), "Token not eligible for graduation");
        
        // Only token creator or factory owner can graduate
        address creator = tokenFactory.tokenToCreator(token);
        require(msg.sender == creator || msg.sender == owner(), "Not authorized");
        
        CreatorToken creatorToken = CreatorToken(payable(token));
        
        // Get token stats
        (uint256 totalSupply, uint256 totalSold, , uint256 marketCap, ,) = 
            creatorToken.getTokenStats();
        
        // Mark as graduated to prevent reentrancy
        graduatedTokens[token] = true;
        
        // Calculate liquidity amounts from bonding curve
        uint256 tokenAmount = totalSupply - totalSold; // Remaining tokens
        uint256 ethAmount = address(creatorToken).balance; // ETH collected
        
        require(tokenAmount > 0 && ethAmount > 0, "Insufficient liquidity for graduation");
        
        // Create DEX pool and add liquidity
        liquidityPair = _createDexPool(token, tokenAmount, ethAmount, dexRouter);
        
        // Store graduation data
        graduatedPairs[token] = liquidityPair;
        
        emit TokenGraduated(
            token,
            creator,
            marketCap,
            liquidityPair,
            block.timestamp
        );
        
        return liquidityPair;
    }
    
    // DEX Integration mappings
    mapping(address => bool) public supportedDEXRouters;
    mapping(address => address) public dexFactories; // router => factory
    mapping(address => bool) public isV3DEX;
    
    // DEX configuration events
    event DEXConfigured(
        address indexed router,
        address indexed factory,
        bool isV3,
        bool supported
    );
    
    /**
     * @dev Configure DEX for graduation support
     */
    function configureDEX(
        address router,
        address factory,
        bool _isV3,
        bool supported
    ) external onlyOwner {
        supportedDEXRouters[router] = supported;
        dexFactories[router] = factory;
        isV3DEX[router] = _isV3;
        
        emit DEXConfigured(router, factory, _isV3, supported);
    }
    
    /**
     * @dev Create DEX pool for graduated tokens with dynamic DEX support
     */
    function _createDexPool(
        address token, 
        uint256 tokenAmount, 
        uint256 ethAmount, 
        address dexRouter
    ) internal returns (address poolAddress) {
        require(supportedDEXRouters[dexRouter], "DEX not supported");
        require(tokenAmount > 0 && ethAmount > 0, "Invalid amounts");
        
        address factory = dexFactories[dexRouter];
        require(factory != address(0), "Factory not configured");
        
        // Get WETH address (assumed to be available on DEX)
        address weth = _getWETHAddress(dexRouter);
        require(weth != address(0), "WETH not found");
        
        if (isV3DEX[dexRouter]) {
            // Create V3 pool with 0.3% fee tier
            poolAddress = _createV3Pool(token, weth, factory, 3000);
        } else {
            // Create V2 pool
            poolAddress = _createV2Pool(token, weth, factory);
        }
        
        require(poolAddress != address(0), "Pool creation failed");
        
        // Transfer tokens and ETH for liquidity
        CreatorToken(payable(token)).transfer(address(this), tokenAmount);
        
        return poolAddress;
    }
    
    /**
     * @dev Create Uniswap V3 style pool
     */
    function _createV3Pool(
        address token,
        address weth,
        address factory,
        uint24 fee
    ) internal returns (address poolAddress) {
        // Call factory to create pool
        bytes memory data = abi.encodeWithSignature(
            "createPool(address,address,uint24)",
            token,
            weth,
            fee
        );
        
        (bool success, bytes memory result) = factory.call(data);
        require(success, "V3 pool creation failed");
        
        poolAddress = abi.decode(result, (address));
    }
    
    /**
     * @dev Create Uniswap V2 style pool
     */
    function _createV2Pool(
        address token,
        address weth,
        address factory
    ) internal returns (address poolAddress) {
        // Call factory to create pair
        bytes memory data = abi.encodeWithSignature(
            "createPair(address,address)",
            token,
            weth
        );
        
        (bool success, bytes memory result) = factory.call(data);
        require(success, "V2 pair creation failed");
        
        poolAddress = abi.decode(result, (address));
    }
    
    /**
     * @dev Get WETH address for the given DEX router
     */
    function _getWETHAddress(address dexRouter) internal view returns (address) {
        // Try to get WETH from router
        try this._callWETH(dexRouter) returns (address weth) {
            return weth;
        } catch {
            // Fallback: use common WETH addresses
            return _getDefaultWETH();
        }
    }
    
    /**
     * @dev External function to call WETH() on router (for try-catch)
     */
    function _callWETH(address router) external view returns (address) {
        bytes memory data = abi.encodeWithSignature("WETH()");
        (bool success, bytes memory result) = router.staticcall(data);
        require(success, "WETH call failed");
        return abi.decode(result, (address));
    }
    
    /**
     * @dev Get default WETH address based on chain
     */
    function _getDefaultWETH() internal view returns (address) {
        uint256 chainId = block.chainid;
        
        // 0G Networks - Jarinne DEX integration
        if (chainId == 16661) { // 0G Mainnet
            return 0x1Cd0690fF9a693f5EF2dD976660a8dAFc81A109c; // Jarinne WETH
        }
        if (chainId == 16600) { // 0G Testnet  
            return 0x0fE9B43625fA7EdD663aDcEC0728DD635e4AbF7c; // Testnet WETH
        }
        
        // Base networks
        if (chainId == 8453 || chainId == 84532) {
            return 0x4200000000000000000000000000000000000006; // Base WETH
        }
        
        // Ethereum mainnet
        if (chainId == 1) {
            return 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2; // Ethereum WETH
        }
        
        return address(0); // Unknown chain
    }
    
    /**
     * @dev Update ETH to USD rate (owner only, in production use Chainlink oracle)
     */
    function updateEthToUsdRate(uint256 newRate) external onlyOwner {
        require(newRate > 0, "Invalid rate");
        ethToUsdRate = newRate;
    }
    
    /**
     * @dev Get graduation status and info for a token
     */
    function getGraduationInfo(address tokenAddress) external view returns (
        bool isGraduated,
        uint256 thresholdInUSD,
        uint256 thresholdInETH,
        uint256 currentMarketCap,
        bool readyForGraduation,
        address liquidityPair
    ) {
        isGraduated = graduatedTokens[tokenAddress];
        thresholdInUSD = getGraduationThreshold(tokenAddress);
        thresholdInETH = usdToEth(thresholdInUSD);
        liquidityPair = graduatedPairs[tokenAddress];
        readyForGraduation = isReadyForGraduation(tokenAddress);
        
        try CreatorToken(payable(tokenAddress)).getTokenStats() returns (
            uint256, uint256, uint256, uint256 marketCap, uint256, uint256
        ) {
            currentMarketCap = marketCap;
        } catch {
            currentMarketCap = 0;
        }
        
        return (isGraduated, thresholdInUSD, thresholdInETH, currentMarketCap, readyForGraduation, liquidityPair);
    }
}
