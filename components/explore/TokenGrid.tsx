"use client";

import React from "react";
import TokenCard from "./TokenCard";
import {
  type TokenData,
  tokenDataService,
} from "@/lib/services/TokenDataService";

interface TokenGridProps {
  tokens: TokenData[];
}

const TokenGrid = ({ tokens }: TokenGridProps) => {
  // Convert TokenData to the format expected by TokenCard
  const DEFAULT_IMG =
    "https://purple-voluntary-minnow-145.mypinata.cloud/ipfs/bafkreiadbzvwwngz3kvk5ut75gdzlbpklxokyacpysotogltergnkhx7um";

  const toHttpImage = (url?: string): string => {
    if (!url || !url.trim()) return DEFAULT_IMG;
    const trimmed = url.trim();
    if (trimmed.startsWith("ipfs://")) {
      return `https://purple-voluntary-minnow-145.mypinata.cloud/ipfs/${trimmed.slice(7)}`;
    }
    if (trimmed.startsWith("ipfs/")) {
      return `https://purple-voluntary-minnow-145.mypinata.cloud/ipfs/${trimmed}`;
    }
    // If it doesn't look like a normal URL or data URI, use default
    if (
      !/^https?:\/\//i.test(trimmed) &&
      !/^data:image\//i.test(trimmed) &&
      !/^\//.test(trimmed)
    ) {
      return DEFAULT_IMG;
    }
    return trimmed;
  };

  const formattedTokens = tokens.map((token) => ({
    id: token.id,
    name: token.name,
    symbol: token.symbol,
    image: toHttpImage(token.logoUrl),
    priceChange: token.priceChange,
    priceValue: token.priceValue,
    currentPrice: tokenDataService.formatCurrentPrice(token.currentPrice),
    marketCap: tokenDataService.formatMarketCap(token.marketCap),
    volume: `${tokenDataService.formatVolume(token.dailyVolume)} vol`,
    age: tokenDataService.formatLaunchTime(token.launchTime),
    isLive: token.isLive,
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative ">
      {formattedTokens.map((token, idx) => (
        <TokenCard key={token.id} token={token} index={idx} />
      ))}
    </div>
  );
};

export default TokenGrid;
