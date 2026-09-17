import { NextResponse } from "next/server";

/** Chỉ dùng khi phát triển: giả làm dịch vụ đẩy để kiểm thử (không có ở production) */
type Hit = { at: string; status: number; auth: string; encoding: string | null; ttl: string | null; urgency: string | null; bytes: number };
const g = globalThis as unknown as { __pushSink?: Hit[] };
const enabled = () => process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_ACTOR === "1";

export async function POST(req: Request) {
  if (!enabled()) return new NextResponse(null, { status: 404 });
  const status = Number(new URL(req.url).searchParams.get("status") ?? 201);
  const body = Buffer.from(await req.arrayBuffer());
  const auth = req.headers.get("authorization") ?? "";
  (g.__pushSink ??= []).push({ at: new Date().toISOString(), status, auth: /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/.test(auth) ? "vapid-ok" : "bad", encoding: req.headers.get("content-encoding"), ttl: req.headers.get("ttl"), urgency: req.headers.get("urgency"), bytes: body.length });
  if (g.__pushSink.length > 50) g.__pushSink.shift();
  return new NextResponse(null, { status: [201, 404, 410, 429, 500].includes(status) ? status : 201 });
}

export function GET() {
  if (!enabled()) return new NextResponse(null, { status: 404 });
  return NextResponse.json(g.__pushSink ?? []);
}
