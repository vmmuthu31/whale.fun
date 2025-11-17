import { createPublicClient, http, createWalletClient, custom } from 'viem';
import { TokenData } from "./TokenDataService";
import X402TokenFactoryABI from "@/config/abi/X402TokenFactory.json";
import { mainnet } from 'viem/chains';

// X402TokenFactory contract address (from deployment)
const X402_FACTORY_ADDRESS = "0xe87ab02994a53e01ff5718fb938fa001d7306d22";

// 0G Testnet RPC URL
const ZEROG_TESTNET_RPC = process.env.NEXT_PUBLIC_0G_TESTNET_RPC_URL || "https://evmrpc-testnet.0g.ai";

/**
 * Service for fetching X402 token data
 */
export class X402TokenService {
  private client: any;

  constructor(chainId: number = 16602) {
    this.client = createPublicClient({
      transport: http(ZEROG_TESTNET_RPC),
    });
  }

  /**
   * Get all X402 tokens created by the factory
   */
  async getAllX402Tokens(chainId: number = 16602): Promise<TokenData[]> {
    try {
      console.log("🔍 Fetching X402 tokens from factory...");
      
      // Get the total number of tokens by trying to access increasing indices until we get an error
      const tokenAddresses: string[] = [];
      
      try {
        // First, try to get the total token count if available
        const totalTokens = await this.client.readContract({
          address: X402_FACTORY_ADDRESS as `0x${string}`,
          abi: X402TokenFactoryABI.abi,
          functionName: 'totalTokens'
        }).catch(() => 0);
        
        // If we got a total count, fetch all tokens directly
        if (totalTokens > 0) {
          for (let i = 0; i < totalTokens; i++) {
            try {
              const tokenAddress = await this.client.readContract({
                address: X402_FACTORY_ADDRESS as `0x${string}`,
                abi: X402TokenFactoryABI.abi,
                functionName: 'allTokens',
                args: [i]
              });
              tokenAddresses.push(tokenAddress as string);
            } catch (error) {
              console.warn(`Failed to fetch token at index ${i}:`, error);
            }
          }
        } else {
          // Fallback to the old method if totalTokens is not available
          let i = 0;
          while (true) {
            try {
              const tokenAddress = await this.client.readContract({
                address: X402_FACTORY_ADDRESS as `0x${string}`,
                abi: X402TokenFactoryABI.abi,
                functionName: 'allTokens',
                args: [i]
              });
              tokenAddresses.push(tokenAddress as string);
              i++;
            } catch (error) {
              break;
            }
          }
        }
      } catch (error) {
        return [];
      }
      
      console.log(`Found ${tokenAddresses.length} token addresses`);
      
      // Define ERC20 ABI once outside the map function
      const erc20Abi = [
        {
          constant: true,
          inputs: [],
          name: 'name',
          outputs: [{ name: '', type: 'string' }],
          payable: false,
          stateMutability: 'view',
          type: 'function'
        },
        {
          constant: true,
          inputs: [],
          name: 'symbol',
          outputs: [{ name: '', type: 'string' }],
          payable: false,
          stateMutability: 'view',
          type: 'function'
        },
        {
          constant: true,
          inputs: [],
          name: 'decimals',
          outputs: [{ name: '', type: 'uint8' }],
          payable: false,
          stateMutability: 'view',
          type: 'function'
        },
        {
          constant: true,
          inputs: [],
          name: 'totalSupply',
          outputs: [{ name: '', type: 'uint256' }],
          payable: false,
          stateMutability: 'view',
          type: 'function'
        }
      ] as const;

      // Process each token address
      const tokenPromises = tokenAddresses.map(async (tokenAddress: string) => {
        console.log(`\n🔍 Processing token at address: ${tokenAddress}`);
        
        // Initialize token data with default values
        let tokenName = 'Unnamed Token';
        let tokenSymbol = 'TOKEN';
        const tokenDecimals = 18; // Using const since it's not reassigned
        const tokenTotalSupply = BigInt(0); // Using const since it's not reassigned
        let tokenCreator = '0x0000000000000000000000000000000000000000';
        let tokenCreatedAt = BigInt(0);
        let tokenImageUrl = ''; // Changed from const to let as we'll be updating it

        try {
          // Try to get token info from factory first
          try {
            const factoryInfo = await this.client.readContract({
              address: X402_FACTORY_ADDRESS as `0x${string}`,
              abi: X402TokenFactoryABI.abi,
              functionName: 'tokenInfo',
              args: [tokenAddress]
            }) as { name?: string; symbol?: string; owner?: string; createdAt?: { toString: () => string } } | null;
              
            if (factoryInfo) {
              console.log('📋 Factory info:', {
                name: factoryInfo.name,
                symbol: factoryInfo.symbol,
                owner: factoryInfo.owner,
                createdAt: factoryInfo.createdAt?.toString()
              });
              
              if (factoryInfo?.name) tokenName = factoryInfo.name;
              if (factoryInfo?.symbol) tokenSymbol = factoryInfo.symbol;
              if (factoryInfo?.owner) tokenCreator = factoryInfo.owner;
              if (factoryInfo?.createdAt) {
                tokenCreatedAt = BigInt(factoryInfo.createdAt.toString());
              }
              
              // Try to get imageUrl from factory info if available (depends on your contract implementation)
              if ('imageUrl' in factoryInfo) {
                tokenImageUrl = (factoryInfo as any).imageUrl || '';
                console.log('🖼️  Found image URL in factory info:', tokenImageUrl);
              }
            }
          } catch (factoryError) {
            console.warn(`Could not fetch token info from factory for ${tokenAddress}:`, factoryError);
          }

          // Get token details directly from the token contract
          let nameResult = tokenName;
          let symbolResult = tokenSymbol;
          const decimalsResult = tokenDecimals; // Using const since it's not reassigned
          const totalSupplyResult = tokenTotalSupply; // Using const since it's not reassigned
          const imageUrlResult = ''; // Using const since it's not reassigned
          
          try {
            const results = await Promise.all([
              this.client.readContract({
                address: tokenAddress as `0x${string}`,
                abi: erc20Abi,
                functionName: 'name',
              }).catch(() => tokenName) as Promise<string>,
              this.client.readContract({
                address: tokenAddress as `0x${string}`,
                abi: erc20Abi,
                functionName: 'symbol',
              }).catch(() => tokenSymbol) as Promise<string>,
              this.client.readContract({
                address: tokenAddress as `0x${string}`,
                abi: erc20Abi,
                functionName: 'decimals',
              }).then(Number).catch(() => tokenDecimals) as Promise<number>,
              this.client.readContract({
                address: tokenAddress as `0x${string}`,
                abi: erc20Abi,
                functionName: 'totalSupply',
              }).then((s: bigint) => BigInt(s.toString())).catch(() => tokenTotalSupply) as Promise<bigint>,
              this.client.readContract({
                address: tokenAddress as `0x${string}`,
                abi: [
                  {
                    "inputs": [],
                    "name": "imageUrl",
                    "outputs": [{"internalType": "string", "name": "", "type": "string"}],
                    "stateMutability": "view",
                    "type": "function"
                  }
                ],
                functionName: 'imageUrl',
              }).catch(() => '') as Promise<string>
            ]);

            // Log raw results from token contract
            console.log('📊 Raw token contract data:', {
              name: results[0],
              symbol: results[1],
              decimals: results[2],
              totalSupply: results[3].toString(),
              imageUrl: results[4] || 'Not found'
            });

            nameResult = results[0];
            symbolResult = results[1];
            tokenImageUrl = results[4] || tokenImageUrl; // Use imageUrl from token contract if available
            const newDecimals = results[2];
            const newTotalSupply = results[3];
            const newImageUrl = results[4];
            
            // Update token data with new values
            tokenName = nameResult;
            tokenSymbol = symbolResult;
          } catch (error) {
            console.error(`Error fetching token details for ${tokenAddress}:`, error);
          }

          // Log final token data before creating the object
          console.log('✅ Final token data:', {
            name: tokenName,
            symbol: tokenSymbol,
            decimals: tokenDecimals,
            totalSupply: tokenTotalSupply.toString(),
            creator: tokenCreator,
            createdAt: tokenCreatedAt.toString(),
            imageUrl: tokenImageUrl || 'No image URL found'
          });

          // Create token data object with the fetched values
          const tokenData: TokenData = {
            id: tokenAddress,
            address: tokenAddress,
            name: tokenName,
            symbol: tokenSymbol,
            description: `${tokenName} (${tokenSymbol}) - X402 Token`,
            // Use token-specific image if available, otherwise use default X402 logo
            logoUrl: tokenImageUrl,
            creator: tokenCreator,
            launchTime: tokenCreatedAt,
            currentPrice: BigInt(0),
            marketCap: BigInt(0),
            totalSupply: tokenTotalSupply,
            totalSold: tokenTotalSupply, // Assuming all supply is initially sold
            holderCount: BigInt(1), // At least the creator
            dailyVolume: BigInt(0),
            isLive: true,
            priceChange: '0.0%',
            priceValue: '0.00',
            age: 'Just now',
            isExternal: false,
            chainId: chainId,
            isX402: true // Mark as X402 token
          };

          return tokenData;
        } catch (error) {
          console.error(`Error fetching details for X402 token ${tokenAddress}:`, error);
          return null;
        }
      });

      console.log('\n🔄 Processing all tokens...');
      console.log('Token addresses:', tokenAddresses);
      
      try {
        // Wait for all token data to be processed
        const tokenResults = await Promise.all(tokenPromises);
        
        // Filter out any null values and ensure type safety
        const validTokens = tokenResults.filter((token): token is TokenData => token !== null);
        console.log(`✅ Successfully processed ${validTokens.length} valid tokens`);
        return validTokens;
      } catch (error) {
        console.error('Error processing token data:', error);
        return [];
      }
    } catch (error) {
      console.error('Error in getAllX402Tokens:', error);
      return [];
    }
  }
}

// Create and export singleton instance
export const x402TokenService = new X402TokenService();
export default x402TokenService;
