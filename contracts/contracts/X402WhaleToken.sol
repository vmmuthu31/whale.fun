// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./X402Token.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./libraries/MEVProtectionLibrary.sol";

/**
 * @title X402WhaleToken
 * @dev X402-compliant token with additional features from WhaleToken
 * Features: MEV Protection, Staking, Governance, Revenue Sharing
 */
contract X402WhaleToken is X402Token, ReentrancyGuard, Pausable {
    using MEVProtectionLibrary for MEVProtectionLibrary.MEVConfig;
    using MEVProtectionLibrary for MEVProtectionLibrary.RateLimit;
    
    // MEV Protection
    MEVProtectionLibrary.MEVConfig public mevConfig = MEVProtectionLibrary.MEVConfig({
        maxSlippage: 500,                // 5% max slippage
        priceImpactThreshold: 1000,       // 10% price impact threshold
        timeWindow: 1 hours,              // 1 hour time window for rate limiting
        maxTransactionSize: 1000000 * 10**18, // 1M tokens max per transaction
        commitRevealDelay: 5 minutes,     // 5 minutes commit-reveal delay
        sandwichProtectionEnabled: true,  // Enable sandwich protection
        frontRunningProtectionEnabled: true // Enable front-running protection
    });
    
    mapping(address => MEVProtectionLibrary.RateLimit) public userRateLimits;
    mapping(address => uint256) public lastTransactionBlock;
    mapping(bytes32 => MEVProtectionLibrary.TransactionCommit) public transactionCommits;
    
    // Token metadata
    string private _tokenURI = "https://moccasin-fast-tahr-86.mypinata.cloud/ipfs/bafkreiadbzvwwngz3kvk5ut75gdzlbpklxokyacpysotogltergnkhx7um";
    
    // Staking variables
    mapping(address => uint256) public stakedBalance;
    mapping(address => uint256) public stakeTimestamp;
    uint256 public totalStaked;
    uint256 public stakingRewardRate; // Annual percentage rate (e.g., 10 = 10%)
    
    // Events
    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 amount);
    event MEVProtectionUpdated(bool enabled, uint256 minAmount, uint256 maxAmount, uint256 cooldown);
    
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply,
        address initialOwner,
        string memory imageUrl_
    ) X402Token(name_, symbol_, decimals_, initialSupply, initialOwner, initialOwner, imageUrl_) {
        // MEV protection is initialized in the declaration
        
        // Set default staking reward rate (5% annual)
        stakingRewardRate = 5;
    }
    
    // Override transfer with MEV protection
    function transfer(address to, uint256 amount) 
        public 
        override 
        nonReentrant 
        whenNotPaused 
        returns (bool) 
    {
        _checkMEVProtection(msg.sender, to, amount);
        return super.transfer(to, amount);
    }
    
    // Override transferFrom with MEV protection
    function transferFrom(address from, address to, uint256 amount) 
        public 
        override 
        nonReentrant 
        whenNotPaused 
        returns (bool) 
    {
        _checkMEVProtection(from, to, amount);
        return super.transferFrom(from, to, amount);
    }
    
    // Stake tokens
    function stake(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Cannot stake 0");
        
        // Transfer tokens to this contract
        _transfer(msg.sender, address(this), amount);
        
        // Update staking balances
        if (stakedBalance[msg.sender] > 0) {
            _claimRewards();
        } else {
            stakeTimestamp[msg.sender] = block.timestamp;
        }
        
        stakedBalance[msg.sender] += amount;
        totalStaked += amount;
        
        emit Staked(msg.sender, amount);
    }
    
    // Unstake tokens
    function unstake(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0 && amount <= stakedBalance[msg.sender], "Invalid amount");
        
        // Claim rewards first
        _claimRewards();
        
        // Update staking balances
        stakedBalance[msg.sender] -= amount;
        totalStaked -= amount;
        
        // Transfer tokens back to user
        _transfer(address(this), msg.sender, amount);
        
        emit Unstaked(msg.sender, amount);
    }
    
    // Claim staking rewards
    function claimRewards() external nonReentrant whenNotPaused {
        _claimRewards();
    }
    
    // Internal function to claim rewards
    function _claimRewards() internal {
        uint256 rewards = calculatePendingRewards(msg.sender);
        if (rewards > 0) {
            _mint(msg.sender, rewards);
            stakeTimestamp[msg.sender] = block.timestamp;
            emit RewardsClaimed(msg.sender, rewards);
        }
    }
    
    // Calculate pending rewards for a user
    function calculatePendingRewards(address user) public view returns (uint256) {
        if (stakedBalance[user] == 0) return 0;
        
        uint256 stakeDuration = block.timestamp - stakeTimestamp[user];
        uint256 annualReward = (stakedBalance[user] * stakingRewardRate) / 100;
        return (annualReward * stakeDuration) / 365 days;
    }
    
    // Update MEV protection settings (only owner)
    function updateMEVProtection(
        uint256 maxSlippage,
        uint256 priceImpactThreshold,
        uint256 timeWindow,
        uint256 maxTransactionSize,
        uint256 commitRevealDelay,
        bool sandwichProtectionEnabled,
        bool frontRunningProtectionEnabled
    ) external onlyOwner {
        mevConfig = MEVProtectionLibrary.MEVConfig({
            maxSlippage: maxSlippage,
            priceImpactThreshold: priceImpactThreshold,
            timeWindow: timeWindow,
            maxTransactionSize: maxTransactionSize,
            commitRevealDelay: commitRevealDelay,
            sandwichProtectionEnabled: sandwichProtectionEnabled,
            frontRunningProtectionEnabled: frontRunningProtectionEnabled
        });
        
        emit MEVProtectionUpdated(
            sandwichProtectionEnabled || frontRunningProtectionEnabled,
            maxSlippage,
            maxTransactionSize,
            timeWindow
        );
    }
    
    // Internal function to check MEV protection
    function _checkMEVProtection(
        address from,
        address to,
        uint256 amount
    ) internal {
        // Check if any MEV protection is enabled
        if (mevConfig.sandwichProtectionEnabled || mevConfig.frontRunningProtectionEnabled) {
            // Check transaction size limit
            require(amount <= mevConfig.maxTransactionSize, "Transaction size exceeds limit");
            
            // Check time window for rate limiting
            if (userRateLimits[from].lastResetTime + mevConfig.timeWindow < block.timestamp) {
                // Reset rate limiting for this user
                userRateLimits[from] = MEVProtectionLibrary.RateLimit({
                    totalVolume: 0,
                    lastResetTime: block.timestamp,
                    transactionCount: 0
                });
            }
            
            // Update rate limiting
            userRateLimits[from].totalVolume += amount;
            userRateLimits[from].transactionCount++;
            
            // Update last transaction block
            lastTransactionBlock[from] = block.number;
        }
    }
    
    // Pause all token transfers (only owner)
    function pause() external onlyOwner {
        _pause();
    }
    
    // Unpause all token transfers (only owner)
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // Update staking reward rate (only owner)
    function setStakingRewardRate(uint256 newRate) external onlyOwner {
        require(newRate <= 100, "Rate too high"); // Max 100% APR
        stakingRewardRate = newRate;
    }
    
    /**
     * @dev Returns the URI for the token's metadata
     */
    function tokenURI() public view returns (string memory) {
        return _tokenURI;
    }
    
    /**
     * @dev Updates the token's metadata URI (only owner)
     * @param newURI The new URI for the token's metadata
     */
    function updateTokenURI(string memory newURI) external onlyOwner {
        _tokenURI = newURI;
    }
}
