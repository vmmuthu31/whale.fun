import { getEnv } from "./env.js";


export type WalletConfig = {
  rootPrivateKey?: string;
  secondaryPrivateKeys: string[];
};

export function getWalletConfig(): WalletConfig {
  const env = getEnv();
  if (!env.rootPrivateKey) {
    console.warn("[wallets] ROOT_PRIVATE_KEY/PRIVATE_KEY not set in .env");
  }
  return {
    rootPrivateKey: env.rootPrivateKey,
    secondaryPrivateKeys: env.secondaryPrivateKeys,
  };
}
