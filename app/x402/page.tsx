'use client';

import React, { useEffect, useState } from 'react';
import { useAccount, useWalletClient, usePublicClient, useChainId, useBalance } from 'wagmi';
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { getX402Client } from "@/lib/x402-client";
import { BrowserProvider, ethers } from "ethers";
import { formatEther, parseEther } from 'ethers';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Copy, ArrowLeft, ExternalLink, LineChart, CandlestickChart } from "lucide-react";
import { FaGlobe, FaTelegramPlane } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { tokenDataService } from "@/lib/services/TokenDataService";
import { formatNumber, formatCurrency } from "@/utils/formatters";
import { toast } from "sonner";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Header from "@/components/layout/Header";

interface TradeResponse {
  success: boolean;
  txHash?: string;
  amount?: string;
  message?: string;
}

const X402_TOKEN_ADDRESS = '0x71A682D8029d031EB57Ba6BB02d3B37D486fffA4';
const CREATOR_ADDRESS = '0x95Cf028D5e86863570E300CAD14484Dc2068eB79';

// Mock token data that matches the TokenData interface
const X402_TOKEN_DATA = {
  id: X402_TOKEN_ADDRESS,
  address: X402_TOKEN_ADDRESS,
  name: 'X402 ZeroGravity Token',
  symbol: 'X402',
  description: 'X402 ZeroGravity Token for payment processing',
  logoUrl: 'https://i.imgur.com/your-x402-logo.png',
  creator: CREATOR_ADDRESS,
  launchTime: Math.floor(Date.now() / 1000),
  currentPrice: BigInt(0),
  marketCap: BigInt(0),
  totalSupply: BigInt(1000000 * 10**18), // 1M tokens with 18 decimals
  totalSold: BigInt(0),
  holderCount: BigInt(1),
  dailyVolume: BigInt(0),
  isLive: true,
  priceChange: '0.0%',
  priceValue: '0.00',
  age: '1 day',
  isExternal: true,
  chainId: 1
};
const TokenStat = ({
  name,
  percent,
  votes,
  eth,
  selected,
  onClick,
}: {
  name: string;
  percent: string;
  votes: string;
  eth: string;
  selected?: boolean;
  onClick?: () => void;
}) => (
  <Card
    onClick={onClick}
    className={`group flex-1 border-dashed cursor-pointer transition-colors duration-200 ${
      selected ? 'bg-[#B65FFF]' : 'bg-white hover:bg-[#DAADFF]'
    }`}
  >
    <CardContent className="p-6 text-center">
      <p className={`text-xs uppercase tracking-wider transition-colors duration-200 ${
        selected ? 'text-white' : 'text-[#0000004D] group-hover:text-white'
      }`}>
        {name}
      </p>
      <p className={`text-2xl font-extrabold transition-colors duration-200 ${
        selected ? 'text-white' : 'text-[#B65FFF] group-hover:text-white'
      }`}>
        {percent}
      </p>
      <div className="mt-3">
        <span className={`text-5xl leading-none font-black transition-colors duration-200 ${
          selected ? 'text-white' : 'text-gray-900 group-hover:text-white'
        }`}>
          {votes}
        </span>
      </div>
      <p className={`mt-2 text-xs transition-colors duration-200 ${
        selected ? 'text-white' : 'text-gray-900 group-hover:text-white'
      }`}>
        {eth}
      </p>
    </CardContent>
  </Card>
);

export default function X402TokenPage() {
  // Hooks
  const router = useRouter();
  const { address, isConnected, chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  
  // State
  const [amount, setAmount] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [tokenData, setTokenData] = useState(X402_TOKEN_DATA);
  const [userBalance, setUserBalance] = useState<bigint>(BigInt(0));
  const [showBuyDialog, setShowBuyDialog] = useState<boolean>(false);
  const [showSellDialog, setShowSellDialog] = useState<boolean>(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);
  
  // Fetch token data, user balance, and holder count
  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('Fetching token data...');
        console.log('Connected address:', address);
        console.log('Token address:', X402_TOKEN_ADDRESS);
        
        // In a real implementation, you would fetch this from your API or contract
        // For now, we're using the mock data
        setTokenData(X402_TOKEN_DATA);
        
        if (address && publicClient) {
          try {
            console.log('Fetching balance for address:', address);
            
            // First, let's just fetch the balance to debug
            const balance = await publicClient.readContract({
              address: X402_TOKEN_ADDRESS as `0x${string}`,
              abi: [{
                inputs: [{ name: 'owner', type: 'address' }],
                name: 'balanceOf',
                outputs: [{ name: '', type: 'uint256' }],
                stateMutability: 'view',
                type: 'function',
              }],
              functionName: 'balanceOf',
              args: [address as `0x${string}`]
            });
            
            console.log('Raw balance from contract:', balance);
            setUserBalance(BigInt(balance.toString()));
            
            // Now fetch other data
            const [totalSupply, holderCount] = await Promise.all([
              publicClient.readContract({
                address: X402_TOKEN_ADDRESS as `0x${string}`,
                abi: [{
                  inputs: [],
                  name: 'totalSupply',
                  outputs: [{ name: '', type: 'uint256' }],
                  stateMutability: 'view',
                  type: 'function',
                }],
                functionName: 'totalSupply'
              }),
              // Try to fetch holder count if the contract has this function
              (async () => {
                try {
                  // First try the standard ERC20 way (if the contract implements it)
                  const holders = await publicClient.readContract({
                    address: X402_TOKEN_ADDRESS as `0x${string}`,
                    abi: [{
                      inputs: [],
                      name: 'getHolderCount',
                      outputs: [{ name: 'count', type: 'uint256' }],
                      stateMutability: 'view',
                      type: 'function',
                    }],
                    functionName: 'getHolderCount'
                  });
                  return BigInt(holders.toString());
                } catch (error) {
                  console.warn('Could not fetch holder count from contract, using fallback', error);
                  // Fallback to 1 if we can't get the count
                  return BigInt(1);
                }
              })()
            ]);
            
            console.log('Total supply:', totalSupply);
            console.log('Holder count:', holderCount);
            
            // Update token data with latest info
            setTokenData(prev => ({
              ...prev,
              totalSupply: BigInt(totalSupply.toString()),
              holderCount: BigInt(holderCount.toString())
            }));
            
          } catch (error) {
            console.error('Error fetching token data:', error);
            // Fallback to default values if there's an error
            setUserBalance(BigInt(0));
          }
        } else {
          console.log('No connected address or public client');
          // Reset balance if not connected
          setUserBalance(BigInt(0));
        }
      } catch (error) {
        console.error('Error in fetchData:', error);
      }
    };
    
    fetchData();
    
    // Set up an interval to refresh balance every 10 seconds
    const interval = setInterval(fetchData, 10000);
    
    // Clean up interval on component unmount
    return () => clearInterval(interval);
  }, [address, publicClient]);

  // Format number with commas and optional decimals
  const formatNumber = (num: number | string | bigint, decimals: number = 2): string => {
    const numValue = typeof num === 'bigint' ? Number(num) : Number(num);
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals
    }).format(numValue);
  };

  // Format token balance with 18 decimal places
  const formatTokenBalance = (balance: bigint): string => {
    return formatNumber(Number(balance) / 10**18, 2);
  };

  // Format token amount to wei
  const formatToWei = (amount: string): bigint => {
    return parseEther(amount);
  };

  const handleTradeBuy = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setMessage({ type: 'error', text: 'Please enter a valid amount' });
      return;
    }

    if (!walletClient || !address) {
      setMessage({ type: "error", text: "Wallet connection required" });
      return;
    }    

    setLoading(true);
    setMessage(null);

    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const x402Client = getX402Client();
      const apiUrl = new URL('/api/x402/buy', window.location.origin).toString();
      
      const response = await x402Client.makePaymentProtectedRequest(
        apiUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            walletAddress: address, 
            amount: parseFloat(amount).toString(), 
            chainId: chain?.id 
          }),
        },
        address,
        signer
      );

      const data: TradeResponse = await response.json();

      if (response.ok && data.success) {
        setMessage({
          type: "success",
          text: `Purchase successful! ${data.message}`,
        });
        setAmount("");
      } else {
        setMessage({
          type: "error",
          text: data.message || 'Failed to buy tokens',
        });
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTradeSell = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setMessage({ type: "error", text: "Please enter a valid amount" });
      return;
    }

    if (!walletClient || !address) {
      setMessage({ type: "error", text: "Wallet not connected" });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      if (!walletClient || !chain) {
        throw new Error('Wallet client or chain not available');
      }
      // Create a Web3Provider using the wallet client
      const provider = new BrowserProvider(walletClient);
      const signer = await provider.getSigner();
      const x402Client = getX402Client();

      // 1. Get token details
      const tokenAddress = '0x71A682D8029d031EB57Ba6BB02d3B37D486fffA4';
      // Basic ERC20 ABI - using minimal required functions
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          'function name() view returns (string)',
          'function symbol() view returns (string)',
          'function decimals() view returns (uint8)',
          'function balanceOf(address) view returns (uint256)',
          'function allowance(address owner, address spender) view returns (uint256)',
          'function approve(address spender, uint256 amount) returns (bool)'
        ],
        signer // Use signer instead of provider for write operations
      );

      // 2. Get token data and check balance
      // 2. Get token data and check balance
      const [name, symbol, decimals, balance] = await Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.decimals(),
        tokenContract.balanceOf(address)
      ]);
      
      // Generate a random nonce since the contract doesn't implement nonces()
      const nonce = ethers.hexlify(ethers.randomBytes(32));

      console.log('Token Details:', { name, symbol, decimals: Number(decimals) });
      console.log('Balance in wei:', balance.toString());
      console.log('Balance in tokens:', ethers.formatUnits(balance, decimals));
      
      const amountInWei = ethers.parseUnits(amount, decimals);
      console.log('Amount to sell in wei:', amountInWei.toString());
      console.log('Amount to sell in tokens:', amount);
      
      // Check if user has enough balance
      if (balance < amountInWei) {
        throw new Error(`Insufficient ${symbol} balance. You have ${ethers.formatUnits(balance, decimals)} ${symbol}, but trying to sell ${amount} ${symbol}`);
      }

      // 3. Get the spender address (the receiving contract)
      const spenderAddress = '0x71A682D8029d031EB57Ba6BB02d3B37D486fffA4';
      
      // 4. Check allowance and approve if needed
      const allowance = await tokenContract.allowance(address, spenderAddress);
      console.log('Current allowance in wei:', allowance.toString());
      console.log('Current allowance in tokens:', ethers.formatUnits(allowance, decimals));
      
      if (allowance < amountInWei) {
        setMessage({ type: 'info', text: 'Approving tokens for transfer...' });
        console.log('Sending approval transaction...');
        const approveTx = await tokenContract.approve(spenderAddress, amountInWei);
        console.log('Approval tx hash:', approveTx.hash);
        const receipt = await approveTx.wait();
        console.log('Approval confirmed in block:', receipt.blockNumber);
        
        // Verify the new allowance
        const newAllowance = await tokenContract.allowance(address, spenderAddress);
        console.log('New allowance in wei:', newAllowance.toString());
        console.log('New allowance in tokens:', ethers.formatUnits(newAllowance, decimals));
      } else {
        console.log('No need to approve, proceeding with transfer...');
      }
      setMessage({ type: 'success', text: 'Approval successful! Proceeding with transfer...' });
      
      // 5. Prepare EIP-712 signature data
      const validAfter = Math.floor(Date.now() / 1000);
      const validBefore = validAfter + 3600; // 1 hour validity

      const domain = {
        name,
        version: '1',
        chainId: chain.id,
        verifyingContract: tokenAddress
      };

      // The 'to' address should be the contract that will process the transfer
      // This is typically different from the spender address
      const receivingContract = '0x71A682D8029d031EB57Ba6BB02d3B37D486fffA4'; // TODO: Replace with the actual contract address that processes transfers
      
      // Prepare the transfer message
      const message = {
        from: address,
        to: receivingContract,
        value: amountInWei.toString(),
        validAfter,
        validBefore,
        nonce: nonce // Already in hex format
      };
      
      console.log('Transfer message:', message);

      const types = {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' }
        ]
      };

      // 5. Sign the typed data
      setMessage({ type: 'success', text: 'Please sign the message in your wallet...' });
      const signature = await signer.signTypedData(domain, types, message);
      const sig = ethers.Signature.from(signature);

      // 6. Send to API
      setMessage({ type: 'success', text: 'Processing your sale...' });
      const apiUrl = new URL('/api/x402/sell', window.location.origin).toString();
      const response = await x402Client.makePaymentProtectedRequest(
        apiUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: address,
            amount: amount, // Send the original token amount, not the wei amount
            chainId: chain.id,
            authorization: {
              ...message,
              v: sig.v,
              r: sig.r,
              s: sig.s
            }
          })
        },
        address,
        signer
      );

      const data: TradeResponse = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to process sale');
      }

      setMessage({
        type: "success",
        text: `Sale successful! ${data.message}`
      });
      setAmount("");
      
    } catch (err) {
      console.error('Sell error:', err);
      setMessage({
        type: "error",
        text: err instanceof Error ? 
          (err.message.includes('user rejected') ? 'Transaction was rejected' : err.message) : 
          "Failed to process sale"
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Token Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="col-span-2">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4 mb-6">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={tokenData.logoUrl} alt={tokenData.name} />
                  <AvatarFallback>{tokenData.symbol.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-2xl font-bold">{tokenData.name}</h2>
                  <p className="text-gray-600">${tokenData.priceValue} USD</p>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 mb-6">
                <TokenStat 
                  name="Price" 
                  percent={tokenData.priceChange} 
                  votes={tokenData.priceValue}
                  eth=""
                  selected
                />
                <TokenStat 
                  name="Market Cap" 
                  percent="" 
                  votes={tokenData.marketCap.toString()}
                  eth=""
                />
                <TokenStat 
                  name="Holders" 
                  percent="" 
                  votes={tokenData.holderCount ? tokenData.holderCount.toString() : '0'} 
                  eth={tokenData.symbol} 
                />
              </div>
              
              <div className="space-y-4">
                {isConnected && isClient && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Your Balance:</span>
                    <span className="font-medium" data-testid="user-balance">
                      {formatTokenBalance(userBalance)} {tokenData.symbol}
                    </span>
                  </div>
                )}
                
                <div className="flex space-x-4">
                  <Button 
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                    onClick={() => setShowBuyDialog(true)}
                  >
                    Buy {tokenData.symbol}
                  </Button>
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => setShowSellDialog(true)}
                    disabled={userBalance <= 0}
                  >
                    Sell {tokenData.symbol}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Price Chart Placeholder */}
          <Card>
            <CardContent className="p-6 h-full flex items-center justify-center">
              <div className="text-center text-gray-500">
                <LineChart className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>Price chart coming soon</p>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Token Details Tabs */}
        <div className="bg-white shadow rounded-lg overflow-hidden mb-8">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button className="border-b-2 border-blue-500 text-blue-600 py-4 px-6 font-medium">
                Overview
              </button>
              <button className="border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 py-4 px-6 font-medium">
                Transactions
              </button>
              <button className="border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 py-4 px-6 font-medium">
                Holders
              </button>
            </nav>
          </div>
          
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">About {tokenData.name}</h3>
            <p className="text-gray-600 mb-6">{tokenData.description}</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Token Information</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Contract</span>
                    <div className="flex items-center">
                      <span className="font-mono text-sm">
                        {`${tokenData.address.slice(0, 6)}...${tokenData.address.slice(-4)}`}
                      </span>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(tokenData.address);
                          toast.success('Address copied to clipboard');
                        }}
                        className="ml-2 text-gray-400 hover:text-gray-600"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <a 
                        href={`https://etherscan.io/address/${tokenData.address}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="ml-2 text-gray-400 hover:text-gray-600"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Creator</span>
                    <div className="flex items-center">
                      <span className="font-mono text-sm">
                        {`${tokenData.creator.slice(0, 6)}...${tokenData.creator.slice(-4)}`}
                      </span>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(tokenData.creator);
                          toast.success('Creator address copied to clipboard');
                        }}
                        className="ml-2 text-gray-400 hover:text-gray-600"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total Supply</span>
                    <span>{formatEther(tokenData.totalSupply)} {tokenData.symbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Decimals</span>
                    <span>18</span>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Socials</h4>
                <div className="flex space-x-4">
                  <a 
                    href="#" 
                    className="text-gray-400 hover:text-gray-600"
                    onClick={(e) => {
                      e.preventDefault();
                      toast.info('Website coming soon');
                    }}
                  >
                    <FaGlobe className="h-6 w-6" />
                  </a>
                  <a 
                    href="#" 
                    className="text-gray-400 hover:text-blue-500"
                    onClick={(e) => {
                      e.preventDefault();
                      toast.info('Twitter coming soon');
                    }}
                  >
                    <FaXTwitter className="h-6 w-6" />
                  </a>
                  <a 
                    href="#" 
                    className="text-gray-400 hover:text-blue-400"
                    onClick={(e) => {
                      e.preventDefault();
                      toast.info('Telegram coming soon');
                    }}
                  >
                    <FaTelegramPlane className="h-6 w-6" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      {/* Buy Dialog */}
      <Dialog open={showBuyDialog} onOpenChange={setShowBuyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buy {tokenData.symbol}</DialogTitle>
            <DialogDescription>
              Enter the amount of {tokenData.symbol} you want to buy
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label htmlFor="buy-amount" className="block text-sm font-medium text-gray-700 mb-1">
                Amount
              </label>
              <Input
                id="buy-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                className="w-full"
                min="0"
                step="0.000000000000000001"
              />
              <div className="flex justify-between mt-1 text-sm text-gray-500">
                <span>Balance: {formatEther(userBalance)} {tokenData.symbol}</span>
                <button 
                  className="text-blue-600 hover:text-blue-800"
                  onClick={() => setAmount(formatEther(userBalance))}
                >
                  Max
                </button>
              </div>
            </div>
            {message && (
              <div className={`p-3 rounded-md ${
                message.type === 'error' ? 'bg-red-50 text-red-700' : 
                message.type === 'success' ? 'bg-green-50 text-green-700' :
                'bg-blue-50 text-blue-700'
              }`}>
                {message.text}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowBuyDialog(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleTradeBuy}
              disabled={loading || !amount || parseFloat(amount) <= 0}
            >
              {loading ? 'Processing...' : 'Buy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Sell Dialog */}
      <Dialog open={showSellDialog} onOpenChange={setShowSellDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sell {tokenData.symbol}</DialogTitle>
            <DialogDescription>
              Enter the amount of {tokenData.symbol} you want to sell
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label htmlFor="sell-amount" className="block text-sm font-medium text-gray-700 mb-1">
                Amount
              </label>
              <Input
                id="sell-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                className="w-full"
                min="0"
                max={formatEther(userBalance)}
                step="0.000000000000000001"
              />
              <div className="flex justify-between mt-1 text-sm text-gray-500">
                <span>Balance: {formatEther(userBalance)} {tokenData.symbol}</span>
                <button 
                  className="text-blue-600 hover:text-blue-800"
                  onClick={() => setAmount(formatEther(userBalance))}
                >
                  Max
                </button>
              </div>
            </div>
            {message && (
              <div className={`p-3 rounded-md ${
                message.type === 'error' ? 'bg-red-50 text-red-700' : 
                message.type === 'success' ? 'bg-green-50 text-green-700' :
                'bg-blue-50 text-blue-700'
              }`}>
                {message.text}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowSellDialog(false)}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleTradeSell}
              disabled={loading || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > parseFloat(formatEther(userBalance))}
            >
              {loading ? 'Processing...' : 'Sell'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Message Toast */}
      {message && (
        <div
          className={`fixed bottom-4 right-4 p-4 rounded-md ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}