import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import {
  Address,
  createPublicClient,
  defineChain,
  getContract,
  http,
} from "viem";

dotenv.config();

function args() {
  const out: Record<string, string | boolean | number> = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k.startsWith("--")) {
      const key = k.slice(2);
      const val = a[i + 1] && !a[i + 1].startsWith("--") ? a[i + 1] : "true";
      out[key] = val === "true" ? true : (isNaN(Number(val)) ? val : Number(val));
      if (val !== "true") i++;
    }
  }
  return out;
}

async function main() {
  const a = args();
  const network = (a.network as string) || "0g-testnet";
  const limit = (a.limit as number) || 100; // cap results

  const ZeroGTestnet = defineChain({
    id: 16602,
    network: "0g-testnet",
    name: "0G Testnet",
    nativeCurrency: { name: "A0GI", symbol: "A0GI", decimals: 18 },
    rpcUrls: {
      default: {
        http: [process.env.RPC_0G_TESTNET || "https://evmrpc-testnet.0g.ai"],
      },
    },
    blockExplorers: { default: { name: "0G Explorer", url: "https://chainscan-newton.0g.ai" } },
  });

  const chain = network === "0g-testnet" ? ZeroGTestnet : ((): any => { throw new Error(`Unsupported network ${network}`); })();
  const publicClient = createPublicClient({ chain, transport: http() });

  // Paths
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, "../..");
  const deploymentsDir = path.join(repoRoot, "contracts", "deployments");
  const artifactsDir = path.join(repoRoot, "contracts", "artifacts", "contracts");

  // Load latest deployment JSON
  const files = fs
    .readdirSync(deploymentsDir)
    .filter((f) => f.startsWith(`${network}-`) && f.endsWith(".json"))
    .sort();
  if (files.length === 0) throw new Error(`No deployment found for ${network}`);
  const latest = files[files.length - 1];
  const deployment = JSON.parse(fs.readFileSync(path.join(deploymentsDir, latest), "utf8"));

  const TokenFactoryAddr = deployment.contracts.TokenFactory as Address;
  const WhaleTokenAddr = (deployment.contracts.WhaleToken || "0x0000000000000000000000000000000000000000") as Address;

  const tfArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, "TokenFactoryRoot.sol", "TokenFactory.json"), "utf8"));
  const ctArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, "CreatorToken.sol", "CreatorToken.json"), "utf8"));

  const tokenFactory = getContract({ address: TokenFactoryAddr, abi: tfArtifact.abi, client: { public: publicClient } });

  // Fetch all tokens from factory
  const all = (await publicClient.readContract({
    address: TokenFactoryAddr,
    abi: tfArtifact.abi,
    functionName: "getAllTokens",
    args: [],
  })) as Address[];

  const tokens = all
    .filter((t) => t.toLowerCase() !== (WhaleTokenAddr as string).toLowerCase())
    .slice(0, limit);

  console.log(`[list] Factory=${TokenFactoryAddr} tokens=${tokens.length} (limit=${limit})`);

  // Read metadata for each token
  const out: Array<{ address: string; name: string; symbol: string; description: string }>= [];
  for (const t of tokens) {
    try {
      const token = getContract({ address: t, abi: ctArtifact.abi, client: { public: publicClient } });
      const [name, symbol, description] = (await Promise.all([
        publicClient.readContract({ address: t, abi: ctArtifact.abi, functionName: "name", args: [] }),
        publicClient.readContract({ address: t, abi: ctArtifact.abi, functionName: "symbol", args: [] }),
        publicClient.readContract({ address: t, abi: ctArtifact.abi, functionName: "description", args: [] }),
      ])) as [string, string, string];
      out.push({ address: t, name, symbol, description });
      console.log(`- ${t} | ${name} (${symbol}) | ${description}`);
    } catch (e) {
      console.log(`- ${t} | <failed to read metadata>`);
    }
  }

  // Optional: output JSON file if --out path provided
  const outPath = (a.out as string) || "";
  if (outPath) {
    fs.writeFileSync(path.isAbsolute(outPath) ? outPath : path.join(process.cwd(), outPath), JSON.stringify(out, null, 2));
    console.log(`[list] Wrote ${out.length} entries to ${outPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
