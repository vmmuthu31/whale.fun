// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./X402Token.sol";

/**
 * @title X402TradingEngine
 * @dev Trading engine optimized for X402 tokens with meta-transaction support
 */
contract X402TradingEngine is ReentrancyGuard, Ownable {
    struct TradingPair {
        address tokenA;
        address tokenB;
        uint256 reserveA;
        uint256 reserveB;
        uint256 totalSupply;
        uint256 lastTradeTime;
        bool isActive;
    }
    
    mapping(bytes32 => TradingPair) public tradingPairs;
    mapping(bytes32 => mapping(address => uint256)) public liquidityBalances;
    bytes32[] public allPairs;
    
    struct FeeStructure {
        uint256 baseFee;
        uint256 maxFee;
        uint256 creatorShare;
        uint256 platformShare;
    }
    
    FeeStructure public fees = FeeStructure({
        baseFee: 5, // 0.05%
        maxFee: 30, // 0.30%
        creatorShare: 2000, // 20% of fees
        platformShare: 8000  // 80% of fees
    });
    
    // Platform fee recipient
    address public feeRecipient;
    
    // Events
    event PairCreated(bytes32 indexed pairId, address tokenA, address tokenB);
    event LiquidityAdded(bytes32 indexed pairId, address provider, uint256 amountA, uint256 amountB, uint256 liquidity);
    event Swap(
        bytes32 indexed pairId,
        address indexed sender,
        uint256 amountIn,
        uint256 amountOut,
        address tokenIn,
        address tokenOut,
        address indexed to
    );
    
    constructor(address _feeRecipient) Ownable(msg.sender) {
        feeRecipient = _feeRecipient;
    }
    
    /**
     * @notice Create a new trading pair
     */
    function createPair(address tokenA, address tokenB) external onlyOwner returns (bytes32 pairId) {
        require(tokenA != tokenB, "Identical addresses");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        
        pairId = keccak256(abi.encodePacked(token0, token1));
        require(!tradingPairs[pairId].isActive, "Pair exists");
        
        tradingPairs[pairId] = TradingPair({
            tokenA: token0,
            tokenB: token1,
            reserveA: 0,
            reserveB: 0,
            totalSupply: 0,
            lastTradeTime: block.timestamp,
            isActive: true
        });
        
        allPairs.push(pairId);
        emit PairCreated(pairId, token0, token1);
    }
    
    /**
     * @notice Add liquidity to a trading pair
     */
    function addLiquidity(
        bytes32 pairId,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) external nonReentrant returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        TradingPair storage pair = tradingPairs[pairId];
        require(pair.isActive, "Pair not active");
        
        (uint256 reserveA, uint256 reserveB) = (pair.reserveA, pair.reserveB);
        
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = (amountADesired * reserveB) / reserveA;
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, 'INSUFFICIENT_B_AMOUNT');
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = (amountBDesired * reserveA) / reserveB;
                require(amountAOptimal <= amountADesired, 'INSUFFICIENT_A_AMOUNT');
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
        
        // Transfer tokens
        IERC20(pair.tokenA).transferFrom(msg.sender, address(this), amountA);
        IERC20(pair.tokenB).transferFrom(msg.sender, address(this), amountB);
        
        // Mint liquidity tokens
        if (pair.totalSupply == 0) {
            liquidity = sqrt(amountA * amountB);
        } else {
            liquidity = min(
                (amountA * pair.totalSupply) / reserveA,
                (amountB * pair.totalSupply) / reserveB
            );
        }
        
        require(liquidity > 0, 'INSUFFICIENT_LIQUIDITY_MINTED');
        
        // Update reserves and supply
        pair.reserveA += amountA;
        pair.reserveB += amountB;
        pair.totalSupply += liquidity;
        liquidityBalances[pairId][msg.sender] += liquidity;
        
        emit LiquidityAdded(pairId, msg.sender, amountA, amountB, liquidity);
    }
    
    /**
     * @notice Swap tokens
     */
    function swap(
        bytes32 pairId,
        address tokenIn,
        uint256 amountIn,
        uint256 amountOutMin,
        address to
    ) external nonReentrant returns (uint256 amountOut) {
        TradingPair storage pair = tradingPairs[pairId];
        require(pair.isActive, "Pair not active");
        
        (address token0, ) = sortTokens(pair.tokenA, pair.tokenB);
        (uint256 reserve0, uint256 reserve1) = 
            tokenIn == token0 ? (pair.reserveA, pair.reserveB) : (pair.reserveB, pair.reserveA);
        
        // Calculate fee
        uint256 fee = (amountIn * fees.baseFee) / 10000;
        uint256 amountInAfterFee = amountIn - fee;
        
        // Calculate output amount
        amountOut = getAmountOut(amountInAfterFee, reserve0, reserve1);
        require(amountOut >= amountOutMin, 'INSUFFICIENT_OUTPUT_AMOUNT');
        
        // Transfer tokens
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        
        // Distribute fees
        if (fee > 0) {
            uint256 creatorFee = (fee * fees.creatorShare) / 10000;
            uint256 platformFee = (fee * fees.platformShare) / 10000;
            
            // In a real implementation, you would distribute these fees
            IERC20(tokenIn).transfer(feeRecipient, platformFee);
            // Creator fee distribution would go here
        }
        
        // Update reserves
        if (tokenIn == token0) {
            pair.reserveA += amountInAfterFee;
            pair.reserveB -= amountOut;
        } else {
            pair.reserveB += amountInAfterFee;
            pair.reserveA -= amountOut;
        }
        
        // Transfer output tokens
        IERC20(tokenIn == token0 ? pair.tokenB : pair.tokenA).transfer(to, amountOut);
        
        emit Swap(pairId, msg.sender, amountIn, amountOut, tokenIn, tokenIn == token0 ? pair.tokenB : pair.tokenA, to);
    }
    
    // Helper functions
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) 
        public pure returns (uint256) {
        require(amountIn > 0, 'INSUFFICIENT_INPUT_AMOUNT');
        require(reserveIn > 0 && reserveOut > 0, 'INSUFFICIENT_LIQUIDITY');
        uint256 amountInWithFee = amountIn * 9975; // 0.25% fee
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 10000) + amountInWithFee;
        return numerator / denominator;
    }
    
    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }
    
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
    
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
    
    function updateFeeStructure(
        uint256 _baseFee,
        uint256 _maxFee,
        uint256 _creatorShare,
        uint256 _platformShare
    ) external onlyOwner {
        require(_baseFee <= _maxFee, "Invalid fee range");
        require(_creatorShare + _platformShare == 10000, "Invalid fee distribution");
        
        fees = FeeStructure({
            baseFee: _baseFee,
            maxFee: _maxFee,
            creatorShare: _creatorShare,
            platformShare: _platformShare
        });
    }
    
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid address");
        feeRecipient = _feeRecipient;
    }
}
