import dotenv from "dotenv";

dotenv.config();

export type Env = {
  rpcTestnet?: string;
  rpcMainnet?: string;
  rootPrivateKey?: string;
  secondaryPrivateKeys: string[];
  fundPerWalletWei?: bigint;
  confirm?: boolean;
};

export function getEnv(): Env {
  const secondary = (process.env.SECONDARY_PRIVATE_KEYS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const fundWei = process.env.FUND_PER_WALLET_WEI
    ? BigInt(process.env.FUND_PER_WALLET_WEI)
    : undefined;

  return {
    rpcTestnet: process.env.RPC_0G_TESTNET,
    rpcMainnet: process.env.RPC_0G_MAINNET,
    rootPrivateKey: process.env.ROOT_PRIVATE_KEY || process.env.PRIVATE_KEY,
    secondaryPrivateKeys: secondary,
    fundPerWalletWei: fundWei,
    confirm: (process.env.CONFIRM || "").toLowerCase() === "true",
  };
}
