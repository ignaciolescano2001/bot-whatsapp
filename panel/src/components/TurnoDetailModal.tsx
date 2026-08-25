"use client";

import Link from "next/link";
import type { Turno, TurnoEstado } from "@/lib/agenda-db";

const ESTADO_STYLES: Record<TurnoEstado, string> = {
  confirmado: "bg-emerald-950 text-emerald-400",
  pendiente: "bg-amber-950 text-amber-400",
  cancelado: "bg-neutral-900 text-neutral-500",
  rechazado: "bg-red-950 text-red-400",
};

export default function TurnoDetailModal({
  turno,
  onClose,
  onCancelado,
}: {
  turno: Turno;
  onClose: () => void;
  onCancelado: () => void;
}) {
  async function cancelar() {
    if (!confirm(`¿Cancelar el turno de ${turno.cliente_nombre} (${turno.hora.slice(0, 5)})?`)) return;
    await fetch(`/api/turnos/${turno.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "cancelado" }),
    });
    onCancelado();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-950 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-lg font-semibold">{turno.cliente_nombre}</p>
            <p className="text-sm text-neutral-400">
              {turno.fecha} · {turno.hora.slice(0, 5)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-900"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 space-y-1 text-sm text-neutral-300">
          <p>Servicio: {turno.servicio_nombre}</p>
          <p>Peluquero: {turno.peluquero_nombre}</p>
          {turno.cliente_whatsapp && <p>WhatsApp: {turno.cliente_whatsapp}</p>}
        </div>

        {turno.es_fijo ? (
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-sky-950 px-2 py-0.5 text-xs font-medium text-sky-400">
              fijo
            </span>
            <Link
              href="/horarios-fijos"
              className="text-sm text-neutral-300 underline hover:text-neutral-100"
            >
              Gestionar en Horarios fijos
            </Link>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_STYLES[turno.estado]}`}
            >
              {turno.estado}
            </span>
            {(turno.estado === "confirmado" || turno.estado === "pendiente") && (
              <button
                onClick={cancelar}
                className="rounded-md border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950"
              >
                Cancelar turno
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
