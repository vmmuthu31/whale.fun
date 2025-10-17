"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Copy,
  ArrowLeft,
  ExternalLink,
  LineChart,
  CandlestickChart,
} from "lucide-react";
import { FaGlobe, FaTelegramPlane } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import TradingViewChart from "@/components/TradingViewChart";
import {
  tokenDataService,
  type TokenData,
} from "@/lib/services/TokenDataService";
import { formatEther, parseEther } from "ethers";
import SimilarTokens from "@/components/trade/SimilarTokens";
import StreamPlayer from "@/components/StreamPlayer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useWalletClient,
  useChainId,
} from "wagmi";
import CreatorTokenABI from "@/config/abi/CreatorToken.json";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import Link from "next/link";
import { formatNumber, formatCurrency } from "@/utils/formatters";

const TokenStat = ({
  name,
  percent,
  votes,
  eth,
  selected,
  onClick,
}: {
  name: string;
  percent: string;
  votes: string;
  eth: string;
  selected?: boolean;
  onClick?: () => void;
}) => (
  <Card
    onClick={onClick}
    className={`group flex-1 border-dashed cursor-pointer transition-colors duration-200 ${
      selected ? "bg-[#B65FFF]" : "bg-white hover:bg-[#DAADFF]"
    }`}
  >
    <CardContent className="p-6 text-center">
      <p
        className={`text-xs uppercase tracking-wider transition-colors duration-200 ${
          selected ? "text-white" : "text-[#0000004D] group-hover:text-white"
        }`}
      >
        Token Name
      </p>
      <p
        className={`text-2xl font-extrabold transition-colors duration-200 ${
          selected ? "text-white" : "text-[#B65FFF] group-hover:text-white"
        }`}
      >
        {name}
      </p>
      <div className="mt-3">
        <span
          className={`text-5xl leading-none font-black transition-colors duration-200 ${
            selected ? "text-white" : "text-gray-900 group-hover:text-white"
          }`}
        >
          {percent}
        </span>
      </div>
      <p
        className={`mt-2 text-xs transition-colors duration-200 ${
          selected ? "text-white" : "text-gray-900 group-hover:text-white"
        }`}
      >
        {votes} votes
      </p>
      <p
        className={`mt-1 text-xs transition-colors duration-200 ${
          selected ? "text-white" : "text-gray-900 group-hover:text-white"
        }`}
      >
        {eth} ETH
      </p>
    </CardContent>
  </Card>
);

const TradePage = () => {
  const params = useParams<{ address: string }>();
  const router = useRouter();
  const tokenAddress = params?.address || "";

  // Helper function to format numbers nicely
  const formatNumber = (value: number): string => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    } else if (value >= 1) {
      return value.toFixed(2);
    } else if (value >= 0.0001) {
      return value.toFixed(4);
    } else if (value > 0) {
      return value.toExponential(2);
    } else {
      return "0";
    }
  };

  // State management
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userBalance, setUserBalance] = useState<string>("0");
  const [userTokenBalance, setUserTokenBalance] = useState<string>("0");
  const [userTokenBalanceRaw, setUserTokenBalanceRaw] = useState<bigint>(
    BigInt(0)
  );
  const [copied, setCopied] = useState(false);
  const account = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const wagmiChainId = useChainId();
  console.log("chainId", account?.chain?.id);
  console.log("userbalance", userBalance);
  // Trading state
  const [buyAmount, setBuyAmount] = useState<string>("");
  const [sellAmount, setSellAmount] = useState<string>("");
  const [buyQuote, setBuyQuote] = useState<{
    cost: bigint;
    tokensReceived: bigint;
    priceImpact: number;
  } | null>(null);
  const [sellQuote, setSellQuote] = useState<{
    proceeds: bigint;
    priceImpact: number;
  } | null>(null);
  const [tradingLoading, setTradingLoading] = useState(false);
  const [tradingError, setTradingError] = useState<string | null>(null);

  // Chart data
  const [chartData, setChartData] = useState<
    { timestamp: number; price: number }[]
  >([]);
  const [chartLoading, setChartLoading] = useState<boolean>(false);
  const [chartTimeframe, setChartTimeframe] = useState<
    "5m" | "1h" | "24h" | "7d" | "30d" | "All"
  >("24h");
  const [showStatsTf, setShowStatsTf] = useState(false);
  // Chart type toggle (candle chart by default)
  const [chartType, setChartType] = useState<"line" | "candle">("candle");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Wallet connection
  const { address: userAddress, isConnected, chain } = useAccount();
  // Reactive native balance via wagmi (more reliable for UI)
  const { data: nativeBal } = useBalance({
    address: userAddress,
    chainId: chain?.id,
    // useBalance@wagmi v2 uses TanStack Query options via `query`
    scopeKey: `native-${chain?.id}-${userAddress}`,
    query: {
      enabled: Boolean(userAddress && chain?.id),
      refetchInterval: 10000, // refresh every 10s
      refetchOnWindowFocus: true,
    },
  });

  // Livestream state
  const [selectedToken, setSelectedToken] = useState<"WHALE" | "ARROW">(
    "WHALE"
  );
  const [bossOpen, setBossOpen] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  // Trade panel state (match Livestream UI)
  const [tradeMode, setTradeMode] = useState<"Buy" | "Sell">("Buy");
  const [amount, setAmount] = useState<string>("");
  const parsedAmount = Number(amount || 0);
  // Modal flow
  const [showSetup, setShowSetup] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatAllowed, setChatAllowed] = useState(false);
  // Go Live form state
  const [glTitle, setGlTitle] = useState("Token Name");
  const [glDesc, setGlDesc] = useState("");
  const [glUser, setGlUser] = useState("");
  const [glCam, setGlCam] = useState(true);
  const [glMic, setGlMic] = useState(true);
  const [glRec, setGlRec] = useState(false);
  const [glMirror, setGlMirror] = useState(false);
  // Huddle identifiers for inline publish/recording
  const [roomId, setRoomId] = useState<string>("");
  const [huddleToken, setHuddleToken] = useState<string>("");

  // Fetch token data on mount
  useEffect(() => {
    if (tokenAddress) {
      fetchTokenData();
    }
  }, [tokenAddress]);

  console.log("real token data", tokenData);

  // Fetch user balances when connected
  useEffect(() => {
    if (tokenAddress && userAddress && isConnected) {
      fetchUserBalances();
    }
  }, [tokenAddress, userAddress, isConnected]);

  // Keep userBalance in sync with wagmi's native balance
  useEffect(() => {
    if (nativeBal) {
      // nativeBal.formatted is a string like "0.093"
      console.log(
        "wagmi native balance:",
        nativeBal.formatted,
        nativeBal.symbol
      );
      setUserBalance(nativeBal.formatted);
    }
  }, [nativeBal]);

  // Update quotes when amount changes
  useEffect(() => {
    if (tokenAddress && amount && parsedAmount > 0) {
      if (tradeMode === "Buy") {
        updateBuyQuote();
      } else {
        updateSellQuote();
      }
    } else {
      setBuyQuote(null);
      setSellQuote(null);
    }
  }, [amount, tradeMode, tokenAddress]);

  // Realtime refresh for chart data
  useEffect(() => {
    let timer: any;
    (async () => {
      try {
        // Use default 0G Network chainId for read-only operations
        const chainId = 16661;
        timer = setInterval(() => {
          fetchChartData(chainId);
        }, 30000); // refresh every 30s
      } catch {}
    })();
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [chartTimeframe, tokenAddress]);

  // Realtime refresh for Coin Stats (volume/market cap/holders)
  useEffect(() => {
    if (!tokenAddress) return;
    const statsTimer: any = setInterval(async () => {
      try {
        await fetchTokenData({ silent: true });
      } catch (e) {
        console.warn("stats refresh failed", e);
      }
    }, 30000);
    return () => clearInterval(statsTimer);
  }, [tokenAddress, chartTimeframe]);

  const updateBuyQuote = async () => {
    if (!tokenAddress || !amount || parsedAmount <= 0) return;

    try {
      if (!publicClient) throw new Error("Public client unavailable");

      // ETH amount the user wants to spend
      // User enters ETH amount they want to spend (e.g., "0.1" means 0.1 ETH)
      const ethAmount = parseEther(amount); // Convert to ETH wei (18 decimals)

      // Try contract calculation first (now with fixed BondingCurveLibrary)
      try {
        console.log("Attempting contract calculation for:", {
          tokenAddress,
          ethAmount: ethAmount.toString(),
          amount,
        });

        // Instead of calculating cost for tokens, we need to find how many tokens we can buy with ETH
        const currentPrice = (await publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: CreatorTokenABI,
          functionName: "getCurrentPrice",
        })) as bigint;

        // Estimate initial token amount (convert to proper calculation for small prices)
        // For currentPrice = 1002001000000n wei (0.001002 ETH), and ethAmount = 2000000000000000000n (2 ETH)
        // We need to do: (2 ETH * 10^18) / (0.001002 ETH * 10^18) = 2 / 0.001002 = ~1996 tokens
        const currentPriceEth = Number(formatEther(currentPrice));
        const ethAmountEth = Number(formatEther(ethAmount));
        const estimatedTokensFloat = ethAmountEth / currentPriceEth;
        const estimatedTokens = parseEther(estimatedTokensFloat.toString());

        console.log("Binary search initialization:", {
          currentPrice: currentPrice.toString(),
          currentPriceEth,
          ethAmount: ethAmount.toString(),
          ethAmountEth,
          estimatedTokensFloat,
          estimatedTokens: estimatedTokens.toString(),
        });

        // Use binary search to find exact token amount for this ETH
        let low = BigInt(0);
        let high = estimatedTokens * BigInt(2);
        let bestTokenAmount = BigInt(0);
        let bestCost = BigInt(0);

        for (let i = 0; i < 15; i++) {
          const mid = (low + high) / BigInt(2);
          if (mid <= 0) break;

          try {
            const cost = (await publicClient.readContract({
              address: tokenAddress as `0x${string}`,
              abi: CreatorTokenABI,
              functionName: "calculateBuyCost",
              args: [mid],
            })) as bigint;

            if (cost <= ethAmount) {
              bestTokenAmount = mid;
              bestCost = cost;
              low = mid + BigInt(1);
            } else {
              high = mid - BigInt(1);
            }

            // If we're close enough, break
            const diff = cost > ethAmount ? cost - ethAmount : ethAmount - cost;
            if (diff < ethAmount / BigInt(100)) {
              // Within 1%
              bestTokenAmount = mid;
              bestCost = cost;
              break;
            }
          } catch {
            high = mid - BigInt(1);
          }
        }

        console.log("Contract calculation results:", {
          bestCost: bestCost.toString(),
          bestTokenAmount: bestTokenAmount.toString(),
          costEth: formatEther(bestCost),
          tokensReceived: formatEther(bestTokenAmount),
          currentPrice: currentPrice.toString(),
          currentPriceEth: formatEther(currentPrice),
        });

        // Calculate price impact based on bonding curve
        const costEth = Number(formatEther(bestCost));
        const tokensReceived = Number(formatEther(bestTokenAmount));

        // Check if contract returned reasonable values
        if (costEth > 1000000 || bestTokenAmount <= 0) {
          throw new Error(
            `Contract returned unreasonable values: cost=${costEth} ETH, tokens=${tokensReceived}`
          );
        }

        // Price impact: how much more expensive per token compared to current price
        const avgPricePerToken =
          tokensReceived > 0 ? costEth / tokensReceived : 0;
        const priceImpact =
          currentPriceEth > 0
            ? ((avgPricePerToken - currentPriceEth) / currentPriceEth) * 100
            : 0;

        console.log("Contract calculation success:", {
          costEth,
          tokensReceived,
          priceImpact,
        });
        setBuyQuote({
          cost: bestCost,
          tokensReceived: bestTokenAmount,
          priceImpact: Math.max(0, priceImpact),
        });
        return;
      } catch (contractError) {
        console.warn(
          "Contract calculation failed, using frontend fallback:",
          contractError
        );
      }

      // Fallback to frontend calculation if contract fails
      const currentPrice = (await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: CreatorTokenABI,
        functionName: "getCurrentPrice",
      })) as bigint;

      const ethAmountNumber = parseFloat(amount);
      const fallbackCurrentPriceEth = Number(formatEther(currentPrice));

      // Handle very small prices (like 0.000001 ETH)
      if (fallbackCurrentPriceEth === 0) {
        const tokensReceived = parseEther("1000"); // Give 1000 tokens for minimum cost
        setBuyQuote({
          cost: parseEther("0.001"),
          tokensReceived,
          priceImpact: 0,
        });
        return;
      }

      // Simple estimation: tokens = ETH / currentPrice
      const estimatedTokens = ethAmountNumber / fallbackCurrentPriceEth;
      const tokensReceived = parseEther(estimatedTokens.toString());

      console.log("Frontend fallback calculation:", {
        fallbackCurrentPriceEth,
        ethAmountNumber,
        estimatedTokens,
      });

      if (fallbackCurrentPriceEth < 0.000001) {
        // For very small prices, give generous token amount
        const tokensReceived = parseEther(
          (ethAmountNumber * 1000000).toString()
        );
        setBuyQuote({
          cost: ethAmount,
          tokensReceived,
          priceImpact: 10,
        });
        return;
      }

      // Calculate average price with bonding curve effect
      const priceIncrement = Math.max(fallbackCurrentPriceEth * 0.01, 0.000001);
      const avgPricePerToken =
        fallbackCurrentPriceEth + (estimatedTokens * priceIncrement) / 2;
      const actualCostEth = estimatedTokens * avgPricePerToken;

      console.log("Calculation details:", {
        priceIncrement,
        avgPricePerToken,
        actualCostEth,
        estimatedTokens,
      });

      // Ensure values are reasonable
      if (actualCostEth > ethAmountNumber * 2) {
        // If calculated cost is more than 2x the input, just use simple division
        const simpleTokens = parseEther(
          (ethAmountNumber / fallbackCurrentPriceEth).toString()
        );
        setBuyQuote({
          cost: ethAmount,
          tokensReceived: simpleTokens,
          priceImpact: 5,
        });
        return;
      }

      // Use the actual calculated cost, but cap tokens at what we can afford
      const finalCost = parseEther(
        Math.min(actualCostEth, ethAmountNumber).toString()
      );

      // Calculate price impact
      const priceImpact =
        fallbackCurrentPriceEth > 0
          ? ((avgPricePerToken - fallbackCurrentPriceEth) /
              fallbackCurrentPriceEth) *
            100
          : 0;

      setBuyQuote({
        cost: finalCost,
        tokensReceived,
        priceImpact: Math.max(0, priceImpact),
      });
    } catch (err: any) {
      console.error("Error updating buy quote:", err);
      setBuyQuote(null);
    }
  };

  const updateSellQuote = async () => {
    if (!tokenAddress || !amount || parsedAmount <= 0) {
      setSellQuote(null);
      return;
    }

    try {
      if (!publicClient) throw new Error("Public client unavailable");

      // Check if user has enough tokens to sell
      const userTokenBalanceBigInt = (await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: CreatorTokenABI,
        functionName: "balanceOf",
        args: [userAddress],
      })) as bigint;

      const tokenAmountToSell = parseEther(amount);

      console.log("DEBUG SELL QUOTE: amount string:", amount);
      console.log("DEBUG SELL QUOTE: parsedAmount:", parsedAmount);
      console.log(
        "DEBUG SELL QUOTE: tokenAmountToSell wei:",
        tokenAmountToSell.toString()
      );

      // Validate user has enough tokens
      if (userTokenBalanceBigInt < tokenAmountToSell) {
        console.warn("User doesn't have enough tokens to sell");
        setSellQuote({ proceeds: BigInt(0), priceImpact: 0 });
        return;
      }
      const decimals = 17; // e.g., USDC, USDT

      console.log("Attempting sell calculation for:", {
        tokenAddress,
        tokenAmount: tokenAmountToSell.toString(),
        amount,
        userBalance: (
          Number(userTokenBalanceBigInt) /
          10 ** decimals
        ).toString(),
      });

      // Try contract calculation first
      try {
        const [proceeds, currentPrice] = await Promise.all([
          publicClient.readContract({
            address: tokenAddress as `0x${string}`,
            abi: CreatorTokenABI,
            functionName: "calculateSellPrice",
            args: [tokenAmountToSell],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: tokenAddress as `0x${string}`,
            abi: CreatorTokenABI,
            functionName: "getCurrentPrice",
          }) as Promise<bigint>,
        ]);

        console.log("Contract sell calculation results:", {
          proceeds: proceeds.toString(),
          proceedsEth: formatEther(proceeds),
          currentPrice: currentPrice.toString(),
          currentPriceEth: formatEther(currentPrice),
        });

        // Validate contract returned reasonable values
        const proceedsEth = Number(formatEther(proceeds));
        const currentPriceEth = Number(formatEther(currentPrice));
        const tokenAmountNumber = parseFloat(amount);

        // Check for unreasonable values
        if (proceedsEth < 0 || proceedsEth > 1000000) {
          throw new Error(
            `Contract returned unreasonable proceeds: ${proceedsEth} ETH`
          );
        }

        // Calculate price impact for selling
        const avgPricePerToken =
          tokenAmountNumber > 0 ? proceedsEth / tokenAmountNumber : 0;
        const priceImpact =
          currentPriceEth > 0
            ? ((currentPriceEth - avgPricePerToken) / currentPriceEth) * 100
            : 0;

        console.log("Contract sell calculation success:", {
          proceedsEth,
          priceImpact,
        });
        setSellQuote({
          proceeds,
          priceImpact: Math.max(0, Math.min(100, priceImpact)),
        });
        return;
      } catch (contractError) {
        console.warn(
          "Contract sell calculation failed, using frontend fallback:",
          contractError
        );
      }

      // Fallback to frontend calculation if contract fails
      const currentPrice = (await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: CreatorTokenABI,
        functionName: "getCurrentPrice",
      })) as bigint;

      const tokenAmountNumber = parseFloat(amount);
      const currentPriceEth = Number(formatEther(currentPrice));

      console.log("Frontend fallback sell calculation:", {
        currentPriceEth,
        tokenAmountNumber,
      });

      // Handle edge cases
      if (currentPriceEth <= 0 || tokenAmountNumber <= 0) {
        setSellQuote({ proceeds: BigInt(0), priceImpact: 0 });
        return;
      }

      // Simple bonding curve: selling reduces price
      // For very small prices, use more conservative slippage
      let priceDecrement: number;
      let minPriceRatio: number;

      if (currentPriceEth < 0.000001) {
        // For very small prices, smaller slippage
        priceDecrement = currentPriceEth * 0.005; // 0.5% per token
        minPriceRatio = 0.8; // Minimum 80% of current price
      } else {
        // For normal prices, standard slippage
        priceDecrement = currentPriceEth * 0.01; // 1% per token
        minPriceRatio = 0.7; // Minimum 70% of current price
      }

      // Calculate average price considering bonding curve
      const maxPriceDecrement = currentPriceEth * (1 - minPriceRatio);
      const actualDecrement = Math.min(
        (tokenAmountNumber * priceDecrement) / 2,
        maxPriceDecrement
      );
      const avgPricePerToken = Math.max(
        currentPriceEth - actualDecrement,
        currentPriceEth * minPriceRatio
      );

      const totalProceedsEth = tokenAmountNumber * avgPricePerToken;

      console.log("Sell calculation details:", {
        priceDecrement,
        actualDecrement,
        avgPricePerToken,
        totalProceedsEth,
        minPriceRatio,
      });

      // Ensure totalProceedsEth is reasonable
      if (totalProceedsEth < 0) {
        console.warn("Negative proceeds, setting to 0");
        setSellQuote({ proceeds: BigInt(0), priceImpact: 0 });
        return;
      }

      if (totalProceedsEth > 1000000) {
        console.warn("Proceeds too high, capping at 1000 ETH");
        setSellQuote({ proceeds: parseEther("1000"), priceImpact: 100 });
        return;
      }

      // Convert to wei safely
      const proceeds = parseEther(totalProceedsEth.toFixed(18));

      // Calculate price impact
      const priceImpact =
        currentPriceEth > 0
          ? ((currentPriceEth - avgPricePerToken) / currentPriceEth) * 100
          : 0;

      setSellQuote({
        proceeds,
        priceImpact: Math.max(0, Math.min(100, priceImpact)), // Cap between 0-100%
      });
    } catch (err: any) {
      console.error("Error updating sell quote:", err);
      setSellQuote(null);
      // Optionally set a user-friendly error state
      setTradingError(`Failed to calculate sell quote: ${err.message}`);
    }
  };

  // Update default stream title when token data loads
  useEffect(() => {
    if (tokenData?.name) {
      setGlTitle(tokenData.name);
    }
  }, [tokenData?.name]);

  // Refresh token data after successful trade
  const handleTradeSuccess = () => {
    // Refresh silently after a trade to avoid flicker
    fetchTokenData({ silent: true });
  };

  const fetchTokenData = async (opts?: { silent?: boolean }) => {
    try {
      const silent = Boolean(opts?.silent);
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      // Use default 0G Network chainId for read-only operations
      const chainId = 16661;

      const data = await tokenDataService.getTokenData(tokenAddress, chainId);
      if (data) {
        setTokenData(data);
        await fetchChartData(chainId);
      } else {
        if (!silent) setError("Token not found");
      }
    } catch (err: any) {
      console.error("Error fetching token data:", err);
      if (!opts?.silent) setError(err.message || "Failed to fetch token data");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  const fetchUserBalances = async () => {
    if (!userAddress || !tokenAddress) return;

    try {
      if (!publicClient) throw new Error("Public client unavailable");

      const [ethBalance, tokenBalance] = await Promise.all([
        publicClient.getBalance({ address: userAddress as `0x${string}` }),
        publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: CreatorTokenABI,
          functionName: "balanceOf",
          args: [userAddress],
        }),
      ]);

      // Do not set userBalance here to avoid racing with wagmi's useBalance which is reactive and accurate
      // setUserBalance(formatEther(ethBalance));
      // Store token balance as bigint and format it properly
      const tokenBalanceBigInt = tokenBalance as bigint;
      setUserTokenBalanceRaw(tokenBalanceBigInt);
      setUserTokenBalance(tokenBalanceBigInt.toLocaleString());
    } catch (err: any) {
      console.error("Error fetching user balances:", err);
    }
  };

  const fetchChartData = async (chainId: number) => {
    try {
      setChartLoading(true);
      if (!publicClient) throw new Error("Public client unavailable");

      // Get current block number
      const currentBlock = await publicClient.getBlockNumber();
      const blocksToFetch =
        chartTimeframe === "5m"
          ? 25
          : chartTimeframe === "1h"
          ? 300
          : chartTimeframe === "24h"
          ? 7200
          : chartTimeframe === "7d"
          ? 50400
          : chartTimeframe === "30d"
          ? 216000
          : 432000; // All ~ 60d
      const fromBlock = currentBlock - BigInt(blocksToFetch);

      try {
        // Fetch TokenPurchased and TokenSold events to build real price history
        const [purchaseEvents, sellEvents] = await Promise.all([
          publicClient.getLogs({
            address: tokenAddress as `0x${string}`,
            event: {
              type: "event",
              name: "TokenPurchased",
              inputs: [
                { name: "buyer", type: "address", indexed: true },
                { name: "tokenAmount", type: "uint256", indexed: false },
                { name: "price", type: "uint256", indexed: false },
                { name: "totalPaid", type: "uint256", indexed: false },
              ],
            },
            fromBlock,
            toBlock: currentBlock,
          }),
          publicClient.getLogs({
            address: tokenAddress as `0x${string}`,
            event: {
              type: "event",
              name: "TokenSold",
              inputs: [
                { name: "seller", type: "address", indexed: true },
                { name: "tokenAmount", type: "uint256", indexed: false },
                { name: "price", type: "uint256", indexed: false },
                { name: "totalReceived", type: "uint256", indexed: false },
              ],
            },
            fromBlock,
            toBlock: currentBlock,
          }),
        ]);

        // Combine and sort events by block number
        const allEvents = [...purchaseEvents, ...sellEvents].sort(
          (a, b) => Number(a.blockNumber) - Number(b.blockNumber)
        );

        if (allEvents.length > 0) {
          // Downsample to ~60 buckets and interpolate timestamps using only two block calls
          const n = allEvents.length;
          const target = 60;
          const stride = Math.max(1, Math.ceil(n / target));
          const bucketHeads: typeof allEvents = [];
          const bucketTails: typeof allEvents = [];
          for (let i = 0; i < n; i += stride) {
            const group = allEvents.slice(i, i + stride);
            if (group.length === 0) continue;
            bucketHeads.push(group[0]);
            bucketTails.push(group[group.length - 1]);
          }

          const firstBlock = bucketHeads[0].blockNumber;
          const lastBlock = bucketHeads[bucketHeads.length - 1].blockNumber;
          const [firstBlk, lastBlk] = await Promise.all([
            publicClient.getBlock({ blockNumber: firstBlock }),
            publicClient.getBlock({ blockNumber: lastBlock }),
          ]);
          const firstTs = Number(firstBlk.timestamp) * 1000;
          const lastTs = Number(lastBlk.timestamp) * 1000;
          const firstBN = Number(firstBlock);
          const lastBN = Number(lastBlock);
          const denom = Math.max(1, lastBN - firstBN);

          const candleData: { timestamp: number; price: number }[] =
            bucketHeads.map((head, i) => {
              const bn = Number(head.blockNumber);
              const t = (bn - firstBN) / denom;
              const timestamp = Math.round(firstTs + t * (lastTs - firstTs));
              const tail = bucketTails[i];
              const price = Number(formatEther(tail.args.price as bigint));
              return { timestamp, price };
            });

          setChartData(candleData);
        } else {
          // Fallback: get current price and create a single data point
          const currentPrice = (await publicClient.readContract({
            address: tokenAddress as `0x${string}`,
            abi: CreatorTokenABI,
            functionName: "getCurrentPrice",
          })) as bigint;

          const currentPriceEth = Number(formatEther(currentPrice));
          const now = Date.now();

          setChartData([
            { timestamp: now - 3600000, price: currentPriceEth },
            { timestamp: now, price: currentPriceEth },
          ]);
        }
      } catch (eventError) {
        console.error(
          "Error fetching events, using current price:",
          eventError
        );

        // Fallback to current price
        const currentPrice = (await publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: CreatorTokenABI,
          functionName: "getCurrentPrice",
        })) as bigint;

        const currentPriceEth = Number(formatEther(currentPrice));
        const now = Date.now();

        setChartData([
          { timestamp: now - 3600000, price: currentPriceEth },
          { timestamp: now, price: currentPriceEth },
        ]);
      }
    } catch (err: any) {
      console.error("Error fetching chart data:", err);
    } finally {
      setChartLoading(false);
    }
  };

  const executeTrade = async () => {
    if (!userAddress || !isConnected) {
      setTradingError("Please connect your wallet");
      return;
    }

    if (!amount || parsedAmount <= 0) {
      setTradingError("Please enter a valid amount");
      return;
    }

    // Additional validation for selling
    if (tradeMode === "Sell") {
      const userTokenBalances = parseFloat(userTokenBalance);
      if (parsedAmount > userTokenBalances) {
        setTradingError(
          `Insufficient token balance. You have ${userTokenBalances.toFixed(
            4
          )} tokens`
        );
        return;
      }

      if (!sellQuote || sellQuote.proceeds <= 0) {
        setTradingError("Invalid sell quote. Please try a different amount.");
        return;
      }
    }

    // Additional validation for buying
    if (tradeMode === "Buy") {
      if (!buyQuote || buyQuote.cost <= 0) {
        setTradingError("Invalid buy quote. Please try a different amount.");
        return;
      }

      const userEthBalance = parseFloat(userBalance);
      const costInEth = Number(formatEther(buyQuote.cost));
      const gasBufferEth = 0.001; // Reserve for gas fees
      const totalRequired = costInEth + gasBufferEth;

      if (totalRequired > userEthBalance) {
        setTradingError(
          `Insufficient ETH balance. Need ${totalRequired.toFixed(
            6
          )} ETH (including gas), have ${userEthBalance.toFixed(6)} ETH`
        );
        return;
      }
    }

    try {
      setTradingLoading(true);
      setTradingError(null);

      const { formatEther } = await import("viem");

      // Get current chain - we know we're on 0G Network
      const chainId = 16661;

      // Map chain ID to chain object
      const chainMap: Record<number, any> = {
        16661: {
          id: 16661,
          name: "0G Network",
          network: "0g-network",
          nativeCurrency: { decimals: 18, name: "0G", symbol: "0G" },
          rpcUrls: { default: { http: ["https://evmrpc.0g.ai"] } },
          blockExplorers: {
            default: {
              name: "0G Explorer",
              url: "https://chainscan.0g.ai",
            },
          },
          testnet: false,
        },
      };

      const currentChain = chainMap[chainId];

      // Reuse Wagmi clients
      if (!walletClient) throw new Error("Wallet client unavailable");
      if (!publicClient) throw new Error("Public client unavailable");

      // Parse amounts based on trade mode
      console.log("DEBUG: amount string:", amount);
      console.log("DEBUG: parsedAmount:", parsedAmount);

      let txHash;

      if (tradeMode === "Buy") {
        if (!buyQuote) {
          throw new Error("No buy quote available");
        }

        // For buying, use the tokensReceived from the quote
        const tokenAmount = buyQuote.tokensReceived;
        console.log("DEBUG: ETH amount:", amount);
        console.log("DEBUG: tokens to buy:", formatEther(tokenAmount));

        console.log("Executing buy:", {
          ethAmount: amount,
          tokenAmount: tokenAmount.toString(),
          cost: buyQuote.cost.toString(),
          priceImpact: buyQuote.priceImpact,
        });

        txHash = await walletClient.writeContract({
          account: userAddress as `0x${string}`,
          address: tokenAddress as `0x${string}`,
          abi: CreatorTokenABI,
          functionName: "buyTokens",
          args: [tokenAmount],
          value: buyQuote.cost,
        });
      } else {
        // For selling, parse the amount as tokens
        const tokenAmount = parseEther(amount);

        if (!sellQuote) {
          throw new Error("No sell quote available");
        }

        console.log("Executing sell:", {
          tokenAmount: tokenAmount.toString(),
          expectedProceeds: sellQuote.proceeds.toString(),
          priceImpact: sellQuote.priceImpact,
        });

        console.log("DEBUG EXECUTION: amount string:", amount);
        console.log(
          "DEBUG EXECUTION: tokenAmount wei:",
          tokenAmount.toString()
        );
        console.log(
          "DEBUG EXECUTION: sellQuote proceeds:",
          sellQuote.proceeds.toString()
        );

        // Add comprehensive debugging before transaction
        let gasEstimate: bigint | undefined;
        try {
          console.log("🔍 Pre-transaction state check...");

          // Check current user balance
          const currentUserBalance = (await publicClient.readContract({
            address: tokenAddress as `0x${string}`,
            abi: CreatorTokenABI,
            functionName: "balanceOf",
            args: [userAddress as `0x${string}`],
          })) as bigint;
          console.log(
            "👤 Current user balance:",
            currentUserBalance.toString(),
            "wei"
          );
          console.log(
            "👤 Current user balance:",
            formatEther(currentUserBalance),
            "tokens"
          );

          // Check contract ETH balance
          const contractBalance = await publicClient.getBalance({
            address: tokenAddress as `0x${string}`,
          });
          console.log(
            "🏦 Contract ETH balance:",
            formatEther(contractBalance),
            "0G"
          );

          // Check expected proceeds again
          const expectedProceeds = (await publicClient.readContract({
            address: tokenAddress as `0x${string}`,
            abi: CreatorTokenABI,
            functionName: "calculateSellPrice",
            args: [tokenAmount],
          })) as bigint;
          console.log(
            "💰 Expected proceeds:",
            expectedProceeds.toString(),
            "wei"
          );
          console.log(
            "💰 Expected proceeds:",
            formatEther(expectedProceeds),
            "0G"
          );

          // Verify user has enough tokens
          if (currentUserBalance < tokenAmount) {
            throw new Error(
              `Insufficient token balance. Have: ${formatEther(
                currentUserBalance
              )}, Need: ${formatEther(tokenAmount)}`
            );
          }

          // Verify contract has enough ETH
          if (contractBalance < expectedProceeds) {
            throw new Error(
              `Contract has insufficient ETH. Have: ${formatEther(
                contractBalance
              )}, Need: ${formatEther(expectedProceeds)}`
            );
          }

          console.log("🔍 Estimating gas for sell transaction...");
          gasEstimate = await publicClient.estimateContractGas({
            address: tokenAddress as `0x${string}`,
            abi: CreatorTokenABI,
            functionName: "sellTokens",
            args: [tokenAmount],
            account: userAddress as `0x${string}`,
          });
          console.log("⛽ Gas estimate:", gasEstimate.toString());

          console.log("🔍 Simulating sell transaction...");
          const simulation = await publicClient.simulateContract({
            address: tokenAddress as `0x${string}`,
            abi: CreatorTokenABI,
            functionName: "sellTokens",
            args: [tokenAmount],
            account: userAddress as `0x${string}`,
          });
          console.log("✅ Simulation successful:", simulation);

          // Add a small delay to prevent race conditions
          console.log("⏳ Adding small delay before transaction...");
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (simError: any) {
          console.error("❌ Pre-transaction check failed:", simError.message);
          console.error("Full error:", simError);
          throw new Error(`Transaction would fail: ${simError.message}`);
        }

        // Use the exact same pattern as the working script with explicit gas
        console.log("🚀 Executing transaction with wallet client...");
        txHash = await walletClient.writeContract({
          account: userAddress as `0x${string}`,
          address: tokenAddress as `0x${string}`,
          abi: CreatorTokenABI,
          functionName: "sellTokens",
          args: [tokenAmount],
          chain: currentChain,
          gas: gasEstimate ? gasEstimate + BigInt(50000) : BigInt(300000), // Add buffer to gas estimate or use fallback
        });
      }

      console.log(`${tradeMode} transaction submitted:`, txHash);

      // Wait for transaction confirmation with better error handling for 0G Testnet
      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          timeout: 120000, // Increased timeout for 0G Testnet
        });

        if (receipt.status === "success") {
          console.log(`${tradeMode} transaction confirmed:`, receipt);

          // Refresh data
          await Promise.all([fetchTokenData(), fetchUserBalances()]);

          setAmount("");
          setBuyQuote(null);
          setSellQuote(null);

          toast.success(`${tradeMode} successful!`, {
            description: `Transaction hash: ${txHash}`,
            duration: 5000,
          });
        } else {
          throw new Error(`Transaction failed with status: ${receipt.status}`);
        }
      } catch (receiptError: any) {
        console.warn(
          "Receipt error (transaction may still be successful):",
          receiptError
        );

        // If receipt retrieval fails but transaction was submitted,
        // still refresh data and show success (common on 0G Testnet)
        if (
          receiptError.message.includes("no matching receipts found") ||
          receiptError.message.includes("data corruption")
        ) {
          console.log(
            "⚠️ Receipt not found, but transaction was submitted. Refreshing data..."
          );

          // Wait a bit for the transaction to be processed
          await new Promise((resolve) => setTimeout(resolve, 5000));

          // Refresh data to see if the transaction went through
          await Promise.all([fetchTokenData(), fetchUserBalances()]);

          setAmount("");
          setBuyQuote(null);
          setSellQuote(null);

          toast.warning(`${tradeMode} transaction submitted!`, {
            description: `Hash: ${txHash}\n\nNote: Receipt verification failed on 0G Testnet, but your transaction may have succeeded. Please check your balance.`,
            duration: 8000,
          });
        } else {
          throw receiptError; // Re-throw other receipt errors
        }
      }
    } catch (err: any) {
      console.error("Error executing trade:", err);

      // Better error handling
      let errorMessage = `Failed to ${tradeMode.toLowerCase()} tokens`;

      if (err.message.includes("insufficient funds")) {
        errorMessage =
          tradeMode === "Buy"
            ? "Insufficient ETH for purchase (including gas fees)"
            : "Insufficient tokens to sell";
      } else if (err.message.includes("user rejected")) {
        errorMessage = "Transaction was cancelled by user";
      } else if (err.message.includes("timeout")) {
        errorMessage = "Transaction timeout - it may still be pending";
      } else if (err.message) {
        errorMessage = err.message;
      }

      setTradingError(errorMessage);
    } finally {
      setTradingLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tokenAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            <p className="mt-2 text-gray-600">Loading token data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !tokenData) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error || "Token not found"}</p>
            <Button onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Compute dynamic 24h change for chart header
  const priceChangeStr = tokenData?.priceChange || "0%";
  const changeVal = parseFloat((priceChangeStr || "0").replace("%", ""));
  const isChangeUp = !Number.isNaN(changeVal) && changeVal >= 0;
  const changeAbsStr = Number.isNaN(changeVal)
    ? "0.0"
    : Math.abs(changeVal).toFixed(1);

  // Build realtime chart path and axis labels from chartData
  const svgWidth = 600;
  const svgHeight = 200;
  const topY = 20;
  const bottomY = 170; // leave padding for labels

  const prices = chartData.map((d) => d.price);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 1;
  const pad = (maxPrice - minPrice) * 0.1 || 1; // ensure non-zero
  const yRangeMin = minPrice - pad;
  const yRangeMax = maxPrice + pad;

  const yFor = (v: number) => {
    if (yRangeMax === yRangeMin) return (topY + bottomY) / 2;
    const t = (v - yRangeMin) / (yRangeMax - yRangeMin);
    return bottomY - t * (bottomY - topY);
  };

  const xFor = (i: number) => {
    if (chartData.length <= 1) return 0;
    return (i * svgWidth) / (chartData.length - 1);
  };

  let pathD = "";
  let fillD = "";
  if (chartData.length > 0) {
    pathD = chartData
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(2)},${yFor(p.price).toFixed(
            2
          )}`
      )
      .join(" ");
    const lastX = xFor(chartData.length - 1).toFixed(2);
    fillD = `${pathD} L ${lastX},${bottomY} L 0,${bottomY} Z`;
  }

  // Determine real-time direction from last price delta
  const lastDelta =
    chartData.length > 1
      ? chartData[chartData.length - 1].price -
        chartData[chartData.length - 2].price
      : 0;
  const upColor = "#22c55e"; // emerald-500
  const downColor = "#ef4444"; // red-500
  const strokeColor = lastDelta >= 0 ? upColor : downColor;
  const fillStart = strokeColor; // start color for gradient
  const gridLines = 4;

  // Build OHLC candles from chartData (approx 60 candles)
  const buildOhlc = (points: { timestamp: number; price: number }[]) => {
    if (!points || points.length === 0)
      return [] as {
        time: number;
        open: number;
        high: number;
        low: number;
        close: number;
      }[];
    const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
    const minTs = sorted[0].timestamp;
    const maxTs = sorted[sorted.length - 1].timestamp;
    const totalMs = Math.max(1, maxTs - minTs);
    const target = 60;
    const bucketMs = Math.max(1, Math.floor(totalMs / target));
    const buckets: Record<number, { price: number; timestamp: number }[]> = {};
    for (const p of sorted) {
      const idx = Math.floor((p.timestamp - minTs) / bucketMs);
      const key = minTs + idx * bucketMs;
      (buckets[key] ||= []).push(p);
    }
    const candles: {
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
    }[] = [];
    Object.keys(buckets)
      .map((k) => Number(k))
      .sort((a, b) => a - b)
      .forEach((key) => {
        const pts = buckets[key];
        if (!pts || pts.length === 0) return;
        const open = pts[0].price;
        const close = pts[pts.length - 1].price;
        let high = -Infinity;
        let low = Infinity;
        for (const p of pts) {
          if (p.price > high) high = p.price;
          if (p.price < low) low = p.price;
        }
        candles.push({ time: key, open, high, low, close });
      });
    return candles;
  };

  const ohlc = buildOhlc(chartData);
  const ohlcMin = ohlc.length ? Math.min(...ohlc.map((c) => c.low)) : minPrice;
  const ohlcMax = ohlc.length ? Math.max(...ohlc.map((c) => c.high)) : maxPrice;

  // Candle-specific y mapper with its own padding
  const candlePad = (ohlcMax - ohlcMin) * 0.1 || 1;
  const cyMin = ohlcMin - candlePad;
  const cyMax = ohlcMax + candlePad;
  const yForCandle = (v: number) => {
    if (cyMax === cyMin) return (topY + bottomY) / 2;
    const t = (v - cyMin) / (cyMax - cyMin);
    return bottomY - t * (bottomY - topY);
  };

  const formatTick = (ts: number, position: "start" | "middle" | "end") => {
    const d = new Date(ts);
    if (position === "middle") {
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "2-digit",
      });
    }
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const firstTs =
    chartType === "candle" ? ohlc[0]?.time : chartData[0]?.timestamp;
  const midTs =
    chartType === "candle"
      ? ohlc[Math.floor(ohlc.length / 2)]?.time
      : chartData[Math.floor(chartData.length / 2)]?.timestamp;
  const lastTs =
    chartType === "candle"
      ? ohlc[ohlc.length - 1]?.time
      : chartData[chartData.length - 1]?.timestamp;

  // Coin Stats: compute displayed volume for current timeframe from dailyVolume as an approximation
  const volumeFactor =
    chartTimeframe === "5m"
      ? 1 / (24 * 12)
      : chartTimeframe === "1h"
      ? 1 / 24
      : chartTimeframe === "24h"
      ? 1
      : chartTimeframe === "7d"
      ? 7
      : chartTimeframe === "30d"
      ? 30
      : 60; // All ~ 60d
  const displayedVolume = Number(tokenData.dailyVolume || 0) * volumeFactor;

  // Local compact formatter for number inputs (to avoid bigint type issues)
  const formatCompactNumber = (v: number) =>
    new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(isFinite(v) ? v : 0);

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <main className="px-44 py-6 mt-5">
        {/* Back button */}
        <Link
          href="/explore"
          className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Explore
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Token Info + Chart */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border-gray-200 bg-[#303030]">
              <CardContent className="p-5 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage
                          src={
                            tokenData?.logoUrl ||
                            "https://purple-voluntary-minnow-145.mypinata.cloud/ipfs/bafkreiadbzvwwngz3kvk5ut75gdzlbpklxokyacpysotogltergnkhx7um"
                          }
                          alt={tokenData?.name}
                          className="h-6 w-6 rounded-full"
                        />
                        <AvatarFallback>
                          {tokenData?.symbol?.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-lg leading-none font-semibold text-white">
                        {tokenData?.name} (${tokenData?.symbol})
                      </span>
                    </div>
                    <span className="text-sm leading-none font-medium text-[#FFFFFF80]">
                      {isChangeUp ? "is up" : "is down"}{" "}
                      <span
                        className={`${
                          isChangeUp ? "text-emerald-400" : "text-red-400"
                        } font-semibold`}
                      >
                        {changeAbsStr}%
                      </span>{" "}
                      in 24hrs
                    </span>
                  </div>
                  <div className="flex gap-2" />
                </div>
                <div className="h-64 bg-[#303030] rounded-[22px] relative p-5">
                  {/* Inset panel */}
                  <div className="h-full w-full rounded-[22px] bg-[#FFFFFF0D] border border-black/10 shadow-inner p-5 relative">
                    {chartLoading && (
                      <div className="absolute inset-0 flex items-center justify-center z-10">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-white/30 border-t-white" />
                      </div>
                    )}
                    {/* Dynamic chart from chartData */}
                    {chartType === "line" ? (
                      <svg
                        className="absolute inset-0 m-5"
                        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                        preserveAspectRatio="none"
                      >
                        <defs>
                          <linearGradient
                            id="chartFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor={fillStart}
                              stopOpacity="0.35"
                            />
                            <stop
                              offset="100%"
                              stopColor={fillStart}
                              stopOpacity="0"
                            />
                          </linearGradient>
                        </defs>
                        {/* Gridlines */}
                        {Array.from({ length: gridLines + 1 }).map((_, i) => (
                          <line
                            key={i}
                            x1={0}
                            x2={svgWidth}
                            y1={topY + ((bottomY - topY) * i) / gridLines}
                            y2={topY + ((bottomY - topY) * i) / gridLines}
                            stroke="#ffffff22"
                            strokeWidth={1}
                          />
                        ))}
                        {chartData.length > 1 ? (
                          <>
                            <path d={fillD} fill="url(#chartFill)" />
                            <path
                              d={pathD}
                              stroke={strokeColor}
                              strokeWidth="3"
                              fill="none"
                              strokeLinecap="round"
                            />
                          </>
                        ) : null}
                      </svg>
                    ) : (
                      // Native Candlesticks (OHLC)
                      <svg
                        className="absolute inset-0 m-5"
                        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                        preserveAspectRatio="none"
                      >
                        {/* Gridlines */}
                        {Array.from({ length: gridLines + 1 }).map((_, i) => (
                          <line
                            key={i}
                            x1={0}
                            x2={svgWidth}
                            y1={topY + ((bottomY - topY) * i) / gridLines}
                            y2={topY + ((bottomY - topY) * i) / gridLines}
                            stroke="#ffffff22"
                            strokeWidth={1}
                          />
                        ))}
                        {ohlc.map((c, i) => {
                          const n = Math.max(1, ohlc.length);
                          const bandwidth = svgWidth / n;
                          const centerX = (i + 0.5) * bandwidth;
                          const candleW = Math.max(5, bandwidth * 0.6);
                          const yHigh = yForCandle(c.high);
                          const yLow = yForCandle(c.low);
                          const yOpen = yForCandle(c.open);
                          const yClose = yForCandle(c.close);
                          const isUp = c.close >= c.open;
                          const bodyY = Math.min(yOpen, yClose);
                          const bodyH = Math.max(2, Math.abs(yClose - yOpen));
                          const color = isUp ? upColor : downColor;
                          return (
                            <g key={i}>
                              {/* Wick */}
                              <line
                                x1={centerX.toFixed(2)}
                                x2={centerX.toFixed(2)}
                                y1={yHigh.toFixed(2)}
                                y2={yLow.toFixed(2)}
                                stroke={color}
                                strokeWidth={2}
                              />
                              {/* Body */}
                              <rect
                                x={(centerX - candleW / 2).toFixed(2)}
                                y={bodyY.toFixed(2)}
                                width={candleW.toFixed(2)}
                                height={bodyH.toFixed(2)}
                                fill={color}
                                rx={2}
                              />
                            </g>
                          );
                        })}
                      </svg>
                    )}
                    {/* Axis labels (mock) */}
                    <div className="absolute bottom-4 left-5 right-5 flex justify-between text-xs text-white/40">
                      <span>{firstTs ? formatTick(firstTs, "start") : ""}</span>
                      <span>{midTs ? formatTick(midTs, "middle") : ""}</span>
                      <span>{lastTs ? formatTick(lastTs, "end") : ""}</span>
                    </div>
                    {/* Y-axis min/max */}
                    <div className="absolute top-6 left-6 text-[10px] text-white/50">
                      {prices.length ? minPrice.toFixed(6) : ""}
                    </div>
                    <div className="absolute top-6 right-6 text-[10px] text-white/50">
                      {prices.length ? maxPrice.toFixed(6) : ""}
                    </div>
                  </div>
                </div>
                {/* Timeframe chips at the card bottom (outside inner panel) */}
                <div className="mt-4 px-5 w-full flex items-center justify-between gap-3">
                  <div className="flex items-center justify-center gap-2">
                    {(["5m", "1h", "24h", "7d", "30d", "All"] as const).map(
                      (timeframe) => (
                        <button
                          key={timeframe}
                          onClick={() => {
                            setChartTimeframe(
                              timeframe as typeof chartTimeframe
                            );
                            if (tokenData) fetchChartData(31);
                          }}
                          className={`${
                            chartTimeframe === timeframe
                              ? "bg-[#4B4B4B] text-white shadow-sm"
                              : "text-gray-400 hover:text-white hover:bg-[#3A3A3A]"
                          } px-2.5 py-1 rounded-md text-xs font-medium transition-colors`}
                        >
                          {timeframe}
                        </button>
                      )
                    )}
                  </div>

                  {/* Chart type toggle */}
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-white/60 font-medium">
                      {tokenData?.name || "Token"} / ETH •{" "}
                      <span className="text-emerald-400">$0G</span>
                    </div>
                    <div className="flex bg-[#1F1F1F] rounded-full p-1 text-xs">
                      <button
                        onClick={() => setChartType("line")}
                        className={`px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 ${
                          chartType === "line"
                            ? "bg-white text-black"
                            : "text-white/70 hover:text-white"
                        }`}
                      >
                        <LineChart size={12} />
                        Line
                      </button>
                      <button
                        onClick={() => setChartType("candle")}
                        className={`px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 ${
                          chartType === "candle"
                            ? "bg-white text-black"
                            : "text-white/70 hover:text-white"
                        }`}
                      >
                        <CandlestickChart size={12} />
                        Candle
                      </button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Similar Tokens panel */}
            <SimilarTokens
              currentTokenAddress={tokenAddress}
              chainId={chain?.id}
            />

            {/* Token header */}
            {/* <Card className="border-gray-200">
              <CardContent className="p-5 md:p-6 flex gap-4 items-center">
                <div className="h-12 w-12 rounded-xl bg-gray-100 border border-[#0000001A] overflow-hidden">
                  <Avatar className="h-full w-full rounded-xl">
                    <AvatarImage
                      src={
                        tokenData.logoUrl ||
                        "https://ipfs.io/ipfs/bafkreiadbzvwwngz3kvk5ut75gdzlbpklxokyacpysotogltergnkhx7um"
                      }
                      alt={tokenData.name}
                    />
                    <AvatarFallback>
                      {tokenData.symbol.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-gray-900 truncate">
                    {tokenData.name}
                  </h1>
                  <div className="mt-2 flex items-center gap-3 flex-wrap text-sm">
                    <span className="font-bold text-gray-900">
                      {tokenData.symbol}
                    </span>
                    {tokenData.isLive && (
                      <Badge
                        variant="destructive"
                        className="bg-green-500 text-white"
                      >
                        LIVE
                      </Badge>
                    )}
                    <span className="px-2 py-0.5 rounded-full border border-[#0000001A] text-gray-800 bg-white">
                      {tokenData.age}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EFEFEF] text-gray-800 border cursor-pointer"
                      style={{ borderColor: "#0000001A" }}
                    >
                      <Copy className="w-3 h-3" />
                      {copied
                        ? "Copied!"
                        : `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(
                            -4
                          )}`}
                    </button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          disabled
                          onClick={(e) => e.preventDefault()}
                          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black text-white opacity-60 cursor-not-allowed"
                          aria-disabled
                        >
                          Go Live
                        </button>
                      </TooltipTrigger>
                      <TooltipContent sideOffset={6}>Coming soon</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </CardContent>
            </Card> */}

            {/* Video player (shown after permissions) */}
            {permissionsGranted ? (
              <>
                <StreamPlayer
                  camEnabled={glCam}
                  micEnabled={glMic}
                  onToggleCam={() => setGlCam((v) => !v)}
                  onToggleMic={() => setGlMic((v) => !v)}
                  onEndStream={() => {
                    // End should only stop camera/mic and keep the page; no preview popup
                    setPermissionsGranted(false);
                    setShowChat(false);
                    // Turn off local states so StreamPlayer won't try to re-acquire
                    setGlCam(false);
                    setGlMic(false);
                    setGlRec(false);
                    // Clear identifiers so no further publish/record attempts
                    setRoomId("");
                    setHuddleToken("");
                  }}
                  recEnabled={glRec}
                  onToggleRec={() => setGlRec((v) => !v)}
                  mirrorEnabled={glMirror}
                  onToggleMirror={() => setGlMirror((v) => !v)}
                  roomId={roomId}
                  token={huddleToken}
                />
              </>
            ) : (
              <></>
            )}

            {/* Price and stats */}
            {/* <Card className="border-gray-200">
              <CardContent className="p-5 md:p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">
                      Current Price
                    </p>
                    <p className="text-xl font-bold text-gray-900">
                      {formatEther(tokenData.currentPrice)} ETH
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">
                      Market Cap
                    </p>
                    <p className="text-xl font-bold text-gray-900">
                      {tokenDataService.formatMarketCap(tokenData.marketCap)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">
                      24h Volume
                    </p>
                    <p className="text-xl font-bold text-gray-900">
                      {tokenDataService.formatVolume(tokenData.dailyVolume)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">
                      Holders
                    </p>
                    <p className="text-xl font-bold text-gray-900">
                      {tokenData.holderCount.toString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card> */}

            {/* Price Chart */}
          </div>

          {/* Right: Sidebar - Same order as Livestream: Boss Battle -> Trade -> Live Chat */}
          <div className="space-y-4">
            {/* <Card className="border-gray-200 mt-0">
              <CardHeader className="">
                <CardTitle className="flex items-center justify-between text-base">
                  <div className="flex items-center gap-2">
                    <span>
                      <img
                        src="/icons/trophy.svg"
                        alt="trophy"
                        width={24}
                        height={24}
                      />
                    </span>
                    <span className="text-[18px] font-semibold">
                      Boss Battle
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="relative inline-flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 drop-shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
                      </span>
                      <span className="text-red-600 font-semibold drop-shadow-[0_0_4px_rgba(239,68,68,0.6)]">
                        Live
                      </span>
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full cursor-pointer"
                    onClick={() => setBossOpen((v) => !v)}
                    aria-expanded={bossOpen}
                    aria-label="Toggle Boss Battle"
                  >
                    <svg
                      className={`h-5 w-5 transition-transform duration-200 ${
                        bossOpen ? "-rotate-180" : "rotate-0"
                      }`}
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M6 9l6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Button>
                </CardTitle>
              </CardHeader>
              <hr className="mx-6 -mt-4 border-[#0000001A]" />
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
                  <div className="flex items-center gap-2 border rounded-lg px-3 py-2">
                    <span>
                      <img
                        src="/icons/coins-stacked.svg"
                        alt="coins-stacked"
                        width={24}
                        height={24}
                      />
                    </span>
                    <div className="leading-tight">
                      <p className="font-semibold">Pool 48.8 ETH</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 border rounded-lg px-3 py-2">
                    <span>
                      <img
                        src="/icons/clock.svg"
                        alt="clock"
                        width={24}
                        height={24}
                      />
                    </span>
                    <div className="leading-tight">
                      <p className="font-semibold">Round 1/3</p>
                      <p className="text-xs text-gray-500">02:37</p>
                    </div>
                  </div>
                  <div className="col-span-1 flex items-center gap-2 border rounded-lg px-3 py-2">
                    <span>
                      <img
                        src="/icons/people.svg"
                        alt="eye"
                        width={24}
                        height={24}
                      />
                    </span>
                    <p className="font-semibold">12,837 live</p>
                  </div>
                </div>

                <div
                  className={`transition-all duration-500 ease-in-out overflow-hidden ${
                    bossOpen
                      ? "max-h-[2000px] opacity-100"
                      : "max-h-0 opacity-0"
                  }`}
                >
                  <div className="space-y-4">
                    <div>
                      {selectedToken ? (
                        <p className="text-sm text-gray-600 mb-2">
                          you have selected{" "}
                          <span className="font-semibold">{selectedToken}</span>
                        </p>
                      ) : (
                        <p className="text-sm text-gray-600 mb-2">
                          Select your chosen token
                        </p>
                      )}

                      <div className="flex gap-3">
                        <TokenStat
                          name="WHALE"
                          percent="61%"
                          votes="1,284"
                          eth="7.1"
                          selected={selectedToken === "WHALE"}
                          onClick={() => setSelectedToken("WHALE")}
                        />
                        <TokenStat
                          name="ARROW"
                          percent="39%"
                          votes="796"
                          eth="5.3"
                          selected={selectedToken === "ARROW"}
                          onClick={() => setSelectedToken("ARROW")}
                        />
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      <Input
                        type="number"
                        placeholder="Amount (ETH)"
                        className="h-11 bg-[#E5E5E566]"
                      />
                      <Button className="w-full h-11 rounded-xl font-semibold cursor-pointer">
                        {`Stake & Vote ${selectedToken}`}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card> */}

            {/* Trade card with real functionality (mock-accurate) */}
            <Card className="mt-2 rounded-2xl bg-[#2B2B2B] text-white border-none shadow-lg">
              <CardContent className="px-4 pt-2 pb-4 space-y-2.5">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-sm">
                    <button
                      onClick={() => {
                        setTradeMode("Buy");
                        setAmount((prev) => (prev ? prev : "0.1"));
                      }}
                      className={`${
                        tradeMode === "Buy" ? "text-white" : "text-white/60"
                      } font-semibold`}
                    >
                      Buy
                    </button>
                    <button
                      onClick={() => setTradeMode("Sell")}
                      className={`${
                        tradeMode === "Sell" ? "text-white" : "text-white/60"
                      } font-semibold`}
                    >
                      Sell
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-white/90 bg-[#3A3A3A] rounded-full px-3 py-1">
                    <Avatar className="h-6 w-6">
                      <AvatarImage
                        src={
                          tokenData?.logoUrl ||
                          "https://purple-voluntary-minnow-145.mypinata.cloud/ipfs/bafkreiadbzvwwngz3kvk5ut75gdzlbpklxokyacpysotogltergnkhx7um"
                        }
                        alt={tokenData?.name}
                      />
                      <AvatarFallback>
                        {tokenData?.symbol?.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    ${tokenData?.symbol}
                    <span className="opacity-70">▾</span>
                  </div>
                </div>

                {/* Inset panel */}
                <div className="rounded-2xl bg-[#1F1F1F] p-3.5">
                  <div className="flex items-center justify-between">
                    {/* Big amount on left */}
                    <input
                      type="number"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^\d*\.?\d*$/.test(v)) setAmount(v);
                      }}
                      placeholder="0.0"
                      className="bg-transparent outline-none text-3xl font-semibold w-[55%] placeholder:text-white/40"
                    />
                    {/* Currency selector on right */}
                    <div className="flex items-center gap-2 bg-[#2B2B2B] rounded-full px-3.5 py-1.5 text-sm">
                      <img
                        src={
                          tradeMode === "Buy"
                            ? "/tokens/0G.png"
                            : tokenData?.logoUrl ||
                              "https://purple-voluntary-minnow-145.mypinata.cloud/ipfs/bafkreiadbzvwwngz3kvk5ut75gdzlbpklxokyacpysotogltergnkhx7um"
                        }
                        alt="arrow-down"
                        className={`rounded-full ${
                          tradeMode === "Buy" ? "h-6 w-full" : "h-4 w-4"
                        }`}
                        width={16}
                        height={16}
                      />
                      <span className="font-semibold">
                        {tradeMode === "Buy"
                          ? "0G"
                          : tokenData?.symbol || "TOKEN"}
                      </span>
                      <span className="opacity-70">▾</span>
                    </div>
                  </div>

                  {/* Chips + available */}
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-4 text-white/60">
                      {["10%", "25%", "50%", "Max"].map((label) => (
                        <button
                          key={label}
                          onClick={() => {
                            if (label === "Max") {
                              const maxAmount =
                                tradeMode === "Buy"
                                  ? (parseFloat(userBalance) * 0.95).toString()
                                  : formatEther(userTokenBalanceRaw);
                              setAmount(maxAmount);
                            } else {
                              const pct = parseInt(label) / 100;
                              const base =
                                tradeMode === "Buy"
                                  ? parseFloat(userBalance)
                                  : Number(formatEther(userTokenBalanceRaw));
                              setAmount((base * pct).toString());
                            }
                          }}
                          className="hover:text-white"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="text-white/60">
                      Available{" "}
                      <span className="text-white/90 font-medium">
                        {tradeMode === "Buy"
                          ? `${parseFloat(userBalance || "0").toFixed(4)} 0G`
                          : `${formatNumber(
                              parseFloat(formatEther(userTokenBalanceRaw))
                            )} ${tokenData?.symbol}`}
                      </span>
                    </div>
                  </div>

                  {/* Amount calculation display */}
                  {amount && parsedAmount > 0 && (
                    <div className="mt-3 p-3 bg-[#161616] rounded-xl border border-white/10">
                      {tradeMode === "Buy" && buyQuote && (
                        <div className="text-sm space-y-1">
                          <div className="flex justify-between text-white/60">
                            <span>You&apos;re spending:</span>
                            <span className="text-white font-medium">
                              {amount} 0G
                            </span>
                          </div>
                          <div className="flex justify-between text-white/60">
                            <span>You&apos;ll receive:</span>
                            <span className="text-white font-medium">
                              {buyQuote.tokensReceived
                                ? formatNumber(
                                    Number(formatEther(buyQuote.tokensReceived))
                                  )
                                : "Calculating..."}{" "}
                              {tokenData?.symbol}
                            </span>
                          </div>
                          <div className="flex justify-between text-white/60">
                            <span>Price Impact:</span>
                            <span
                              className={`font-medium ${
                                buyQuote.priceImpact > 5
                                  ? "text-red-400"
                                  : "text-green-400"
                              }`}
                            >
                              {buyQuote.priceImpact.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      )}
                      {tradeMode === "Sell" && sellQuote && (
                        <div className="text-sm space-y-1">
                          <div className="flex justify-between text-white/60">
                            <span>You&apos;re selling:</span>
                            <span className="text-white font-medium">
                              {amount} {tokenData?.symbol}
                            </span>
                          </div>
                          <div className="flex justify-between text-white/60">
                            <span>You&apos;ll receive:</span>
                            <span className="text-white font-medium">
                              {formatCurrency(
                                Number(formatEther(sellQuote.proceeds)),
                                { currency: "0G" }
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between text-white/60">
                            <span>Price Impact:</span>
                            <span
                              className={`font-medium ${
                                sellQuote.priceImpact > 5
                                  ? "text-red-400"
                                  : "text-green-400"
                              }`}
                            >
                              -{sellQuote.priceImpact.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Primary CTA */}
                  <div className="mt-4">
                    <Button
                      onClick={executeTrade}
                      disabled={
                        !amount ||
                        parsedAmount <= 0 ||
                        tradingLoading ||
                        !isConnected
                      }
                      className={`w-full h-11 rounded-full text-sm font-semibold ${
                        !amount ||
                        parsedAmount <= 0 ||
                        tradingLoading ||
                        !isConnected
                          ? "bg-white/40 text-black/50 cursor-not-allowed"
                          : "bg-white text-black hover:bg-white/90"
                      }`}
                    >
                      {tradingLoading
                        ? "Processing..."
                        : `${tradeMode} $${tokenData?.symbol || "TOKEN"}`}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Live Chat (always visible) */}
            {/* <Card className="border-gray-200 mt-6">
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold">
                    Live Chat
                  </CardTitle>
                  <div className="text-sm text-gray-400">
                    New message will appear here
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <hr className="border-[#0000001A]" />
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <div className="max-w-[70%] bg-[#EAD6FF] text-gray-900 px-4 py-3 rounded-2xl shadow-sm">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">Hey chat</span>
                        <span className="text-xs text-gray-500">23:07</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback>A</AvatarFallback>
                    </Avatar>
                    <div
                      className="max-w-[80%] border rounded-2xl px-4 py-3 shadow-sm"
                      style={{ borderColor: "#0000001A" }}
                    >
                      <div className="text-sm text-emerald-600 font-semibold">
                        aamx8e
                      </div>
                      <div className="mt-1 text-[15px] text-gray-900 flex items-end gap-3">
                        <span>buying your token</span>
                        <span className="text-xs text-gray-500">23:59</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <Input
                    placeholder="Write a message.."
                    className="h-12 rounded-xl bg-[#F2F2F2] placeholder:text-gray-400"
                  />
                  <img
                    src="/icons/send-button.svg"
                    alt="send-button"
                    width={34}
                    height={34}
                    className="cursor-pointer"
                  />
                </div>
              </CardContent>
            </Card> */}

            {/* Token Info (mock-accurate) */}
            <Card className="rounded-2xl bg-[#2B2B2B] text-white border-none shadow-lg">
              <CardContent className="p-4 space-y-4">
                {/* Big token image */}
                <div className="rounded-2xl overflow-hidden bg-black">
                  <img
                    src={tokenData?.logoUrl || "/placeholder.png"}
                    alt={tokenData?.name}
                    className="w-full h-72"
                  />
                </div>

                <div className="space-y-3">
                  <h3 className="text-xl font-semibold">
                    ${tokenData?.symbol}
                  </h3>
                  {/* CA row */}
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <span className="px-2 py-0.5 font-medium">Address</span>
                    <span className="opacity-60">•</span>
                    <Avatar className="h-5 w-5">
                      <AvatarImage
                        src={`https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(
                          tokenData?.creator || tokenAddress || "0x"
                        )}`}
                        alt={tokenData?.creator || tokenAddress || "owner"}
                      />
                      <AvatarFallback>
                        {tokenData?.symbol?.slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium opacity-80">
                      {tokenAddress?.slice(0, 4)}...{tokenAddress?.slice(-4)}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(tokenAddress || "");
                        toast.success("Address copied to clipboard");
                      }}
                      className="p-1 rounded-full cursor-pointer bg-white/10 hover:bg-white/15"
                      title="Copy address"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() =>
                        window.open(
                          `https://chainscan-galileo.0g.ai/address/${tokenAddress}`,
                          "_blank"
                        )
                      }
                      className="p-1 rounded-full cursor-pointer bg-white/10 hover:bg-white/15"
                      title="View on explorer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* Description */}
                  <p className="text-sm text-white/70 leading-6 whitespace-pre-wrap">
                    {tokenData?.description ||
                      `${
                        tokenData?.name || "This token"
                      } is available for trading on the 0G Network. ${
                        tokenData?.symbol ? `$${tokenData.symbol}` : "It"
                      } can be bought and sold directly on this platform.`}
                  </p>
                </div>

                {/* Social row */}
                <div className="flex items-center gap-3 pt-1">
                  {tokenData?.website && (
                    <Link
                      href={tokenData?.website || ""}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/15 grid place-items-center text-white/80"
                      title="Website"
                    >
                      <FaGlobe size={18} />
                    </Link>
                  )}
                  {tokenData?.twitter && (
                    <Link
                      href={`https://www.x.com/${tokenData?.twitter || ""}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/15 grid place-items-center text-white/80"
                      title="X (Twitter)"
                    >
                      <FaXTwitter size={18} />
                    </Link>
                  )}
                  {tokenData?.telegram && (
                    <Link
                      href={`https://t.me/${tokenData?.telegram || ""}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/15 grid place-items-center text-white/80"
                      title="Telegram"
                    >
                      <FaTelegramPlane size={18} />
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="mt-0 rounded-2xl bg-[#2B2B2B] text-white border-none shadow-lg">
              <CardContent className="px-3.5 pt-0 pb-0">
                <div className="flex items-center justify-between mb-1.5 relative">
                  <div className="flex items-center gap-1.5 text-white/80">
                    <FaGlobe className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">Coin Stats</span>
                  </div>
                  <div className="relative">
                    <button
                      className="px-2.5 py-0.5 rounded-full bg-black/20 text-xs text-white/80"
                      onClick={() => setShowStatsTf((s) => !s)}
                    >
                      {chartTimeframe} ▾
                    </button>
                    {showStatsTf && (
                      <div className="absolute right-0 bottom-full mb-1 w-24 bg-[#2B2B2B] border border-white/10 rounded-xl shadow-lg z-10 overflow-hidden">
                        {["5m", "1h", "24h", "7d", "30d", "All"].map((tf) => (
                          <button
                            key={tf}
                            className={`w-full text-left px-3 py-1.5 text-xs ${
                              chartTimeframe === tf
                                ? "bg-white/10 text-white"
                                : "text-white/80 hover:bg-white/5"
                            }`}
                            onClick={() => {
                              setChartTimeframe(tf as typeof chartTimeframe);
                              setShowStatsTf(false);
                              if (tokenData) fetchChartData(31);
                            }}
                          >
                            {tf}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-6 text-sm">
                  {/* 24h Volume */}
                  <div className="flex items-center gap-1.5">
                    <img
                      src="/icons/arrow-trending-up.svg"
                      alt="Volume"
                      width={16}
                      height={16}
                      className="opacity-70"
                    />
                    <div className="text-base font-semibold">
                      {formatCompactNumber(displayedVolume)}
                    </div>
                    <span className="text-emerald-500 text-[10px]">▲</span>
                  </div>

                  {/* Market cap */}
                  <div className="flex items-center gap-1.5 text-white/80">
                    <img
                      src="/icons/fire.svg"
                      alt="Market cap"
                      width={16}
                      height={16}
                      className="opacity-70"
                    />
                    <div className="text-base font-medium">
                      {tokenData.marketCap
                        ? tokenDataService.formatVolume(tokenData.marketCap)
                        : (() => {
                            const supplyNum = Number(
                              formatEther(tokenData.totalSupply)
                            );
                            const priceNum =
                              typeof tokenData.currentPrice === "bigint"
                                ? Number(formatEther(tokenData.currentPrice))
                                : Number(tokenData.currentPrice || 0);
                            return formatCompactNumber(supplyNum * priceNum);
                          })()}
                    </div>
                  </div>

                  {/* Holders */}
                  <div className="flex items-center gap-1.5 text-white/80">
                    <img
                      src="/icons/user-group.svg"
                      alt="Holders"
                      width={16}
                      height={16}
                      className="opacity-70"
                    />
                    <div className="text-base font-medium">
                      {formatNumber(Number(tokenData.holderCount))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Setup Modal (title/description) */}
      <Dialog open={showSetup} onOpenChange={setShowSetup}>
        <DialogContent className="sm:max-w-md rounded-2xl bg-white text-gray-900 border border-[#0000001A] shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-[20px] font-semibold">
              Go live setup
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Add your stream name and description
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Token name"
              value={glTitle}
              onChange={(e) => setGlTitle(e.target.value)}
            />
            <Input
              placeholder="Description"
              value={glDesc}
              onChange={(e) => setGlDesc(e.target.value)}
            />
          </div>
          <DialogFooter className="pt-2">
            <button
              className="h-10 px-4 rounded-xl bg-black text-white font-medium hover:bg-black/90"
              onClick={() => {
                setShowSetup(false);
                setShowTerms(true);
              }}
            >
              Continue
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Terms and Conditions Modal */}
      <Dialog open={showTerms && !acceptedTerms} onOpenChange={setShowTerms}>
        <DialogContent className="sm:max-w-lg rounded-2xl bg-white text-gray-900 border border-[#0000001A] shadow-xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-[20px] font-semibold">
              Terms and conditions
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Whale.fun Livestream Moderation Policy
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-auto space-y-5 text-[13px] leading-6 pr-1">
            <div>
              <p className="font-semibold text-gray-900">Purpose</p>
              <p className="text-gray-600">
                To cultivate a social environment on Whale.fun that preserves
                creativity and freedom of expression and encourages meaningful
                engagement amongst users, free of illegal, harmful, and negative
                interactions.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Restriction on Underage Use
              </p>
              <p className="text-gray-600">
                Livestreaming is restricted to users above the age of 18.
                Whale.fun takes this user restriction seriously.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Prohibited Content</p>
              <ul className="list-disc pl-5 space-y-1.5 text-gray-600">
                <li>Violence and threats</li>
                <li>Harassment and bullying</li>
                <li>Sexual content and nudity</li>
                <li>Youth endangerment</li>
                <li>Illegal activities</li>
                <li>Privacy violations</li>
                <li>Copyright violations</li>
                <li>Terrorism or violent extremism</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Creator Responsibilities
              </p>
              <p className="text-gray-600">
                Follow the moderation policy and review moderation guidelines
                before streaming sensitive topics.
              </p>
              <p className="text-gray-600">
                Contact legal@Whale.fun.com for appeals.
              </p>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <button
              className="h-10 px-4 rounded-xl bg-black text-white font-medium hover:bg-black/90"
              onClick={() => {
                setAcceptedTerms(true);
                setShowTerms(false);
                setShowPreview(true);
              }}
            >
              I agree
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stream Preview Modal */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>Stream preview</DialogTitle>
            <DialogDescription>
              Choose your video/audio preferences
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-xs opacity-70">
                Whale.fun broadcast mode
              </label>
              <select className="w-full rounded border px-3 py-2">
                <option value="webcam">Webcam</option>
              </select>
            </div>
            <div>
              <label className="block text-xs opacity-70">
                Video/audio inputs
              </label>
              <div className="grid grid-cols-1 gap-2">
                <select className="w-full rounded border px-3 py-2">
                  <option>Default Camera</option>
                </select>
                <select className="w-full rounded border px-3 py-2">
                  <option>Default Microphone</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs opacity-70">
                Stream title (optional)
              </label>
              <Input
                placeholder="Enter a descriptive title..."
                value={glDesc}
                onChange={(e) => setGlDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowPreview(false);
                setShowChat(true);
              }}
            >
              Next
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Chat Options Modal */}
      <Dialog open={showChat} onOpenChange={setShowChat}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>Chat options</DialogTitle>
            <DialogDescription>
              Configure your chat before going live
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <label
              className="flex items-center justify-between rounded-xl border px-3 py-2"
              style={{ borderColor: "#0000001A" }}
            >
              <div>
                <div className="font-medium">Token-gated chat</div>
                <div className="text-xs text-gray-500">
                  Only token holders can chat
                </div>
              </div>
              <button
                type="button"
                onClick={() => setChatAllowed((v) => !v)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  chatAllowed
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                {chatAllowed ? "On" : "Off"}
              </button>
            </label>
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                try {
                  if (glCam || glMic) {
                    const perm = await navigator.mediaDevices.getUserMedia({
                      video: glCam,
                      audio: glMic,
                    });
                    // Immediately stop permission stream to avoid dangling devices
                    try {
                      perm.getTracks().forEach((t) => t.stop());
                    } catch {}
                  }
                  setPermissionsGranted(true);
                  setShowChat(false);
                  // Create Huddle room and token so StreamPlayer can join/publish inline
                  const res = await fetch("/api/huddle01/room", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      title: glTitle,
                      description: glDesc,
                    }),
                  });
                  const roomData = await res.json();
                  if (!res.ok || roomData?.error || !roomData?.roomId)
                    throw new Error(roomData?.error || "Failed to create room");
                  const newRoomId = roomData.roomId as string;
                  setRoomId(newRoomId);
                  const tres = await fetch("/api/huddle01/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      roomId: newRoomId,
                      userId: glUser || undefined,
                    }),
                  });
                  const tdata = await tres.json();
                  if (!tres.ok || tdata?.error || !tdata?.token)
                    throw new Error(tdata?.error || "Failed to generate token");
                  setHuddleToken(tdata.token as string);
                } catch (e: any) {
                  alert(
                    e?.message ||
                      "Permission or setup failed. Please try again."
                  );
                }
              }}
            >
              Go live
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TradePage;
