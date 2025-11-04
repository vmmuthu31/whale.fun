// app/api/x402/buy/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { createX402Middleware } from '@/lib/x402-middleware';


// EIP-3009 Token ABI (simplified)
const TOKEN_ABI = [
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes memory signature) external',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
];

const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || '0x71A682D8029d031EB57Ba6BB02d3B37D486fffA4';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const RPC_URL = process.env.RPC_URL || '';

async function handleBuyRequest(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { walletAddress, amount } = body;

    if (!walletAddress || !amount) {
      return NextResponse.json(
        { success: false, message: 'Missing walletAddress or amount' },
        { status: 400 }
      );
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid amount' },
        { status: 400 }
      );
    }

    // Setup provider and signer
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const tokenContract = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, wallet);

    // Get token decimals
    const decimals = await tokenContract.decimals();
    const tokenAmount = ethers.parseUnits(amount, decimals);

    // Check if we have enough tokens to sell
    const balance = await tokenContract.balanceOf(wallet.address);
    if (balance < tokenAmount) {
      return NextResponse.json(
        { success: false, message: 'Insufficient token balance in treasury' },
        { status: 400 }
      );
    }

    // Execute token transfer to buyer
    console.log(`Transferring ${amount} tokens to ${walletAddress}`);
    const tx = await tokenContract.transfer(walletAddress, tokenAmount);
    const receipt = await tx.wait();

    return NextResponse.json({
      success: true,
      message: `Successfully purchased ${amount} tokens`,
      txHash: receipt.hash,
      amount: amount,
    });
  } catch (error) {
    console.error('Error in buy handler:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to process buy request',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // Create x402 middleware with payment amount (0.01 tokens per buy)
  const x402 = createX402Middleware('0.01');
  
  // Handle request with x402 payment protection
  return x402.handleRequest(request, handleBuyRequest);
}