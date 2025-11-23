import {
  parseEther,
  createWalletClient,
  http,
  createPublicClient,
  getContract,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Load environment variables from root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Define 0G Testnet chain
const zeroGTestnet = defineChain({
  id: 16602,
  name: "0G Newton Testnet",
  nativeCurrency: { name: "A0GI", symbol: "A0GI", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://evmrpc-testnet.0g.ai"] },
  },
  blockExplorers: {
    default: { name: "0G Explorer", url: "https://chainscan-newton.0g.ai" },
  },
});

async function main() {
  console.log("Deploying X402 contracts to 0G testnet...");

  // Get deployer account from environment
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY not found in environment");
  }

  const account = privateKeyToAccount(
    `0x${process.env.PRIVATE_KEY.replace(/^0x/, "")}`
  );
  console.log("Deployer address:", account.address);

  // Create clients
  const publicClient = createPublicClient({
    chain: zeroGTestnet,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: zeroGTestnet,
    transport: http(),
  });

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(
    `Balance: ${parseFloat((Number(balance) / 1e18).toFixed(4))} A0GI`
  );

  if (balance === BigInt(0)) {
    throw new Error(
      "Insufficient balance. Please fund your account with testnet tokens."
    );
  }

  // Load compiled contracts
  const artifactsPath = path.join(__dirname, "../artifacts/contracts");

  // Helper function to deploy a contract
  async function deployContract(
    name: string,
    constructorArgs: any[] = [],
    solFileName?: string
  ) {
    console.log(`\n📝 Deploying ${name}...`);
    console.log(
      `Constructor args: ${JSON.stringify(constructorArgs, (_, v) =>
        typeof v === "bigint" ? v.toString() : v
      )}`
    );

    const solFile = solFileName || name;
    const contractPath = path.join(
      artifactsPath,
      `${solFile}.sol/${name}.json`
    );
    const artifact = JSON.parse(fs.readFileSync(contractPath, "utf8"));

    try {
      const hash = await walletClient.deployContract({
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        args: constructorArgs,
      });

      console.log(`Transaction hash: ${hash}`);

      let receipt;
      let retries = 5;
      while (retries > 0) {
        try {
          receipt = await publicClient.waitForTransactionReceipt({
            hash,
            confirmations: 1,
            timeout: 60000, // 1 minute per try
          });
          break;
        } catch (e) {
          console.log(`Waiting for receipt... (${retries} retries left)`);
          retries--;
          if (retries === 0) throw e;
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }

      if (!receipt || !receipt.contractAddress) {
        throw new Error("No contract address in receipt");
      }

      console.log(`✅ ${name} deployed at: ${receipt.contractAddress}`);

      return {
        address: receipt.contractAddress,
        abi: artifact.abi,
      };
    } catch (error: any) {
      console.error(`❌ Error deploying ${name}:`, error);
      if (error?.shortMessage) {
        console.error("Error details:", error.shortMessage);
      }
      if (error?.cause) {
        console.error("Cause:", error.cause);
      }
      throw error;
    }
  }

  // Step 1: Deploy X402Token (implementation)
  const initialSupply = BigInt(1000000) * BigInt(10) ** BigInt(18); // 1M tokens with 18 decimals
  const defaultImageUrl =
    "https://purple-voluntary-minnow-145.mypinata.cloud/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
  const x402Token = await deployContract("X402Token", [
    "X402 Token Implementation", // name_
    "X402-IMPL", // symbol_
    18, // decimals_ (18 is standard for most ERC20 tokens)
    initialSupply, // initialSupply (1M tokens with 18 decimals)
    account.address, // owner_
    account.address, // supplyHolder_
    defaultImageUrl, // imageUrl_
  ]);

  // Step 2: Deploy X402TokenFactory
  const tokenFactory = await deployContract("X402TokenFactory", [
    account.address,
  ]);

  // Step 3: Deploy X402TokenGraduation
  const tokenGraduation = await deployContract("X402TokenGraduation", [
    account.address,
  ]);

  // Step 4: Deploy X402TradingEngine
  const tradingEngine = await deployContract("X402TradingEngine", [
    account.address,
  ]);

  // Step 5: Deploy X402DashboardDataProvider
  const dashboardDataProvider = await deployContract(
    "X402DashboardDataProvider",
    []
  );

  // Step 6: Deploy X402WhaleToken
  const whaleToken = await deployContract("X402WhaleToken", [
    "X402 Whale Token",
    "XWHALE",
    18,
    "1000000000000000000000000000", // 1 billion tokens with 18 decimals
    account.address,
    defaultImageUrl,
  ]);

  // Get contract instances for interaction
  const tokenFactoryContract = getContract({
    address: tokenFactory.address,
    abi: tokenFactory.abi,
    client: { public: publicClient, wallet: walletClient },
  });

  const tradingEngineContract = getContract({
    address: tradingEngine.address,
    abi: tradingEngine.abi,
    client: { public: publicClient, wallet: walletClient },
  });

  const tokenGraduationContract = getContract({
    address: tokenGraduation.address,
    abi: tokenGraduation.abi,
    client: { public: publicClient, wallet: walletClient },
  });

  console.log("\n🔗 Setting up contract relationships...");

  // Set up relationships between contracts if needed
  // For example, if TokenGraduation needs to know about TradingEngine:
  try {
    console.log("Configuring X402TokenGraduation...");
    await tokenGraduationContract.write.initialize([tradingEngine.address]);
    console.log("✅ X402TokenGraduation configured");
  } catch (error) {
    console.log(
      "ℹ️  X402TokenGraduation doesn't have an initialize function or it's already set"
    );
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ X402 ECOSYSTEM DEPLOYED SUCCESSFULLY!");
  console.log("=".repeat(60));
  console.log("Deployed Contract Addresses:");
  console.log("=".repeat(60));
  console.log(`X402Token (Implementation): ${x402Token.address}`);
  console.log(`X402TokenFactory:          ${tokenFactory.address}`);
  console.log(`X402TokenGraduation:       ${tokenGraduation.address}`);
  console.log(`X402TradingEngine:         ${tradingEngine.address}`);
  console.log(`X402DashboardDataProvider: ${dashboardDataProvider.address}`);
  console.log(`X402WhaleToken:            ${whaleToken.address}`);
  console.log("=".repeat(60));

  // Save deployment addresses
  const deploymentInfo = {
    network: "0g-testnet",
    chainId: 16602,
    deployer: account.address,
    timestamp: new Date().toISOString(),
    contracts: {
      X402Token: x402Token.address,
      X402TokenFactory: tokenFactory.address,
      X402TokenGraduation: tokenGraduation.address,
      X402TradingEngine: tradingEngine.address,
      X402DashboardDataProvider: dashboardDataProvider.address,
      X402WhaleToken: whaleToken.address,
    },
    notes: [
      "X402Token is the implementation contract for all X402 tokens",
      "X402TokenFactory is used to deploy new X402 tokens",
      "X402TokenGraduation handles token graduation logic",
      "X402TradingEngine manages trading pairs and liquidity",
      "X402DashboardDataProvider provides analytics and data for the frontend",
      "X402WhaleToken is the platform's native token with staking and governance features",
    ],
  };

  // Save to deployments directory
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = path.join(
    deploymentsDir,
    `deployment-${Date.now()}.json`
  );
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

  console.log(`\n📝 Deployment info saved to: ${deploymentFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
