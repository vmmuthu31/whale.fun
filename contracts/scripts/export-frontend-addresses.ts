import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

type Deployment = {
  network: string;
  chainId: number;
  deployer: string;
  timestamp: string;
  contracts: Record<string, string>;
};

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, "../..");
  const deploymentsDir = path.join(repoRoot, "contracts", "deployments");
  const artifactsDir = path.join(repoRoot, "contracts", "artifacts", "contracts");
  const generatedDir = path.join(repoRoot, "contracts", "generated");
  const abiOutDir = path.join(generatedDir, "abi");

  ensureDir(generatedDir);
  ensureDir(abiOutDir);

  // Find latest 0g-testnet deployment json (or any latest if multiple networks)
  const files = fs
    .readdirSync(deploymentsDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (files.length === 0) throw new Error("No deployments found");
  const latest = files[files.length - 1];
  const deployment: Deployment = JSON.parse(fs.readFileSync(path.join(deploymentsDir, latest), "utf8"));

  // Prepare addresses JSON for frontend
  const addresses = {
    network: deployment.network,
    chainId: deployment.chainId,
    WhaleToken: deployment.contracts.WhaleToken,
    TokenFactory: deployment.contracts.TokenFactory,
    TokenGraduation: deployment.contracts.TokenGraduation,
    TokenAnalytics: deployment.contracts.TokenAnalytics,
    TradingEngine: deployment.contracts.TradingEngine,
    DashboardDataProvider: deployment.contracts.DashboardDataProvider,
  } as const;

  // Load slim ABIs from artifacts
  const tokenFactoryAbi = JSON.parse(
    fs.readFileSync(path.join(artifactsDir, "TokenFactoryRoot.sol", "TokenFactory.json"), "utf8")
  ).abi;
  const creatorTokenAbi = JSON.parse(
    fs.readFileSync(path.join(artifactsDir, "CreatorToken.sol", "CreatorToken.json"), "utf8")
  ).abi;
  const tradingEngineAbi = JSON.parse(
    fs.readFileSync(path.join(artifactsDir, "TradingEngineEnhanced.sol", "TradingEngineEnhanced.json"), "utf8")
  ).abi;
  const dashboardAbi = JSON.parse(
    fs.readFileSync(path.join(artifactsDir, "DashboardDataProvider.sol", "DashboardDataProvider.json"), "utf8")
  ).abi;

  // Optionally we could prune ABIs; for now write full ABIs
  fs.writeFileSync(path.join(generatedDir, "frontend-addresses.json"), JSON.stringify(addresses, null, 2));
  fs.writeFileSync(path.join(abiOutDir, "TokenFactory.json"), JSON.stringify(tokenFactoryAbi, null, 2));
  fs.writeFileSync(path.join(abiOutDir, "CreatorToken.json"), JSON.stringify(creatorTokenAbi, null, 2));
  fs.writeFileSync(path.join(abiOutDir, "TradingEngineEnhanced.json"), JSON.stringify(tradingEngineAbi, null, 2));
  fs.writeFileSync(path.join(abiOutDir, "DashboardDataProvider.json"), JSON.stringify(dashboardAbi, null, 2));

  console.log(`[export] wrote ${path.relative(repoRoot, path.join(generatedDir, "frontend-addresses.json"))}`);
  console.log(`[export] wrote ABIs to ${path.relative(repoRoot, abiOutDir)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
