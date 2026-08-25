"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ExcepcionAgenda, Peluquero, TipoExcepcion } from "@/lib/agenda-db";
import ExcepcionModal from "./ExcepcionModal";

const TIPO_STYLES: Record<TipoExcepcion, string> = {
  cerrado: "bg-red-950 text-red-400",
  peluquero_ausente: "bg-amber-950 text-amber-400",
  horario_especial: "bg-sky-950 text-sky-400",
};

const TIPO_LABEL: Record<TipoExcepcion, string> = {
  cerrado: "Cerrado",
  peluquero_ausente: "Peluquero ausente",
  horario_especial: "Horario especial",
};

function detalle(e: ExcepcionAgenda): string {
  if (e.tipo === "peluquero_ausente") return e.peluquero_nombre ?? "";
  if (e.tipo === "horario_especial") {
    return `${e.hora_inicio?.slice(0, 5)} - ${e.hora_fin?.slice(0, 5)}`;
  }
  return "";
}

export default function ExcepcionesView() {
  const [excepciones, setExcepciones] = useState<ExcepcionAgenda[]>([]);
  const [peluqueros, setPeluqueros] = useState<Peluquero[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<ExcepcionAgenda | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch("/api/excepciones");
      const data = await res.json();
      setExcepciones(data.excepciones ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    fetch("/api/peluqueros")
      .then((r) => r.json())
      .then((data) => setPeluqueros(data.peluqueros ?? []));
  }, []);

  async function eliminar(e: ExcepcionAgenda) {
    if (!confirm(`¿Eliminar esta excepción del ${e.fecha}?`)) return;
    await fetch(`/api/excepciones/${e.id}`, { method: "DELETE" });
    await reload();
  }

  function cerrarModal() {
    setModalAbierto(false);
    setEditando(null);
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Excepciones de agenda</h1>
          <p className="text-sm text-neutral-400">
            Cierres puntuales, ausencias de peluquero y horarios especiales.
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
        <button
          onClick={() => setModalAbierto(true)}
          className="rounded-md bg-emerald-950 px-3 py-1.5 text-sm font-medium text-emerald-400 hover:bg-emerald-900"
        >
          Nueva excepción
        </button>
      </div>

      <div className="divide-y divide-neutral-900 rounded-lg border border-neutral-800">
        {!loading && excepciones.length === 0 && (
          <p className="p-4 text-sm text-neutral-500">Todavía no hay excepciones cargadas.</p>
        )}
        {excepciones.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-medium">
                {e.fecha}
                {detalle(e) && ` · ${detalle(e)}`}
              </p>
              {e.motivo && <p className="text-sm text-neutral-500">{e.motivo}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TIPO_STYLES[e.tipo]}`}
              >
                {TIPO_LABEL[e.tipo]}
              </span>
              <button
                onClick={() => setEditando(e)}
                className="rounded-md border border-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-900"
              >
                Editar
              </button>
              <button
                onClick={() => eliminar(e)}
                className="rounded-md border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950"
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      {(modalAbierto || editando) && (
        <ExcepcionModal
          excepcion={editando ?? undefined}
          peluqueros={peluqueros}
          onClose={cerrarModal}
          onGuardado={() => {
            cerrarModal();
            reload();
          }}
        />
      )}
    </div>
  );
}
