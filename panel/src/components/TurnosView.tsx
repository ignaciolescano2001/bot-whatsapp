"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Peluquero, Servicio, ServicioPedido, Turno, TurnoEstado } from "@/lib/agenda-db";

function hoyIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const ESTADO_STYLES: Record<TurnoEstado, string> = {
  confirmado: "bg-emerald-950 text-emerald-400",
  pendiente: "bg-amber-950 text-amber-400",
  cancelado: "bg-neutral-900 text-neutral-500",
  rechazado: "bg-red-950 text-red-400",
};

function fmtPrice(n: number): string {
  return "$" + n.toLocaleString("es-AR");
}

export default function TurnosView() {
  const [fecha, setFecha] = useState(hoyIso());
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [loading, setLoading] = useState(false);

  const [peluqueros, setPeluqueros] = useState<Peluquero[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [formPeluqueroId, setFormPeluqueroId] = useState("");
  const [formServicio, setFormServicio] = useState<ServicioPedido>("corte");
  const [formFecha, setFormFecha] = useState(fecha);
  const [formHora, setFormHora] = useState("");
  const [horariosLibres, setHorariosLibres] = useState<string[]>([]);
  const [formClienteNombre, setFormClienteNombre] = useState("");
  const [formClienteWhatsapp, setFormClienteWhatsapp] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch(`/api/turnos?fecha=${fecha}`);
      const data = await res.json();
      setTurnos(data.turnos ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha]);

  useEffect(() => {
    fetch("/api/peluqueros")
      .then((r) => r.json())
      .then((data) => {
        setPeluqueros(data.peluqueros ?? []);
        if (data.peluqueros?.[0]) setFormPeluqueroId(data.peluqueros[0].id);
      });
    fetch("/api/servicios")
      .then((r) => r.json())
      .then((data) => setServicios(data.servicios ?? []));
  }, []);

  useEffect(() => {
    if (!formPeluqueroId || !formFecha) return;
    setFormHora("");
    fetch(`/api/turnos/disponibilidad?peluqueroId=${formPeluqueroId}&fecha=${formFecha}`)
      .then((r) => r.json())
      .then((data) => setHorariosLibres(data.horarios_libres ?? []));
  }, [formPeluqueroId, formFecha]);

  const corte = servicios.find((s) => s.nombre === "Corte de pelo");
  const barbaORapado = servicios.find((s) => s.nombre === "Barba o rapado");
  const precioServicio =
    formServicio === "corte"
      ? corte?.precio
      : formServicio === "barba_o_rapado"
        ? barbaORapado?.precio
        : formServicio === "rapado_y_barba"
          ? barbaORapado
            ? barbaORapado.precio * 2
            : undefined
          : corte && barbaORapado
            ? corte.precio + barbaORapado.precio
            : undefined;

  async function cancelar(t: Turno) {
    if (!confirm(`¿Cancelar el turno de ${t.cliente_nombre} (${t.hora.slice(0, 5)})?`)) return;
    await fetch(`/api/turnos/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "cancelado" }),
    });
    await reload();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!formHora) {
      setFormError("Elegí un horario.");
      return;
    }
    setFormLoading(true);
    try {
      const res = await fetch("/api/turnos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peluqueroId: formPeluqueroId,
          servicio: formServicio,
          fecha: formFecha,
          hora: formHora,
          clienteNombre: formClienteNombre,
          clienteWhatsapp: formClienteWhatsapp,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "No se pudo guardar.");
        return;
      }
      setFormClienteNombre("");
      setFormClienteWhatsapp("");
      setFormHora("");
      setShowForm(false);
      if (formFecha === fecha) {
        await reload();
      } else {
        setFecha(formFecha);
      }
    } finally {
      setFormLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Turnos</h1>
          <p className="text-sm text-neutral-400">
            Turnos reservados por el bot y por la landing, en tiempo real.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900"
        >
          ← Conversaciones
        </Link>
      </div>

      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="text-sm text-neutral-400">Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm"
          />
        </div>
        <button
          onClick={() => {
            setFormFecha(fecha);
            setFormError("");
            setShowForm((v) => !v);
          }}
          className="rounded-md bg-emerald-950 px-3 py-1.5 text-sm font-medium text-emerald-400 hover:bg-emerald-900"
        >
          {showForm ? "Cancelar" : "Cargar turno a mano"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 p-4"
        >
          <div>
            <label className="mb-1 block text-sm text-neutral-400">
              Peluquero
            </label>
            <div className="flex gap-2">
              {peluqueros.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setFormPeluqueroId(p.id)}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    formPeluqueroId === p.id
                      ? "bg-neutral-100 text-neutral-900"
                      : "border border-neutral-800 text-neutral-300 hover:bg-neutral-900"
                  }`}
                >
                  {p.nombre}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-neutral-400">
              Servicio
            </label>
            <select
              value={formServicio}
              onChange={(e) => setFormServicio(e.target.value as ServicioPedido)}
              className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm"
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
          <div>
            <label className="mb-1 block text-sm text-neutral-400">Fecha</label>
            <input
              type="date"
              value={formFecha}
              onChange={(e) => setFormFecha(e.target.value)}
              className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-neutral-400">Hora</label>
            <select
              value={formHora}
              onChange={(e) => setFormHora(e.target.value)}
              className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm"
            >
              <option value="">
                {horariosLibres.length === 0 ? "Sin horarios libres" : "Elegir…"}
              </option>
              {horariosLibres.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[10rem] flex-1">
            <label className="mb-1 block text-sm text-neutral-400">
              Nombre del cliente
            </label>
            <input
              value={formClienteNombre}
              onChange={(e) => setFormClienteNombre(e.target.value)}
              className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="min-w-[10rem] flex-1">
            <label className="mb-1 block text-sm text-neutral-400">
              WhatsApp del cliente
            </label>
            <input
              value={formClienteWhatsapp}
              onChange={(e) => setFormClienteWhatsapp(e.target.value)}
              placeholder="Ej: 3548123456"
              className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={formLoading || !formPeluqueroId}
            className="rounded-md bg-emerald-950 px-3 py-1.5 text-sm font-medium text-emerald-400 hover:bg-emerald-900 disabled:opacity-50"
          >
            Reservar
          </button>
          {formError && <p className="w-full text-sm text-red-400">{formError}</p>}
        </form>
      )}

      <div className="divide-y divide-neutral-900 rounded-lg border border-neutral-800">
        {!loading && turnos.length === 0 && (
          <p className="p-4 text-sm text-neutral-500">
            No hay turnos para este día.
          </p>
        )}
        {turnos.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium">
                {t.hora.slice(0, 5)} · {t.peluquero_nombre} · {t.servicio_nombre}
              </p>
              <p className="text-sm text-neutral-500">
                {t.cliente_nombre}
                {t.cliente_whatsapp ? ` · ${t.cliente_whatsapp}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {t.es_fijo ? (
                <Link
                  href="/horarios-fijos"
                  className="shrink-0 rounded-full bg-sky-950 px-2 py-0.5 text-xs font-medium text-sky-400 hover:bg-sky-900"
                  title="Se gestiona en Horarios fijos"
                >
                  fijo
                </Link>
              ) : (
                <>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_STYLES[t.estado]}`}
                  >
                    {t.estado}
                  </span>
                  {(t.estado === "confirmado" || t.estado === "pendiente") && (
                    <button
                      onClick={() => cancelar(t)}
                      className="rounded-md border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950"
                    >
                      Cancelar
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
