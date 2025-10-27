import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getContract,
  http,
  parseEther,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

dotenv.config();

function args() {
  const out: Record<string, string | boolean> = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k.startsWith("--")) {
      const key = k.slice(2);
      const val = a[i + 1] && !a[i + 1].startsWith("--") ? a[i + 1] : "true";
      out[key] = val === "true" ? true : val;
      if (val !== "true") i++;
    }
  }
  return out;
}

const zeroGTestnet = defineChain({
  id: 16602,
  name: "0G Newton Testnet",
  nativeCurrency: { name: "A0GI", symbol: "A0GI", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_0G_TESTNET || "https://evmrpc-testnet.0g.ai"] } },
  blockExplorers: { default: { name: "0G Explorer", url: "https://chainscan-newton.0g.ai" } },
});

async function main() {
  const a = args();
  const network = (a.network as string) || "0g-testnet";
  const simulate = Boolean(a.simulate === true || a.simulate === "true");

  if (network !== "localhost" && !simulate) {
    if ((process.env.CONFIRM || "").toLowerCase() !== "true") {
      throw new Error("CONFIRM=true is required in .env for non-local actions. Use --simulate for dry-run.");
    }
  }

  // Wallet
  const rootPk = (process.env.ROOT_PRIVATE_KEY || process.env.PRIVATE_KEY || "").replace(/^0x/, "");
  if (!rootPk) throw new Error("ROOT_PRIVATE_KEY/PRIVATE_KEY is required in .env");
  const account = privateKeyToAccount(`0x${rootPk}`);

  // Clients
  const chain = zeroGTestnet; // this script targets 0g-testnet by default
  const publicClient = createPublicClient({ chain, transport: http() });
  const walletClient = createWalletClient({ account, chain, transport: http() });

  console.log(`[integration] Network=${network} Root=${account.address}`);

  // Resolve paths
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, "../..");

  // Load latest deployment for this network (under contracts/deployments)
  const deploymentsDir = path.join(repoRoot, "contracts", "deployments");
  const files = fs
    .readdirSync(deploymentsDir)
    .filter((f) => f.startsWith(`${network}-`) && f.endsWith(".json"))
    .sort((a, b) => fs.statSync(path.join(deploymentsDir, b)).mtimeMs - fs.statSync(path.join(deploymentsDir, a)).mtimeMs);
  if (files.length === 0) throw new Error(`No deployment file for ${network}`);
  const deployment = JSON.parse(fs.readFileSync(path.join(deploymentsDir, files[0]), "utf8"));

  const WhaleTokenAddr = deployment.contracts.WhaleToken as `0x${string}`;
  const TokenFactoryAddr = deployment.contracts.TokenFactory as `0x${string}`;
  const TokenAnalyticsAddr = deployment.contracts.TokenAnalytics as `0x${string}`;
  const TradingEngineAddr = deployment.contracts.TradingEngine as `0x${string}`;
  const DashboardAddr = deployment.contracts.DashboardDataProvider as `0x${string}`;

  // Load ABIs
  const artifactsDir = path.join(repoRoot, "contracts", "artifacts", "contracts");
  const tfArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, "TokenFactoryRoot.sol", "TokenFactory.json"), "utf8"));
  const teArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, "TradingEngineEnhanced.sol", "TradingEngineEnhanced.json"), "utf8"));
  const ddpArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, "DashboardDataProvider.sol", "DashboardDataProvider.json"), "utf8"));

  // Contracts
  const tokenFactory = getContract({ address: TokenFactoryAddr, abi: tfArtifact.abi, client: { public: publicClient, wallet: walletClient } });
  const tradingEngine = getContract({ address: TradingEngineAddr, abi: teArtifact.abi, client: { public: publicClient, wallet: walletClient } });
  const dashboard = getContract({ address: DashboardAddr, abi: ddpArtifact.abi, client: { public: publicClient } });

  // 1) Create a token
  const name = a.name as string || "IntegrationToken";
  const symbol = a.symbol as string || "ITKN";
  const totalSupply = a.supply ? BigInt(a.supply as string) : parseUnits("1000000", 18);
  const targetCap = a.cap ? BigInt(a.cap as string) : parseUnits("10000", 18);
  const creatorFeeBps = a.creatorFee ? Number(a.creatorFee) : 200; // 2%
  const description = "Integration test token";
  const logoUrl = "";
  const communitySize = 0;
  const liquidityDepth = a.liq ? BigInt(a.liq as string) : parseEther("0.01");

  const launchFee = (await publicClient.readContract({ address: TokenFactoryAddr, abi: tfArtifact.abi, functionName: "launchFee", args: [] })) as bigint;
  const value = launchFee + liquidityDepth;

  console.log(`[integration] Creating token ${name} (${symbol}) with value=${value}`);
  if (!simulate) {
    const hash = await tokenFactory.write.createTokenWithCommunityData([
      name,
      symbol,
      totalSupply,
      targetCap,
      creatorFeeBps,
      description,
      logoUrl,
      communitySize,
    ], { value });
    console.log(`[create] tx=${hash}`);
    await publicClient.waitForTransactionReceipt({ hash });
  } else {
    console.log(`[simulate] skipped token creation tx`);
  }

  // Discover latest token by this creator
  const tokens = (await publicClient.readContract({
    address: TokenFactoryAddr,
    abi: tfArtifact.abi,
    functionName: "getCreatorTokens",
    args: [account.address],
  })) as `0x${string}`[];
  const tokenAddress = tokens.length > 0 ? tokens[tokens.length - 1] : undefined;
  console.log(`[integration] Latest token for ${account.address}: ${tokenAddress}`);

  if (!tokenAddress) {
    if (simulate) {
      console.log(`[integration] No existing tokens for creator in simulate mode. Skipping pair & dashboard.`);
    } else {
      throw new Error(`No token found for creator after creation. Ensure creation succeeded or re-run without --simulate.`);
    }
  } else {
    // 2) Create a trading pair with WhaleToken (register pair)
    const customFee = 30; // 0.3%
    console.log(`[integration] Creating trading pair token=${tokenAddress} vs WhaleToken=${WhaleTokenAddr}`);
    if (!simulate) {
      const pairHash = await tradingEngine.write.createPair([tokenAddress, WhaleTokenAddr, customFee]);
      console.log(`[pair] tx=${pairHash}`);
      await publicClient.waitForTransactionReceipt({ hash: pairHash });
    } else {
      console.log(`[simulate] skipped createPair tx`);
    }

    // 3) Query dashboard data for the token
    try {
      await publicClient.readContract({
        address: DashboardAddr,
        abi: ddpArtifact.abi,
        functionName: "getTokenDashboardData",
        args: [tokenAddress],
      });
      console.log(`[dashboard] fetched dashboard data for ${tokenAddress}`);
    } catch (e) {
      console.warn(`[dashboard] Failed to fetch dashboard data:`, e);
    }
  }

  // Write a small integration report
  const outDir = path.join(repoRoot, "contracts", "scripts", "generated");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `integration-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify({
    network,
    deployer: account.address,
    createdToken: tokenAddress ?? null,
    factory: TokenFactoryAddr,
    whaleToken: WhaleTokenAddr,
    tradingEngine: TradingEngineAddr,
  }, null, 2));
  console.log(`[integration] wrote ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
