import { NextRequest, NextResponse } from "next/server";
import {
  createExcepcion,
  listExcepciones,
  listExcepcionesRango,
  validarExcepcionInput,
} from "@/lib/agenda-db";

export async function GET(req: NextRequest) {
  const desde = req.nextUrl.searchParams.get("desde");
  const hasta = req.nextUrl.searchParams.get("hasta");
  const excepciones =
    desde && hasta ? await listExcepcionesRango(desde, hasta) : await listExcepciones();
  return NextResponse.json({ excepciones });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const validado = validarExcepcionInput(body ?? {});
  if ("error" in validado) {
    return NextResponse.json({ error: validado.error }, { status: 400 });
  }

  try {
    const excepcion = await createExcepcion(validado.input);
    return NextResponse.json({ excepcion });
  } catch (err) {
    const pgErr = err as { code?: string; message?: string };
    if (pgErr.code === "23505") {
      return NextResponse.json(
        { error: "Ya existe una excepción de ese tipo para esa fecha." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "No se pudo guardar la excepción." }, { status: 500 });
  }
}
