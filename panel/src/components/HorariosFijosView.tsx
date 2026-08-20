"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DIAS_ABIERTOS, generateSlots, labelDia } from "@/lib/slots";
import type { HorarioFijo, Peluquero } from "@/lib/agenda-db";

export default function HorariosFijosView() {
  const [peluqueros, setPeluqueros] = useState<Peluquero[]>([]);
  const [peluqueroId, setPeluqueroId] = useState<string>("");
  const [horarios, setHorarios] = useState<HorarioFijo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [diaSemana, setDiaSemana] = useState(DIAS_ABIERTOS[0].value);
  const [hora, setHora] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");

  useEffect(() => {
    fetch("/api/peluqueros")
      .then((r) => r.json())
      .then((data) => {
        setPeluqueros(data.peluqueros);
        if (data.peluqueros[0]) setPeluqueroId(data.peluqueros[0].id);
      });
  }, []);

  useEffect(() => {
    if (!peluqueroId) return;
    fetch(`/api/horarios-fijos?peluqueroId=${peluqueroId}`)
      .then((r) => r.json())
      .then((data) => setHorarios(data.horarios ?? []));
  }, [peluqueroId]);

  const slotsDelDia = generateSlots(diaSemana);

  async function reloadHorarios() {
    const res = await fetch(`/api/horarios-fijos?peluqueroId=${peluqueroId}`);
    const data = await res.json();
    setHorarios(data.horarios ?? []);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!hora) {
      setError("Elegí un horario.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/horarios-fijos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peluqueroId,
          diaSemana,
          hora,
          clienteNombre: clienteNombre || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo guardar.");
        return;
      }
      setHora("");
      setClienteNombre("");
      await reloadHorarios();
    } finally {
      setLoading(false);
    }
  }

  async function toggleActivo(h: HorarioFijo) {
    await fetch(`/api/horarios-fijos/${h.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !h.activo }),
    });
    await reloadHorarios();
  }

  async function eliminar(h: HorarioFijo) {
    if (!confirm("¿Borrar este horario fijo?")) return;
    await fetch(`/api/horarios-fijos/${h.id}`, { method: "DELETE" });
    await reloadHorarios();
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Horarios fijos</h1>
          <p className="text-sm text-neutral-400">
            Bloqueá un horario semanal recurrente (ej. tu propio corte) para
            que el bot nunca lo ofrezca a un cliente.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900"
        >
          ← Conversaciones
        </Link>
      </div>

      <div className="mb-6">
        <label className="mb-1 block text-sm text-neutral-400">
          Peluquero
        </label>
        <div className="flex gap-2">
          {peluqueros.map((p) => (
            <button
              key={p.id}
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
      </div>

      <form
        onSubmit={handleSubmit}
        className="mb-8 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 p-4"
      >
        <div>
          <label className="mb-1 block text-sm text-neutral-400">Día</label>
          <select
            value={diaSemana}
            onChange={(e) => {
              setDiaSemana(Number(e.target.value));
              setHora("");
            }}
            className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm"
          >
            {DIAS_ABIERTOS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-400">Hora</label>
          <select
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm"
          >
            <option value="">Elegir…</option>
            {slotsDelDia.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[10rem]">
          <label className="mb-1 block text-sm text-neutral-400">
            Nombre (opcional)
          </label>
          <input
            value={clienteNombre}
            onChange={(e) => setClienteNombre(e.target.value)}
            placeholder="Ej: mi propio corte"
            className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !peluqueroId}
          className="rounded-md bg-emerald-950 px-3 py-1.5 text-sm font-medium text-emerald-400 hover:bg-emerald-900 disabled:opacity-50"
        >
          Agregar
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <div className="divide-y divide-neutral-900 rounded-lg border border-neutral-800">
        {horarios.length === 0 && (
          <p className="p-4 text-sm text-neutral-500">
            Todavía no hay horarios fijos para este peluquero.
          </p>
        )}
        {horarios.map((h) => (
          <div
            key={h.id}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium">
                {labelDia(h.dia_semana)} · {h.hora.slice(0, 5)}
              </p>
              {h.cliente_nombre && (
                <p className="text-sm text-neutral-500">{h.cliente_nombre}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleActivo(h)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  h.activo
                    ? "bg-emerald-950 text-emerald-400 hover:bg-emerald-900"
                    : "bg-neutral-900 text-neutral-500 hover:bg-neutral-800"
                }`}
              >
                {h.activo ? "Activo" : "Inactivo"}
              </button>
              <button
                onClick={() => eliminar(h)}
                className="rounded-md border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950"
              >
                Borrar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
