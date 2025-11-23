import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { from, to, amount, token, chainId } = body;

    if (!from || !to || !amount || !token || !chainId) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Generate payment parameters
    const validAfter = Math.floor(Date.now() / 1000); // Valid from now
    const validBefore = validAfter + 3600; // Valid for 1 hour
    const nonce = ethers.hexlify(ethers.randomBytes(32));

    const paymentRequest = {
      from,
      to,
      amount,
      token,
      chainId,
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce,
    };

    return NextResponse.json({
      success: true,
      paymentRequest,
    });
  } catch (error) {
    console.error('Error creating payment request:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
