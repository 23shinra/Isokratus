import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  createUniRequest,
  listUniRequests,
  setUniRequestDone,
} from "@/lib/uni-request-store";

export const runtime = "nodejs";

const rateBucket = new Map<string, number>();

function clientKey(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function rateLimited(key: string, windowMs = 60_000): boolean {
  const now = Date.now();
  const prev = rateBucket.get(key) ?? 0;
  if (now - prev < windowMs) return true;
  rateBucket.set(key, now);
  if (rateBucket.size > 2000) {
    for (const [k, t] of rateBucket) {
      if (now - t > windowMs * 2) rateBucket.delete(k);
    }
  }
  return false;
}

/** Public: submit a missing-university request. */
export async function POST(req: NextRequest) {
  try {
    if (rateLimited(clientKey(req))) {
      return NextResponse.json(
        { error: "Подожди минуту и попробуй снова" },
        { status: 429 },
      );
    }

    const body = (await req.json()) as {
      universityName?: string;
      telegram?: string;
    };

    const row = await createUniRequest({
      universityName: String(body.universityName ?? ""),
      telegram: String(body.telegram ?? ""),
    });

    return NextResponse.json({ ok: true, id: row.id });
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status: number }).status) || 500
        : 500;
    const message =
      err instanceof Error ? err.message : "Не удалось отправить заявку";
    if (status >= 500) console.error("[uni-requests] POST", err);
    return NextResponse.json({ error: message }, { status });
  }
}

/** Admin: list university requests. */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireAdmin(req);
    if (gate !== true) return gate;
    const data = await listUniRequests();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[uni-requests] GET", err);
    return NextResponse.json(
      { error: "Не удалось загрузить заявки" },
      { status: 502 },
    );
  }
}

/** Admin: mark request done / reopen. */
export async function PATCH(req: NextRequest) {
  try {
    const gate = await requireAdmin(req);
    if (gate !== true) return gate;

    const body = (await req.json()) as { id?: string; done?: boolean };
    const id = String(body.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Нет id" }, { status: 400 });
    }
    const done = Boolean(body.done);
    const row = await setUniRequestDone(id, done);
    if (!row) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, request: row });
  } catch (err) {
    console.error("[uni-requests] PATCH", err);
    return NextResponse.json(
      { error: "Не удалось обновить" },
      { status: 502 },
    );
  }
}
