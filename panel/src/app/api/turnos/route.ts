import { NextRequest, NextResponse } from "next/server";
import { crearTurnoManual, listTurnos, type ServicioPedido } from "@/lib/agenda-db";

export async function GET(req: NextRequest) {
  const fecha = req.nextUrl.searchParams.get("fecha");
  if (!fecha) {
    return NextResponse.json({ error: "falta fecha" }, { status: 400 });
  }
  const turnos = await listTurnos(fecha);
  return NextResponse.json({ turnos });
}

const SERVICIOS_VALIDOS: ServicioPedido[] = ["corte", "barba_o_rapado", "combo", "rapado_y_barba"];

const MOTIVO_MENSAJE: Record<string, string> = {
  ocupado: "Justo se ocupó ese horario. Elegí otro.",
  horario_fijo: "Ese horario está reservado de forma fija.",
  fuera_de_horario: "Ese horario está fuera de la atención del local.",
  cerrado: "Ese día la peluquería permanece cerrada.",
  peluquero_ausente: "Ese peluquero no está disponible ese día.",
  fuera_de_horario_especial: "Ese horario está fuera del horario especial de ese día.",
  servicios_no_encontrados: "No se encontraron los servicios en la base.",
  error: "No se pudo guardar el turno.",
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { peluqueroId, servicio, fecha, hora, clienteNombre, clienteWhatsapp } = body ?? {};

  if (typeof peluqueroId !== "string" || !peluqueroId) {
    return NextResponse.json({ error: "falta peluqueroId" }, { status: 400 });
  }
  if (!SERVICIOS_VALIDOS.includes(servicio)) {
    return NextResponse.json({ error: "servicio inválido" }, { status: 400 });
  }
  if (typeof fecha !== "string" || !fecha) {
    return NextResponse.json({ error: "falta fecha" }, { status: 400 });
  }
  if (typeof hora !== "string" || !hora) {
    return NextResponse.json({ error: "falta hora" }, { status: 400 });
  }
  if (typeof clienteNombre !== "string" || !clienteNombre.trim()) {
    return NextResponse.json({ error: "falta el nombre del cliente" }, { status: 400 });
  }
  if (typeof clienteWhatsapp !== "string" || !clienteWhatsapp.trim()) {
    return NextResponse.json({ error: "falta el WhatsApp del cliente" }, { status: 400 });
  }

  const result = await crearTurnoManual({
    peluqueroId,
    servicio,
    fecha,
    hora: `${hora}:00`,
    clienteNombre: clienteNombre.trim(),
    clienteWhatsapp: clienteWhatsapp.trim(),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: MOTIVO_MENSAJE[result.motivo] ?? "No se pudo guardar el turno." },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
