import { NextRequest, NextResponse } from "next/server";
import { consultarDisponibilidad } from "@/lib/agenda-db";

export async function GET(req: NextRequest) {
  const peluqueroId = req.nextUrl.searchParams.get("peluqueroId");
  const fecha = req.nextUrl.searchParams.get("fecha");
  if (!peluqueroId || !fecha) {
    return NextResponse.json({ error: "faltan peluqueroId o fecha" }, { status: 400 });
  }
  const horarios_libres = await consultarDisponibilidad(peluqueroId, fecha);
  return NextResponse.json({ horarios_libres });
}
