import { getBlockchainConnection } from "@/utils/Blockchain";

// Minimal ABI for DashboardDataProvider.getTokenDashboardData
const DashboardDataProviderABI = [
  {
    type: "function",
    name: "getTokenDashboardData",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      {
        name: "data",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "tokenAddress", type: "address" },
          { name: "creator", type: "address" },
          { name: "launchTime", type: "uint256" },
          { name: "currentPrice", type: "uint256" },
          { name: "marketCap", type: "uint256" },
          { name: "fullyDilutedMarketCap", type: "uint256" },
          { name: "priceChange24h", type: "uint256" },
          { name: "priceChange7d", type: "uint256" },
          { name: "allTimeHigh", type: "uint256" },
          { name: "allTimeLow", type: "uint256" },
          { name: "volume24h", type: "uint256" },
          { name: "volume7d", type: "uint256" },
          { name: "volumeTotal", type: "uint256" },
          { name: "bondingCurveProgress", type: "uint256" },
          { name: "tokensRemaining", type: "uint256" },
          { name: "liquidityPool", type: "uint256" },
          { name: "isGraduated", type: "bool" },
          { name: "graduationThreshold", type: "uint256" },
          { name: "holderCount", type: "uint256" },
          { name: "holderConcentration", type: "uint256" },
          { name: "distributionScore", type: "uint256" },
          { name: "totalTrades", type: "uint256" },
          { name: "uniqueTraders", type: "uint256" },
          { name: "averageTradeSize", type: "uint256" },
          { name: "isHealthy", type: "bool" },
          { name: "liquidityRatio", type: "uint256" },
          { name: "volatility", type: "uint256" },
          { name: "riskScore", type: "uint256" }
        ],
      },
    ],
  },
] as const;

export interface TokenDashboardData {
  name: string;
  symbol: string;
  tokenAddress: `0x${string}`;
  creator: `0x${string}`;
  launchTime: bigint;
  currentPrice: bigint;
  marketCap: bigint;
  fullyDilutedMarketCap: bigint;
  priceChange24h: bigint;
  priceChange7d: bigint;
  allTimeHigh: bigint;
  allTimeLow: bigint;
  volume24h: bigint;
  volume7d: bigint;
  volumeTotal: bigint;
  bondingCurveProgress: bigint;
  tokensRemaining: bigint;
  liquidityPool: bigint;
  isGraduated: boolean;
  graduationThreshold: bigint;
  holderCount: bigint;
  holderConcentration: bigint;
  distributionScore: bigint;
  totalTrades: bigint;
  uniqueTraders: bigint;
  averageTradeSize: bigint;
  isHealthy: boolean;
  liquidityRatio: bigint;
  volatility: bigint;
  riskScore: bigint;
}

// Deployed addresses per chain
const DASHBOARD_ADDRESSES: Record<number, `0x${string}`> = {
  // 0g testnet
  16602: "0x1c7a8ca39057c856c512f45ebaadfbc276d6ad77",
  // 0g mainnet: add here when available
};

export class DashboardDataProviderService {
  async getDashboardAddress(chainId?: number): Promise<`0x${string}`> {
    if (!chainId) {
      try {
        const conn = await getBlockchainConnection();
        chainId = Number(conn.network.chainId);
      } catch {
        // default to testnet
        chainId = 16602;
      }
    }
    const addr = DASHBOARD_ADDRESSES[chainId];
    if (!addr) throw new Error(`DashboardDataProvider not configured for chain ${chainId}`);
    return addr;
  }

  async getTokenDashboardData(token: `0x${string}`, chainId?: number): Promise<TokenDashboardData> {
    const { createPublicClient, defineChain, http } = await import("viem");

    const zeroGMainnet = defineChain({
      id: 16661,
      name: "0G Mainnet",
      network: "0g-mainnet",
      nativeCurrency: { decimals: 18, name: "0G", symbol: "0G" },
      rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_0G_RPC_URL || "https://evmrpc.0g.ai"] } },
      blockExplorers: { default: { name: "0G Chain Explorer", url: "https://chainscan.0g.ai" } },
    });

    const zeroGTestnet = defineChain({
      id: 16602,
      name: "0G Testnet",
      network: "0g-testnet",
      nativeCurrency: { decimals: 18, name: "A0GI", symbol: "A0GI" },
      rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_0G_TESTNET_RPC_URL || "https://evmrpc-testnet.0g.ai"] } },
      blockExplorers: { default: { name: "0G Explorer", url: "https://chainscan-newton.0g.ai" } },
    });

    const selectedChain = (chainId === 16661 ? zeroGMainnet : zeroGTestnet);
    const publicClient = createPublicClient({ chain: selectedChain, transport: http() });

    const address = await this.getDashboardAddress(chainId);

    const data = (await publicClient.readContract({
      address,
      abi: DashboardDataProviderABI as any,
      functionName: "getTokenDashboardData",
      args: [token],
    })) as any;

    // viem returns tuple as array; map to interface
    const mapped: TokenDashboardData = {
      name: data.name,
      symbol: data.symbol,
      tokenAddress: data.tokenAddress,
      creator: data.creator,
      launchTime: BigInt(data.launchTime),
      currentPrice: BigInt(data.currentPrice),
      marketCap: BigInt(data.marketCap),
      fullyDilutedMarketCap: BigInt(data.fullyDilutedMarketCap),
      priceChange24h: BigInt(data.priceChange24h),
      priceChange7d: BigInt(data.priceChange7d),
      allTimeHigh: BigInt(data.allTimeHigh),
      allTimeLow: BigInt(data.allTimeLow),
      volume24h: BigInt(data.volume24h),
      volume7d: BigInt(data.volume7d),
      volumeTotal: BigInt(data.volumeTotal),
      bondingCurveProgress: BigInt(data.bondingCurveProgress),
      tokensRemaining: BigInt(data.tokensRemaining),
      liquidityPool: BigInt(data.liquidityPool),
      isGraduated: Boolean(data.isGraduated),
      graduationThreshold: BigInt(data.graduationThreshold),
      holderCount: BigInt(data.holderCount),
      holderConcentration: BigInt(data.holderConcentration),
      distributionScore: BigInt(data.distributionScore),
      totalTrades: BigInt(data.totalTrades),
      uniqueTraders: BigInt(data.uniqueTraders),
      averageTradeSize: BigInt(data.averageTradeSize),
      isHealthy: Boolean(data.isHealthy),
      liquidityRatio: BigInt(data.liquidityRatio),
      volatility: BigInt(data.volatility),
      riskScore: BigInt(data.riskScore),
    };

    return mapped;
  }
}

export const dashboardDataProviderService = new DashboardDataProviderService();
export default dashboardDataProviderService;
