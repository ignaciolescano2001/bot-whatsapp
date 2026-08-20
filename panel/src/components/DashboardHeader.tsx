"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function DashboardHeader({ phone }: { phone: string | null }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
      <div>
        <h1 className="text-lg font-semibold">Agente WhatsApp</h1>
        <p className="text-sm text-neutral-400">
          {phone ? `Conectado como +${phone}` : "Sin número conectado"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/turnos"
          className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900"
        >
          Turnos
        </Link>
        <Link
          href="/horarios-fijos"
          className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900"
        >
          Horarios fijos
        </Link>
        <button
          onClick={handleLogout}
          className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900"
        >
          Salir
        </button>
      </div>
    </header>
  );
}
