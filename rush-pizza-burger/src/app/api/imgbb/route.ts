import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ImgBB not configured" }, { status: 500 });
  }

  const formData = await req.formData();
  const file = formData.get("image") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");

  const body = new FormData();
  body.append("key", apiKey);
  body.append("image", base64);

  const res = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body });
  const data = await res.json();

  if (!data.success) {
    return NextResponse.json({ error: data.error?.message ?? "Upload failed" }, { status: 400 });
  }

  // Use direct image URL (i.ibb.co/...) — page URL (ibb.co/...) breaks <img> and Next/Image
  const directUrl =
    (data.data?.image?.url as string | undefined) ??
    (data.data?.thumb?.url as string | undefined) ??
    (data.data?.display_url as string | undefined) ??
    (data.data?.url as string);

  return NextResponse.json({
    url: directUrl,
    pageUrl: data.data?.url as string,
    displayUrl: data.data?.display_url as string,
    deleteUrl: data.data?.delete_url as string,
  });
}
