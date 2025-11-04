// lib/x402-middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

interface X402PaymentHeader {
  facilitator: string;
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
}

export class X402Middleware {
  private facilitatorUrl: string;
  private receiverAddress: string;
  private tokenAddress: string;
  private chainId: number;
  private paymentAmount: string;

  constructor(config: {
    facilitatorUrl: string;
    receiverAddress: string;
    tokenAddress: string;
    chainId: number;
    paymentAmount: string;
  }) {
    this.facilitatorUrl = config.facilitatorUrl;
    this.receiverAddress = config.receiverAddress;
    this.tokenAddress = config.tokenAddress;
    this.chainId = config.chainId;
    this.paymentAmount = config.paymentAmount;
  }

  async handleRequest(
    request: NextRequest,
    handler: (req: NextRequest) => Promise<NextResponse>
  ): Promise<NextResponse> {
    const proofHeader = request.headers.get('x-402-proof');

    if (!proofHeader) {
      // No proof provided, return 402 Payment Required
      return this.return402Response();
    }

    // Verify the payment proof
    const isValid = await this.verifyProof(proofHeader);

    if (!isValid) {
      return NextResponse.json(
        { success: false, message: 'Invalid payment proof' },
        { status: 402 }
      );
    }

    // Payment verified, proceed with the actual request handler
    return handler(request);
  }

  private return402Response(): NextResponse {
    const paymentInfo: X402PaymentHeader = {
      facilitator: this.facilitatorUrl,
      amount: this.paymentAmount,
      receiver: this.receiverAddress,
      token: this.tokenAddress,
      chainId: this.chainId,
    };

    return NextResponse.json(
      { success: false, message: 'Payment required' },
      {
        status: 402,
        headers: {
          'X-402-Payment': JSON.stringify(paymentInfo),
        },
      }
    );
  }

  private async verifyProof(proofHeader: string): Promise<boolean> {
    try {
      const proof: X402ProofHeader = JSON.parse(proofHeader);
      
      // Verify timestamp validity
      const now = Math.floor(Date.now() / 1000);
      const validAfter = parseInt(proof.validAfter);
      const validBefore = parseInt(proof.validBefore);

      if (now < validAfter || now > validBefore) {
        console.error('Proof timestamp invalid');
        return false;
      }

      // Construct the message that was signed (EIP-3009 format)
      const message = ethers.solidityPackedKeccak256(
        ['address', 'address', 'uint256', 'uint256', 'uint256', 'bytes32'],
        [
          this.receiverAddress,
          this.tokenAddress,
          ethers.parseUnits(this.paymentAmount, 18),
          validAfter,
          validBefore,
          proof.nonce,
        ]
      );

      // Recover the signer address
      const recoveredAddress = ethers.recoverAddress(message, proof.signature);

      // In a production environment, you would check if this address
      // has sufficient balance and the nonce hasn't been used
      console.log('Payment proof verified for address:', recoveredAddress);
      
      return true;
    } catch (error) {
      console.error('Error verifying proof:', error);
      return false;
    }
  }
}

// Helper function to create middleware instance
export function createX402Middleware(paymentAmount: string = '0.01') {
  return new X402Middleware({
    facilitatorUrl: process.env.X402_FACILITATOR_URL || 'http://localhost:8000',
    receiverAddress: process.env.RECEIVER_WALLET_ADDRESS || '',
    tokenAddress: process.env.TOKEN_ADDRESS || '0x71A682D8029d031EB57Ba6BB02d3B37D486fffA4',
    chainId: parseInt(process.env.CHAIN_ID || '16600'),
    paymentAmount,
  });
}