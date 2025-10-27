"use client";
import Header from "@/components/layout/Header";
import { useState, useEffect } from "react";
import type { FC, ChangeEvent, FormEvent } from "react";
import { tokenFactoryRootService } from "@/lib/services/TokenFactoryRootService";
import { parseEther, formatEther } from "ethers";
import {
  getBlockchainConnection,
  validateNetwork,
  SUPPORTED_NETWORKS,
  switchNetwork,
} from "@/utils/Blockchain";
import { combineTokenMetadata } from "@/utils/tokenMetadata";
import { toast } from "sonner";
import Link from "next/link";
import Image from "next/image";
import {
  useAccount,
  useWalletClient,
  usePublicClient,
  useChainId,
} from "wagmi";
import {
  ChevronLeft,
  UploadCloud,
  X,
  Globe,
  Send,
  User,
  Trash2,
  FileText,
} from "lucide-react";

interface InputFieldProps {
  label: string;
  id: string;
  placeholder: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  isTextArea?: boolean;
  maxLength?: number;
  infoText?: string;
  type?: string;
}

const InputField: FC<InputFieldProps> = ({
  label,
  id,
  placeholder,
  value,
  onChange,
  isTextArea = false,
  maxLength,
  infoText,
  type = "text",
}) => (
  <div>
    <label
      htmlFor={id}
      className="block text-sm font-medium text-gray-700 mb-1"
    >
      {label}
    </label>
    {isTextArea ? (
      <textarea
        id={id}
        name={id}
        rows={3}
        className="w-full px-3 py-2 bg-black/5 border border-transparent rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        maxLength={maxLength}
      />
    ) : (
      <input
        type={type}
        id={id}
        name={id}
        className="w-full px-3 py-2 bg-black/5 border border-transparent rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
    )}
    {infoText && <p className="text-xs text-gray-400 mt-1">{infoText}</p>}
  </div>
);

const StepIndicator: FC<{ current: number; total: number }> = ({
  current,
  total,
}) => {
  return (
    <div className="flex items-center gap-3 my-4" aria-label="progress">
      {Array.from({ length: total }).map((_, i) => {
        const idx = i + 1;
        const active = idx <= current;
        return (
          <div
            key={idx}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              active ? "bg-purple-500" : "bg-gray-200"
            }`}
          />
        );
      })}
    </div>
  );
};

const PreviewCard: FC<{
  name: string;
  symbol: string;
  description: string;
  logo: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  address?: string | undefined;
}> = ({
  name,
  symbol,
  description,
  logo,
  website,
  twitter,
  telegram,
  address,
}) => {
  const short = address
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : "0x…";
  const siteUrl =
    website && website.trim()
      ? website.startsWith("http")
        ? website
        : `https://${website}`
      : null;
  const twitterUrl =
    twitter && twitter.trim()
      ? twitter.startsWith("http")
        ? twitter
        : `https://twitter.com/${twitter.replace(/^@/, "")}`
      : null;
  const telegramUrl =
    telegram && telegram.trim()
      ? telegram.startsWith("http")
        ? telegram
        : `https://t.me/${telegram.replace(/^@/, "")}`
      : null;
  return (
    <div className="sticky top-8 rounded-2xl bg-black text-white shadow-lg w-[340px] md:w-[360px] min-h-[520px] flex flex-col">
      <div
        className={`relative aspect-square w-full ${
          logo ? "rounded-t-2xl" : "rounded-2xl"
        } overflow-hidden flex items-center justify-center`}
        style={{ backgroundColor: logo ? undefined : "#E4D3F3" }}
      >
        {logo ? (
          <Image src={logo} alt="Logo preview" className="object-cover" fill />
        ) : (
          <div className="text-purple-700 font-semibold rounded-lg"></div>
        )}
      </div>
      <div className="flex flex-col p-4 space-y-2 flex-grow">
        <div className="text-2xl font-bold">
          {symbol ? `$${symbol.toUpperCase()}` : "$YOURCOIN"}
        </div>
        <div className="text-sm text-gray-400">{name || "Your Token"}</div>
        <div className="text-xs text-gray-500 flex items-center gap-1.5">
          <span className="uppercase">CA:</span>
          <User className="w-3 h-3" />
          <span>{short}</span>
        </div>
        <p className="text-sm text-gray-400 flex-grow pt-2">
          {description || "Add a token description. It goes here."}
        </p>
        <div className="flex items-center gap-3 pt-2 mt-auto">
          {/* Website */}
          <a
            href={siteUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#F1F1F11A] opacity-40`}
            onClick={(e) => {
              if (!siteUrl) e.preventDefault();
            }}
            aria-label="Website"
          >
            <Globe className="w-4 h-4 text-gray-300" />
          </a>
          {/* X (Twitter) - inline brand X svg */}
          <a
            href={twitterUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#F1F1F11A] opacity-40`}
            onClick={(e) => {
              if (!twitterUrl) e.preventDefault();
            }}
            aria-label="Twitter (X)"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M18.244 3H21l-7.42 8.486L22 21h-6.59l-5.16-6.034L4.9 21H2l7.94-9.08L2 3h6.59l4.73 5.53L18.244 3Zm-1.038 16.2h2.06L8.91 4.8H6.85l10.356 14.4Z"
                className="text-gray-300"
              />
            </svg>
          </a>
          {/* Telegram */}
          <a
            href={telegramUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#F1F1F11A] opacity-40`}
            onClick={(e) => {
              if (!telegramUrl) e.preventDefault();
            }}
            aria-label="Telegram"
          >
            <Send className="w-4 h-4 text-gray-300" />
          </a>
        </div>
      </div>
    </div>
  );
};

const CreatePage: FC = () => {
  const [formData, setFormData] = useState({
    tokenName: "",
    tokenSymbol: "",
    description: "",
    logoUrl: "",
    totalSupply: "1000000",
    targetMarketCap: "0.1",
    creatorFeeBps: "30",
    website: "",
    telegram: "",
    twitter: "",
    logoPreview: "",
    logoFile: null as File | null,
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const [currentStep, setCurrentStep] = useState(1); // 1: Basics, 2: Story
  const totalSteps = 2;

  const stepMeta: Record<number, { title: string; subtitle: string }> = {
    1: {
      title: "Create your token",
      subtitle: "Upload a logo, name your token, and set a short symbol.",
    },
    2: {
      title: "Tell your story",
      subtitle: "Add a concise thesis and optional links.",
    },
  };

  const { address } = useAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isTokenCreated, setIsTokenCreated] = useState(false);
  const [createdTokenHash, setCreatedTokenHash] = useState<string | null>(null);
  const [createdTokenAddress, setCreatedTokenAddress] = useState<string | null>(
    null
  );
  const [creationCost, setCreationCost] = useState<{
    launchFee: bigint;
    liquidity: bigint;
    total: bigint;
  } | null>(null);
  const [currentNetwork, setCurrentNetwork] = useState<{
    chainId: number;
    name: string;
  } | null>(null);

  // Reuse initialized clients from Wagmi/RainbowKit provider
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const wagmiChainId = useChainId();

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // local preview immediately
    const localUrl = URL.createObjectURL(file);
    setFormData((prev) => ({ ...prev, logoPreview: localUrl, logoFile: file }));
    setUploadingLogo(true);
    setUploadStatus("Uploading...");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Upload failed");
      }
      const data = await res.json();
      if (data?.url) {
        setFormData((prev) => ({ ...prev, logoUrl: data.url }));
        setUploadStatus("Uploaded Successfully");
      } else {
        setUploadStatus("Uploaded (no URL returned)");
      }
    } catch (err: any) {
      console.error("Pinata upload error:", err);
      setUploadStatus("Upload failed");
    } finally {
      setUploadingLogo(false);
    }
  };

  const removeLogo = () => {
    if (formData.logoFile) {
      URL.revokeObjectURL(formData.logoPreview);
    }
    setFormData((prev) => ({
      ...prev,
      logoPreview: "",
      logoFile: null,
      logoUrl: "",
    }));
    setUploadStatus(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const connection = await getBlockchainConnection();
      const chainId = Number(connection.network.chainId);

      try {
        validateNetwork(chainId);
      } catch (networkError) {
        try {
          // Prefer current wagmi chain if supported; otherwise default to 0G Testnet
          const preferredChainId = SUPPORTED_NETWORKS[wagmiChainId || chainId]
            ? (wagmiChainId || chainId)
            : 16602;
          await switchNetwork(preferredChainId);
          // Re-check connection after switch
          const connRetry = await getBlockchainConnection();
          const retryChainId = Number(connRetry.network.chainId);
          validateNetwork(retryChainId);
        } catch (switchErr) {
          const supportedNetworksList = Object.values(SUPPORTED_NETWORKS)
            .map((network) => `${network.name} (${network.chainId})`)
            .join(", ");

          throw new Error(
            `Unsupported network (Chain ID: ${chainId}). Please switch to one of the supported networks: ${supportedNetworksList}`
          );
        }
      }

      try {
        console.log("Attempting to call getFactoryStats...");
        const factoryStats = await tokenFactoryRootService.getFactoryStats();
        console.log("✅ Factory stats:", factoryStats);
      } catch (contractError: any) {
        console.error("❌ Contract check failed:", contractError);
        console.error("Error details:", {
          message: contractError.message,
          code: contractError.code,
          chainId: chainId,
          networkName: currentNetwork?.name,
        });

        if (contractError.message.includes("could not decode result data")) {
          throw new Error(
            `Contract call failed on ${
              currentNetwork?.name || "current network"
            }. This might be due to RPC issues or wallet provider problems. Try refreshing the page or switching wallet networks.`
          );
        }
        throw contractError;
      }

      // Use Wagmi-provided clients and chain
      console.log("Making direct call via Wagmi clients...");
      const currentChainId = wagmiChainId || chainId;
      console.log("Current chain ID:", currentChainId);

      // Map chain ID to chain object and contract address
      const chainMap: Record<number, { chain: any; contractAddress: string }> =
        {
          16602: {
            chain: {
              id: 16602,
              name: "0G Testnet",
              network: "0g-testnet",
              nativeCurrency: { decimals: 18, name: "A0GI", symbol: "A0GI" },
              rpcUrls: {
                default: { http: ["https://evmrpc-testnet.0g.ai"] },
                public: { http: ["https://evmrpc-testnet.0g.ai"] },
              },
              blockExplorers: {
                default: { name: "0G Explorer", url: "https://chainscan-newton.0g.ai" },
              },
              testnet: true,
            },
            contractAddress: "0x24267001806bccce23b1e453da83e4c5ec02d2b8",
          },
          16661: {
            chain: {
              id: 16661,
              name: "0G Mainnet",
              network: "0g-mainnet",
              nativeCurrency: {
                decimals: 18,
                name: "0G",
                symbol: "0G",
              },
              rpcUrls: {
                default: {
                  http: ["https://evmrpc.0g.ai"],
                },
                public: {
                  http: ["https://evmrpc.0g.ai"],
                },
              },
              blockExplorers: {
                default: {
                  name: "0G Explorer",
                  url: "https://chainscan.0g.ai",
                },
              },
              testnet: false,
            },
            contractAddress: "0x9Da032047eCaFE668360C3b290420E785bF46598",
          },
          // Add more chains as needed
        };

      const chainConfig = chainMap[currentChainId];
      if (!chainConfig) {
        throw new Error(
          `Unsupported chain ID: ${currentChainId}. Please switch to a supported network.`
        );
      }

      // Ensure we have a connected account and wallet client
      if (!address) {
        throw new Error("No wallet account found. Please connect your wallet.");
      }
      if (!walletClient) {
        throw new Error(
          "Wallet client not available. Ensure your wallet is connected."
        );
      }
      const account = address as `0x${string}`; // Use the connected account from wagmi

      // Load contract ABI
      const TokenFactoryABI = (
        await import("@/config/abi/TokenFactoryRoot.json")
      ).default;

      const contractAddress = chainConfig.contractAddress as `0x${string}`;
      // Load current on-chain creation costs dynamically (launchFee + minInitialLiquidity)
      const dynamicCost = await tokenFactoryRootService.calculateCreationCost(
        undefined,
        currentChainId
      );
      const totalCost = dynamicCost.total;

      console.log("Direct contract call with params:", {
        account: account,
        name: formData.tokenName,
        symbol: formData.tokenSymbol.toUpperCase(),
        totalSupply: parseEther(formData.totalSupply || "0"),
        targetMarketCap: parseEther(formData.targetMarketCap || "0"),
        creatorFeePercent: BigInt(Number(formData.creatorFeeBps || "0")),
        description: combineTokenMetadata({
          description: formData.description || "Token created via Whale.fun",
          website: formData.website,
          telegram: formData.telegram,
          twitter: formData.twitter,
        }),
        logoUrl:
          formData.logoUrl ||
          formData.logoPreview ||
          "https://purple-voluntary-minnow-145.mypinata.cloud/ipfs/bafkreiadbzvwwngz3kvk5ut75gdzlbpklxokyacpysotogltergnkhx7um",
        value: totalCost.toString(),
      });

      // Check user's balance before attempting the write
      try {
        if (!publicClient) throw new Error("Public client not available");
        const userBalance = await publicClient.getBalance({ address: account });
        if (userBalance < totalCost) {
          toast.error("Insufficient balance", {
            description: `Need ${formatEther(totalCost)} ${
              SUPPORTED_NETWORKS[currentChainId]?.currencySymbol || "ETH"
            }, have ${formatEther(userBalance)}`,
          });
          setError(
            `Insufficient balance. Need ${formatEther(totalCost)} ${
              SUPPORTED_NETWORKS[currentChainId]?.currencySymbol || "ETH"
            }, have ${formatEther(userBalance)}`
          );
          return;
        }
      } catch (balanceErr) {
        console.warn(
          "Could not verify balance before transaction:",
          balanceErr
        );
      }

      // Direct contract call using Wagmi's wallet client (Viem WalletClient instance)
      const txHash = await walletClient.writeContract({
        account: account,
        address: contractAddress,
        abi: TokenFactoryABI,
        functionName: "createToken",
        args: [
          formData.tokenName,
          formData.tokenSymbol.toUpperCase(),
          parseEther(formData.totalSupply || "0"),
          parseEther(formData.targetMarketCap || "0"),
          BigInt(Number(formData.creatorFeeBps || "0")),
          combineTokenMetadata({
            description: formData.description || "Token created via Whale.fun",
            website: formData.website,
            telegram: formData.telegram,
            twitter: formData.twitter,
          }),
          formData.logoUrl ||
            formData.logoPreview ||
            "https://purple-voluntary-minnow-145.mypinata.cloud/ipfs/bafkreiadbzvwwngz3kvk5ut75gdzlbpklxokyacpysotogltergnkhx7um",
        ],
        value: totalCost,
      });

      console.log("Transaction hash:", txHash);

      console.log("Waiting for transaction receipt...");

      if (!publicClient) {
        throw new Error(
          "Public client not available. Please refresh and try again."
        );
      }

      let receipt;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
            timeout: 120000, // Increased timeout to 2 minutes
            retryCount: 5,
            retryDelay: 5000, // 5 second delay between retries
          });
          break; // Success, exit retry loop
        } catch (receiptError: any) {
          retryCount++;
          console.warn(
            `Receipt fetch attempt ${retryCount} failed:`,
            receiptError.message
          );

          if (retryCount === maxRetries) {
            // Last attempt failed, but we have a transaction hash
            console.warn(
              "Could not get transaction receipt, but transaction was submitted"
            );
            setSuccess(
              `Token creation transaction submitted! Transaction hash: ${txHash}. Please check the explorer to confirm status.`
            );
            setCreatedTokenHash(txHash);
            // We don't have the token address without the receipt
            setCreatedTokenAddress(null);
            setIsTokenCreated(true);
            return; // Exit the function here
          }

          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, 10000)); // 10 second delay
        }
      }

      console.log("Transaction confirmed:", receipt);

      if (receipt?.status === "success") {
        // Extract token contract address from logs
        let tokenContractAddress = null;
        if (receipt.logs && receipt.logs.length > 0) {
          // Look for TokenCreated event log (usually the first log)
          // The contract address is typically in the first log's address field
          for (const log of receipt.logs) {
            if (log.topics && log.topics.length > 0) {
              // This is likely the TokenCreated event from the new token contract
              tokenContractAddress = log.address;
              break;
            }
          }
        }

        console.log("Extracted token contract address:", tokenContractAddress);
        setSuccess(`Token created successfully!`);
        setCreatedTokenHash(txHash);
        setCreatedTokenAddress(tokenContractAddress);
        setIsTokenCreated(true);
        // Reset form data but keep it for potential reuse
        // setFormData({ ... }) - removed to keep data for success display
      } else if (receipt?.status === "reverted") {
        throw new Error(`Transaction failed (reverted). Hash: ${txHash}`);
      } else {
        // Unknown status or no receipt
        setSuccess(
          `Transaction submitted with hash: ${txHash}. Please check the explorer to confirm the status.`
        );
        setCreatedTokenHash(txHash);
        setIsTokenCreated(true);
      }
    } catch (err: any) {
      console.error("Token creation error:", err);
      setError(err.message || "Failed to create token. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Load creation cost on component mount
  const loadCreationCost = async () => {
    try {
      const cost = await tokenFactoryRootService.calculateCreationCost();
      setCreationCost(cost);
    } catch (err) {
      console.error("Failed to load creation cost:", err);
    }
  };

  // Check current network
  const checkNetwork = async () => {
    try {
      const connection = await getBlockchainConnection();
      const chainId = Number(connection.network.chainId);
      const networkConfig = validateNetwork(chainId);
      setCurrentNetwork({ chainId, name: networkConfig.name });
    } catch (err) {
      console.log("Network check failed:", err);
      setCurrentNetwork(null);
    }
  };

  // Check network, balance and load costs when component mounts or chain changes
  useEffect(() => {
    const init = async () => {
      await loadCreationCost();
      await checkNetwork();

      // If connected but on unsupported network, try to switch to 0G Testnet by default
      if (address && wagmiChainId && !SUPPORTED_NETWORKS[wagmiChainId]) {
        try {
          await switchNetwork(16602);
          toast.success("Network switched to 0G Testnet");
        } catch (err) {
          toast.error("Please switch network", {
            description: "This app requires 0G Network (mainnet or testnet) to function properly",
          });
        }
      }

      // Check balance if connected
      if (address && publicClient) {
        try {
          const cost = await tokenFactoryRootService.calculateCreationCost();
          const balance = await publicClient.getBalance({ address });
          if (balance < cost.total) {
            toast.warning("Insufficient balance", {
              description: `You need at least ${formatEther(cost.total)} ${
                SUPPORTED_NETWORKS[16661]?.currencySymbol || "ETH"
              } to create a token`,
              duration: 5000,
            });
          }
        } catch (err) {
          console.warn("Failed to check initial balance:", err);
        }
      }
    };

    init();
  }, [address, wagmiChainId, publicClient]);

  // Success message component
  const TokenCreatedMessage = () => (
    <div className="text-center p-8 border-2 border-dashed border-purple-200 rounded-2xl">
      <Image
        src="/img/congrats.svg"
        alt="Token creation successful"
        className="mx-auto mb-6"
        width={96}
        height={96}
      />
      <h2 className="text-2xl sm:text-3xl font-bold text-gray-800">
        Token created
      </h2>
      <p className="text-gray-500 mt-2 max-w-sm mx-auto">
        Your token is live on-chain. Review the details and open your Launch
        Room.
      </p>
      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-600">
          <strong>Token:</strong> {formData.tokenName} ({formData.tokenSymbol})
        </p>
        {/* Transaction hash removed from UI display */}
      </div>
      <div className="flex items-center justify-center gap-4 mt-8">
        <Link
          href={`/token/${createdTokenAddress || createdTokenHash}`}
          type="button"
          className="px-6 py-3 bg-black text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
        >
          View token page
        </Link>
        <button
          type="button"
          className="px-6 py-3 cursor-pointer bg-black text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
          onClick={() => {
            if (createdTokenHash && currentNetwork) {
              const networkConfig = SUPPORTED_NETWORKS[currentNetwork.chainId];
              if (networkConfig) {
                const explorerUrl = networkConfig.blockExplorerUrl.replace(
                  /\/$/,
                  ""
                );
                window.open(`${explorerUrl}/tx/${createdTokenHash}`, "_blank");
              }
            }
          }}
        >
          View on explorer
        </button>
      </div>
      <button
        type="button"
        className="mt-4 text-sm cursor-pointer text-gray-500 hover:text-gray-700 underline"
        onClick={() => {
          setIsTokenCreated(false);
          setCreatedTokenHash(null);
          setCreatedTokenAddress(null);
          setSuccess(null);
          setFormData({
            tokenName: "",
            tokenSymbol: "",
            description: "",
            logoUrl: "",
            totalSupply: "1000000",
            targetMarketCap: "0.1",
            creatorFeeBps: "30",
            website: "",
            telegram: "",
            twitter: "",
            logoPreview: "",
            logoFile: null,
          });
          setCurrentStep(1);
        }}
      >
        Create another token
      </button>
    </div>
  );

  return (
    <main>
      <Header />
      <div className="flex items-center justify-center w-full bg-white bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] p-4">
        <div className="w-full max-w-6xl mx-auto">
          {isTokenCreated ? (
            <div
              className="bg-white p-8 sm:p-12 rounded-2xl shadow-sm border"
              style={{ borderColor: "#B65FFF33" }}
            >
              <TokenCreatedMessage />
            </div>
          ) : (
            <>
              <form
                onSubmit={handleSubmit}
                onKeyDown={(e) => {
                  if ((e as unknown as KeyboardEvent).key === "Enter") {
                    e.preventDefault();
                  }
                }}
              >
                <div
                  className="rounded-2xl p-5 sm:p-6"
                  style={{ backgroundColor: "#B65FFF33" }}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                    {/* LEFT: Steps */}
                    <div className="md:pl-2 mx-4">
                      <div className="bg-white rounded-2xl p-5 sm:p-6">
                        <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900">
                          {stepMeta[currentStep].title}
                        </h2>
                        <p className="text-gray-600 mt-1">
                          {stepMeta[currentStep].subtitle}
                        </p>
                        <StepIndicator
                          current={currentStep}
                          total={totalSteps}
                        />

                        <div className="min-h-[26rem] sm:min-h-[28rem] flex flex-col">
                          {currentStep === 1 && (
                            <div className="space-y-5">
                              <div className="border-2 border-dashed border-gray-300 rounded-xl bg-black/5">
                                <label className="cursor-pointer flex min-h-40 sm:min-h-48 flex-col items-center justify-center gap-4 transition-colors">
                                  <span className="inline-flex items-center justify-center w-12 h-12 rounded-md bg-[#1018280D] text-[#101828]">
                                    <UploadCloud className="w-6 h-6" />
                                  </span>
                                  <p className="text-base">
                                    <span className="font-semibold text-gray-900">
                                      Click to upload
                                    </span>
                                    <span className="text-gray-500">
                                      {" "}
                                      or drag and drop
                                    </span>
                                  </p>
                                  <p className="text-xs text-gray-400 tracking-wide">
                                    SVG, PNG, JPG or GIF
                                  </p>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleFileChange}
                                  />
                                </label>
                              </div>

                              {formData.logoFile && (
                                <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-black/5 text-gray-700">
                                      <FileText className="w-5 h-5" />
                                    </span>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-gray-900 truncate">
                                        {formData.logoFile.name}
                                      </p>
                                      <p className="text-xs text-gray-500 truncate">
                                        {(
                                          formData.logoFile.size /
                                          (1024 * 1024)
                                        ).toFixed(2)}
                                        MB |{" "}
                                        {uploadingLogo
                                          ? "Uploading..."
                                          : uploadStatus ||
                                            (formData.logoUrl
                                              ? "Uploaded Successfully"
                                              : "Pending")}
                                      </p>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={removeLogo}
                                    className="inline-flex items-center justify-center rounded-xl border border-gray-200 p-2 text-gray-600 hover:bg-black/5 hover:text-red-600"
                                    aria-label="Remove file"
                                  >
                                    <Trash2 className="w-5 h-5" />
                                  </button>
                                </div>
                              )}
                              <InputField
                                label="Token Name"
                                id="tokenName"
                                placeholder="Your Token"
                                value={formData.tokenName}
                                onChange={handleChange}
                              />
                              <InputField
                                label="Token Symbol"
                                id="tokenSymbol"
                                placeholder="$ YOURCOIN"
                                value={formData.tokenSymbol}
                                onChange={handleChange}
                              />
                            </div>
                          )}

                          {/** Step 2 (Supply & Fees) removed; values are hardcoded via defaults in formData */}

                          {currentStep === 2 && (
                            <div className="space-y-6">
                              <InputField
                                label="Description"
                                id="description"
                                placeholder="What's the thesis, utility, or story?"
                                value={formData.description}
                                onChange={handleChange}
                                isTextArea
                                maxLength={280}
                                infoText="max 280 chars"
                              />
                              <InputField
                                label="Website URL (optional)"
                                id="website"
                                placeholder="https://..."
                                value={formData.website}
                                onChange={handleChange}
                              />
                              <InputField
                                label="Telegram (optional)"
                                id="telegram"
                                placeholder="@yourchannel"
                                value={formData.telegram}
                                onChange={handleChange}
                              />
                              <InputField
                                label="Twitter/X (optional)"
                                id="twitter"
                                placeholder="@handle"
                                value={formData.twitter}
                                onChange={handleChange}
                              />
                              {/* <InputField
                              label="Logo URL (optional)"
                              id="logoUrl"
                              placeholder="https://example.com/logo.png"
                              value={formData.logoUrl}
                              onChange={handleChange}
                              infoText="Direct link to your token logo image"
                            /> */}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-4 mt-6">
                          <button
                            type="button"
                            disabled={isLoading || currentStep === 1}
                            onClick={() =>
                              setCurrentStep((s) => Math.max(1, s - 1))
                            }
                            className="w-10 h-10 flex items-center justify-center bg-black/5 text-gray-900 font-semibold rounded-xl hover:bg-black/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronLeft className="w-5 h-5" />
                          </button>

                          {currentStep < totalSteps ? (
                            <button
                              type="button"
                              disabled={
                                isLoading ||
                                (currentStep === 1 &&
                                  (!formData.tokenName ||
                                    !formData.tokenSymbol))
                              }
                              onClick={() =>
                                setCurrentStep((s) =>
                                  Math.min(totalSteps, s + 1)
                                )
                              }
                              className="px-8 py-3 w-full hover:cursor-pointer hover:text-white bg-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Next
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={handleSubmit}
                              disabled={isLoading}
                              className="px-8 py-3 bg-black text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isLoading ? "Creating Token..." : "Create"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* RIGHT: Preview */}
                    <div className="md:pr-2 flex md:justify-center items-center bg-white rounded-2xl">
                      <div className="bg-black rounded-xl p-4 h-fit">
                        <PreviewCard
                          name={formData.tokenName}
                          symbol={formData.tokenSymbol}
                          description={formData.description}
                          logo={formData.logoPreview || formData.logoUrl}
                          website={formData.website}
                          twitter={formData.twitter}
                          telegram={formData.telegram}
                          address={address}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </form>
              <div className="flex items-center justify-center mt-8">
                <button
                  type="button"
                  disabled={isLoading}
                  className="text-sm text-gray-500 hover:text-gray-700 underline"
                  onClick={() => {
                    setFormData({
                      tokenName: "",
                      tokenSymbol: "",
                      description: "",
                      logoUrl: "",
                      totalSupply: "1000000",
                      targetMarketCap: "0.1",
                      creatorFeeBps: "30",
                      website: "",
                      telegram: "",
                      twitter: "",
                      logoPreview: "",
                      logoFile: null,
                    });
                    setError(null);
                    setSuccess(null);
                    setCurrentStep(1);
                  }}
                >
                  Reset form
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
};

export default CreatePage;
