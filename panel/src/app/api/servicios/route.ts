import { NextResponse } from "next/server";
import { listServicios } from "@/lib/agenda-db";

export async function GET() {
  const servicios = await listServicios();
  return NextResponse.json({ servicios });
}
