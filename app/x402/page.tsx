'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Header from "@/components/layout/Header";
import { formatEther } from 'ethers';

import { BrowserProvider } from "ethers";
import { useAccount, useWalletClient, useChainId } from 'wagmi';
import { getX402Client } from "@/lib/x402-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

interface TokenData {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  owner: string;
  createdAt: number;
  imageUrl: string;
  address: string;
}

export default function X402ListingPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();
  
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // Form state
  const [newName, setNewName] = useState('');
  const [newSymbol, setNewSymbol] = useState('');
  const [newSupply, setNewSupply] = useState('1000000');
  const [newImage, setNewImage] = useState('');

  const fetchTokens = async () => {
    try {
      const response = await fetch('/api/x402/tokens');
      const data = await response.json();
      if (data.success) {
        setTokens(data.tokens);
      }
    } catch (error) {
      console.error('Failed to fetch tokens', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokens();
  }, []);

  const handleCreateToken = async () => {
    if (!newName || !newSymbol || !newSupply) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (!walletClient || !address) {
      toast.error("Wallet connection required");
      return;
    }

    setCreating(true);
    try {
      const provider = new BrowserProvider(walletClient);
      const signer = await provider.getSigner();
      const x402Client = getX402Client();
      const apiUrl = new URL('/api/x402/create', window.location.origin).toString();

      toast.info("Initiating token creation...");

      const response = await x402Client.makePaymentProtectedRequest(
        apiUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newName,
            symbol: newSymbol,
            initialSupply: newSupply,
            imageUrl: newImage,
            owner: address,
            chainId: chainId
          }),
        },
        address,
        signer
      );

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success("Token created successfully!");
        setShowCreateDialog(false);
        // Reset form
        setNewName('');
        setNewSymbol('');
        setNewSupply('1000000');
        setNewImage('');
        // Refresh list
        fetchTokens();
        // Navigate to new token
        if (data.tokenAddress) {
            router.push(`/x402/${data.tokenAddress}`);
        }
      } else {
        toast.error(data.message || "Failed to create token");
      }
    } catch (error) {
      console.error("Creation error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create token");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">X402 Tokens</h1>
            <Button onClick={() => setShowCreateDialog(true)} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="mr-2 h-4 w-4" /> Create Token
            </Button>
        </div>
        
        {loading ? (
          <div>Loading tokens...</div>
        ) : tokens.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-500 mb-4">No tokens found.</p>
            <Button onClick={() => setShowCreateDialog(true)}>Create the first token</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tokens.map((token) => (
              <Card 
                key={token.address} 
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => router.push(`/x402/${token.address}`)}
              >
                <CardContent className="p-6">
                  <div className="flex items-center space-x-4 mb-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={token.imageUrl} alt={token.name} />
                      <AvatarFallback>{token.symbol.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="text-xl font-bold">{token.name}</h3>
                      <p className="text-gray-500">{token.symbol}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex justify-between">
                      <span>Supply:</span>
                      <span>{parseFloat(formatEther(token.totalSupply)).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Address:</span>
                      <span className="font-mono">{token.address.slice(0, 6)}...{token.address.slice(-4)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Token</DialogTitle>
            <DialogDescription>
              Launch your own token on the X402 protocol. A fee of 0.1 tokens is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Token Name</Label>
              <Input id="name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. My Token" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="symbol">Token Symbol</Label>
              <Input id="symbol" value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} placeholder="e.g. MTK" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supply">Initial Supply</Label>
              <Input id="supply" type="number" value={newSupply} onChange={(e) => setNewSupply(e.target.value)} placeholder="1000000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="image">Image URL (Optional)</Label>
              <Input id="image" value={newImage} onChange={(e) => setNewImage(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateToken} disabled={creating}>
              {creating ? 'Creating...' : 'Create Token (0.1 Fee)'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}