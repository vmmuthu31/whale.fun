"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useBalance, useWalletClient } from "wagmi";
import { parseEther, formatEther } from "ethers";
import {
  getBlockchainConnection,
  switchNetwork,
  getExplorerUrl,
} from "@/utils/Blockchain";
import CreatorTokenABI from "@/config/abi/CreatorToken.json";
import Image from "next/image";
import { toast } from "sonner";

interface TokenCardProps {
  token: {
    id: string;
    name: string;
    symbol: string;
    image: string;
    priceChange: string;
    priceValue: string;
    currentPrice: string;
    marketCap: string;
    volume: string;
    age: string;
    isLive?: boolean;
    isExternal?: boolean;
    chainId?: number;
  };
  index?: number;
}

const TokenCard = ({ token, index }: TokenCardProps) => {
  const router = useRouter();
  const { address: userAddress, isConnected, chain } = useAccount();
  const { data: balance } = useBalance({
    address: userAddress,
    chainId: 16661, // 0G Mainnet
  });
  const { data: walletClient } = useWalletClient();
  const [isQuickBuying, setIsQuickBuying] = useState(false);
  const [quickBuyError, setQuickBuyError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Avoid hydration flicker: consider connected only after mount and when address exists
  useEffect(() => {
    setMounted(true);
  }, []);
  const isReady = mounted && !!userAddress; // treat as connected when address is present

  const handleCardClick = () => {
    // Special case for X402 token
    if (token.symbol === 'X402' || token.name === 'X402 Token') {
      router.push('/x402');
      return;
    }
    
    if (token.isExternal) {
      router.push(`/token/external/${token.id}`);
    } else {
      router.push(`/token/${token.id}`);
    }
  };

  const handleQuickBuy = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!isConnected || !userAddress) {
      setQuickBuyError("Please connect your wallet");
      return;
    }

    if (token.isExternal) {
      setQuickBuyError("Quick buy not available for external tokens");
      return;
    }

    // Check if we're on the right chain
    if (!chain || chain.id !== 16661) {
      // Try to switch to 0G Mainnet automatically
      try {
        await switchNetwork(16602);
        // Wait a bit for the chain switch to complete
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (switchError: any) {
        // If the chain doesn't exist, try to add it
        if (switchError.code === 4902) {
          try {
            await (window as any).ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: "0x411D", // 16661 in hex
                  chainName: "0G Mainnet",
                  nativeCurrency: {
                    name: "0G",
                    symbol: "0G",
                    decimals: 18,
                  },
                  rpcUrls: ["https://evmrpc.0g.ai"],
                  blockExplorerUrls: ["https://chainscan.0g.ai"],
                },
              ],
            });
            // Wait a bit for the chain addition to complete
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Verify the addition and switch was successful
            const currentChainId = await (window as any).ethereum.request({
              method: "eth_chainId",
            });
            const chainIdDecimal = parseInt(currentChainId, 16);

            if (chainIdDecimal !== 16661) {
              setQuickBuyError(
                "Please manually switch to 0G Mainnet in your wallet"
              );
              return;
            }
          } catch (addError) {
            console.error("Failed to add 0G Mainnet:", addError);
            setQuickBuyError("Please manually add 0G Mainnet to your wallet");
            return;
          }
        } else if (switchError.code === 4001) {
          // User rejected the request
          setQuickBuyError("Network switch cancelled by user");
          return;
        } else {
          console.error("Failed to switch to 0G Mainnet:", switchError);
          setQuickBuyError("Please switch to 0G Mainnet in your wallet");
          return;
        }
      }
    }

    // Check user's balance
    const requiredAmount = parseEther("0.01");
    if (!balance || balance.value < requiredAmount) {
      const balanceETH = balance ? formatEther(balance.value) : "0";
      const errorMsg = `Insufficient balance. Need 0.01 ETH, have ${balanceETH} ETH`;
      toast.error("Insufficient balance", {
        description: errorMsg,
      });
      setQuickBuyError(errorMsg);
      return;
    }

    setIsQuickBuying(true);
    setQuickBuyError(null);

    try {
      const { createPublicClient, http } = await import("viem");

      // Check if wallet client is available
      if (!walletClient) {
        throw new Error("Wallet client not available");
      }

      // Define 0G Mainnet chain
      const zeroGMainnet = {
        id: 16661,
        name: "0G Mainnet",
        network: "0g-mainnet",
        nativeCurrency: { decimals: 18, name: "0G", symbol: "0G" },
        rpcUrls: { default: { http: ["https://evmrpc.0g.ai"] } },
        blockExplorers: {
          default: {
            name: "0G Explorer",
            url: "https://chainscan.0g.ai",
          },
        },
        testnet: false,
      };

      // Create clients
      const publicClient = createPublicClient({
        chain: zeroGMainnet,
        transport: http(),
      });

      // Calculate buy amount for 0.01 ETH
      const ethAmount = parseEther("0.01");

      // Since we don't have calculateTokensForETH, we'll estimate by trying different token amounts
      // Start with current price to get a rough estimate
      let currentPrice: bigint;
      try {
        currentPrice = (await publicClient.readContract({
          address: token.id as `0x${string}`,
          abi: CreatorTokenABI,
          functionName: "getCurrentPrice",
        })) as bigint;
      } catch (error) {
        // Fallback to currentPrice if getCurrentPrice doesn't exist
        console.warn("getCurrentPrice failed, trying currentPrice:", error);
        currentPrice = (await publicClient.readContract({
          address: token.id as `0x${string}`,
          abi: CreatorTokenABI,
          functionName: "currentPrice",
        })) as bigint;
      }

      // Estimate tokens we can buy: ethAmount / currentPrice
      // Use a binary search approach to find the right amount
      const tokenAmount = ethAmount / currentPrice; // Initial estimate

      // Try to get closer to 0.01 ETH by binary search
      let low = tokenAmount / BigInt(2);
      let high = tokenAmount * BigInt(2);
      let bestTokenAmount = tokenAmount;
      let bestCost = ethAmount;

      for (let i = 0; i < 10; i++) {
        // Max 10 iterations
        try {
          const mid = (low + high) / BigInt(2);
          if (mid <= 0) break;

          const cost = (await publicClient.readContract({
            address: token.id as `0x${string}`,
            abi: CreatorTokenABI,
            functionName: "calculateBuyCost",
            args: [mid],
          })) as bigint;

          if (cost <= ethAmount) {
            bestTokenAmount = mid;
            bestCost = cost;
            low = mid;
          } else {
            high = mid;
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
          break;
        }
      }

      if (bestTokenAmount <= 0) {
        throw new Error("Cannot buy tokens with this amount");
      }

      console.log("Quick buy:", {
        tokenAmount: bestTokenAmount.toString(),
        cost: bestCost.toString(),
        costEth: formatEther(bestCost),
      });

      // Execute the buy transaction
      const txHash = await walletClient.writeContract({
        account: userAddress as `0x${string}`,
        address: token.id as `0x${string}`,
        abi: CreatorTokenABI,
        functionName: "buyTokens",
        args: [bestTokenAmount],
        value: bestCost,
      });

      console.log("Quick buy transaction submitted:", txHash);

      // Show immediate success message since transaction was submitted
      toast.success("Transaction submitted", {
        description: `Purchase of ${formatEther(bestTokenAmount)} ${
          token.symbol
        } initiated`,
        duration: 3000,
      });

      // Try to wait for confirmation with proper error handling
      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          timeout: 30000, // Reduced timeout
          retryCount: 3,
          retryDelay: 2000,
        });

        if (receipt.status === "success") {
          console.log("Quick buy confirmed:", receipt);
          toast.success("Quick buy confirmed!", {
            description: `Successfully bought ${formatEther(bestTokenAmount)} ${
              token.symbol
            }`,
            duration: 5000,
          });
        } else {
          toast.error("Transaction failed", {
            description: "The transaction was reverted",
            duration: 5000,
          });
        }
      } catch (receiptError: any) {
        // If we can't get the receipt, the transaction might still succeed
        console.warn("Could not get transaction receipt:", receiptError);
        toast.info("Transaction pending", {
          description:
            "Your transaction is processing. Check your wallet for updates.",
          duration: 5000,
        });
      }
    } catch (error: any) {
      console.error("Quick buy error:", error);
      setQuickBuyError(error.message || "Quick buy failed");

      // Show error to user
      if (error.message.includes("User rejected")) {
        setQuickBuyError("Transaction cancelled by user");
      } else if (error.message.includes("insufficient")) {
        setQuickBuyError("Insufficient ETH balance");
      } else {
        setQuickBuyError("Quick buy failed. Please try again.");
      }
    } finally {
      setIsQuickBuying(false);
    }
  };

  const bgIndex = useMemo(() => {
    if (typeof index === "number") return index % 4; // cycle in order and repeat
    const s = token.id || token.name || "";
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 4;
  }, [index, token.id, token.name]);

  const themes = [
    {
      // Blue
      bg: "#6EC2FF",
      heading: "text-white",
      text: "text-white/80",
      priceChange: token.priceChange.startsWith("-")
        ? "text-red-200"
        : "text-green-200",
      quickBuy: "bg-black/80 text-white hover:bg-black hover:cursor-pointer",
    },
    {
      // Purple
      bg: "#7962D9",
      heading: "text-white",
      text: "text-white/80",
      priceChange: token.priceChange.startsWith("-")
        ? "text-red-200"
        : "text-green-200",
      quickBuy: "bg-black/80 text-white hover:bg-black hover:cursor-pointer",
    },
    {
      // Beige
      bg: "linear-gradient(135deg, #E8DFD0, #AF9C82)",
      heading: "text-black",
      text: "text-black/70",
      priceChange: token.priceChange.startsWith("-")
        ? "text-red-600"
        : "text-green-600",
      quickBuy: "bg-black text-white hover:bg-gray-800 hover:cursor-pointer",
    },
    {
      // Grey
      bg: "#F3F4F6", // A light grey base
      heading: "text-black",
      text: "text-black/70",
      priceChange: token.priceChange.startsWith("-")
        ? "text-red-600"
        : "text-green-600",
      quickBuy: "bg-black text-white hover:bg-gray-800 hover:cursor-pointer",
    },
  ];

  const theme = themes[bgIndex];
  const overlayBg = `linear-gradient(0deg, rgba(0,0,0,0.28), rgba(0,0,0,0.28)), ${theme.bg}`;
  const headingClass = "text-white";
  const textClass = "text-white/80";
  const priceChangeClass = token.priceChange.startsWith("-")
    ? "text-red-200"
    : "text-green-200";

  const DEFAULT_IMG =
    "https://purple-voluntary-minnow-145.mypinata.cloud/ipfs/bafkreiadbzvwwngz3kvk5ut75gdzlbpklxokyacpysotogltergnkhx7um";

  const [imgSrc, setImgSrc] = useState<string>(token.image || DEFAULT_IMG);

  useEffect(() => {
    setImgSrc(token.image || DEFAULT_IMG);
  }, [token.image]);

  return (
    <div
      style={{ background: overlayBg }}
      className="relative rounded-2xl p-5 shadow-md cursor-pointer transition-transform hover:scale-[1.01] flex flex-col justify-between h-[237px] w-[364px] overflow-hidden"
      onClick={handleCardClick}
    >
      {/* Content on the left */}
      <div className="flex-1 min-w-0 pr-[170px] z-10">
        <div className="flex items-center space-x-2">
          <div
            className={`text-xl font-extrabold tracking-tight truncate ${headingClass}`}
          >
            {token.name}
          </div>
          {(token.symbol === 'X402' || token.name === 'X402 Token') && (
            <span className="bg-blue-500 text-white text-xs font-medium px-2 py-0.5 rounded-full">
              x402
            </span>
          )}
        </div>
        <div className={`mt-1 text-sm/5 ${textClass}`}>
          (${token.symbol.toUpperCase()})
        </div>
        <div className={`mt-1 text-sm/5 ${textClass}`}>Market Cap</div>
        <div className="mt-1 flex items-baseline gap-2">
          <div className={`text-2xl font-bold truncate ${headingClass}`}>
            {token.currentPrice}
          </div>
          <div className={`flex items-center mt-1 medium ${priceChangeClass}`}>
            {token.priceChange}
          </div>
        </div>
        <button
          className={`mt-4 inline-flex items-center gap-1 text-sm cursor-pointer font-semibold underline underline-offset-4 ${textClass} hover:opacity-80`}
          onClick={(e) => {
            e.stopPropagation();
            handleCardClick();
          }}
        >
          View Token →
        </button>
      </div>

      {/* Quick Buy Button at the bottom */}
      <div className="mt-auto z-10">
        {quickBuyError && (
          <div className="mb-2 text-xs text-red-200 bg-red-500/20 rounded px-2 py-1">
            {quickBuyError}
          </div>
        )}
        <button
          onClick={handleQuickBuy}
          disabled={isQuickBuying || !isReady}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-all ${
            isQuickBuying
              ? "bg-gray-500 text-gray-300 cursor-not-allowed"
              : !isReady
              ? "bg-gray-600 text-gray-400 cursor-not-allowed"
              : theme.quickBuy
          }`}
        >
          {isQuickBuying ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              Buying...
            </>
          ) : !isReady ? (
            "Connect Wallet"
          ) : (
            "+ Quick buy 0.01"
          )}
        </button>
      </div>

      {/* Image on the right (vertically centered, fixed 146.2px square) */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 h-[150px] w-[150px]">
        <div className="relative h-full w-full rounded-l-2xl overflow-hidden">
          <img
            src={imgSrc}
            alt={token.name}
            className="w-full h-full object-cover"
            width={150}
            height={150}
            onError={() => {
              if (imgSrc !== DEFAULT_IMG) {
                setImgSrc(DEFAULT_IMG);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default TokenCard;
