"use client";

import type { ConversationListItem } from "@/lib/db";

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: ConversationListItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-r border-neutral-800">
      {conversations.length === 0 && (
        <p className="p-4 text-sm text-neutral-500">
          Todavía no hay conversaciones.
        </p>
      )}
      {conversations.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={`flex w-full flex-col gap-1 border-b border-neutral-900 px-4 py-3 text-left hover:bg-neutral-900 ${
            selectedId === c.id ? "bg-neutral-900" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">{c.name || c.phone}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                c.mode === "AI"
                  ? "bg-emerald-950 text-emerald-400"
                  : "bg-amber-950 text-amber-400"
              }`}
            >
              {c.mode === "AI" ? "IA" : "HUMANO"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm text-neutral-500">
            <span className="truncate">
              {c.last_message_preview || "Sin mensajes"}
            </span>
            <span className="shrink-0">{relativeTime(c.last_message_at)}</span>
          </div>
        </button>
      ))}
    </aside>
  );
}
