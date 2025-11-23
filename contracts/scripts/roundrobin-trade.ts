import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  Address,
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

// Curated mock token profiles for nicer demo names & metadata
const MOCK_PROFILES = [
  {
    name: "Aqua Orca",
    symbol: "ORCA",
    description: "Ocean-born memecoin riding tidal hype.",
    logoUrl: "https://i.imgur.com/3Qv2PjW.png",
    communitySize: 4200,
  },
  {
    name: "Laser Llama",
    symbol: "LLAMA",
    description: "Chill vibes. Hot lasers. DeFi herder.",
    logoUrl: "https://i.imgur.com/9qv2pFQ.png",
    communitySize: 6800,
  },
  {
    name: "Nebula Cat",
    symbol: "NEKO",
    description: "Cosmic feline exploring yield galaxies.",
    logoUrl: "https://i.imgur.com/7nq0s5d.png",
    communitySize: 12000,
  },
  {
    name: "Whale Wink",
    symbol: "WINK",
    description: "Big brain whale with diamond fins.",
    logoUrl: "https://i.imgur.com/2hTzZmi.png",
    communitySize: 9500,
  },
  {
    name: "Pixel Penguin",
    symbol: "PXP",
    description: "On-chain tuxedo speedrunner.",
    logoUrl: "https://i.imgur.com/0qzVg2N.png",
    communitySize: 5100,
  },
  {
    name: "Turbo Toad",
    symbol: "TOAD",
    description: "Perpetual hop to ATH.",
    logoUrl: "https://i.imgur.com/6CwQ9aT.png",
    communitySize: 7700,
  },
  {
    name: "Meta Manta",
    symbol: "MANTA",
    description: "Gliding through liquidity streams.",
    logoUrl: "https://i.imgur.com/t2qB1mE.png",
    communitySize: 8300,
  },
  {
    name: "Zen Zebra",
    symbol: "ZEBRA",
    description: "Black & white clarity in markets.",
    logoUrl: "https://i.imgur.com/3h4rV3H.png",
    communitySize: 6100,
  },
  {
    name: "Rocket Raccoon",
    symbol: "RKTN",
    description: "Trash to treasure tokenomics.",
    logoUrl: "https://i.imgur.com/X9j0e1B.png",
    communitySize: 10400,
  },
  {
    name: "Cyber Shrimp",
    symbol: "SHRMP",
    description: "Small bags. Big energy.",
    logoUrl: "https://i.imgur.com/8D0b7cS.png",
    communitySize: 5600,
  },
  {
    name: "Meme Mako",
    symbol: "MAKO",
    description: "Fastest shark on the chain.",
    logoUrl: "https://i.imgur.com/5dR41Qy.png",
    communitySize: 9000,
  },
  {
    name: "Quantum Quokka",
    symbol: "QQ",
    description: "Always smiling. Always compounding.",
    logoUrl: "https://i.imgur.com/2m3r1hZ.png",
    communitySize: 4800,
  },
];

function profileForAddress(addr: string) {
  const seed = parseInt(addr.slice(2, 6), 16);
  const p = MOCK_PROFILES[seed % MOCK_PROFILES.length];
  // Add small variation to community size to avoid identical numbers
  const variance = seed % 1000;
  return { ...p, communitySize: p.communitySize + variance };
}

function args() {
  const out: Record<string, string | boolean | number> = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k.startsWith("--")) {
      const key = k.slice(2);
      const val = a[i + 1] && !a[i + 1].startsWith("--") ? a[i + 1] : "true";
      out[key] = val === "true" ? true : isNaN(Number(val)) ? val : Number(val);
      if (val !== "true") i++;
    }
  }
  return out;
}

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

function randBetween(min: bigint, max: bigint) {
  if (max <= min) return min;
  const r = Math.random();
  const diff = max - min;
  return min + BigInt(Math.floor(Number(diff) * r));
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function waitForReceiptRobust(
  publicClient: ReturnType<typeof createPublicClient>,
  hash: `0x${string}`
) {
  // First try a normal wait with generous timeout
  try {
    return await publicClient.waitForTransactionReceipt({
      hash,
      pollingInterval: 1500,
      timeout: 90_000,
    });
  } catch (e) {
    // Fall back to manual polling to handle flaky -32000 responses
  }
  const start = Date.now();
  const deadline = start + 120_000; // 2 minutes
  while (Date.now() < deadline) {
    try {
      const rcpt = await publicClient.getTransactionReceipt({ hash });
      return rcpt;
    } catch (err) {
      // -32000 no matching receipts found -> keep polling
    }
    await sleep(2000);
  }
  throw new Error(`Timeout waiting for receipt ${hash}`);
}

async function main() {
  const a = args();
  const network = (a.network as string) || "0g-testnet";
  const simulate = Boolean(a.simulate === true || a.simulate === "true");
  // Actions configuration: fixed via --actions or random per wallet between [actionsMin, actionsMax]
  const actionsFixed = (a.actions as number) || undefined;
  const actionsMin = (a.actionsMin as number) || 20;
  const actionsMax = (a.actionsMax as number) || 30;
  const minEth = a.minEth ? parseEther(String(a.minEth)) : parseEther("0.001");
  const maxEth = a.maxEth ? parseEther(String(a.maxEth)) : parseEther("0.0012");
  const fundAmountWei = a.fundAmount
    ? parseEther(String(a.fundAmount))
    : undefined; // e.g., --fundAmount 0.1

  if (network !== "localhost" && !simulate) {
    if ((process.env.CONFIRM || "").toLowerCase() !== "true") {
      throw new Error(
        "CONFIRM=true is required in .env for non-local actions. Use --simulate for dry-run."
      );
    }
  }

  const rootPk = (
    process.env.ROOT_PRIVATE_KEY ||
    process.env.PRIVATE_KEY ||
    ""
  ).replace(/^0x/, "");
  if (!rootPk)
    throw new Error("ROOT_PRIVATE_KEY/PRIVATE_KEY is required in .env");
  const secondaryList = (process.env.SECONDARY_PRIVATE_KEYS || "")
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((s) => s.replace(/^0x/, ""));
  if (secondaryList.length === 0)
    throw new Error(
      "SECONDARY_PRIVATE_KEYS required in .env (CSV of private keys)"
    );

  const chain = zeroGTestnet;
  const publicClient = createPublicClient({ chain, transport: http() });
  const rootAccount = privateKeyToAccount(`0x${rootPk}`);
  const rootWallet = createWalletClient({
    account: rootAccount,
    chain,
    transport: http(),
  });

  const wallets = [
    rootAccount,
    ...secondaryList.map((pk) => privateKeyToAccount(`0x${pk}`)),
  ];
  const walletClients = new Map<
    Address,
    ReturnType<typeof createWalletClient>
  >();
  walletClients.set(
    rootAccount.address,
    createWalletClient({ account: rootAccount, chain, transport: http() })
  );
  for (const w of wallets.slice(1)) {
    walletClients.set(
      w.address,
      createWalletClient({ account: w, chain, transport: http() })
    );
  }

  console.log(
    `[rr] Network=${network} Wallets=${wallets.length} actions=${
      actionsFixed ?? `${actionsMin}-${actionsMax} (random per wallet)`
    } simulate=${simulate}`
  );
  if (fundAmountWei)
    console.log(
      `[rr] Auto-fund enabled: target per secondary wallet = ${fundAmountWei} wei`
    );

  // Paths
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, "../..");
  const deploymentsDir = path.join(repoRoot, "contracts", "deployments");
  const artifactsDir = path.join(
    repoRoot,
    "contracts",
    "artifacts",
    "contracts"
  );

  // Load latest deployment JSON
  const files = fs
    .readdirSync(deploymentsDir)
    .filter((f) => f.startsWith(`${network}-`) && f.endsWith(".json"))
    .sort(
      (a, b) =>
        fs.statSync(path.join(deploymentsDir, b)).mtimeMs -
        fs.statSync(path.join(deploymentsDir, a)).mtimeMs
    );
  if (files.length === 0) throw new Error(`No deployment file for ${network}`);
  const deployment = JSON.parse(
    fs.readFileSync(path.join(deploymentsDir, files[0]), "utf8")
  );

  const TokenFactoryAddr = deployment.contracts.TokenFactory as `0x${string}`;
  const WhaleTokenAddr = deployment.contracts.WhaleToken as `0x${string}`;
  const TradingEngineAddr = deployment.contracts.TradingEngine as `0x${string}`;
  const DashboardAddr = deployment.contracts
    .DashboardDataProvider as `0x${string}`;

  const tfArtifact = JSON.parse(
    fs.readFileSync(
      path.join(artifactsDir, "TokenFactoryRoot.sol", "TokenFactory.json"),
      "utf8"
    )
  );
  const ctArtifact = JSON.parse(
    fs.readFileSync(
      path.join(artifactsDir, "CreatorToken.sol", "CreatorToken.json"),
      "utf8"
    )
  );
  const teArtifact = JSON.parse(
    fs.readFileSync(
      path.join(
        artifactsDir,
        "TradingEngineEnhanced.sol",
        "TradingEngineEnhanced.json"
      ),
      "utf8"
    )
  );
  const ddpArtifact = JSON.parse(
    fs.readFileSync(
      path.join(
        artifactsDir,
        "DashboardDataProvider.sol",
        "DashboardDataProvider.json"
      ),
      "utf8"
    )
  );

  const tokenFactory = getContract({
    address: TokenFactoryAddr,
    abi: tfArtifact.abi,
    client: { public: publicClient },
  });
  const tradingEngine = getContract({
    address: TradingEngineAddr,
    abi: teArtifact.abi,
    client: { public: publicClient },
  });
  const dashboard = getContract({
    address: DashboardAddr,
    abi: ddpArtifact.abi,
    client: { public: publicClient },
  });

  // Optional: fund secondary wallets up to fundAmountWei
  if (fundAmountWei && !simulate) {
    console.log(
      `[fund] Checking secondary wallets for top-up to ${fundAmountWei} wei`
    );
    for (const w of wallets.slice(1)) {
      // exclude root
      const bal = await publicClient.getBalance({ address: w.address });
      console.log(`[fund] ${w.address} current balance = ${bal} wei`);
      if (bal < fundAmountWei) {
        const needed = fundAmountWei - bal;
        const to = w.address;
        const hash = await rootWallet.sendTransaction({
          account: rootAccount,
          chain,
          to,
          value: needed,
        });
        console.log(`[fund] Sent ${needed} wei to ${to} tx=${hash}`);
        await publicClient.waitForTransactionReceipt({ hash });
      } else {
        console.log(`[fund] No top-up needed for ${w.address}`);
      }
    }
  }

  // Collect existing tokens only (no creation now)
  const collected: Address[] = [];
  for (const w of wallets) {
    const tokens = (await publicClient.readContract({
      address: TokenFactoryAddr,
      abi: tfArtifact.abi,
      functionName: "getCreatorTokens",
      args: [w.address],
    })) as `0x${string}`[];
    for (const t of tokens) collected.push(t as Address);
  }

  // Unique token list
  let tokensAll = Array.from(new Set(collected)) as Address[];
  // Never include WhaleToken in tradable tokens set
  tokensAll = tokensAll.filter(
    (t) => t.toLowerCase() !== (WhaleTokenAddr as string).toLowerCase()
  );

  // If no wallet-owned tokens found, fallback to factory-wide tokens (both simulate and real runs)
  if (tokensAll.length === 0) {
    try {
      const all = (await publicClient.readContract({
        address: TokenFactoryAddr,
        abi: tfArtifact.abi,
        functionName: "getAllTokens",
        args: [],
      })) as Address[];
      tokensAll = all
        .filter(
          (t) => t.toLowerCase() !== (WhaleTokenAddr as string).toLowerCase()
        )
        .slice(0, 20); // cap for sanity
      console.log(`[rr] Using factory tokens fallback: ${tokensAll.length}`);
    } catch {
      // ignore
    }
  }

  console.log(`[rr] Tokens prepared: ${tokensAll.length}`);

  if (tokensAll.length === 0) {
    console.log(
      `[rr] No tokens available to trade. In simulate mode, either pre-create tokens (real run) or ensure factory has tokens.`
    );
    console.log(`[rr] Exiting.`);
    return;
  }

  // Helper: compute tokenAmount for target ETH (buy)
  async function solveBuyTokenAmount(
    token: Address,
    ethBudget: bigint
  ): Promise<{ tokenAmount: bigint; cost: bigint } | null> {
    // Use current price and remaining supply to bound the search space
    const stats = (await publicClient.readContract({
      address: token,
      abi: ctArtifact.abi,
      functionName: "getTokenStats",
      args: [],
    })) as readonly [bigint, bigint, bigint, bigint, bigint, bigint];
    const totalSupply = stats[0];
    const totalSold = stats[1];
    const currentPrice = stats[2];
    const remaining = totalSupply > totalSold ? totalSupply - totalSold : 0n;

    if (remaining === 0n || currentPrice === BigInt(0)) return null;

    // Rough estimate: budget / price (in 1e18 precision)
    let estimate = (ethBudget * 10n ** 18n) / currentPrice;
    if (estimate <= BigInt(0)) estimate = 1n;

    // Hard cap max tokens per buy to avoid heavy curve evals on RPC
    const MAX_TOKENS_PER_BUY = parseUnits("2", 18); // 2 tokens max per buy
    // Give some headroom but clamp to remaining and cap
    let hi = estimate * 2n;
    if (hi > remaining) hi = remaining;
    if (hi > MAX_TOKENS_PER_BUY) hi = MAX_TOKENS_PER_BUY;
    if (hi <= BigInt(0)) hi = 1n;

    // Binary search between [1, hi]
    let lo = 1n;
    let best: { tokenAmount: bigint; cost: bigint } | null = null;
    let oogCount = 0;
    for (let i = 0; i < 32 && lo <= hi; i++) {
      const mid = (lo + hi) / 2n;
      let cost: bigint | null = null;
      try {
        cost = (await publicClient.readContract({
          address: token,
          abi: ctArtifact.abi,
          functionName: "calculateBuyCost",
          args: [mid],
        })) as bigint;
      } catch (e) {
        // If RPC fails (e.g., out of gas in eth_call), shrink search space aggressively
        oogCount++;
        if (oogCount >= 2) {
          // Fall back to trying exactly 1 token
          try {
            const oneCost = (await publicClient.readContract({
              address: token,
              abi: ctArtifact.abi,
              functionName: "calculateBuyCost",
              args: [1n * 10n ** 18n],
            })) as bigint;
            if (oneCost <= ethBudget)
              return { tokenAmount: 1n * 10n ** 18n, cost: oneCost };
            return null; // even 1 token exceeds budget
          } catch {
            return null;
          }
        }
        hi = mid - 1n;
        continue;
      }
      if (cost <= ethBudget) {
        best = { tokenAmount: mid, cost };
        lo = mid + 1n;
      } else {
        if (mid === BigInt(0)) break;
        hi = mid - 1n;
      }
    }
    // Final check: ensure best within budget; otherwise, try 1 token
    if (!best) {
      try {
        const oneCost = (await publicClient.readContract({
          address: token,
          abi: ctArtifact.abi,
          functionName: "calculateBuyCost",
          args: [1n * 10n ** 18n],
        })) as bigint;
        if (oneCost <= ethBudget)
          return { tokenAmount: 1n * 10n ** 18n, cost: oneCost };
      } catch {}
    }
    return best;
  }

  // Helper: compute tokenAmount for target ETH (sell)
  async function solveSellTokenAmount(
    token: Address,
    ethTarget: bigint,
    maxAvailable: bigint
  ): Promise<{ tokenAmount: bigint; proceed: bigint } | null> {
    if (maxAvailable === BigInt(0)) return null;
    let lo = BigInt(1);
    let hi = maxAvailable;
    let best: { tokenAmount: bigint; proceed: bigint } | null = null;

    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / BigInt(2);
      const proceed = (await publicClient.readContract({
        address: token,
        abi: ctArtifact.abi,
        functionName: "calculateSellPrice",
        args: [mid],
      })) as bigint;
      if (proceed <= ethTarget) {
        best = { tokenAmount: mid, proceed };
        lo = mid + 1n;
      } else {
        hi = mid - 1n;
      }
      if (lo > hi) break;
    }
    return best;
  }

  // Interleaved random trading across wallets
  const actionsPlan = new Map<Address, number>();
  for (const w of wallets) {
    const n =
      actionsFixed ??
      Math.floor(Math.random() * (actionsMax - actionsMin + 1)) + actionsMin;
    actionsPlan.set(w.address, n);
    console.log(`[rr] Wallet ${w.address} planned actions=${n}`);
  }

  // Pick a random wallet each action to avoid linear order, until all actions complete
  while ([...actionsPlan.values()].some((n) => n > 0)) {
    const active = wallets
      .map((w) => w.address)
      .filter((a) => (actionsPlan.get(a) || 0) > 0);
    if (active.length === 0) break;
    const addr = active[Math.floor(Math.random() * active.length)];
    const remaining = actionsPlan.get(addr) || 0;

    const w = wallets.find((wa) => wa.address === addr)!;
    const wc = walletClients.get(w.address)!;
    const token = tokensAll[Math.floor(Math.random() * tokensAll.length)];
    if (!token) {
      actionsPlan.set(addr, remaining - 1);
      await sleep(200);
      continue;
    }
    const isBuy = Math.random() < 0.5;
    const ethAmt = randBetween(minEth, maxEth);

    const tokenContract = getContract({
      address: token,
      abi: ctArtifact.abi,
      client: { public: publicClient, wallet: wc },
    });

    let success = false;
    if (isBuy) {
      const solved = await solveBuyTokenAmount(token, ethAmt);
      if (!solved || solved.tokenAmount === BigInt(0)) {
        console.log(
          `[skip][buy] ${w.address} token=${token} reason=no-solution for ~${ethAmt} wei`
        );
      } else {
        console.log(
          `[buy] ${w.address} token=${token} eth~${ethAmt} sends=${solved.cost} for tokens=${solved.tokenAmount}`
        );
        if (!simulate) {
          const hash = await tokenContract.write.buyTokens(
            [solved.tokenAmount],
            { account: w, chain, value: solved.cost }
          );
          console.log(`[tx:buy] ${hash}`);
          await waitForReceiptRobust(publicClient, hash);
        }
        success = true;
      }
    } else {
      const bal = (await publicClient.readContract({
        address: token,
        abi: ctArtifact.abi,
        functionName: "balanceOf",
        args: [w.address],
      })) as bigint;
      if (bal === BigInt(0)) {
        console.log(
          `[skip][sell] ${w.address} token=${token} reason=no-balance`
        );
      } else {
        const solved = await solveSellTokenAmount(token, ethAmt, bal);
        if (!solved || solved.tokenAmount === BigInt(0)) {
          console.log(
            `[skip][sell] ${w.address} token=${token} reason=no-solution for ~${ethAmt} wei; bal=${bal}`
          );
        } else {
          console.log(
            `[sell] ${w.address} token=${token} targetETH~${ethAmt} selling=${solved.tokenAmount} expect>=${solved.proceed}`
          );
          if (!simulate) {
            const hash = await tokenContract.write.sellTokens(
              [solved.tokenAmount],
              { account: w, chain }
            );
            console.log(`[tx:sell] ${hash}`);
            await waitForReceiptRobust(publicClient, hash);
          }
          success = true;
        }
      }
    }

    actionsPlan.set(addr, remaining - 1);
    // After a successful buy/sell, wait 30s to reduce RPC load; otherwise a tiny 200ms to avoid bursts
    await sleep(success ? 30_000 : 200);
  }

  // Final summaries
  console.log("\n=== TOKEN SUMMARIES ===");
  for (const t of tokensAll) {
    try {
      const stats = (await publicClient.readContract({
        address: t,
        abi: ctArtifact.abi,
        functionName: "getTokenStats",
        args: [],
      })) as readonly [bigint, bigint, bigint, bigint, bigint, bigint];
      const tradeStats = (await publicClient.readContract({
        address: TradingEngineAddr,
        abi: teArtifact.abi,
        functionName: "getTokenTradingStats",
        args: [t],
      })) as readonly [
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint
      ];
      const [
        totalSupply,
        totalSold,
        currentPrice,
        marketCap,
        holderCount,
        creatorFees,
      ] = stats;
      const [
        totalVolume,
        dailyVolume,
        weeklyVolume,
        totalTrades,
        uniqueTraders,
        averageTradeSize,
        priceChange24h,
        allTimeHigh,
        allTimeLow,
      ] = tradeStats;
      console.log(`- token ${t}`);
      console.log(
        `    supply=${totalSupply} sold=${totalSold} price=${currentPrice} mcap=${marketCap} holders=${holderCount} fees=${creatorFees}`
      );
      console.log(
        `    vol24h=${dailyVolume} vol7d=${weeklyVolume} totalVol=${totalVolume} trades=${totalTrades} traders=${uniqueTraders}`
      );
      console.log(
        `    avgTrade=${averageTradeSize} price24h=${priceChange24h} ath=${allTimeHigh} atl=${allTimeLow}`
      );
    } catch (e) {
      console.log(`- token ${t}: summary fetch failed`);
    }
  }

  console.log("\n=== WALLET SUMMARIES ===");
  for (const w of wallets) {
    const balEth = await publicClient.getBalance({ address: w.address });
    console.log(`- ${w.address} ETH=${balEth}`);
    for (const t of tokensAll) {
      const bal = (await publicClient.readContract({
        address: t,
        abi: ctArtifact.abi,
        functionName: "balanceOf",
        args: [w.address],
      })) as bigint;
      if (bal > BigInt(0)) console.log(`    token ${t} balance=${bal}`);
    }
  }

  console.log("\n[rr] Done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
