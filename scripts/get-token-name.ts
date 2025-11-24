import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || '0x71A682D8029d031EB57Ba6BB02d3B37D486fffA4';
const RPC_URL = process.env.RPC_URL || 'https://evmrpc-testnet.0g.ai';

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(
    TOKEN_ADDRESS,
    ['function name() view returns (string)'],
    provider
  );
  
  const name = await contract.name();
  console.log('Fee Token Name:', name);
}

main().catch(console.error);
