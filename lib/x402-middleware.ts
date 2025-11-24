// lib/x402-middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

interface X402PaymentHeader {
  amount: string;
  receiver: string;
  token: string;
  chainId: number;
}

interface X402ProofHeader {
  signature: string;
  nonce: string;
  validAfter: string;
  validBefore: string;
  from: string; // User's address who signed the message
}

// Simple in-memory nonce tracking (in production, use Redis/database)
const usedNonces = new Set<string>();

export class X402Middleware {
  private receiverAddress: string;
  private tokenAddress: string;
  private chainId: number;
  private paymentAmount: string;
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;

  constructor(config: {
    receiverAddress: string;
    tokenAddress: string;
    chainId: number;
    paymentAmount: string;
  }) {
    this.receiverAddress = config.receiverAddress;
    this.tokenAddress = config.tokenAddress;
    this.chainId = config.chainId;
    this.paymentAmount = config.paymentAmount;
    
    // Initialize provider and wallet for fee collection
    const rpcUrl = process.env.RPC_URL || 'https://evmrpc-testnet.0g.ai';
    const privateKey = process.env.PRIVATE_KEY || '';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
  }

  async handleRequest(
    request: NextRequest,
    handler: (req: NextRequest) => Promise<NextResponse>
  ): Promise<NextResponse> {
    const proofHeader = request.headers.get("x-402-proof");

    if (!proofHeader) {
      // No proof provided, return 402 Payment Required
      return this.return402Response();
    }

    // Verify and collect the payment
    const result = await this.verifyAndCollectFee(proofHeader);

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.error || "Invalid payment proof" },
        { status: 402 }
      );
    }

    // Payment collected, proceed with the actual request handler
    return handler(request);
  }

  private return402Response(): NextResponse {
    const paymentInfo: X402PaymentHeader = {
      amount: this.paymentAmount,
      receiver: this.receiverAddress,
      token: this.tokenAddress,
      chainId: this.chainId,
    };

    return NextResponse.json(
      { success: false, message: "Payment required" },
      {
        status: 402,
        headers: {
          "X-402-Payment": JSON.stringify(paymentInfo),
        },
      }
    );
  }

  private async verifyAndCollectFee(proofHeader: string): Promise<{ success: boolean; error?: string }> {
    try {
      const proof: X402ProofHeader = JSON.parse(proofHeader);

      // Check if nonce was already used
      if (usedNonces.has(proof.nonce)) {
        return { success: false, error: "Nonce already used" };
      }

      // Verify timestamp validity
      const now = Math.floor(Date.now() / 1000);
      const validAfter = parseInt(proof.validAfter);
      const validBefore = parseInt(proof.validBefore);

      if (now < validAfter || now > validBefore) {
        return { success: false, error: "Proof timestamp invalid" };
      }

      // Get the user address from the proof
      const userAddress = proof.from;
      
      if (!userAddress || !ethers.isAddress(userAddress)) {
        return { success: false, error: "Invalid user address in proof" };
      }

      // For native token fees, verify a simple signed message
      const amountWei = ethers.parseUnits(this.paymentAmount, 18);
      
      const messageHash = ethers.solidityPackedKeccak256(
        ['address', 'address', 'uint256', 'uint256', 'uint256', 'bytes32'],
        [
          userAddress,
          this.receiverAddress,
          amountWei,
          validAfter,
          validBefore,
          proof.nonce,
        ]
      );

      // Verify the signature (signMessage adds "\x19Ethereum Signed Message:\n" prefix)
      const recoveredAddress = ethers.recoverAddress(
        ethers.hashMessage(ethers.getBytes(messageHash)),
        proof.signature
      );
      
      if (recoveredAddress.toLowerCase() !== userAddress.toLowerCase()) {
        return { success: false, error: "Invalid signature - does not match claimed address" };
      }

      console.log("Signature verified! Fee authorization confirmed for:", userAddress);

      // For native token fees, we verify the signature as proof of payment authorization
      // The actual native token transfer would happen outside the middleware
      // (e.g., user sends native tokens to a payment address separately)
      
      // Mark nonce as used to prevent replay attacks
      usedNonces.add(proof.nonce);
      
      console.log(`Fee verified: ${this.paymentAmount} tokens (native) from ${userAddress}`);
      return { success: true };
    } catch (error) {
      console.error("Error collecting fee:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to collect fee" 
      };
    }
  }
}

// Helper function to create middleware instance
export function createX402Middleware(paymentAmount: string = "0.01") {
  return new X402Middleware({
    receiverAddress: process.env.RECEIVER_WALLET_ADDRESS || "",
    tokenAddress:
      process.env.TOKEN_ADDRESS || "0x71A682D8029d031EB57Ba6BB02d3B37D486fffA4",
    chainId: parseInt(process.env.CHAIN_ID || "16602"),
    paymentAmount,
  });
}
