import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

// ABI for X402TokenFactory
const FACTORY_ABI = [
  'function allTokens(uint256) view returns (address)',
  'function getTokenData(address) view returns (tuple(string name, string symbol, uint8 decimals, uint256 totalSupply, address owner, uint256 createdAt, string imageUrl, address tokenAddress))',
];

const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS || '0xf1f31be058167da9f5565f5bab9c27881c0a37c1';
const RPC_URL = process.env.RPC_URL || 'https://evm-testnet.0g.ai'; // Default to 0g testnet if not set

export async function GET(request: NextRequest) {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const factoryContract = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
    
    const tokens = [];
    let index = 0;
    const MAX_TOKENS = 50; // Safety limit

    // Fetch tokens one by one until we hit a limit or error
    // In a production environment, we would use a multicall or a better indexer
    while (index < MAX_TOKENS) {
      try {
        const tokenAddress = await factoryContract.allTokens(index);
        const tokenData = await factoryContract.getTokenData(tokenAddress);
        
        tokens.push({
          name: tokenData.name,
          symbol: tokenData.symbol,
          decimals: Number(tokenData.decimals),
          totalSupply: tokenData.totalSupply.toString(),
          owner: tokenData.owner,
          createdAt: Number(tokenData.createdAt),
          imageUrl: tokenData.imageUrl,
          address: tokenData.tokenAddress
        });
        
        index++;
      } catch (e) {
        // Break loop when we reach the end of the array (revert)
        break;
      }
    }
    
    return NextResponse.json({
      success: true,
      tokens: tokens
    });
  } catch (error) {
    console.error('Error fetching tokens:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch tokens' },
      { status: 500 }
    );
  }
}
