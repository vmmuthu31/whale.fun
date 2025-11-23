import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { createX402Middleware } from '@/lib/x402-middleware';

// ABI for X402TokenFactory
const FACTORY_ABI = [
  'function createToken(string name, string symbol, uint8 decimals, uint256 initialSupply, address owner, string imageUrl) external returns (address)',
];

const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS || '0xf1f31be058167da9f5565f5bab9c27881c0a37c1';
const RPC_URL = process.env.RPC_URL || 'https://evm-testnet.0g.ai';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

async function handleCreateRequest(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { name, symbol, initialSupply, imageUrl, owner } = body;

    if (!name || !symbol || !initialSupply || !owner) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Setup provider and signer (Factory owner/admin or just a relayer)
    // In this case, the factory allows anyone to create tokens? 
    // Let's check the contract.
    /*
     * contract X402TokenFactory is Ownable {
     * ...
     * function createToken(...) external returns (address) { ... }
     * }
     */
    // It seems `createToken` is `external` and NOT `onlyOwner`. So anyone can call it.
    // However, we are paying for gas here, so we use our backend wallet.
    // The `owner` param in `createToken` specifies who will own the new token contract.
    
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const factoryContract = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, wallet);

    console.log(`Creating token: ${name} (${symbol}) for ${owner}`);
    
    // Call createToken
    // decimals is hardcoded to 18 usually, or passed. Let's assume 18.
    const decimals = 18;
    const supplyWei = ethers.parseUnits(initialSupply.toString(), decimals);
    
    const tx = await factoryContract.createToken(
      name,
      symbol,
      decimals,
      supplyWei,
      owner,
      imageUrl || ''
    );
    
    console.log('Creation tx sent:', tx.hash);
    const receipt = await tx.wait();
    console.log('Creation confirmed in block:', receipt.blockNumber);
    
    // We need to find the address of the created token from events.
    // Event: TokenCreated(address indexed tokenAddress, string name, string symbol, uint8 decimals, uint256 totalSupply, address indexed creator)
    // We can parse the logs.
    
    console.log('Receipt logs:', JSON.stringify(receipt.logs, null, 2));
    
    let newTokenAddress = null;
    for (const log of receipt.logs) {
      try {
        const parsedLog = factoryContract.interface.parseLog(log);
        console.log('Parsed log:', parsedLog?.name, parsedLog?.args);
        if (parsedLog && parsedLog.name === 'TokenCreated') {
          newTokenAddress = parsedLog.args[0]; // tokenAddress is the first arg
          break;
        }
      } catch (e) {
        console.log('Failed to parse log:', e);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Token created successfully',
      txHash: receipt.hash,
      tokenAddress: newTokenAddress
    });
  } catch (error) {
    console.error('Error creating token:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create token',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Create x402 middleware with payment amount (e.g. 0.1 tokens to create a new token)
    const x402 = createX402Middleware('0.1');
    
    // Handle request with x402 payment protection
    return await x402.handleRequest(request, handleCreateRequest);
  } catch (error) {
    console.error('Error in POST handler:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error', error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
