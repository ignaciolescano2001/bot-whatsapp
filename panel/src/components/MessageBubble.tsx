import type { Message } from "@/lib/db";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isHuman = message.role === "human";

  return (
    <div className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-md rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "border border-neutral-700 bg-neutral-900 text-neutral-100"
            : isHuman
              ? "bg-amber-700 text-white"
              : "bg-emerald-700 text-white"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        <p className="mt-1 text-right text-[10px] opacity-70">
          {formatTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}
