// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IStreamLaunch.sol";
import "./CreatorToken.sol";
import "./libraries/SecurityLibrary.sol";

/**
 * @title TokenFactory
 * @dev Root factory contract for creating and managing tokens
 */
contract TokenFactory is ReentrancyGuard, Ownable, ITokenFactory {
    using SecurityLibrary for SecurityLibrary.RiskMetrics;
    
    // Events
    event LaunchFeeUpdated(uint256 indexed oldFee, uint256 indexed newFee);
    
    address public immutable whaleToken;
    address[] public allTokens;
    mapping(address => address[]) public creatorTokens;
    mapping(address => bool) public override isValidToken;
    
    // Revenue model - competitive fees for sustainability
    uint256 public launchFee = 0.001 ether; // Small launch fee: ~$2 at current ETH prices
    uint256 public minInitialLiquidity = 0; // No minimum liquidity required
    uint256 public maxTokensPerCreator = 1000000; // Practically unlimited
    
    // Platform commission structure
    uint256 public platformCommissionRate = 100; // 1% on all trades (100 basis points)
    uint256 public creatorCommissionRate = 300; // 3% to creator (300 basis points)
    uint256 public constant MAX_TOTAL_COMMISSION = 500; // Max 5% total fees
    
    // Platform statistics & revenue tracking
    uint256 public totalTokensCreated;
    uint256 public totalVolumeTraded;
    uint256 public totalFeesCollected;
    uint256 public platformRevenue; // Our commission earnings
    uint256 public totalCommissionGenerated; // Total commission from all trades
    
    // Token creation limits
    mapping(address => uint256) public creatorTokenCount;
    mapping(address => uint256) public lastTokenCreation;
    
    // Enhanced creator tracking
    mapping(address => address) public tokenToCreator;
    mapping(address => uint256) public tokenToLaunchTime;
    mapping(address => uint256) public creatorUniqueTokens;
    address[] public uniqueCreators;
    
    // Gas price tracking removed for size optimization
    
    constructor(address _whaleToken) Ownable(msg.sender) {
        whaleToken = _whaleToken;
    }
    
    function createToken(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        uint256 targetMarketCap,
        uint256 creatorFeePercent,
        string memory description,
        string memory logoUrl
    ) external payable override returns (address) {
        return _createTokenWithCommunityData(
            name, symbol, totalSupply, targetMarketCap, creatorFeePercent,
            description, logoUrl, 0, msg.value - launchFee
        );
    }
    
    function createTokenWithCommunityData(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        uint256 targetMarketCap,
        uint256 creatorFeePercent,
        string memory description,
        string memory logoUrl,
        uint256 expectedCommunitySize
    ) external payable returns (address) {
        return _createTokenWithCommunityData(
            name, symbol, totalSupply, targetMarketCap, creatorFeePercent,
            description, logoUrl, expectedCommunitySize, msg.value - launchFee
        );
    }
    
    function _createTokenWithCommunityData(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        uint256 targetMarketCap,
        uint256 creatorFeePercent,
        string memory description,
        string memory logoUrl,
        uint256 communitySize,
        uint256 liquidityDepth
    ) internal nonReentrant returns (address) {
        // Revenue-generating validation while keeping platform open
        require(msg.value >= launchFee, "Low fee");
        require(totalSupply > 0, "Bad supply");
        require(targetMarketCap > 0, "Bad cap");
        require(bytes(name).length > 0, "Bad name");
        require(bytes(symbol).length > 0, "Bad symbol");
        require(creatorFeePercent + platformCommissionRate <= MAX_TOTAL_COMMISSION, "High fees");
        // Still very open but with sustainable revenue model
        
        // Deploy new enhanced token contract
        CreatorToken newToken = new CreatorToken(
            name,
            symbol,
            totalSupply,
            targetMarketCap,
            msg.sender,
            whaleToken,
            creatorFeePercent,
            description,
            logoUrl,
            communitySize,
            liquidityDepth
        );
        
        address tokenAddress = address(newToken);
        
        // Update tracking
        allTokens.push(tokenAddress);
        creatorTokens[msg.sender].push(tokenAddress);
        isValidToken[tokenAddress] = true;
        totalTokensCreated++;
        creatorTokenCount[msg.sender]++;
        lastTokenCreation[msg.sender] = block.timestamp;
        
        // Enhanced tracking
        tokenToCreator[tokenAddress] = msg.sender;
        tokenToLaunchTime[tokenAddress] = block.timestamp;
        _trackCreator(msg.sender);
        
        // Send initial liquidity to token contract
        payable(tokenAddress).transfer(liquidityDepth);
        
        // Collect launch fee for platform revenue
        totalFeesCollected += launchFee;
        platformRevenue += launchFee;
        
        emit TokenCreated(
            tokenAddress,
            msg.sender,
            name,
            symbol,
            totalSupply,
            block.timestamp
        );
        
        return tokenAddress;
    }
    
    function getCreatorTokens(address creator) external view override returns (address[] memory) {
        return creatorTokens[creator];
    }
    
    function getAllTokens() external view override returns (address[] memory) {
        return allTokens;
    }
    
    function getFactoryStats() external view override returns (
        uint256 _totalTokensCreated,
        uint256 _totalVolumeTraded,
        uint256 _totalFeesCollected,
        uint256 _launchFee
    ) {
        return (
            totalTokensCreated,
            totalVolumeTraded,
            totalFeesCollected,
            launchFee
        );
    }
    
    // Analytics functions moved to TokenAnalytics contract for size optimization
    
    function _trackCreator(address creator) internal {
        if (creatorUniqueTokens[creator] == 0) {
            uniqueCreators.push(creator);
        }
        creatorUniqueTokens[creator]++;
    }
    
    // Gas price tracking removed for size optimization
    
    // Admin functions
    function setLaunchFee(uint256 newFee) external onlyOwner {
        // Keep platform competitive - max fee 0.01 ETH (~$20)
        require(newFee <= 0.01 ether, "High fee");
        emit LaunchFeeUpdated(launchFee, newFee);
        launchFee = newFee;
    }
    
    function setPlatformCommissionRate(uint256 newRate) external onlyOwner {
        require(newRate <= 200, "High rate"); // Max 2%
        platformCommissionRate = newRate;
    }
    
    function setCreatorCommissionRate(uint256 newRate) external onlyOwner {
        require(newRate <= 400, "Creator commission too high"); // Max 4%
        creatorCommissionRate = newRate;
    }
    
    function setMinInitialLiquidity(uint256 newMin) external onlyOwner {
        // No minimum required - completely open
        require(newMin >= 0, "Cannot be negative");
        minInitialLiquidity = newMin;
    }
    
    function setMaxTokensPerCreator(uint256 newMax) external onlyOwner {
        // Keep high limits for user freedom
        require(newMax >= 1000, "Must allow significant token creation");
        maxTokensPerCreator = newMax;
    }
    
    function withdrawPlatformRevenue() external onlyOwner {
        uint256 amount = platformRevenue;
        platformRevenue = 0;
        payable(owner()).transfer(amount);
    }
    
    function withdrawFees() external onlyOwner {
        // Withdraw any remaining ETH (backup function)
        payable(owner()).transfer(address(this).balance);
    }
    
    /**
     * @dev Record platform commission from trading
     * Called by CreatorToken contracts when trades happen
     */
    function recordPlatformCommission(uint256 amount) external payable {
        require(isValidToken[msg.sender], "Only valid tokens");
        require(msg.value == amount, "Amount mismatch");
        platformRevenue += amount;
        totalCommissionGenerated += amount;
    }
    
    receive() external payable {}
}
