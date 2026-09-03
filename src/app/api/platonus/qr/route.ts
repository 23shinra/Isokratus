import { NextRequest, NextResponse } from "next/server";
import { qrMarkPaths } from "@/lib/platonus/endpoints";
import { errorResponse, readProxyContext } from "@/lib/platonus/route-helpers";
import { platonusTryPost } from "@/lib/platonus/server";

export async function POST(req: NextRequest) {
  const ctx = readProxyContext(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = (await req.json()) as { code?: string };
  if (!body.code?.trim()) {
    return NextResponse.json({ error: "Пустой QR-код" }, { status: 400 });
  }

  const code = body.code.trim();

  // Platonus QR payloads vary by version — try common shapes.
  const variants: unknown[] = [
    { qrCode: code },
    { code },
    { data: code },
    { qrData: code },
    { qr: code },
    { value: code },
    code,
  ];

  // If scanned value looks like JSON, also try parsed object.
  if (code.startsWith("{") || code.startsWith("[")) {
    try {
      variants.unshift(JSON.parse(code));
    } catch {
      // ignore
    }
  }

  try {
    const result = await platonusTryPost(qrMarkPaths(), variants[0], ctx, variants);
    return NextResponse.json({ ok: true, data: result.data, path: result.path });
  } catch (err) {
    return errorResponse(err, "Не удалось отметить посещаемость по QR");
  }
}
