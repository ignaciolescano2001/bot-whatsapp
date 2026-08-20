import { NextResponse } from "next/server";
import { listPeluqueros } from "@/lib/agenda-db";

export async function GET() {
  const peluqueros = await listPeluqueros();
  return NextResponse.json({ peluqueros });
}
