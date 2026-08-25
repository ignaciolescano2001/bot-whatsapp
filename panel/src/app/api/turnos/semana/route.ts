import { NextRequest, NextResponse } from "next/server";
import { listExcepcionesRango, listTurnosSemana } from "@/lib/agenda-db";

function addDiasIso(fechaIso: string, dias: number): string {
  const d = new Date(fechaIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const desde = req.nextUrl.searchParams.get("desde");
  if (!desde || !/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
    return NextResponse.json({ error: "falta desde (YYYY-MM-DD)" }, { status: 400 });
  }
  const hasta = addDiasIso(desde, 4);
  const [turnos, excepciones] = await Promise.all([
    listTurnosSemana(desde, hasta),
    listExcepcionesRango(desde, hasta),
  ]);
  return NextResponse.json({ desde, hasta, turnos, excepciones });
}
