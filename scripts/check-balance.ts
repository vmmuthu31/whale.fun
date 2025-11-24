import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || '0x71A682D8029d031EB57Ba6BB02d3B37D486fffA4';
const RPC_URL = process.env.RPC_URL || 'https://evmrpc-testnet.0g.ai';
const TEST_PRIVATE_KEY = process.env.TEST_PRIVATE_KEY || '';

async function main() {
  const wallet = new ethers.Wallet(TEST_PRIVATE_KEY);
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(
    TOKEN_ADDRESS,
    [
      'function balanceOf(address) view returns (uint256)',
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)'
    ],
    provider
  );
  
  const [balance, decimals, symbol] = await Promise.all([
    contract.balanceOf(wallet.address),
    contract.decimals(),
    contract.symbol()
  ]);
  
  console.log(`Test Wallet: ${wallet.address}`);
  console.log(`Token: ${symbol}`);
  console.log(`Balance: ${ethers.formatUnits(balance, decimals)} ${symbol}`);
  console.log(`Required for fee (0.1): 0.1 ${symbol}`);
}

main().catch(console.error);
