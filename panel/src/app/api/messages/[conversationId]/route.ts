import { NextRequest, NextResponse } from "next/server";
import { getConversationById, getMessages, insertHumanMessage } from "@/lib/db";
import { enqueueOutbox } from "@/lib/redis";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const messages = await getMessages(Number(conversationId));
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = Number(conversationId);

  const body = await req.json();
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "contenido vacío" }, { status: 400 });
  }

  const conversation = await getConversationById(id);
  if (!conversation) {
    return NextResponse.json(
      { error: "conversación no encontrada" },
      { status: 404 },
    );
  }

  const message = await insertHumanMessage(id, content);
  await enqueueOutbox(id, conversation.phone, content);

  return NextResponse.json({ message });
}
