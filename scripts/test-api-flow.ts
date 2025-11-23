import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL = 'http://localhost:3000';
const RECEIVER_ADDRESS = process.env.RECEIVER_WALLET_ADDRESS || '';
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || '0x71A682D8029d031EB57Ba6BB02d3B37D486fffA4'; // Fee token
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '16600');

// Generate a random user wallet
const userWallet = ethers.Wallet.createRandom();
console.log('User Wallet:', userWallet.address);

async function generateProof(amount: string) {
  const validAfter = Math.floor(Date.now() / 1000) - 60;
  const validBefore = Math.floor(Date.now() / 1000) + 3600;
  const nonce = ethers.hexlify(ethers.randomBytes(32));

  // Message construction matches middleware
  const message = ethers.solidityPackedKeccak256(
    ['address', 'address', 'uint256', 'uint256', 'uint256', 'bytes32'],
    [
      RECEIVER_ADDRESS,
      TOKEN_ADDRESS,
      ethers.parseUnits(amount, 18),
      validAfter,
      validBefore,
      nonce,
    ]
  );

  const signature = await userWallet.signMessage(ethers.getBytes(message));

  return JSON.stringify({
    signature,
    nonce,
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
  });
}

async function testCreate() {
  console.log('\n--- Testing Token Creation ---');
  const proof = await generateProof('0.1'); // 0.1 fee for creation
  
  const response = await fetch(`${BASE_URL}/api/x402/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-402-proof': proof,
    },
    body: JSON.stringify({
      name: 'Test Token',
      symbol: 'TEST',
      initialSupply: '1000000',
      owner: userWallet.address,
      imageUrl: 'https://example.com/image.png',
    }),
  });

  const text = await response.text();
  console.log('Status:', response.status);
  
  let data;
  try {
    data = JSON.parse(text);
    console.log('Response:', data);
    
    if (data.txHash) {
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://evmrpc-testnet.0g.ai');
        const receipt = await provider.getTransactionReceipt(data.txHash);
        console.log('Tx Receipt Logs:', JSON.stringify(receipt?.logs, null, 2));
        
        // Try to decode logs manually to find the address
        // Event: TokenCreated(address indexed tokenAddress, string name, string symbol, uint8 decimals, uint256 totalSupply, address indexed creator)
        // Topic 0 is keccak256("TokenCreated(address,string,string,uint8,uint256,address)")
        
        const iface = new ethers.Interface([
            'event TokenCreated(address indexed tokenAddress, string name, string symbol, uint8 decimals, uint256 totalSupply, address indexed creator)'
        ]);
        
        for (const log of receipt?.logs || []) {
            try {
                const parsed = iface.parseLog(log);
                if (parsed?.name === 'TokenCreated') {
                    console.log('Found TokenCreated event locally:', parsed.args);
                    data.tokenAddress = parsed.args[0];
                }
            } catch (e) {
                // ignore
            }
        }
    }
  } catch (e) {
    console.error('Failed to parse JSON response:', text);
    throw new Error('Invalid JSON response');
  }
  return data.tokenAddress;
}

async function testBuy(tokenAddress: string) {
  console.log('\n--- Testing Buy ---');
  const proof = await generateProof('0.01'); // 0.01 fee for buy
  
  const response = await fetch(`${BASE_URL}/api/x402/buy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-402-proof': proof,
    },
    body: JSON.stringify({
      walletAddress: userWallet.address,
      amount: '100',
      tokenAddress: tokenAddress,
    }),
  });

  const data = await response.json();
  console.log('Status:', response.status);
  console.log('Response:', data);
}

async function testSell(tokenAddress: string) {
  console.log('\n--- Testing Sell ---');
  const proof = await generateProof('0.01'); // 0.01 fee for sell
  
  // For sell, we need authorization. 
  // Since we can't easily sign EIP-3009 without the contract deployed and accessible via provider in this script (or mocking it),
  // we will just send the request and expect it to ask for authorization.
  // Or we can try to mock the auth param if the API doesn't validate it on-chain immediately (it does try to execute).
  // So we expect a 400 with "Authorization required" or similar if we don't provide it.
  
  const response = await fetch(`${BASE_URL}/api/x402/sell`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-402-proof': proof,
    },
    body: JSON.stringify({
      walletAddress: userWallet.address,
      amount: '50',
      tokenAddress: tokenAddress,
      // No authorization provided initially
    }),
  });

  const data = await response.json();
  console.log('Status:', response.status);
  console.log('Response:', data);
}

async function main() {
  try {
    const tokenAddress = await testCreate();
    if (tokenAddress) {
      await testBuy(tokenAddress);
      await testSell(tokenAddress);
    } else {
      console.log('Skipping buy/sell tests due to creation failure');
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
}

main();
