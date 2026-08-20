"use client";

import { useEffect, useState } from "react";
import ConnectionStatusScreen from "./ConnectionStatusScreen";
import DashboardHeader from "./DashboardHeader";
import ConversationList from "./ConversationList";
import ConversationPanel from "./ConversationPanel";
import type { StatusResponse } from "@/lib/types";
import type { ConversationListItem } from "@/lib/db";

export default function ConnectionGate() {
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    [],
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/connection/status");
        const data: StatusResponse = await res.json();
        if (!cancelled) setStatusData(data);
      } catch {
        // se reintenta en el próximo ciclo de polling
      }
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (statusData?.status !== "ok") return;

    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/conversations");
        const data = await res.json();
        if (!cancelled) setConversations(data.conversations);
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
  }, [statusData?.status]);

  if (!statusData || statusData.status !== "ok") {
    return <ConnectionStatusScreen data={statusData} />;
  }

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-screen flex-col">
      <DashboardHeader phone={statusData.phone ?? null} />
      <div className="flex flex-1 overflow-hidden">
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {selected ? (
          <ConversationPanel
            key={selected.id}
            conversation={selected}
            onDeleted={() => {
              setSelectedId(null);
              setConversations((prev) =>
                prev.filter((c) => c.id !== selected.id),
              );
            }}
            onModeChanged={(mode) => {
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === selected.id ? { ...c, mode } : c,
                ),
              );
            }}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-neutral-500">
            Seleccioná una conversación
          </div>
        )}
      </div>
    </div>
  );
}
