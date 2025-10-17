"use client";

import React, { useState, useEffect, useMemo } from "react";
import Header from "@/components/layout/Header";
import SearchAndFilter from "@/components/explore/SearchAndFilter";
import CreateTokenButton from "@/components/explore/CreateTokenButton";
import TokenGrid from "@/components/explore/TokenGrid";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { toast } from "sonner";
import { formatEther } from "ethers";
import {
  tokenDataService,
  type TokenData,
} from "@/lib/services/TokenDataService";
import { switchNetwork, SUPPORTED_NETWORKS } from "@/utils/Blockchain";

const ExplorePage = () => {
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");

  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();

  useEffect(() => {
    fetchTokens();
  }, []);

  // Check network and balance when component mounts or when chain/address changes
  useEffect(() => {
    const checkNetworkAndBalance = async () => {
      // Check and switch network if needed
      if (address && chainId && chainId !== 16661) {
        try {
          await switchNetwork(16661);
          toast.success("Network switched to 0G Network");
        } catch (err) {
          toast.error("Please switch network", {
            description: "This app requires 0G Network to function properly",
          });
        }
      }

      // Check balance if connected
      if (address && publicClient) {
        try {
          const minBalance = BigInt("10000000000000000"); // 0.01 ETH minimum for quick buy
          const balance = await publicClient.getBalance({ address });
          if (balance < minBalance) {
            toast.warning("Low balance", {
              description: `You need at least 0.01 ${
                SUPPORTED_NETWORKS[16661]?.currencySymbol || "ETH"
              } to perform quick buy actions`,
              duration: 5000,
            });
          }
        } catch (err) {
          console.warn("Failed to check initial balance:", err);
        }
      }
    };

    checkNetworkAndBalance();
  }, [address, chainId, publicClient]);

  // Memoized filtered tokens for better performance
  const filteredTokens = useMemo(() => {
    let filtered = [...tokens];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (token) =>
          token.name.toLowerCase().includes(query) ||
          token.symbol.toLowerCase().includes(query) ||
          token.description.toLowerCase().includes(query)
      );
    }

    // Apply category filter
    switch (selectedFilter) {
      case "recent":
        // Sort by launch time (most recent first)
        filtered = filtered.sort((a, b) => Number(b.launchTime - a.launchTime));
        break;
      case "high-volume":
        // Sort by daily volume (highest first)
        filtered = filtered.sort((a, b) =>
          Number(b.dailyVolume - a.dailyVolume)
        );
        break;
      case "low-price":
        // Sort by current price (lowest first)
        filtered = filtered.sort((a, b) =>
          Number(a.currentPrice - b.currentPrice)
        );
        break;
      case "high-price":
        // Sort by current price (highest first)
        filtered = filtered.sort((a, b) =>
          Number(b.currentPrice - a.currentPrice)
        );
        break;
      case "all":
      default:
        // No additional sorting, keep original order
        break;
    }

    return filtered;
  }, [tokens, searchQuery, selectedFilter]);

  const fetchTokens = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log("Starting to fetch tokens...");

      // For explore page, we don't need wallet connection
      // Use default mainnet chain ID since this is public data
      const chainId = 16661; // 0G Mainnet
      console.log("Using chain ID:", chainId);

      // Fetch tokens data
      const tokensData = await tokenDataService.getAllTokensData(chainId);
      console.log("Fetched tokens data:", tokensData);

      setTokens(tokensData);
    } catch (err: any) {
      console.error("Error fetching tokens:", err);
      setError(err.message || "Failed to fetch tokens");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchTokens();
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleFilterChange = (filter: string) => {
    setSelectedFilter(filter);
  };

  return (
    <div className="min-h-screen bg-white relative">
      <Header />

      {/* Main content with dotted background */}
      <div className="px-20 py-8 relative">
        {/* Dotted grid background */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle, #d1d5db 1px, transparent 1px)`,
            backgroundSize: "20px 20px",
          }}
        />

        {/* Search and Filter Section */}
        <div className="flex items-center justify-between mb-8 relative z-10">
          <SearchAndFilter
            onSearchChange={handleSearchChange}
            onFilterChange={handleFilterChange}
            searchQuery={searchQuery}
            selectedFilter={selectedFilter}
          />
          <CreateTokenButton />
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg relative z-10">
            <p className="text-sm text-red-700 mb-2">{error}</p>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12 relative z-10">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            <p className="mt-2 text-gray-600">Loading tokens...</p>
          </div>
        )}

        {/* Results Count */}
        {!loading && !error && tokens.length > 0 && (
          <div className="mb-4 relative z-10">
            <p className="text-sm text-gray-600">
              Showing {filteredTokens.length} of {tokens.length} tokens
              {searchQuery && <span> for &quot;{searchQuery}&quot;</span>}
              {selectedFilter !== "all" && (
                <span> • {selectedFilter.replace("-", " ")}</span>
              )}
            </p>
          </div>
        )}

        {/* Token Grid */}
        {!loading && !error && <TokenGrid tokens={filteredTokens} />}

        {/* Empty State */}
        {!loading && !error && tokens.length === 0 && (
          <div className="text-center py-12 relative z-10">
            <p className="text-gray-600 mb-4">No tokens found</p>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
            >
              Refresh
            </button>
          </div>
        )}

        {/* No Results State */}
        {!loading &&
          !error &&
          tokens.length > 0 &&
          filteredTokens.length === 0 && (
            <div className="text-center py-12 relative z-10">
              <p className="text-gray-600 mb-4">
                No tokens match your search criteria
              </p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedFilter("all");
                }}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
              >
                Clear filters
              </button>
            </div>
          )}
      </div>
    </div>
  );
};

export default ExplorePage;
