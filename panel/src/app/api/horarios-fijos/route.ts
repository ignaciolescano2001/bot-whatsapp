import { NextRequest, NextResponse } from "next/server";
import {
  createHorarioFijo,
  generateSlots,
  listHorariosFijos,
} from "@/lib/agenda-db";

export async function GET(req: NextRequest) {
  const peluqueroId = req.nextUrl.searchParams.get("peluqueroId");
  if (!peluqueroId) {
    return NextResponse.json({ error: "falta peluqueroId" }, { status: 400 });
  }
  const horarios = await listHorariosFijos(peluqueroId);
  return NextResponse.json({ horarios });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { peluqueroId, diaSemana, hora, clienteNombre } = body ?? {};

  if (typeof peluqueroId !== "string" || !peluqueroId) {
    return NextResponse.json({ error: "falta peluqueroId" }, { status: 400 });
  }
  if (typeof diaSemana !== "number" || diaSemana < 2 || diaSemana > 6) {
    return NextResponse.json(
      { error: "el local solo atiende de martes (2) a sábado (6)" },
      { status: 400 },
    );
  }
  if (!generateSlots(diaSemana).includes(hora)) {
    return NextResponse.json(
      { error: "ese horario no es un turno válido para ese día" },
      { status: 400 },
    );
  }

  const horario = await createHorarioFijo({
    peluqueroId,
    diaSemana,
    hora: `${hora}:00`,
    clienteNombre: typeof clienteNombre === "string" && clienteNombre.trim() ? clienteNombre.trim() : null,
  });
  return NextResponse.json({ horario });
}
