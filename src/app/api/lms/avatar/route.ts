import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readProxyContext } from "@/lib/lms/route-helpers";
import { LmsHttpError, lmsFetch, lmsFetchBinary } from "@/lib/lms/server";
import { normalizeBaseUrl } from "@/lib/lms/endpoints";

function toDataUrl(buffer: ArrayBuffer, contentType: string): string {
  const bytes = Buffer.from(buffer);
  const base64 = bytes.toString("base64");
  const mime = contentType.includes("image") ? contentType.split(";")[0] : "image/jpeg";
  return `data:${mime};base64,${base64}`;
}

function normalizePhotoBase64(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim().replace(/\s+/g, "");
  if (trimmed.startsWith("data:image")) return trimmed;
  // strip accidental quotes / url prefix
  const bare = trimmed.replace(/^"|"$/g, "");
  if (/^https?:\/\//i.test(bare)) return bare;
  return `data:image/jpeg;base64,${bare}`;
}

export async function GET(req: NextRequest) {
  const ctx = readProxyContext(req);
  if (ctx instanceof NextResponse) return ctx;

  try {
    // 1) mobile personInfo often embeds photoBase64
    try {
      const info = await lmsFetch(`rest/mobile/personInfo/${ctx.lang}`, {
        baseUrl: ctx.baseUrl,
        token: ctx.token,
      });
      if (info.data && typeof info.data === "object") {
        const row = info.data as Record<string, unknown>;
        const photo =
          normalizePhotoBase64(row.photoBase64) ||
          normalizePhotoBase64(row.photo) ||
          normalizePhotoBase64(row.avatar) ||
          normalizePhotoBase64(row.profilePicture) ||
          normalizePhotoBase64(row.image);
        if (photo) {
          return NextResponse.json({ url: photo, source: "personInfo" });
        }
      }
    } catch {
      // continue
    }

    // 2) dedicated profile picture endpoint (binary or base64 text)
    const picturePaths = [
      "rest/img/profilePicture",
      "rest/api/person/profilePicture",
      "rest/mobile/profilePicture",
      "rest/file/profilePicture",
    ];

    for (const path of picturePaths) {
      try {
        const binary = await lmsFetchBinary(path, {
          baseUrl: ctx.baseUrl,
          token: ctx.token,
        });

        // empty / tiny placeholder
        if (binary.buffer.byteLength < 32) continue;

        // sometimes LMS returns base64 as text/plain
        if (
          binary.contentType.includes("text") ||
          binary.contentType.includes("json") ||
          binary.contentType.includes("octet-stream")
        ) {
          const asText = Buffer.from(binary.buffer).toString("utf-8").trim();
          if (asText.startsWith("{")) {
            try {
              const json = JSON.parse(asText) as Record<string, unknown>;
              const photo =
                normalizePhotoBase64(json.photoBase64) ||
                normalizePhotoBase64(json.photo) ||
                normalizePhotoBase64(json.data);
              if (photo) {
                return NextResponse.json({ url: photo, source: path });
              }
            } catch {
              // fall through
            }
          }
          const fromText = normalizePhotoBase64(asText);
          if (fromText && (asText.startsWith("data:") || asText.length > 100)) {
            return NextResponse.json({ url: fromText, source: path });
          }
        }

        if (binary.contentType.startsWith("image/") || binary.buffer.byteLength > 500) {
          return NextResponse.json({
            url: toDataUrl(binary.buffer, binary.contentType),
            source: path,
          });
        }
      } catch (err) {
        if (err instanceof LmsHttpError && (err.status === 401 || err.status === 403)) {
          throw err;
        }
      }
    }

    // 3) last resort: public-ish URL with token query (some installs)
    const fallback = `${normalizeBaseUrl(ctx.baseUrl)}/rest/img/profilePicture`;
    return NextResponse.json(
      { error: "Аватар не найден", fallback },
      { status: 404 },
    );
  } catch (err) {
    return errorResponse(err, "Не удалось получить аватар");
  }
}
