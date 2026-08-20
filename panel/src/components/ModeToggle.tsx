"use client";

import { useState } from "react";
import type { ConversationMode } from "@/lib/db";

export default function ModeToggle({
  conversationId,
  mode,
  onChanged,
}: {
  conversationId: number;
  mode: ConversationMode;
  onChanged: (mode: ConversationMode) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next: ConversationMode = mode === "AI" ? "HUMAN" : "AI";
    setLoading(true);
    try {
      await fetch(`/api/mode/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      onChanged(next);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
        mode === "AI"
          ? "bg-emerald-950 text-emerald-400 hover:bg-emerald-900"
          : "bg-amber-950 text-amber-400 hover:bg-amber-900"
      }`}
    >
      Modo: {mode === "AI" ? "IA" : "Humano"}
    </button>
  );
}
