import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const PINATA_JWT =
      process.env.PINATA_JWT ||
      process.env.NEXT_PINATA_JWT ||
      process.env.NEXT_PUBLIC_PINATA_JWT;
    if (!PINATA_JWT) {
      return NextResponse.json(
        { error: "Missing PINATA_JWT in environment" },
        { status: 500 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Rebuild a FormData to send to Pinata
    const pinataForm = new FormData();
    pinataForm.append("file", file, (file as any).name || "upload.png");

    const pinataRes = await fetch(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PINATA_JWT}`,
        },
        body: pinataForm as any,
        // @ts-expect-error - fetch types for RequestInit don't include duplex
        duplex: "half",
      }
    );

    if (!pinataRes.ok) {
      const text = await pinataRes.text();
      return NextResponse.json(
        { error: "Pinata upload failed", details: text },
        { status: 502 }
      );
    }

    const data = await pinataRes.json();
    const cid = data.IpfsHash || data.cid || data.Hash; // support various shapes
    const url = `https://purple-voluntary-minnow-145.mypinata.cloud/ipfs/${cid}`;

    return NextResponse.json({ cid, url });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Upload error" },
      { status: 500 }
    );
  }
}
