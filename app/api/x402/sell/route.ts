// app/api/x402/sell/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { createX402Middleware } from '@/lib/x402-middleware';

const { formatUnits, parseUnits } = ethers;

// EIP-3009 Token ABI with all required functions and events
const TOKEN_ABI = [
  // EIP-3009 Functions
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external',
  'function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external',
  'function cancelAuthorization(address authorizer, bytes32 nonce) external',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function name() external view returns (string memory)',
  'function symbol() external view returns (string memory)',
  'function nonces(address owner) external view returns (uint256)',
  'function DOMAIN_SEPARATOR() external view returns (bytes32)',
  'function PERMIT_TYPEHASH() external pure returns (bytes32)',
  'function TRANSFER_WITH_AUTHORIZATION_TYPEHASH() external view returns (bytes32)',
  'function RECEIVE_WITH_AUTHORIZATION_TYPEHASH() external view returns (bytes32)',
  'function CANCEL_AUTHORIZATION_TYPEHASH() external view returns (bytes32)',
  
  // Events
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
  'event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)',
  'event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce)',
  'event TransferWithAuthorization(address indexed from, address indexed to, uint256 value, bytes32 indexed nonce)'
];

const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || '0x71A682D8029d031EB57Ba6BB02d3B37D486fffA4';
const RPC_URL = process.env.RPC_URL || '';
const RECEIVER_ADDRESS = process.env.RECEIVER_WALLET_ADDRESS || '';

async function logSignatureData(
  tokenContract: any,
  from: string,
  to: string,
  value: bigint,
  validAfter: number,
  validBefore: number,
  nonce: string
) {
  try {
    const domain = {
      name: await tokenContract.name(),
      version: '1',
      chainId: (await tokenContract.provider.getNetwork()).chainId,
      verifyingContract: tokenContract.target
    };

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

    const message = {
      from,
      to,
      value: value.toString(),
      validAfter,
      validBefore,
      nonce
    };

    console.log('=== Signature Debug Info ===');
    console.log('Domain:', JSON.stringify(domain, null, 2));
    console.log('Message:', JSON.stringify(message, null, 2));
    console.log('Types:', JSON.stringify(types, null, 2));

    return { domain, types, message };
  } catch (error) {
    console.error('Error in logSignatureData:', error);
    throw error;
  }
}

async function handleSellRequest(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { walletAddress, amount, authorization, chainId, tokenAddress } = body;

    if (!tokenAddress) {
      return NextResponse.json(
        { success: false, message: 'Missing tokenAddress' },
        { status: 400 }
      );
    }

    // Get token decimals and calculate token amount
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const tokenContract = new ethers.Contract(tokenAddress, TOKEN_ABI, provider);
    const decimals = Number(await tokenContract.decimals());
    
    // Parse the amount with the correct number of decimals
    let tokenAmount;
    try {
      // Ensure amount is a string and handle decimal points correctly
      tokenAmount = parseUnits(amount.toString(), decimals);
    } catch (error) {
      console.error('Error parsing token amount:', error);
      return NextResponse.json(
        { success: false, message: 'Invalid token amount format' },
        { status: 400 }
      );
    }

    // Check user's balance
    const userBalance = await tokenContract.balanceOf(walletAddress);
    const userBalanceBN = BigInt(userBalance.toString());
    const tokenAmountBN = BigInt(tokenAmount.toString());
    
    const userBalanceFormatted = formatUnits(userBalance, decimals);
    const tokenAmountFormatted = formatUnits(tokenAmount, decimals);
    
    console.log({
      userAddress: walletAddress,
      userBalance: userBalance.toString(),
      userBalanceFormatted,
      tokenAmount: tokenAmount.toString(),
      tokenAmountFormatted,
      decimals
    });
    
    // Check if user has sufficient balance
    if (userBalanceBN < tokenAmountBN) {
      return NextResponse.json(
        { 
          success: false, 
          message: `Insufficient token balance. You have ${userBalanceFormatted} tokens, but trying to sell ${tokenAmountFormatted} tokens.` 
        },
        { status: 400 }
      );
    }

    if (authorization) {
      // Use EIP-3009 transferWithAuthorization if authorization is provided
      const { v, r, s, nonce, validAfter, validBefore } = authorization;
      
      console.log(`Processing authorized transfer from ${walletAddress}`);
      
      // The x402 middleware has already verified the payment
      console.log('Payment verified by x402 middleware');
      
      // Create a provider and signer
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const signer = new ethers.Wallet(process.env.PRIVATE_KEY || '', provider);
      const tokenContract = new ethers.Contract(tokenAddress, TOKEN_ABI, signer);
      
      try {
        console.log('Transfer parameters:', {
          from: walletAddress,
          to: RECEIVER_ADDRESS,
          value: tokenAmount.toString(),
          validAfter,
          validBefore,
          nonce,
          v, r, s
        });

        // Convert signature components to proper format
        const vNum = typeof v === 'string' ? parseInt(v, 16) : v;
        const rBytes = ethers.getBytes(r);
        const sBytes = ethers.getBytes(s);
        
        // Ensure r and s are 32 bytes long
        const formattedR = ethers.hexlify(ethers.zeroPadValue(rBytes, 32));
        const formattedS = ethers.hexlify(ethers.zeroPadValue(sBytes, 32));

        console.log('Formatted signature:', { 
          v: vNum, 
          r: formattedR, 
          s: formattedS,
          nonce: nonce,
          from: walletAddress,
          to: RECEIVER_ADDRESS,
          value: tokenAmount.toString(),
          validAfter,
          validBefore
        });

        // Try to get the domain separator and type hash
        let domainSeparator, transferTypeHash;
        try {
          domainSeparator = await tokenContract.DOMAIN_SEPARATOR().catch(() => null);
          transferTypeHash = await tokenContract.TRANSFER_WITH_AUTHORIZATION_TYPEHASH().catch(() => null);
          
          console.log('Domain Separator:', domainSeparator || 'Not available');
          console.log('Transfer With Authorization Typehash:', transferTypeHash || 'Not available');
        } catch (e) {
          console.log('Could not fetch EIP-712 domain info, proceeding with standard transferWithAuthorization');
        }
        
        // Log the full call data for debugging
        const callData = tokenContract.interface.encodeFunctionData('transferWithAuthorization', [
          walletAddress,
          RECEIVER_ADDRESS,
          tokenAmount,
          validAfter,
          validBefore,
          nonce,
          vNum,
          formattedR,
          formattedS
        ]);
        console.log('Call data:', callData);

        // Execute the transferWithAuthorization with proper v, r, s parameters
        console.log('Sending transaction...');
        
        // Try the transfer with authorization
        try {
          console.log('=== TransferWithAuthorization Debug ===');
          console.log('Wallet Address:', walletAddress);
          console.log('Receiver Address:', RECEIVER_ADDRESS);
          console.log('Token Amount:', tokenAmount.toString());
          console.log('Valid After:', validAfter);
          console.log('Valid Before:', validBefore);
          console.log('Nonce:', nonce);
          console.log('v:', vNum);
          console.log('r:', formattedR);
          console.log('s:', formattedS);

          // Log the domain and message data
          const signatureData = await logSignatureData(
            tokenContract,
            walletAddress,
            RECEIVER_ADDRESS,
            tokenAmount,
            validAfter,
            validBefore,
            nonce
          );

          console.log('Domain:', JSON.stringify(signatureData.domain, null, 2));
          console.log('Message:', JSON.stringify(signatureData.message, null, 2));
          console.log('Types:', JSON.stringify(signatureData.types, null, 2));

          console.log('Attempting transferWithAuthorization with separate v, r, s parameters');
          const tx = await tokenContract.transferWithAuthorization(
            walletAddress, // from
            RECEIVER_ADDRESS, // to
            tokenAmount, // value (in wei)
            validAfter,
            validBefore,
            nonce,
            vNum, // v as number
            formattedR, // r as bytes32
            formattedS  // s as bytes32
          );
          
          console.log('Transaction sent, waiting for confirmation...');
          const receipt = await tx.wait();
          console.log('Transfer successful, tx hash:', receipt.transactionHash);
          
          return NextResponse.json({
            success: true,
            message: `Successfully sold ${amount} tokens`,
            txHash: receipt.transactionHash,
            amount: amount,
          });
          
        } catch (error: any) {
          console.error('Standard transferWithAuthorization failed, error details:', {
            error: error.message,
            code: error.code,
            data: error.data,
            stack: error.stack,
            reason: error.reason,
            method: error.method,
            transaction: error.transaction
          });
          
          // Try with alternative signature format if the standard one fails
          try {
            console.log('Trying alternative signature format with packed signature...');
            // Create a packed signature (65 bytes: r + s + v)
            const signature = ethers.concat([
              formattedR,
              formattedS,
              ethers.toBeHex(vNum, 1)
            ]);
            
            console.log('Packed signature:', signature);
            
            // Try with the packed signature as the last parameter
            const tx = await tokenContract.transferWithAuthorization(
              walletAddress,
              RECEIVER_ADDRESS,
              tokenAmount,
              validAfter,
              validBefore,
              nonce,
              signature
            );
            
            console.log('Transaction sent with packed signature, waiting for confirmation...');
            const receipt = await tx.wait();
            console.log('Transfer successful with packed signature, tx hash:', receipt.transactionHash);
            
            return NextResponse.json({
              success: true,
              message: `Successfully sold ${amount} tokens`,
              txHash: receipt.transactionHash,
              amount: amount,
            })
          } catch (altError: any) {
            console.error('Alternative transferWithAuthorization with packed signature also failed:', {
              error: altError.message,
              code: altError.code,
              data: altError.data,
              reason: altError.reason,
              method: altError.method,
              transaction: altError.transaction,
              stack: altError.stack
            });
            
            // Try one more time with a different signature format (some implementations might use this)
            try {
              console.log('Trying one more time with different signature format...');
              // In your route.ts file, update the transferWithAuthorization call to match the contract's ABI:
                const tx = await tokenContract.transferWithAuthorization(
                    walletAddress,         // from
                    RECEIVER_ADDRESS,      // to
                    tokenAmount,           // value
                    validAfter,            // validAfter
                    validBefore,           // validBefore
                    nonce,                 // nonce
                    vNum,                  // v (as number)
                    formattedR,            // r (as bytes32)
                    formattedS             // s (as bytes32)
                );
              
              console.log('Transaction sent with object signature, waiting for confirmation...');
              const receipt = await tx.wait();
              console.log('Transfer successful with object signature, tx hash:', receipt.transactionHash);
              
              return NextResponse.json({
                success: true,
                message: `Successfully sold ${amount} tokens`,
                txHash: receipt.transactionHash,
                amount: amount,
              })
            } catch (finalError: any) {
              console.error('Final attempt with object signature also failed:', {
                error: finalError.message,
                code: finalError.code,
                data: finalError.data,
                reason: finalError.reason,
                method: finalError.method,
                transaction: finalError.transaction,
                stack: finalError.stack
              });
              
              return NextResponse.json(
                { 
                  success: false, 
                  message: `Transfer failed after multiple attempts: ${finalError.message}`,
                  error: {
                    message: finalError.message,
                    code: finalError.code,
                    reason: finalError.reason,
                    method: finalError.method
                  }
                },
                { status: 500 }
              );
            }
          }
        }
      } catch (error: any) {
        console.error('Transfer failed:', {
          error: error.message,
          code: error.code,
          data: error.data,
          stack: error.stack
        });
        return NextResponse.json(
          { 
            success: false, 
            message: `Transfer failed: ${error.message}`,
            error: {
              message: error.message,
              code: error.code,
              reason: error.reason
            }
          },
          { status: 500 }
        );
      }
    } else {
      // Return instructions for user to create authorization
      return NextResponse.json(
        {
          success: false,
          message: 'Authorization required. User must sign EIP-3009 authorization for token transfer.',
          requiresAuthorization: true,
          authorizationParams: {
            from: walletAddress,
            to: RECEIVER_ADDRESS,
            value: tokenAmount.toString(),
            tokenAddress: tokenAddress,
          },
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error processing sell request:', {
      error: error.message,
      stack: error.stack,
    });
    
    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

// Export the handler with x402 middleware
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Create x402 middleware with payment amount (0.01 tokens per sell)
    const x402 = createX402Middleware('0.01');
    
    // Handle request with x402 payment protection
    return x402.handleRequest(request, async () => {
      try {
        return await handleSellRequest(request);
      } catch (error: any) {
        console.error('Error in x402 handler:', error);
        return NextResponse.json(
          { success: false, message: 'Error processing request', error: error.message },
          { status: 500 }
        );
      }
    });
  } catch (error: any) {
    console.error('Error in POST handler:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error', error: error.message },
      { status: 500 }
    );
  }
}