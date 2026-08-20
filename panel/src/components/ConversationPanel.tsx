"use client";

import { useEffect, useRef, useState } from "react";
import MessageBubble from "./MessageBubble";
import ModeToggle from "./ModeToggle";
import type {
  ConversationListItem,
  ConversationMode,
  Message,
} from "@/lib/db";

export default function ConversationPanel({
  conversation,
  onDeleted,
  onModeChanged,
}: {
  conversation: ConversationListItem;
  onDeleted: () => void;
  onModeChanged: (mode: ConversationMode) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/messages/${conversation.id}`);
        const data = await res.json();
        if (!cancelled) setMessages(data.messages);
      } catch {
        // se reintenta en el próximo ciclo de polling
      }
    }

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [conversation.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function handleSend() {
    const content = draft.trim();
    if (!content) return;
    setSending(true);
    try {
      await fetch(`/api/messages/${conversation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      setDraft("");
      const res = await fetch(`/api/messages/${conversation.id}`);
      const data = await res.json();
      setMessages(data.messages);
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    if (
      !confirm("¿Borrar esta conversación? Esta acción no se puede deshacer.")
    ) {
      return;
    }
    await fetch(`/api/conversations/${conversation.id}`, {
      method: "DELETE",
    });
    onDeleted();
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <div>
          <h2 className="font-medium">
            {conversation.name || conversation.phone}
          </h2>
          <p className="text-sm text-neutral-500">+{conversation.phone}</p>
        </div>
        <div className="flex items-center gap-2">
          <ModeToggle
            conversationId={conversation.id}
            mode={conversation.mode}
            onChanged={onModeChanged}
          />
          <button
            onClick={handleDelete}
            className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-900"
          >
            Borrar
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-neutral-800 p-3">
        {conversation.mode === "AI" ? (
          <p className="text-center text-sm text-neutral-500">
            El bot responde automáticamente. Cambiá a modo Humano para
            escribir vos.
          </p>
        ) : (
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
              placeholder="Escribí un mensaje..."
              className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            />
            <button
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
