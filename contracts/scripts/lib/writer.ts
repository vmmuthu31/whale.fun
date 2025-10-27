import fs from "fs";
import path from "path";

export type AddressBook = {
  network: string;
  chainId: number;
  contracts: Record<string, string>;
};

export function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function writeJson(filePath: string, data: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`[writer] wrote ${filePath}`);
}

export function writeDeployment(
  rootDir: string,
  filename: string,
  addresses: AddressBook
) {
  const out = path.join(rootDir, "contracts", "deployments", filename);
  writeJson(out, addresses);
}
