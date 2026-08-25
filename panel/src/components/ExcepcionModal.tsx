"use client";

import { useEffect, useState } from "react";
import type { ExcepcionAgenda, Peluquero, TipoExcepcion, Turno } from "@/lib/agenda-db";

const TIPO_LABEL: Record<TipoExcepcion, string> = {
  cerrado: "Peluquería cerrada",
  peluquero_ausente: "Peluquero ausente",
  horario_especial: "Horario especial",
};

export default function ExcepcionModal({
  excepcion,
  peluqueros,
  onClose,
  onGuardado,
}: {
  excepcion?: ExcepcionAgenda;
  peluqueros: Peluquero[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [fecha, setFecha] = useState(excepcion?.fecha ?? "");
  const [tipo, setTipo] = useState<TipoExcepcion>(excepcion?.tipo ?? "cerrado");
  const [peluqueroId, setPeluqueroId] = useState(excepcion?.peluquero_id ?? "");
  const [horaInicio, setHoraInicio] = useState(excepcion?.hora_inicio?.slice(0, 5) ?? "");
  const [horaFin, setHoraFin] = useState(excepcion?.hora_fin?.slice(0, 5) ?? "");
  const [motivo, setMotivo] = useState(excepcion?.motivo ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [turnosAfectados, setTurnosAfectados] = useState<number | null>(null);

  useEffect(() => {
    if (tipo !== "peluquero_ausente" || !fecha || !peluqueroId) {
      setTurnosAfectados(null);
      return;
    }
    const peluqueroNombre = peluqueros.find((p) => p.id === peluqueroId)?.nombre;
    if (!peluqueroNombre) return;
    fetch(`/api/turnos?fecha=${fecha}`)
      .then((r) => r.json())
      .then((data) => {
        const turnos: Turno[] = data.turnos ?? [];
        const afectados = turnos.filter(
          (t) =>
            !t.es_fijo &&
            t.peluquero_nombre === peluqueroNombre &&
            (t.estado === "pendiente" || t.estado === "confirmado"),
        );
        setTurnosAfectados(afectados.length);
      });
  }, [tipo, fecha, peluqueroId, peluqueros]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!fecha) {
      setError("Elegí una fecha.");
      return;
    }
    if (tipo === "peluquero_ausente" && !peluqueroId) {
      setError("Elegí el peluquero ausente.");
      return;
    }
    if (tipo === "horario_especial") {
      if (!horaInicio || !horaFin) {
        setError("Completá hora de inicio y de finalización.");
        return;
      }
      if (horaInicio >= horaFin) {
        setError("La hora de inicio tiene que ser anterior a la de finalización.");
        return;
      }
    }

    setLoading(true);
    try {
      const body = { fecha, tipo, peluqueroId, horaInicio, horaFin, motivo };
      const res = await fetch(
        excepcion ? `/api/excepciones/${excepcion.id}` : "/api/excepciones",
        {
          method: excepcion ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo guardar.");
        return;
      }
      onGuardado();
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
          <p className="text-lg font-semibold">
            {excepcion ? "Editar excepción" : "Nueva excepción"}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-900"
          >
            ✕
          </button>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-sm text-neutral-400">Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm"
          />
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-sm text-neutral-400">Tipo</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoExcepcion)}
            className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm"
          >
            {(Object.keys(TIPO_LABEL) as TipoExcepcion[]).map((t) => (
              <option key={t} value={t}>
                {TIPO_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        {tipo === "peluquero_ausente" && (
          <div className="mb-3">
            <label className="mb-1 block text-sm text-neutral-400">Peluquero</label>
            <div className="flex gap-2">
              {peluqueros.map((p) => (
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
            {turnosAfectados !== null && turnosAfectados > 0 && (
              <p className="mt-2 text-xs text-amber-400">
                Hay {turnosAfectados} turno{turnosAfectados === 1 ? "" : "s"} existente
                {turnosAfectados === 1 ? "" : "s"} para{" "}
                {peluqueros.find((p) => p.id === peluqueroId)?.nombre} en esta fecha. No se van a
                cancelar solos.
              </p>
            )}
          </div>
        )}

        {tipo === "horario_especial" && (
          <div className="mb-3 flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-neutral-400">Desde</label>
              <input
                type="time"
                step={1800}
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm text-neutral-400">Hasta</label>
              <input
                type="time"
                step={1800}
                value={horaFin}
                onChange={(e) => setHoraFin(e.target.value)}
                className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-sm text-neutral-400">Motivo (opcional)</label>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: Feriado"
            className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm"
          />
        </div>

        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-emerald-950 px-3 py-1.5 text-sm font-medium text-emerald-400 hover:bg-emerald-900 disabled:opacity-50"
        >
          Guardar
        </button>
      </form>
    </div>
  );
}
