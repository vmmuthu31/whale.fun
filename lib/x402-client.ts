// lib/x402-client.ts
// Client-side helper for handling x402 payment flow

import { ethers } from 'ethers';

interface PaymentInfo {
  facilitator: string;
  amount: string;
  receiver: string;
  token: string;
  chainId: number;
}

interface PaymentRequest {
  nonce: string;
  validAfter: string;
  validBefore: string;
  from: string;
  to: string;
  amount: string;
  token: string;
  chainId: number;
}

export class X402Client {
  private facilitatorUrl: string;

  constructor(facilitatorUrl: string) {
    this.facilitatorUrl = facilitatorUrl;
  }

  /**
   * Handle a 402 Payment Required response
   */
  async handlePaymentRequired(
    response: Response,
    walletAddress: string,
    signer: ethers.Signer
  ): Promise<string> {
    // Extract payment info from response headers
    const paymentHeader = response.headers.get('X-402-Payment');
    if (!paymentHeader) {
      throw new Error('No payment information in 402 response');
    }

    const paymentInfo: PaymentInfo = JSON.parse(paymentHeader);

    // Request payment details from facilitator
    const paymentRequest = await this.createPaymentRequest(
      walletAddress,
      paymentInfo
    );

    // Sign the payment authorization
    const signature = await this.signPaymentAuthorization(
      signer,
      paymentRequest
    );

    // Create proof header
    const proof = {
      signature,
      nonce: paymentRequest.nonce,
      validAfter: paymentRequest.validAfter,
      validBefore: paymentRequest.validBefore,
    };

    return JSON.stringify(proof);
  }

  /**
   * Create a payment request via the facilitator
   */
  private async createPaymentRequest(
    from: string,
    paymentInfo: PaymentInfo
  ): Promise<PaymentRequest> {
    const response = await fetch(`${this.facilitatorUrl}/api/create-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: paymentInfo.receiver,
        amount: paymentInfo.amount,
        token: paymentInfo.token,
        chainId: paymentInfo.chainId,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create payment request');
    }

    const data = await response.json();
    return data.paymentRequest;
  }

  /**
   * Sign EIP-3009 payment authorization
   */
  private async signPaymentAuthorization(
    signer: ethers.Signer,
    request: PaymentRequest
  ): Promise<string> {
    // Construct the message to sign (EIP-3009 format)
    const messageHash = ethers.solidityPackedKeccak256(
      ['address', 'address', 'uint256', 'uint256', 'uint256', 'bytes32'],
      [
        request.to,
        request.token,
        ethers.parseUnits(request.amount, 18),
        request.validAfter,
        request.validBefore,
        request.nonce,
      ]
    );

    // Sign the message hash
    const signature = await signer.signMessage(ethers.getBytes(messageHash));
    return signature;
  }

  /**
   * Make an API call with automatic x402 payment handling
   */
  async makePaymentProtectedRequest(
    url: string,
    options: RequestInit,
    walletAddress: string,
    signer: ethers.Signer
  ): Promise<Response> {
    // Initial request
    let response = await fetch(url, options);

    // If 402 Payment Required, handle payment
    if (response.status === 402) {
      const proofHeader = await this.handlePaymentRequired(
        response,
        walletAddress,
        signer
      );

      // Retry request with payment proof
      const headersWithProof = new Headers(options.headers);
      headersWithProof.set('X-402-Proof', proofHeader);

      response = await fetch(url, {
        ...options,
        headers: headersWithProof,
      });
    }

    return response;
  }
}

// Helper function to get x402 client instance
export function getX402Client(): X402Client {
  const facilitatorUrl = process.env.NEXT_PUBLIC_X402_FACILITATOR_URL || 'http://localhost:3001';
  return new X402Client(facilitatorUrl);
}