"use client";

import { useState } from "react";
import type { Peluquero, Servicio, ServicioPedido } from "@/lib/agenda-db";

function fmtPrice(n: number): string {
  return "$" + n.toLocaleString("es-AR");
}

export default function CrearTurnoModal({
  fecha,
  hora,
  peluqueros,
  peluquerosAusentesIds = [],
  servicios,
  onClose,
  onCreado,
}: {
  fecha: string;
  hora: string;
  peluqueros: Peluquero[];
  peluquerosAusentesIds?: string[];
  servicios: Servicio[];
  onClose: () => void;
  onCreado: () => void;
}) {
  const peluquerosDisponibles = peluqueros.filter(
    (p) => !peluquerosAusentesIds.includes(p.id),
  );
  const [peluqueroId, setPeluqueroId] = useState(peluquerosDisponibles[0]?.id ?? "");
  const [servicio, setServicio] = useState<ServicioPedido>("corte");
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteWhatsapp, setClienteWhatsapp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const corte = servicios.find((s) => s.nombre === "Corte de pelo");
  const barbaORapado = servicios.find((s) => s.nombre === "Barba o rapado");
  const precioServicio =
    servicio === "corte"
      ? corte?.precio
      : servicio === "barba_o_rapado"
        ? barbaORapado?.precio
        : servicio === "rapado_y_barba"
          ? barbaORapado
            ? barbaORapado.precio * 2
            : undefined
          : corte && barbaORapado
            ? corte.precio + barbaORapado.precio
            : undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!peluqueroId) {
      setError("Elegí un peluquero.");
      return;
    }
    if (!clienteNombre.trim() || !clienteWhatsapp.trim()) {
      setError("Completá nombre y WhatsApp del cliente.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/turnos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peluqueroId,
          servicio,
          fecha,
          hora,
          clienteNombre,
          clienteWhatsapp,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo guardar.");
        return;
      }
      onCreado();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-950 p-5"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-lg font-semibold">Nuevo turno</p>
            <p className="text-sm text-neutral-400">
              {fecha} · {hora.slice(0, 5)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-900"
          >
            ✕
          </button>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-sm text-neutral-400">Peluquero</label>
          {peluquerosDisponibles.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No hay peluqueros disponibles este día.
            </p>
          ) : (
            <div className="flex gap-2">
              {peluquerosDisponibles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeluqueroId(p.id)}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    peluqueroId === p.id
                      ? "bg-neutral-100 text-neutral-900"
                      : "border border-neutral-800 text-neutral-300 hover:bg-neutral-900"
                  }`}
                >
                  {p.nombre}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-sm text-neutral-400">Servicio</label>
          <select
            value={servicio}
            onChange={(e) => setServicio(e.target.value as ServicioPedido)}
            className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm"
          >
            <option value="corte">Corte de pelo</option>
            <option value="barba_o_rapado">Barba o rapado</option>
            <option value="combo">Corte + barba</option>
            <option value="rapado_y_barba">Rapado + barba</option>
          </select>
          {precioServicio !== undefined && (
            <p className="mt-1 text-xs text-neutral-500">{fmtPrice(precioServicio)}</p>
          )}
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-sm text-neutral-400">Nombre del cliente</label>
          <input
            value={clienteNombre}
            onChange={(e) => setClienteNombre(e.target.value)}
            className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm text-neutral-400">WhatsApp del cliente</label>
          <input
            value={clienteWhatsapp}
            onChange={(e) => setClienteWhatsapp(e.target.value)}
            placeholder="Ej: 3548123456"
            className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm"
          />
        </div>

        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading || !peluqueroId}
          className="w-full rounded-md bg-emerald-950 px-3 py-1.5 text-sm font-medium text-emerald-400 hover:bg-emerald-900 disabled:opacity-50"
        >
          Reservar
        </button>
      </form>
    </div>
  );
}
