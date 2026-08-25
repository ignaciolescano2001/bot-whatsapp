"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DIAS_ABIERTOS, generateSlots, generateSlotsEnRango } from "@/lib/slots";
import type { ExcepcionAgenda, Peluquero, Servicio, Turno, TurnoEstado } from "@/lib/agenda-db";
import TurnoDetailModal from "./TurnoDetailModal";
import CrearTurnoModal from "./CrearTurnoModal";

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const CHIP_STYLES: Record<TurnoEstado, string> = {
  confirmado: "bg-emerald-950 text-emerald-300 border-emerald-900",
  pendiente: "bg-amber-950 text-amber-300 border-amber-900",
  cancelado: "bg-neutral-900 text-neutral-500 border-neutral-800",
  rechazado: "bg-red-950 text-red-300 border-red-900",
};

function dowFromFechaIso(fechaIso: string): number {
  const [y, m, d] = fechaIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDiasIso(fechaIso: string, dias: number): string {
  const [y, m, d] = fechaIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
}

// La semana laboral arranca martes. Si "hoy" cae domingo o lunes, se
// muestra por defecto la próxima semana laboral (el martes que viene).
function weekStartFor(fechaIso: string): string {
  const dow = dowFromFechaIso(fechaIso);
  if (dow === 0) return addDiasIso(fechaIso, 2);
  if (dow === 1) return addDiasIso(fechaIso, 1);
  return addDiasIso(fechaIso, 2 - dow);
}

function fmtRango(desde: string, hasta: string): string {
  const [, md, dd] = desde.split("-").map(Number);
  const [, mh, dh] = hasta.split("-").map(Number);
  if (md === mh) return `${dd} - ${dh} ${MESES[md - 1]}`;
  return `${dd} ${MESES[md - 1]} - ${dh} ${MESES[mh - 1]}`;
}

export default function AgendaSemanalView() {
  const [weekStart, setWeekStart] = useState(() => weekStartFor(hoyArgentina()));
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [excepciones, setExcepciones] = useState<ExcepcionAgenda[]>([]);
  const [loading, setLoading] = useState(false);
  const [peluqueros, setPeluqueros] = useState<Peluquero[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);

  const [detalle, setDetalle] = useState<Turno | null>(null);
  const [alta, setAlta] = useState<{ fecha: string; hora: string } | null>(null);

  const dias = useMemo(
    () =>
      DIAS_ABIERTOS.map((d, i) => ({
        ...d,
        fecha: addDiasIso(weekStart, i),
      })),
    [weekStart],
  );

  const hoy = hoyArgentina();
  const hasta = dias[dias.length - 1]?.fecha ?? weekStart;

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch(`/api/turnos/semana?desde=${weekStart}`);
      const data = await res.json();
      setTurnos(data.turnos ?? []);
      setExcepciones(data.excepciones ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  useEffect(() => {
    fetch("/api/peluqueros")
      .then((r) => r.json())
      .then((data) => setPeluqueros(data.peluqueros ?? []));
    fetch("/api/servicios")
      .then((r) => r.json())
      .then((data) => setServicios(data.servicios ?? []));
  }, []);

  const filasHora = useMemo(() => {
    const set = new Set<string>([...generateSlots(2), ...generateSlots(6)]);
    return Array.from(set).sort();
  }, []);

  const porCelda = useMemo(() => {
    const map = new Map<string, Turno[]>();
    for (const t of turnos) {
      const key = `${t.fecha}|${t.hora.slice(0, 5)}`;
      const arr = map.get(key);
      if (arr) arr.push(t);
      else map.set(key, [t]);
    }
    return map;
  }, [turnos]);

  const excepcionesPorFecha = useMemo(() => {
    const map = new Map<
      string,
      {
        cerrado?: string | null;
        especial?: { inicio: string; fin: string };
        ausentes: { id: string; nombre: string }[];
      }
    >();
    for (const e of excepciones) {
      const entry = map.get(e.fecha) ?? { ausentes: [] };
      if (e.tipo === "cerrado") {
        entry.cerrado = e.motivo;
      } else if (e.tipo === "horario_especial" && e.hora_inicio && e.hora_fin) {
        entry.especial = { inicio: e.hora_inicio.slice(0, 5), fin: e.hora_fin.slice(0, 5) };
      } else if (e.tipo === "peluquero_ausente" && e.peluquero_id) {
        entry.ausentes.push({ id: e.peluquero_id, nombre: e.peluquero_nombre ?? "" });
      }
      map.set(e.fecha, entry);
    }
    return map;
  }, [excepciones]);

  function cerrarModales() {
    setDetalle(null);
    setAlta(null);
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Agenda semanal</h1>
          <p className="text-sm text-neutral-400">
            Vista de la semana completa, martes a sábado.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900"
        >
          ← Conversaciones
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart((w) => addDiasIso(w, -7))}
            className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900"
          >
            ‹ Semana anterior
          </button>
          <span className="px-2 text-sm font-medium">{fmtRango(weekStart, hasta)}</span>
          <button
            onClick={() => setWeekStart((w) => addDiasIso(w, 7))}
            className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900"
          >
            Semana siguiente ›
          </button>
        </div>
        <button
          onClick={() => setWeekStart(weekStartFor(hoyArgentina()))}
          className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white"
        >
          Hoy
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 720 }}>
          <thead>
            <tr className="border-b border-neutral-800">
              <th className="w-20 shrink-0 border-r border-neutral-800 bg-neutral-950 px-2 py-2 text-left text-neutral-400">
                Hora
              </th>
              {dias.map((d) => {
                const exc = excepcionesPorFecha.get(d.fecha);
                return (
                  <th
                    key={d.value}
                    className={`min-w-[140px] px-2 py-2 text-left ${
                      d.fecha === hoy
                        ? "bg-neutral-900 text-neutral-100"
                        : "text-neutral-400"
                    }`}
                  >
                    {d.label.toUpperCase()}
                    <span className="ml-1 font-normal text-neutral-500">
                      {d.fecha.slice(8, 10)}
                    </span>
                    {exc?.cerrado !== undefined && (
                      <span className="ml-2 inline-block rounded-full bg-red-950 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                        🔴 CERRADO
                      </span>
                    )}
                    {exc?.cerrado === undefined && exc && exc.ausentes.length > 0 && (
                      <p className="mt-0.5 truncate text-[10px] font-normal text-amber-500">
                        {exc.ausentes.map((a) => a.nombre).join(", ")} ausente
                      </p>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filasHora.map((hora) => (
              <tr key={hora} className="border-b border-neutral-900">
                <td className="border-r border-neutral-800 px-2 py-1.5 text-neutral-400">
                  {hora}
                </td>
                {dias.map((d) => {
                  const exc = excepcionesPorFecha.get(d.fecha);
                  const slotsDelDia = exc?.especial
                    ? generateSlotsEnRango(exc.especial.inicio, exc.especial.fin)
                    : generateSlots(d.value);
                  const abierto = exc?.cerrado === undefined && slotsDelDia.includes(hora);
                  if (!abierto) {
                    return (
                      <td
                        key={d.value}
                        className="bg-neutral-900/40 px-2 py-1.5 text-neutral-700"
                      >
                        —
                      </td>
                    );
                  }
                  const items = porCelda.get(`${d.fecha}|${hora}`) ?? [];
                  return (
                    <td key={d.value} className="align-top px-1.5 py-1.5">
                      {items.length === 0 ? (
                        <button
                          onClick={() => setAlta({ fecha: d.fecha, hora })}
                          className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-neutral-800 py-2 text-xs text-neutral-600 hover:border-neutral-600 hover:text-neutral-400"
                        >
                          Libre
                        </button>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {items.map((t) => (
                            <button
                              key={t.id}
                              onClick={() => setDetalle(t)}
                              className={`rounded-md border px-2 py-1 text-left text-xs ${
                                t.es_fijo
                                  ? "border-sky-900 bg-sky-950 text-sky-300"
                                  : CHIP_STYLES[t.estado]
                              }`}
                            >
                              <p className="truncate font-medium">{t.cliente_nombre}</p>
                              <p className="truncate opacity-80">
                                {t.servicio_nombre} · {t.peluquero_nombre}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loading && <p className="mt-3 text-sm text-neutral-500">Cargando…</p>}

      {detalle && (
        <TurnoDetailModal
          turno={detalle}
          onClose={() => setDetalle(null)}
          onCancelado={() => {
            cerrarModales();
            reload();
          }}
        />
      )}

      {alta && (
        <CrearTurnoModal
          fecha={alta.fecha}
          hora={alta.hora}
          peluqueros={peluqueros}
          peluquerosAusentesIds={
            excepcionesPorFecha.get(alta.fecha)?.ausentes.map((a) => a.id) ?? []
          }
          servicios={servicios}
          onClose={() => setAlta(null)}
          onCreado={() => {
            cerrarModales();
            reload();
          }}
        />
      )}
    </div>
  );
}
