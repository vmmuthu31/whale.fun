import { ContractTransactionResponse, EventLog } from "ethers";
import {
  BaseContractService,
  TransactionOptions,
  EventFilterOptions,
  ContractConfig,
} from "./BaseContractService";
import TokenFactoryRootABI from "@/config/abi/TokenFactoryRoot.json";

/**
 * Factory statistics interface
 */
export interface FactoryStats {
  totalTokensCreated: bigint;
  totalVolumeTraded: bigint;
  totalFeesCollected: bigint;
  launchFee: bigint;
}

/**
 * Token creation parameters interface
 */
export interface TokenCreationParams {
  name: string;
  symbol: string;
  totalSupply: bigint;
  targetMarketCap: bigint;
  creatorFeePercent: bigint;
  description?: string;
  logoUrl?: string;
  liquidityAmount?: bigint; // ETH amount for initial liquidity
}

/**
 * Token creation parameters with community data
 */
export interface TokenCreationWithCommunityParams extends TokenCreationParams {
  expectedCommunitySize: bigint;
}

/**
 * Token information interface
 */
export interface TokenInfo {
  address: string;
  creator: string;
  launchTime: bigint;
  isValid: boolean;
}

/**
 * Creator statistics interface
 */
export interface CreatorStats {
  tokenCount: bigint;
  uniqueTokens: bigint;
  lastCreationTime: bigint;
  tokens: string[];
  canCreateNow: boolean;
}

/**
 * TokenFactoryRoot contract deployment configuration
 */
export const TOKEN_FACTORY_ROOT_CONFIG: ContractConfig = {
  name: "TokenFactoryRoot",
  abi: TokenFactoryRootABI,
  deployments: {
    16602: {
      address: "0x24267001806bccce23b1e453da83e4c5ec02d2b8",
      deployedAt: 0,
      verified: false,
    },
    16661: {
      address: "0x9Da032047eCaFE668360C3b290420E785bF46598",
      deployedAt: 0,
      verified: false,
    },
    // Add other networks as needed
  },
};

/**
 * TokenFactoryRoot Service
 * Provides comprehensive functionality for token creation and factory management:
 * - Token creation with bonding curves
 * - Creator management and tracking
 * - Factory statistics and analytics
 * - Admin functions for fee and parameter management
 */
export class TokenFactoryRootService extends BaseContractService {
  constructor() {
    super(TOKEN_FACTORY_ROOT_CONFIG);
  }

  // ==================== Token Creation ====================

  /**
   * Create a new token with standard parameters
   */
  async createToken(
    params: TokenCreationParams,
    options: TransactionOptions = {},
    chainId?: number
  ): Promise<ContractTransactionResponse> {
    const launchFee = await this.getLaunchFee(chainId);
    const minLiquidity = await this.getMinInitialLiquidity(chainId);

    const liquidityAmount = params.liquidityAmount || minLiquidity;
    const totalValue = launchFee + liquidityAmount;

    const txOptions = { ...options, value: totalValue };

    return await this.executeMethod(
      "createToken",
      [
        params.name,
        params.symbol,
        params.totalSupply,
        params.targetMarketCap,
        params.creatorFeePercent,
        params.description,
        params.logoUrl,
      ],
      txOptions,
      chainId
    );
  }

  /**
   * Create a new token with community data
   */
  async createTokenWithCommunityData(
    params: TokenCreationWithCommunityParams,
    options: TransactionOptions = {},
    chainId?: number
  ): Promise<ContractTransactionResponse> {
    const launchFee = await this.getLaunchFee(chainId);
    const minLiquidity = await this.getMinInitialLiquidity(chainId);

    const liquidityAmount = params.liquidityAmount || minLiquidity;
    const totalValue = launchFee + liquidityAmount;

    const txOptions = { ...options, value: totalValue };

    return await this.executeMethod(
      "createTokenWithCommunityData",
      [
        params.name,
        params.symbol,
        params.totalSupply,
        params.targetMarketCap,
        params.creatorFeePercent,
        params.description,
        params.logoUrl,
        params.expectedCommunitySize,
      ],
      txOptions,
      chainId
    );
  }

  // ==================== Token Management ====================

  /**
   * Get all tokens created by a specific creator
   */
  async getCreatorTokens(creator: string, chainId?: number): Promise<string[]> {
    return await this.callMethod("getCreatorTokens", [creator], chainId);
  }

  /**
   * Get all tokens created by the factory
   */
  async getAllTokens(chainId?: number): Promise<string[]> {
    return await this.callMethod("getAllTokens", [], chainId);
  }

  /**
   * Check if a token is valid (created by this factory)
   */
  async isValidToken(token: string, chainId?: number): Promise<boolean> {
    return await this.callMethod("isValidToken", [token], chainId);
  }

  /**
   * Get the creator of a specific token
   */
  async getTokenCreator(token: string, chainId?: number): Promise<string> {
    return await this.callMethod("tokenToCreator", [token], chainId);
  }

  /**
   * Get the launch time of a specific token
   */
  async getTokenLaunchTime(token: string, chainId?: number): Promise<bigint> {
    return await this.callMethod("tokenToLaunchTime", [token], chainId);
  }

  /**
   * Get comprehensive token information
   */
  async getTokenInfo(token: string, chainId?: number): Promise<TokenInfo> {
    const [creator, launchTime, isValid] = await Promise.all([
      this.getTokenCreator(token, chainId),
      this.getTokenLaunchTime(token, chainId),
      this.isValidToken(token, chainId),
    ]);

    return {
      address: token,
      creator,
      launchTime,
      isValid,
    };
  }

  /**
   * Get token at specific index in allTokens array
   */
  async getTokenAtIndex(index: bigint, chainId?: number): Promise<string> {
    return await this.callMethod("allTokens", [index], chainId);
  }

  // ==================== Creator Management ====================

  /**
   * Get creator token count
   */
  async getCreatorTokenCount(
    creator: string,
    chainId?: number
  ): Promise<bigint> {
    return await this.callMethod("creatorTokenCount", [creator], chainId);
  }

  /**
   * Get creator unique token count
   */
  async getCreatorUniqueTokens(
    creator: string,
    chainId?: number
  ): Promise<bigint> {
    return await this.callMethod("creatorUniqueTokens", [creator], chainId);
  }

  /**
   * Get last token creation time for creator
   */
  async getLastTokenCreation(
    creator: string,
    chainId?: number
  ): Promise<bigint> {
    return await this.callMethod("lastTokenCreation", [creator], chainId);
  }

  /**
   * Get unique creator at specific index
   */
  async getUniqueCreatorAtIndex(
    index: bigint,
    chainId?: number
  ): Promise<string> {
    return await this.callMethod("uniqueCreators", [index], chainId);
  }

  /**
   * Get comprehensive creator statistics
   */
  async getCreatorStats(
    creator: string,
    chainId?: number
  ): Promise<CreatorStats> {
    const [tokenCount, uniqueTokens, lastCreation, tokens] = await Promise.all([
      this.getCreatorTokenCount(creator, chainId),
      this.getCreatorUniqueTokens(creator, chainId),
      this.getLastTokenCreation(creator, chainId),
      this.getCreatorTokens(creator, chainId),
    ]);

    const canCreateNow = true; // No cooldown restrictions

    return {
      tokenCount,
      uniqueTokens,
      lastCreationTime: lastCreation,
      tokens,
      canCreateNow,
    };
  }

  /**
   * Check if creator can create a new token now
   */
  async canCreatorCreateToken(
    creator: string,
    chainId?: number
  ): Promise<boolean> {
    const [tokenCount, maxTokens] = await Promise.all([
      this.getCreatorTokenCount(creator, chainId),
      this.getMaxTokensPerCreator(chainId),
    ]);

    const hasCapacity = tokenCount < maxTokens;

    return hasCapacity;
  }

  // ==================== Factory Statistics ====================

  /**
   * Get factory statistics
   */
  async getFactoryStats(chainId?: number): Promise<FactoryStats> {
    // If no chainId provided, get current network from MetaMask
    if (!chainId) {
      const connection = await import("@/utils/Blockchain").then((m) =>
        m.getBlockchainConnection()
      );
      chainId = Number((await connection).network.chainId);
    }

    const result = await this.callMethod("getFactoryStats", [], chainId);

    return {
      totalTokensCreated: result[0],
      totalVolumeTraded: result[1],
      totalFeesCollected: result[2],
      launchFee: result[3],
    };
  }

  /**
   * Get total tokens created
{{ ... }}
   */
  async getTotalTokensCreated(chainId?: number): Promise<bigint> {
    return await this.callMethod("totalTokensCreated", [], chainId);
  }

  /**
   * Get total volume traded across all tokens
   */
  async getTotalVolumeTraded(chainId?: number): Promise<bigint> {
    return await this.callMethod("totalVolumeTraded", [], chainId);
  }

  /**
   * Get total fees collected by the factory
   */
  async getTotalFeesCollected(chainId?: number): Promise<bigint> {
    return await this.callMethod("totalFeesCollected", [], chainId);
  }

  // ==================== Factory Parameters ====================

  /**
   * Get current launch fee
   */
  async getLaunchFee(chainId?: number): Promise<bigint> {
    return await this.callMethod("launchFee", [], chainId);
  }

  /**
   * Get minimum initial liquidity requirement
   */
  async getMinInitialLiquidity(chainId?: number): Promise<bigint> {
    return await this.callMethod("minInitialLiquidity", [], chainId);
  }

  /**
   * Get maximum tokens per creator
   */
  async getMaxTokensPerCreator(chainId?: number): Promise<bigint> {
    return await this.callMethod("maxTokensPerCreator", [], chainId);
  }

  /**
   * Get whale token address
   */
  async getWhaleToken(chainId?: number): Promise<string> {
    return await this.callMethod("whaleToken", [], chainId);
  }

  // ==================== Admin Functions ====================

  /**
   * Set launch fee (only owner)
   */
  async setLaunchFee(
    newFee: bigint,
    options: TransactionOptions = {},
    chainId?: number
  ): Promise<ContractTransactionResponse> {
    return await this.executeMethod("setLaunchFee", [newFee], options, chainId);
  }

  /**
   * Set minimum initial liquidity (only owner)
   */
  async setMinInitialLiquidity(
    newMin: bigint,
    options: TransactionOptions = {},
    chainId?: number
  ): Promise<ContractTransactionResponse> {
    return await this.executeMethod(
      "setMinInitialLiquidity",
      [newMin],
      options,
      chainId
    );
  }

  /**
   * Set maximum tokens per creator (only owner)
   */
  async setMaxTokensPerCreator(
    newMax: bigint,
    options: TransactionOptions = {},
    chainId?: number
  ): Promise<ContractTransactionResponse> {
    return await this.executeMethod(
      "setMaxTokensPerCreator",
      [newMax],
      options,
      chainId
    );
  }

  /**
   * Withdraw collected fees (only owner)
   */
  async withdrawFees(
    options: TransactionOptions = {},
    chainId?: number
  ): Promise<ContractTransactionResponse> {
    return await this.executeMethod("withdrawFees", [], options, chainId);
  }

  // ==================== Event Listening ====================

  /**
   * Listen to TokenCreated events
   */
  async onTokenCreated(
    callback: (event: EventLog) => void,
    chainId?: number
  ): Promise<void> {
    await this.listenToEvent("TokenCreated", callback, chainId);
  }

  /**
   * Listen to LaunchFeeUpdated events
   */
  async onLaunchFeeUpdated(
    callback: (event: EventLog) => void,
    chainId?: number
  ): Promise<void> {
    await this.listenToEvent("LaunchFeeUpdated", callback, chainId);
  }

  /**
   * Get historical TokenCreated events
   */
  async getTokenCreatedEvents(
    filterOptions: EventFilterOptions = {},
    chainId?: number
  ): Promise<EventLog[]> {
    return await this.getEvents("TokenCreated", filterOptions, chainId);
  }

  /**
   * Get TokenCreated events for a specific creator
   */
  async getCreatorTokenEvents(
    creator: string,
    filterOptions: EventFilterOptions = {},
    chainId?: number
  ): Promise<EventLog[]> {
    const events = await this.getTokenCreatedEvents(filterOptions, chainId);
    return events.filter(
      (event) =>
        event.args && event.args[1].toLowerCase() === creator.toLowerCase()
    );
  }

  // ==================== Utility Methods ====================

  /**
   * Calculate total cost for token creation including fees and liquidity
   */
  async calculateCreationCost(
    liquidityAmount?: bigint,
    chainId?: number
  ): Promise<{
    launchFee: bigint;
    liquidity: bigint;
    total: bigint;
  }> {
    const launchFee = await this.getLaunchFee(chainId);
    const minLiquidity = await this.getMinInitialLiquidity(chainId);
    const liquidity = liquidityAmount || minLiquidity;

    return {
      launchFee,
      liquidity,
      total: launchFee + liquidity,
    };
  }

  /**
   * Validate token creation parameters
   */
  validateTokenParams(params: TokenCreationParams): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Name validation
    if (!params.name || params.name.length === 0) {
      errors.push("Token name is required");
    } else if (params.name.length > 32) {
      errors.push("Token name must be 32 characters or less");
    }

    // Symbol validation
    if (!params.symbol || params.symbol.length === 0) {
      errors.push("Token symbol is required");
    } else if (params.symbol.length > 10) {
      errors.push("Token symbol must be 10 characters or less");
    }

    // Supply validation
    if (params.totalSupply <= BigInt(0)) {
      errors.push("Total supply must be greater than 0");
    } else if (params.totalSupply > BigInt(10) ** BigInt(27)) {
      errors.push("Total supply exceeds maximum limit");
    }

    // Market cap validation
    if (params.targetMarketCap <= BigInt(0)) {
      errors.push("Target market cap must be greater than 0");
    } else if (params.targetMarketCap > BigInt(10) ** BigInt(24)) {
      errors.push("Target market cap exceeds maximum limit");
    }

    // Creator fee validation
    if (
      params.creatorFeePercent < BigInt(30) ||
      params.creatorFeePercent > BigInt(95)
    ) {
      errors.push("Creator fee must be between 30% and 95%");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get paginated tokens list
   */
  async getPaginatedTokens(
    offset: bigint = BigInt(0),
    limit: bigint = BigInt(20),
    chainId?: number
  ): Promise<{
    tokens: string[];
    hasMore: boolean;
    total: bigint;
  }> {
    const total = await this.getTotalTokensCreated(chainId);
    const tokens: string[] = [];

    const end = offset + limit;
    const actualEnd = end > total ? total : end;

    for (let i = offset; i < actualEnd; i++) {
      const token = await this.getTokenAtIndex(i, chainId);
      tokens.push(token);
    }

    return {
      tokens,
      hasMore: end < total,
      total,
    };
  }

  /**
   * Get creator rankings by token count
   */
  async getTopCreators(
    limit: bigint = BigInt(10),
    chainId?: number
  ): Promise<
    Array<{
      creator: string;
      tokenCount: bigint;
      uniqueTokens: bigint;
    }>
  > {
    // Note: This would require indexing all creators
    // For now, return empty array - implement with off-chain indexing
    return [];
  }

  /**
   * Search tokens by name or symbol
   */
  async searchTokens(query: string, chainId?: number): Promise<string[]> {
    // Note: This would require off-chain indexing of token metadata
    // For now, return empty array - implement with Graph Protocol or similar
    return [];
  }

  /**
   * Get recent token launches
   */
  async getRecentTokens(
    limit: bigint = BigInt(10),
    chainId?: number
  ): Promise<string[]> {
    const total = await this.getTotalTokensCreated(chainId);
    const start = total > limit ? total - limit : BigInt(0);
    const tokens: string[] = [];

    for (let i = total - BigInt(1); i >= start; i--) {
      const token = await this.getTokenAtIndex(i, chainId);
      tokens.push(token);
    }

    return tokens;
  }
}

// Create and export a singleton instance
export const tokenFactoryRootService = new TokenFactoryRootService();
export default tokenFactoryRootService;
