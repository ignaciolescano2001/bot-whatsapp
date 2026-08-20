import { NextRequest, NextResponse } from "next/server";
import { setMode } from "@/lib/db";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;

  const body = await req.json();
  const mode = body?.mode;
  if (mode !== "AI" && mode !== "HUMAN") {
    return NextResponse.json({ error: "modo inválido" }, { status: 400 });
  }

  await setMode(Number(conversationId), mode);
  return NextResponse.json({ ok: true });
}
