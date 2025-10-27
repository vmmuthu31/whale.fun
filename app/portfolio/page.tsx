"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, usePublicClient, useChainId } from "wagmi";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TokenFactoryRootService } from "@/lib/services/TokenFactoryRootService";
import { TokenStats } from "@/lib/services/CreatorTokenService";
import { formatEther, parseEther } from "ethers";
import {
  Loader2,
  TrendingUp,
  DollarSign,
  Users,
  Clock,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { formatNumber, formatCurrency } from "@/utils/formatters";
import { SUPPORTED_NETWORKS } from "@/utils/Blockchain";
import Image from "next/image";
import { parseTokenMetadata } from "@/utils/tokenMetadata";
import { Badge } from "@/components/ui/badge";

interface TokenPortfolioItem {
  address: string;
  name: string;
  symbol: string;
  balance: bigint;
  stats: TokenStats;
  creator: string;
  launchTime: bigint;
  description: string;
  logoUrl: string;
  currentValue: bigint;
  priceChange24h?: number;
}

interface PortfolioStats {
  totalValue: bigint;
  totalTokens: number;
  createdTokens: number;
  totalGains: bigint;
  totalFees: bigint;
}

export default function PortfolioPage() {
  const { address, isConnected, status } = useAccount();
  const publicClient = usePublicClient();
  const wagmiChainId = useChainId();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [portfolioTokens, setPortfolioTokens] = useState<TokenPortfolioItem[]>(
    []
  );
  const [createdTokens, setCreatedTokens] = useState<TokenPortfolioItem[]>([]);
  const [portfolioStats, setPortfolioStats] = useState<PortfolioStats>({
    totalValue: BigInt(0),
    totalTokens: 0,
    createdTokens: 0,
    totalGains: BigInt(0),
    totalFees: BigInt(0),
  });
  const [activeTab, setActiveTab] = useState("holdings");

  // Ensure client-side mount before deciding connection UI to avoid hydration flicker
  useEffect(() => {
    setMounted(true);
  }, []);

  const loadPortfolioData = useCallback(async () => {
    if (!address) return;

    setLoading(true);
    try {
      if (!publicClient) throw new Error("Public client unavailable");

      const factoryService = new TokenFactoryRootService();

      // Select supported chain for reads (prefer wagmi chain)
      const currentChainId =
        (wagmiChainId && SUPPORTED_NETWORKS[wagmiChainId]) ? wagmiChainId : 16602;

      // Get tokens created by user
      let createdTokenAddresses: string[] = [];
      try {
        createdTokenAddresses = await factoryService.getCreatorTokens(
          address,
          currentChainId
        );
      } catch (error) {
        console.error("[Portfolio] Error getCreatorTokens:", error);
        createdTokenAddresses = [];
      }

      // Get all tokens from the factory to check holdings
      let allTokenAddresses: string[] = [];
      try {
        allTokenAddresses = await factoryService.getAllTokens(currentChainId);
      } catch (error) {
        console.error("[Portfolio] Error getAllTokens:", error);
        allTokenAddresses = [];
      }

      // Get creator stats
      let creatorStats;
      try {
        creatorStats = await factoryService.getCreatorStats(
          address,
          currentChainId
        );
      } catch (error) {
        console.error("[Portfolio] Error getCreatorStats:", error);
        creatorStats = null;
      }

      // If we couldn't get tokens from factory, try to scan for common token patterns
      if (allTokenAddresses.length === 0) {
        // No tokens found from factory; fallback paths can be implemented here
        // For now, we'll use an empty array, but you could add logic here to:
        // 1. Check known token addresses from your app's database
        // 2. Scan recent blockchain events for token creations by this user
        // 3. Use a predefined list of test tokens
        allTokenAddresses = [];
      }

      // Load token data for all tokens to check holdings

      const allTokensData = await Promise.all(
        allTokenAddresses.map(async (tokenAddress, index) => {
          try {
            // Use Wagmi public client for reading contract data
            if (!publicClient) throw new Error("Public client unavailable");

            // Load CreatorToken ABI
            const CreatorTokenABI = (
              await import("@/config/abi/CreatorToken.json")
            ).default;

            // Create a safe contract reader function with better error handling
            const safeReadContract = async (
              functionName: string,
              fallbackValue: any,
              args?: any[]
            ) => {
              try {
                const result = await publicClient.readContract({
                  address: tokenAddress as `0x${string}`,
                  abi: CreatorTokenABI,
                  functionName,
                  ...(args && { args }),
                });
                // Check if result is empty or null
                if (
                  result === null ||
                  result === undefined ||
                  result === "0x" ||
                  result === ""
                ) {
                  console.warn(
                    `Function ${functionName} returned empty data for ${tokenAddress}, using fallback`
                  );
                  return fallbackValue;
                }
                return result;
              } catch (error: any) {
                // Handle specific contract errors
                if (
                  error.message?.includes("function") &&
                  error.message?.includes("returned no data")
                ) {
                  console.warn(
                    `Function ${functionName} not available for ${tokenAddress}, using fallback`
                  );
                } else if (error.message?.includes("Unsupported chain ID")) {
                  console.warn(
                    `Chain ID issue for ${functionName} on ${tokenAddress}, using fallback`
                  );
                } else {
                  console.warn(
                    `Function ${functionName} failed for ${tokenAddress}:`,
                    error
                  );
                }
                return fallbackValue;
              }
            };

            // Read basic token info from contract with fallbacks
            const [name, symbol, totalSupply, decimals, description, logoUrl] =
              await Promise.all([
                safeReadContract(
                  "name",
                  `Token ${tokenAddress.slice(0, 6)}...${tokenAddress.slice(
                    -4
                  )}`
                ),
                safeReadContract(
                  "symbol",
                  `TKN${tokenAddress.slice(-4).toUpperCase()}`
                ),
                safeReadContract(
                  "totalSupply",
                  BigInt("1000000000000000000000000")
                ),
                safeReadContract("decimals", 18),
                safeReadContract("description", ""),
                safeReadContract("logoUrl", ""),
              ]);

            // Try to get additional stats (may fail if methods don't exist)
            let stats;
            try {
              const [
                currentPrice,
                marketCap,
                holderCount,
                totalSold,
                creatorFees,
              ] = await Promise.all([
                // Try getCurrentPrice first, fallback to currentPrice
                (async () => {
                  try {
                    return await safeReadContract(
                      "getCurrentPrice",
                      parseEther("0.001")
                    );
                  } catch (error) {
                    console.warn(
                      `[Portfolio] getCurrentPrice failed for ${tokenAddress}, trying currentPrice:`,
                      error
                    );
                    return await safeReadContract(
                      "currentPrice",
                      parseEther("0.001")
                    );
                  }
                })(),
                safeReadContract("marketCap", BigInt(0)),
                safeReadContract("holderCount", BigInt(1)),
                safeReadContract("totalSold", BigInt(0)),
                safeReadContract("getTotalFeesCollected", BigInt(0)),
              ]);

              stats = {
                totalSupply: totalSupply as bigint,
                totalSold: totalSold as bigint,
                currentPrice: currentPrice as bigint,
                marketCap: marketCap as bigint,
                holderCount: holderCount as bigint,
                creatorFees: creatorFees as bigint,
              };
            } catch (error) {
              console.warn(
                `[Portfolio] Could not load stats for token ${tokenAddress}:`,
                error
              );
              // Fallback stats
              stats = {
                totalSupply: totalSupply as bigint,
                totalSold: BigInt(0),
                currentPrice: parseEther("0.001"),
                marketCap: BigInt(0),
                holderCount: BigInt(1),
                creatorFees: BigInt(0),
              };
            }

            // Get user's balance
            const balance = await safeReadContract("balanceOf", BigInt(0), [
              address,
            ]);

            const currentValue =
              (balance * stats.currentPrice) / BigInt(10 ** 18);

            // Get token creator and launch time from TokenFactory
            const tokenCreator = await safeReadContract("creator", address);

            // Try to get launch time from TokenFactory
            let launchTime: bigint;
            try {
              launchTime = await factoryService.getTokenLaunchTime(
                tokenAddress,
                currentChainId
              );
            } catch (error) {
              console.warn(
                `Could not get launch time for ${tokenAddress}:`,
                error
              );
              launchTime = BigInt(Date.now() - index * 86400000); // Fallback to approximate
            }

            return {
              address: tokenAddress,
              name: name as string,
              symbol: symbol as string,
              balance,
              stats,
              creator: tokenCreator,
              launchTime: launchTime,
              description:
                (description as string) ||
                (tokenCreator === address
                  ? `Token ${name} created by you`
                  : `Token ${name}`),
              logoUrl: (logoUrl as string) || "",
              currentValue,
            };
          } catch (error) {
            console.error(
              `[Portfolio] Error loading token data for ${tokenAddress}:`,
              error
            );
            // Return minimal data if contract calls fail
            return {
              address: tokenAddress,
              name: `Token ${index + 1}`,
              symbol: `TKN${index + 1}`,
              balance: BigInt(0),
              stats: {
                totalSupply: BigInt(0),
                totalSold: BigInt(0),
                currentPrice: BigInt(0),
                marketCap: BigInt(0),
                holderCount: BigInt(0),
                creatorFees: BigInt(0),
              },
              creator: address,
              launchTime: BigInt(Date.now()),
              description: `Token at ${tokenAddress}`,
              logoUrl: "",
              currentValue: BigInt(0),
            };
          }
        })
      );

      // Filter tokens with non-zero balance for portfolio holdings
      const tokensWithBalance = allTokensData.filter(
        (token) => token.balance > BigInt(0)
      );

      // Filter tokens created by the user using the addresses from getCreatorTokens
      const createdTokensData = allTokensData.filter((token) =>
        createdTokenAddresses.includes(token.address)
      );

      // If no created tokens found from factory but we have tokens with high balance,
      // also check by reading creator field from contract as fallback
      let fallbackCreatedTokens: TokenPortfolioItem[] = [];
      if (createdTokensData.length === 0 && allTokensData.length > 0) {
        console.log(
          "No created tokens found from factory, checking by creator field..."
        );
        fallbackCreatedTokens = allTokensData.filter(
          (token) => token.creator === address
        );
        console.log(
          "Fallback created tokens:",
          fallbackCreatedTokens.map((t) => ({
            address: t.address,
            name: t.name,
          }))
        );
      }

      const finalCreatedTokens =
        createdTokensData.length > 0
          ? createdTokensData
          : fallbackCreatedTokens;

      /*
      Debug: All tokens data
      console.debug(
        "All tokens data:",
        allTokensData.map((t) => ({
          address: t.address,
          name: t.name,
          creator: t.creator,
        }))
      );
      console.debug(
        "Final created tokens data:",
        finalCreatedTokens.map((t) => ({ address: t.address, name: t.name }))
      );
      console.debug(
        "Tokens with balance:",
        tokensWithBalance.map((t) => ({
          address: t.address,
          name: t.name,
          balance: t.balance.toString(),
        }))
      );
      */

      // Calculate portfolio statistics
      const totalValue = tokensWithBalance.reduce(
        (sum: bigint, token: TokenPortfolioItem) => sum + token.currentValue,
        BigInt(0)
      );
      const totalFees = finalCreatedTokens.reduce(
        (sum: bigint, token: TokenPortfolioItem) =>
          sum + token.stats.creatorFees,
        BigInt(0)
      );

      setCreatedTokens(finalCreatedTokens);
      setPortfolioTokens(tokensWithBalance);
      setPortfolioStats({
        totalValue,
        totalTokens: tokensWithBalance.length,
        createdTokens: finalCreatedTokens.length,
        totalGains: BigInt(0), // Would need historical data to calculate
        totalFees,
      });
    } catch (error) {
      console.error("[Portfolio] Error loading portfolio data:", error);

      // Set empty state on error
      setCreatedTokens([]);
      setPortfolioTokens([]);
      setPortfolioStats({
        totalValue: BigInt(0),
        totalTokens: 0,
        createdTokens: 0,
        totalGains: BigInt(0),
        totalFees: BigInt(0),
      });
    } finally {
      setLoading(false);
    }
  }, [address, publicClient, wagmiChainId]);

  useEffect(() => {
    if (mounted && (isConnected || address)) {
      loadPortfolioData();
    }
  }, [mounted, isConnected, address, status, wagmiChainId, loadPortfolioData]);

  const TokenCard = ({ token }: { token: TokenPortfolioItem }) => {
    // Parse the combined description to extract metadata
    const tokenMetadata = parseTokenMetadata(token.description);

    return (
      <Card className="bg-gray-50 border-gray-200 hover:bg-gray-100 transition-all duration-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {token.logoUrl ? (
                <img
                  src={token.logoUrl}
                  alt={token.name}
                  width={40}
                  height={40}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                  {token.symbol.charAt(0)}
                </div>
              )}
              <div>
                <CardTitle className="text-black text-lg">
                  {token.name}
                </CardTitle>
                <p className="text-gray-600 text-sm">{token.symbol}</p>
              </div>
            </div>
            <Badge variant="secondary" className="bg-blue-100 text-blue-700">
              {token.creator === address ? "Created" : "Holding"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Display token description if available */}
            {tokenMetadata.description && (
              <div className="mb-3 p-2 bg-gray-100 rounded">
                <p className="text-xs text-gray-600 mb-1">Description</p>
                <p className="text-sm text-gray-800">
                  {tokenMetadata.description}
                </p>
              </div>
            )}

            {/* Display social links if available */}
            {(tokenMetadata.website ||
              tokenMetadata.telegram ||
              tokenMetadata.twitter) && (
              <div className="mb-3 p-2 bg-gray-100 rounded">
                <p className="text-xs text-gray-600 mb-2">Links</p>
                <div className="flex gap-2">
                  {tokenMetadata.website && (
                    <a
                      href={tokenMetadata.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                    >
                      Website
                    </a>
                  )}
                  {tokenMetadata.telegram && (
                    <a
                      href={
                        tokenMetadata.telegram.startsWith("@")
                          ? `https://t.me/${tokenMetadata.telegram.slice(1)}`
                          : tokenMetadata.telegram
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                    >
                      Telegram
                    </a>
                  )}
                  {tokenMetadata.twitter && (
                    <a
                      href={
                        tokenMetadata.twitter.startsWith("@")
                          ? `https://twitter.com/${tokenMetadata.twitter.slice(
                              1
                            )}`
                          : tokenMetadata.twitter
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                    >
                      Twitter
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-gray-600">Balance</span>
              <span className="text-black font-medium">
                {formatNumber(token.balance)} {token.symbol}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Current Price</span>
              <span className="text-black font-medium">
                {formatCurrency(Number(formatEther(token.stats.currentPrice)), {
                  currency: "ETH",
                })}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Value</span>
              <span className="text-green-600 font-medium">
                {formatCurrency(Number(formatEther(token.currentValue)), {
                  currency: "ETH",
                })}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Market Cap</span>
              <span className="text-black font-medium">
                {formatCurrency(Number(formatEther(token.stats.marketCap)), {
                  currency: "ETH",
                })}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Holders</span>
              <span className="text-black font-medium">
                {formatNumber(Number(token.stats.holderCount))}
              </span>
            </div>
            {token.creator === address && (
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Fees Earned</span>
                <span className="text-green-600 font-medium">
                  {formatCurrency(
                    Number(formatEther(token.stats.creatorFees)),
                    { currency: "ETH" }
                  )}
                </span>
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-gray-200">
            <Link href={`/token/${token.address}`}>
              <Button
                variant="outline"
                size="sm"
                className="w-full cursor-pointer"
              >
                View Details <ExternalLink className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Before hydration, avoid rendering wallet-dependent UI
  if (!mounted) {
    return (
      <div>
        <Header />
        <div className="px-10 border w-full">
          <div className="min-h-[90vh] flex flex-col justify-center items-center text-black bg-[url('/img/bg-vector.svg')] bg-contain bg-no-repeat border-l border-r border-transparent [border-image:linear-gradient(to_bottom,#ebe3e8,transparent)_1]">
            <div className="text-center">
              <h1 className="font-britisans text-4xl font-bold mb-4">
                Loading
              </h1>
              <p className="text-gray-600 mb-8">Preparing your portfolio…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show connect screen only when mounted and truly not connected
  if (mounted && !isConnected && !address) {
    return (
      <div>
        <Header />
        <div className="px-10 border w-full">
          <div className="min-h-[90vh] flex flex-col justify-center items-center text-black bg-[url('/img/bg-vector.svg')] bg-contain bg-no-repeat border-l border-r border-transparent [border-image:linear-gradient(to_bottom,#ebe3e8,transparent)_1]">
            <div className="text-center">
              <h1 className="font-britisans text-4xl font-bold mb-4">
                Connect Your Wallet
              </h1>
              <p className="text-gray-600 mb-8">
                Connect your wallet to view your token portfolio
              </p>
              <Button className="bg-black text-white hover:bg-gray-800">
                Connect Wallet
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <div className="px-10 border w-full">
        <div className="min-h-[90vh] text-black bg-[url('/img/bg-vector.svg')] bg-contain bg-no-repeat border-l border-r border-transparent [border-image:linear-gradient(to_bottom,#ebe3e8,transparent)_1]">
          <div className="pt-8 pb-12">
            {/* Portfolio Header */}
            <div className="text-center mb-8">
              <h1 className="font-britisans text-5xl font-bold mb-4">
                Your Portfolio
              </h1>
              <p className="text-gray-600 text-lg">
                Track your token holdings and created tokens
              </p>
            </div>

            {loading ? (
              <div className="flex justify-center items-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-black" />
                <span className="ml-2 text-black">Loading portfolio...</span>
              </div>
            ) : (
              <div className="max-w-7xl bg-white mx-auto">
                {/* Portfolio Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                  <Card className="bg-gray-50 border-gray-200">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3">
                        <DollarSign className="w-8 h-8 text-green-600" />
                        <div>
                          <p className="text-gray-600 text-sm">Total Value</p>
                          <p className="text-black text-2xl font-bold">
                            {formatCurrency(portfolioStats.totalValue)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gray-50 border-gray-200">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3">
                        <Users className="w-8 h-8 text-blue-600" />
                        <div>
                          <p className="text-gray-600 text-sm">Total Tokens</p>
                          <p className="text-black text-2xl font-bold">
                            {portfolioStats.totalTokens}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gray-50 border-gray-200">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3">
                        <TrendingUp className="w-8 h-8 text-purple-600" />
                        <div>
                          <p className="text-gray-600 text-sm">
                            Created Tokens
                          </p>
                          <p className="text-black text-2xl font-bold">
                            {portfolioStats.createdTokens}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gray-50 border-gray-200">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3">
                        <Clock className="w-8 h-8 text-yellow-600" />
                        <div>
                          <p className="text-gray-600 text-sm">Fees Earned</p>
                          <p className="text-black text-2xl font-bold">
                            {formatCurrency(portfolioStats.totalFees)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Portfolio Tabs */}
                <Tabs
                  value={activeTab}
                  onValueChange={setActiveTab}
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-2 bg-gray-100 border-gray-200">
                    <TabsTrigger
                      value="holdings"
                      className="data-[state=active]:bg-white"
                    >
                      All Holdings ({portfolioStats.totalTokens})
                    </TabsTrigger>
                    <TabsTrigger
                      value="created"
                      className="data-[state=active]:bg-white"
                    >
                      Created Tokens ({portfolioStats.createdTokens})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="holdings" className="mt-6">
                    {portfolioTokens.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {portfolioTokens.map((token) => (
                          <TokenCard key={token.address} token={token} />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-20">
                        <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-black mb-2">
                          No tokens found
                        </h3>
                        <p className="text-gray-600 mb-6">
                          You don&apos;t have any tokens in your portfolio yet.
                        </p>
                        <Link href="/explore">
                          <Button className="bg-black text-white hover:bg-gray-800">
                            Explore Tokens
                          </Button>
                        </Link>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="created" className="mt-6">
                    {createdTokens.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {createdTokens.map((token) => (
                          <TokenCard key={token.address} token={token} />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-20">
                        <TrendingUp className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-black mb-2">
                          No tokens created
                        </h3>
                        <p className="text-gray-600 mb-6">
                          You haven&apos;t created any tokens yet.
                        </p>
                        <Link href="/launch">
                          <Button className="bg-black text-white hover:bg-gray-800">
                            Create Your First Token
                          </Button>
                        </Link>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
