import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const CLOSED_DAYS = [0, 1]; // domingo, lunes

function getHoursForDow(dow: number): [number, number, number, number][] {
  if (dow >= 2 && dow <= 5) return [[9, 30, 13, 0], [16, 30, 21, 0]];
  if (dow === 6) return [[9, 0, 16, 0]];
  return [];
}

function generateSlots(dow: number): string[] {
  const slots: string[] = [];
  for (const [h1, m1, h2, m2] of getHoursForDow(dow)) {
    let cur = h1 * 60 + m1;
    const end = h2 * 60 + m2;
    while (cur + 30 <= end) {
      const h = Math.floor(cur / 60);
      const m = cur % 60;
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      cur += 30;
    }
  }
  return slots;
}

// dow según extract(dow) de Postgres: 0 = domingo ... 6 = sábado. Se calcula
// en UTC para no depender de la zona horaria del proceso.
function dowFromFechaIso(fechaIso: string): number {
  const [y, m, d] = fechaIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export type PeluqueroNombre = "Ignacio" | "Chino";
export type ServicioPedido = "corte" | "barba_o_rapado" | "combo";

interface Peluquero {
  id: string;
  nombre: string;
}

interface Servicio {
  id: string;
  nombre: string;
  precio: number;
}

async function getPeluqueroPorNombre(nombre: string): Promise<Peluquero | null> {
  const res = await pool.query<Peluquero>(
    `SELECT id, nombre FROM peluqueros WHERE activo = true AND nombre ILIKE $1 LIMIT 1`,
    [nombre],
  );
  return res.rows[0] ?? null;
}

async function getServicios(): Promise<{ corte: Servicio; barbaORapado: Servicio } | null> {
  const res = await pool.query<Servicio>(
    `SELECT id, nombre, precio::float AS precio FROM servicios WHERE activo = true`,
  );
  const corte = res.rows.find((s) => s.nombre === "Corte de pelo");
  const barbaORapado = res.rows.find((s) => s.nombre === "Barba o rapado");
  if (!corte || !barbaORapado) return null;
  return { corte, barbaORapado };
}

export interface DisponibilidadResult {
  ok: true;
  peluquero: string;
  fecha: string;
  cerrado: boolean;
  horarios_libres: string[];
}

export async function consultarDisponibilidad(
  peluqueroNombre: string,
  fechaIso: string,
): Promise<DisponibilidadResult | { ok: false; error: string }> {
  const peluquero = await getPeluqueroPorNombre(peluqueroNombre);
  if (!peluquero) {
    return { ok: false, error: `No encontré al peluquero "${peluqueroNombre}".` };
  }

  const dow = dowFromFechaIso(fechaIso);
  if (CLOSED_DAYS.includes(dow)) {
    return { ok: true, peluquero: peluquero.nombre, fecha: fechaIso, cerrado: true, horarios_libres: [] };
  }

  const todos = generateSlots(dow);

  const [ocupadosRes, fijosRes] = await Promise.all([
    pool.query<{ hora: string }>(
      `SELECT hora FROM turnos WHERE peluquero_id = $1 AND fecha = $2 AND estado IN ('pendiente','confirmado')`,
      [peluquero.id, fechaIso],
    ),
    pool.query<{ hora: string }>(
      `SELECT hora FROM horarios_fijos WHERE peluquero_id = $1 AND dia_semana = $2 AND activo = true`,
      [peluquero.id, dow],
    ),
  ]);

  const ocupados = new Set([
    ...ocupadosRes.rows.map((r) => r.hora.slice(0, 5)),
    ...fijosRes.rows.map((r) => r.hora.slice(0, 5)),
  ]);

  return {
    ok: true,
    peluquero: peluquero.nombre,
    fecha: fechaIso,
    cerrado: false,
    horarios_libres: todos.filter((t) => !ocupados.has(t)),
  };
}

export interface CrearTurnoInput {
  peluquero: string;
  servicio: ServicioPedido;
  fecha: string;
  hora: string;
  clienteNombre: string;
  clienteWhatsapp: string;
}

export type CrearTurnoResult =
  | {
      ok: true;
      peluquero: string;
      servicio_label: string;
      precio: number;
      fecha: string;
      hora: string;
    }
  | { ok: false; motivo: "peluquero_no_encontrado" | "ocupado" | "horario_fijo" | "fuera_de_horario" | "error"; detalle?: string };

export async function crearTurno(input: CrearTurnoInput): Promise<CrearTurnoResult> {
  const peluquero = await getPeluqueroPorNombre(input.peluquero);
  if (!peluquero) return { ok: false, motivo: "peluquero_no_encontrado" };

  const servicios = await getServicios();
  if (!servicios) return { ok: false, motivo: "error", detalle: "No pude leer los servicios." };
  const { corte, barbaORapado } = servicios;

  let servicioId: string;
  let servicioLabel: string;
  let precio: number;
  if (input.servicio === "corte") {
    servicioId = corte.id;
    servicioLabel = "Corte de pelo";
    precio = corte.precio;
  } else if (input.servicio === "barba_o_rapado") {
    servicioId = barbaORapado.id;
    servicioLabel = "Barba o rapado";
    precio = barbaORapado.precio;
  } else {
    // "combo" es siempre corte + barba, nunca corte + rapado (rapar
    // reemplaza al corte, no tiene sentido combinarlos).
    servicioId = corte.id;
    servicioLabel = "Corte de pelo + Barba";
    precio = corte.precio + barbaORapado.precio;
  }

  try {
    await pool.query(
      `INSERT INTO turnos (peluquero_id, servicio_id, fecha, hora, cliente_nombre, cliente_whatsapp, estado)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmado')`,
      [peluquero.id, servicioId, input.fecha, input.hora, input.clienteNombre, input.clienteWhatsapp],
    );
    return {
      ok: true,
      peluquero: peluquero.nombre,
      servicio_label: servicioLabel,
      precio,
      fecha: input.fecha,
      hora: input.hora,
    };
  } catch (err) {
    const pgErr = err as { code?: string; message?: string };
    if (pgErr.code === "23505") {
      return { ok: false, motivo: "ocupado" };
    }
    if (pgErr.code === "23514" && pgErr.message?.includes("reservado de forma fija")) {
      return { ok: false, motivo: "horario_fijo" };
    }
    if (pgErr.code === "23514") {
      return { ok: false, motivo: "fuera_de_horario" };
    }
    return { ok: false, motivo: "error", detalle: pgErr.message };
  }
}
