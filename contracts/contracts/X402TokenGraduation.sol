// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./X402Token.sol";

/**
 * @title X402TokenGraduation
 * @dev Handles graduation of X402 tokens to DEX liquidity pools
 */
contract X402TokenGraduation is Ownable, ReentrancyGuard {
    constructor(address initialOwner) Ownable(initialOwner) ReentrancyGuard() {}
    // Token graduation status
    struct GraduationInfo {
        bool isGraduated;
        uint256 graduationTime;
        address liquidityPool;
        uint256 liquidityAmount;
        uint256 ethLiquidity;
        uint256 tokenLiquidity;
    }
    
    // Graduation requirements
    struct GraduationRequirements {
        uint256 minLiquidityETH;  // Minimum ETH liquidity required
        uint256 minLiquidityToken; // Minimum token liquidity required
        uint256 minHolders;       // Minimum number of token holders
        uint256 minTradingVolume; // Minimum trading volume in ETH
        uint256 minLockTime;      // Minimum time since token creation
    }
    
    // Contract state
    mapping(address => GraduationInfo) public graduationInfo;
    mapping(address => GraduationRequirements) public tokenRequirements;
    mapping(address => bool) public isWhitelistedDex;
    
    // Default requirements
    GraduationRequirements public defaultRequirements = GraduationRequirements({
        minLiquidityETH: 10 ether,      // 10 ETH
        minLiquidityToken: 1000000 * 10**18, // 1M tokens (assuming 18 decimals)
        minHolders: 100,                // 100 holders
        minTradingVolume: 50 ether,     // 50 ETH
        minLockTime: 7 days             // 7 days
    });
    
    // Events
    event TokenGraduated(
        address indexed token,
        address indexed creator,
        address liquidityPool,
        uint256 ethLiquidity,
        uint256 tokenLiquidity,
        uint256 timestamp
    );
    
    event GraduationRequirementsUpdated(
        address indexed token,
        uint256 minLiquidityETH,
        uint256 minLiquidityToken,
        uint256 minHolders,
        uint256 minTradingVolume,
        uint256 minLockTime
    );
    
    event DexWhitelisted(address indexed dex, bool whitelisted);
    
    /**
     * @notice Check if a token meets graduation requirements
     */
    function checkGraduationEligibility(
        address token,
        uint256 liquidityETH,
        uint256 liquidityToken,
        uint256 holderCount,
        uint256 tradingVolume
    ) public view returns (bool) {
        GraduationRequirements memory requirements = tokenRequirements[token].minLiquidityETH > 0 
            ? tokenRequirements[token] 
            : defaultRequirements;
            
        return (
            liquidityETH >= requirements.minLiquidityETH &&
            liquidityToken >= requirements.minLiquidityToken &&
            holderCount >= requirements.minHolders &&
            tradingVolume >= requirements.minTradingVolume
        );
    }
    
    /**
     * @notice Graduate a token to DEX
     */
    function graduateToken(
        address token,
        address dexRouter,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable nonReentrant returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        require(isWhitelistedDex[dexRouter], "DEX not whitelisted");
        require(!graduationInfo[token].isGraduated, "Already graduated");
        
        // Transfer tokens from sender
        IERC20(token).transferFrom(msg.sender, address(this), amountTokenDesired);
        
        // Approve DEX router to spend tokens
        IERC20(token).approve(dexRouter, amountTokenDesired);
        
        // Add liquidity (this is a simplified version - actual implementation depends on DEX)
        (amountToken, amountETH, liquidity) = IX402DexRouter(dexRouter).addLiquidityETH{value: msg.value}(
            token,
            amountTokenDesired,
            amountTokenMin,
            amountETHMin,
            to,
            deadline
        );
        
        // Update graduation info
        graduationInfo[token] = GraduationInfo({
            isGraduated: true,
            graduationTime: block.timestamp,
            liquidityPool: to, // In a real DEX, this would be the LP token address
            liquidityAmount: liquidity,
            ethLiquidity: amountETH,
            tokenLiquidity: amountToken
        });
        
        emit TokenGraduated(
            token,
            msg.sender,
            to,
            amountETH,
            amountToken,
            block.timestamp
        );
    }
    
    /**
     * @notice Set custom graduation requirements for a token
     */
    function setTokenRequirements(
        address token,
        uint256 minLiquidityETH,
        uint256 minLiquidityToken,
        uint256 minHolders,
        uint256 minTradingVolume,
        uint256 minLockTime
    ) external onlyOwner {
        tokenRequirements[token] = GraduationRequirements({
            minLiquidityETH: minLiquidityETH,
            minLiquidityToken: minLiquidityToken,
            minHolders: minHolders,
            minTradingVolume: minTradingVolume,
            minLockTime: minLockTime
        });
        
        emit GraduationRequirementsUpdated(
            token,
            minLiquidityETH,
            minLiquidityToken,
            minHolders,
            minTradingVolume,
            minLockTime
        );
    }
    
    /**
     * @notice Update default graduation requirements
     */
    function updateDefaultRequirements(
        uint256 minLiquidityETH,
        uint256 minLiquidityToken,
        uint256 minHolders,
        uint256 minTradingVolume,
        uint256 minLockTime
    ) external onlyOwner {
        defaultRequirements = GraduationRequirements({
            minLiquidityETH: minLiquidityETH,
            minLiquidityToken: minLiquidityToken,
            minHolders: minHolders,
            minTradingVolume: minTradingVolume,
            minLockTime: minLockTime
        });
    }
    
    /**
     * @notice Whitelist a DEX router
     */
    function whitelistDex(address dex, bool whitelisted) external onlyOwner {
        isWhitelistedDex[dex] = whitelisted;
        emit DexWhitelisted(dex, whitelisted);
    }
    
    /**
     * @notice Withdraw ETH sent to the contract by mistake
     */
    function withdrawETH() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }
    
    /**
     * @notice Withdraw ERC20 tokens sent to the contract by mistake
     */
    function withdrawToken(address token) external onlyOwner {
        IERC20(token).transfer(owner(), IERC20(token).balanceOf(address(this)));
    }
    
    // Required for receiving ETH
    receive() external payable {}
}

// Interface for DEX router (simplified)
interface IX402DexRouter {
    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external payable returns (uint amountToken, uint amountETH, uint liquidity);
}

