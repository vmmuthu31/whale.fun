import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  parseEther,
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  getContract,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Load env
dotenv.config();

// Simple args parser
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

// Chains
const zeroGTestnet = defineChain({
  id: 16602,
  name: "0G Newton Testnet",
  nativeCurrency: { name: "A0GI", symbol: "A0GI", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.RPC_0G_TESTNET || "https://evmrpc-testnet.0g.ai"],
    },
  },
  blockExplorers: {
    default: { name: "0G Explorer", url: "https://chainscan-newton.0g.ai" },
  },
});

const hardhatLocal = defineChain({
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.RPC_LOCALHOST || "http://127.0.0.1:8545"] },
  },
});

async function main() {
  const a = args();
  const network = (a.network as string) || "0g-testnet"; // "localhost" or "0g-testnet"
  const countPerWallet = a.count ? Number(a.count) : 1;
  const simulate = Boolean(a.simulate === true || a.simulate === "true");

  // Safety: require CONFIRM=true on non-local when not simulating
  if (network !== "localhost" && !simulate) {
    if ((process.env.CONFIRM || "").toLowerCase() !== "true") {
      throw new Error(
        "CONFIRM=true is required in .env for non-local actions. Use --simulate to dry-run."
      );
    }
  }

  // Load wallets
  const rootPk = (
    process.env.ROOT_PRIVATE_KEY ||
    process.env.PRIVATE_KEY ||
    ""
  ).replace(/^0x/, "");
  if (!rootPk)
    throw new Error("ROOT_PRIVATE_KEY/PRIVATE_KEY is required in .env");
  const secondaryList = (process.env.SECONDARY_PRIVATE_KEYS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^0x/, ""));
  if (secondaryList.length === 0)
    throw new Error(
      "SECONDARY_PRIVATE_KEYS must contain at least one private key"
    );

  const fundPerWalletWei = process.env.FUND_PER_WALLET_WEI
    ? BigInt(process.env.FUND_PER_WALLET_WEI)
    : BigInt(0);

  // Clients
  const chain = network === "localhost" ? hardhatLocal : zeroGTestnet;
  const publicClient = createPublicClient({ chain, transport: http() });
  const rootAccount = privateKeyToAccount(`0x${rootPk}`);
  const rootClient = createWalletClient({
    account: rootAccount,
    chain,
    transport: http(),
  });

  console.log(`[roundrobin] Network: ${network}`);
  console.log(`[roundrobin] Root: ${rootAccount.address}`);
  console.log(`[roundrobin] Secondary wallets: ${secondaryList.length}`);
  console.log(
    `[roundrobin] countPerWallet=${countPerWallet}, simulate=${simulate}`
  );

  // Load deployments file
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const deploymentsDir = path.resolve(__dirname, "../deployments");
  const deploymentFile =
    network === "localhost" ? "local.json" : `${network}-*.json`;

  // Pick latest deployment file for this network
  const files = fs
    .readdirSync(deploymentsDir)
    .filter((f) =>
      network === "localhost"
        ? f === "local.json"
        : f.startsWith(`${network}-`) && f.endsWith(".json")
    )
    .sort(
      (a, b) =>
        fs.statSync(path.join(deploymentsDir, b)).mtimeMs -
        fs.statSync(path.join(deploymentsDir, a)).mtimeMs
    );
  if (files.length === 0)
    throw new Error(
      `No deployment file found for ${network} in contracts/deployments/`
    );
  const deploymentPath = path.join(deploymentsDir, files[0]);
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const tokenFactoryAddress: `0x${string}` = deployment.contracts?.TokenFactory;
  if (!tokenFactoryAddress)
    throw new Error("TokenFactory address not found in deployment file");

  // Load TokenFactory ABI from artifacts (TokenFactoryRoot.sol/TokenFactory.json)
  const artifactsDir = path.resolve(
    __dirname,
    "../artifacts/contracts/TokenFactoryRoot.sol"
  );
  const tfArtifact = JSON.parse(
    fs.readFileSync(path.join(artifactsDir, "TokenFactory.json"), "utf8")
  );

  const tokenFactory = getContract({
    address: tokenFactoryAddress,
    abi: tfArtifact.abi,
    client: { public: publicClient, wallet: rootClient },
  });

  // Read launch fee (so we can send exact value)
  const launchFee = (await publicClient.readContract({
    address: tokenFactoryAddress,
    abi: tfArtifact.abi,
    functionName: "launchFee",
    args: [],
  })) as bigint;
  console.log(
    `[roundrobin] Current launchFee: ${launchFee} wei (${
      Number(launchFee) / 1e18
    } ETH)`
  );

  // Funding step
  if (fundPerWalletWei > BigInt(0) && !simulate) {
    console.log(
      `[roundrobin] Funding secondary wallets with ${fundPerWalletWei} wei each...`
    );
    for (const pk of secondaryList) {
      const acc = privateKeyToAccount(`0x${pk}`);
      const to = acc.address;
      const hash = await rootClient.sendTransaction({
        to,
        value: fundPerWalletWei,
      });
      console.log(`[fund] ${to} tx=${hash}`);
      await publicClient.waitForTransactionReceipt({ hash });
    }
  } else if (fundPerWalletWei === BigInt(0)) {
    console.log("[roundrobin] Skipping funding (FUND_PER_WALLET_WEI not set)");
  } else if (simulate) {
    console.log("[roundrobin] Simulate mode: funding skipped");
  }

  // Generated output collector
  const created: Array<{
    wallet: string;
    tokenAddress: string;
    name: string;
    symbol: string;
  }> = [];

  // Create tokens per wallet
  for (const pk of secondaryList) {
    const account = privateKeyToAccount(`0x${pk}`);
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(),
    });
    const tfForWallet = getContract({
      address: tokenFactoryAddress,
      abi: tfArtifact.abi,
      client: { public: publicClient, wallet: walletClient },
    });

    for (let i = 0; i < countPerWallet; i++) {
      // Build token params (can be overridden later via flags/env)
      const name =
        process.env.DEFAULT_TOKEN_NAME ||
        `DemoToken_${account.address.slice(2, 6)}_${i + 1}`;
      const symbol = process.env.DEFAULT_TOKEN_SYMBOL || `DT${i + 1}`;
      const totalSupply = process.env.DEFAULT_TOKEN_SUPPLY
        ? BigInt(process.env.DEFAULT_TOKEN_SUPPLY)
        : parseUnits("1000000", 18);
      const targetCap = process.env.DEFAULT_TARGET_MARKET_CAP
        ? BigInt(process.env.DEFAULT_TARGET_MARKET_CAP)
        : parseUnits("10000", 18);
      const creatorFeeBps = process.env.DEFAULT_CREATOR_FEE_BPS
        ? Number(process.env.DEFAULT_CREATOR_FEE_BPS)
        : 200; // 2%
      const description =
        process.env.DEFAULT_DESCRIPTION ||
        "Demo token created by round-robin script";
      const logoUrl = process.env.DEFAULT_LOGO_URL || "";
      const communitySize = process.env.DEFAULT_COMMUNITY_SIZE
        ? Number(process.env.DEFAULT_COMMUNITY_SIZE)
        : 0;
      const liquidityDepth = process.env.DEFAULT_LIQUIDITY_DEPTH_WEI
        ? BigInt(process.env.DEFAULT_LIQUIDITY_DEPTH_WEI)
        : parseEther("0.001");

      const value = launchFee + liquidityDepth;

      console.log(
        `[create] ${account.address} -> ${name} (${symbol}) sending value=${value}`
      );
      if (simulate) {
        console.log(`[simulate] would call createTokenWithCommunityData(...)`);
        continue;
      }

      const hash = await tfForWallet.write.createTokenWithCommunityData(
        [
          name,
          symbol,
          totalSupply,
          targetCap,
          creatorFeeBps,
          description,
          logoUrl,
          communitySize,
        ],
        { value }
      );

      console.log(`[tx] ${hash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // The token address is emitted via TokenCreated event; but factory also tracks last token in arrays.
      // For simplicity, fetch creator tokens and grab the last.
      const tokens = (await publicClient.readContract({
        address: tokenFactoryAddress,
        abi: tfArtifact.abi,
        functionName: "getCreatorTokens",
        args: [account.address],
      })) as `0x${string}`[];
      const tokenAddress = tokens[tokens.length - 1];
      console.log(`[created] token=${tokenAddress}`);

      created.push({ wallet: account.address, tokenAddress, name, symbol });
    }
  }

  // Write generated file
  const outDir = path.resolve(__dirname, "./generated");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `tokens-${Date.now()}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify({ network, factory: tokenFactoryAddress, created }, null, 2)
  );
  console.log(`[roundrobin] wrote ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
