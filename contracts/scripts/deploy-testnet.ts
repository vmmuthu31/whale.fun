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

// Load environment variables
dotenv.config();

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
  console.log("Deploying contracts to 0G testnet...");

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
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const artifactsPath = path.join(__dirname, "../artifacts/contracts");

  // Helper function to deploy a contract
  async function deployContract(
    name: string,
    constructorArgs: any[] = [],
    solFileName?: string
  ) {
    console.log(`\n📝 Deploying ${name}...`);

    const solFile = solFileName || name;
    const contractPath = path.join(
      artifactsPath,
      `${solFile}.sol/${name}.json`
    );
    const artifact = JSON.parse(fs.readFileSync(contractPath, "utf8"));

    const hash = await walletClient.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      args: constructorArgs,
    });

    console.log(`Transaction hash: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ ${name} deployed at: ${receipt.contractAddress}`);

    return {
      address: receipt.contractAddress!,
      abi: artifact.abi,
    };
  }

  // Step 1: Deploy WhaleToken
  const whaleToken = await deployContract("WhaleToken");

  // Step 2: Deploy TokenFactory (from TokenFactoryRoot.sol)
  const tokenFactory = await deployContract(
    "TokenFactory",
    [whaleToken.address],
    "TokenFactoryRoot"
  );

  // Step 3: Deploy TokenGraduation
  const tokenGraduation = await deployContract("TokenGraduation", [
    tokenFactory.address,
  ]);

  // Step 4: Deploy TokenAnalyticsEnhanced
  const tokenAnalytics = await deployContract("TokenAnalyticsEnhanced", [
    tokenFactory.address,
    tokenGraduation.address,
  ]);

  // Step 5: Deploy TradingEngineEnhanced
  const tradingEngine = await deployContract("TradingEngineEnhanced", [
    whaleToken.address,
    tokenFactory.address,
    tokenAnalytics.address,
  ]);

  // Step 6: Deploy DashboardDataProvider
  const dashboardProvider = await deployContract("DashboardDataProvider", [
    tokenFactory.address,
    tokenAnalytics.address,
    tradingEngine.address,
    tokenGraduation.address,
  ]);

  // Configuration
  console.log("\n⚙️  Configuring contracts...");

  // Configure TokenGraduation with initial ETH/USD rate
  console.log("Setting initial ETH/USD rate...");
  const tokenGraduationContract = getContract({
    address: tokenGraduation.address,
    abi: tokenGraduation.abi,
    client: { public: publicClient, wallet: walletClient },
  });

  const initialEthToUsdRate = parseEther("2000"); // $2000 per ETH
  let hash = await tokenGraduationContract.write.updateEthToUsdRate([
    initialEthToUsdRate,
  ]);
  await publicClient.waitForTransactionReceipt({ hash });

  // Configure TokenFactory
  console.log("Configuring TokenFactory...");
  const tokenFactoryContract = getContract({
    address: tokenFactory.address,
    abi: tokenFactory.abi,
    client: { public: publicClient, wallet: walletClient },
  });

  hash = await tokenFactoryContract.write.setLaunchFee([parseEther("0.001")]);
  await publicClient.waitForTransactionReceipt({ hash });

  hash = await tokenFactoryContract.write.setMinInitialLiquidity([BigInt(0)]);
  await publicClient.waitForTransactionReceipt({ hash });

  hash = await tokenFactoryContract.write.setMaxTokensPerCreator([
    BigInt(1_000_000),
  ]);

  await publicClient.waitForTransactionReceipt({ hash });

  hash = await tokenFactoryContract.write.setPlatformCommissionRate([100]);
  await publicClient.waitForTransactionReceipt({ hash });

  hash = await tokenFactoryContract.write.setCreatorCommissionRate([300]);
  await publicClient.waitForTransactionReceipt({ hash });

  // Configure TradingEngine fees
  console.log("Configuring TradingEngine fees...");
  const tradingEngineContract = getContract({
    address: tradingEngine.address,
    abi: tradingEngine.abi,
    client: { public: publicClient, wallet: walletClient },
  });

  hash = await tradingEngineContract.write.updateFeeStructure([
    30, 100, 70, 20, 10,
  ]);
  await publicClient.waitForTransactionReceipt({ hash });

  console.log("\n" + "=".repeat(60));
  console.log("✅ DEPLOYMENT SUCCESSFUL!");
  console.log("=".repeat(60));
  console.log("Deployed Contract Addresses:");
  console.log("=".repeat(60));
  console.log(`WhaleToken:              ${whaleToken.address}`);
  console.log(`TokenFactory:            ${tokenFactory.address}`);
  console.log(`TokenGraduation:         ${tokenGraduation.address}`);
  console.log(`TokenAnalytics:          ${tokenAnalytics.address}`);
  console.log(`TradingEngine:           ${tradingEngine.address}`);
  console.log(`DashboardDataProvider:   ${dashboardProvider.address}`);
  console.log("=".repeat(60));

  // Save deployment addresses
  const deploymentInfo = {
    network: "0g-testnet",
    chainId: 16602,
    deployer: account.address,
    timestamp: new Date().toISOString(),
    contracts: {
      WhaleToken: whaleToken.address,
      TokenFactory: tokenFactory.address,
      TokenGraduation: tokenGraduation.address,
      TokenAnalytics: tokenAnalytics.address,
      TradingEngine: tradingEngine.address,
      DashboardDataProvider: dashboardProvider.address,
    },
  };

  console.log("\n📄 Deployment info saved to deployments/");

  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const filename = `0g-testnet-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(deploymentsDir, filename),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log(`Saved to: deployments/${filename}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
