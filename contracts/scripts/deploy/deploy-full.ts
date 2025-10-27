/*
  Deploy runner (scaffold) for EnhancedWhaleDeployment
  - Intentionally minimal in Task 4; we will implement actual deployment orchestration in Task 5.
  - Usage (for now): ts-node scripts/deploy/deploy-full.ts --network 0g-testnet
*/

import path from "path";
import { writeDeployment, AddressBook } from "../lib/writer.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.substring(2);
      const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : "true";
      out[key] = val;
      if (val !== "true") i++;
    }
  }
  return out;
}

function getOutFilename(network: string) {
  const map: Record<string, string> = {
    "0g-testnet": "0g-testnet.json",
    "0g-mainnet": "0g-mainnet.json",
    hardhat: "local.json",
    localhost: "local.json",
  };
  return map[network] || `${network}.json`;
}

async function main() {
  const args = parseArgs();
  const network = (args.network || process.env.HARDHAT_NETWORK || "0g-testnet").toString();

  console.log(`[deploy-full] Selected network: ${network}`);
  console.log(`
Next step (Task 5 will automate this):
  npx hardhat ignition deploy ./ignition/modules/EnhancedDeployment.ts --network ${network}

Optionally pass parameters via Ignition if you want to override defaults, e.g.:
  --parameters '{"launchFee":"1000000000000000","jarinneRouter":"0x...","jarinneDexFactory":"0x..."}'
`);

  // Placeholder write (no addresses yet). This ensures the folder exists.
  const addresses: AddressBook = {
    network,
    chainId: network === "0g-mainnet" ? 16661 : network === "0g-testnet" ? 16602 : 31337,
    contracts: {},
  };
  const repoRoot = path.resolve(__dirname, "../../..");
  const outFile = getOutFilename(network);
  writeDeployment(repoRoot, outFile, addresses);

  console.log(`[deploy-full] Placeholder deployment file written: contracts/deployments/${outFile}`);
  console.log(`[deploy-full] After deployment, we will update this file with actual contract addresses (Task 5).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
