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

// Igual que generateSlots pero para un rango de horas arbitrario (usado por
// las excepciones de "horario especial"), no atado a getHoursForDow.
export function generateSlotsEnRango(horaInicio: string, horaFin: string): string[] {
  const [h1, m1] = horaInicio.split(":").map(Number);
  const [h2, m2] = horaFin.split(":").map(Number);
  const slots: string[] = [];
  let cur = h1 * 60 + m1;
  const end = h2 * 60 + m2;
  while (cur + 30 <= end) {
    const h = Math.floor(cur / 60);
    const m = cur % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    cur += 30;
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
export type ServicioPedido = "corte" | "barba_o_rapado" | "combo" | "rapado_y_barba";

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

export type TipoExcepcion = "cerrado" | "peluquero_ausente" | "horario_especial";

interface ExcepcionRow {
  tipo: TipoExcepcion;
  peluquero_id: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  motivo: string | null;
}

interface ExcepcionesResueltas {
  cerrado: boolean;
  motivoCierre?: string;
  horarioEspecial?: { inicio: string; fin: string; motivo?: string };
  peluquerosAusentes: Map<string, string | null>;
}

// Función pura: no toca la DB, solo interpreta las filas de excepciones de
// un día. Se testea sin necesidad de una conexión real (ver
// scripts/test-excepciones.ts).
export function resolverExcepciones(excepciones: ExcepcionRow[]): ExcepcionesResueltas {
  const resultado: ExcepcionesResueltas = { cerrado: false, peluquerosAusentes: new Map() };
  for (const e of excepciones) {
    if (e.tipo === "cerrado") {
      resultado.cerrado = true;
      resultado.motivoCierre = e.motivo ?? undefined;
    } else if (e.tipo === "horario_especial" && e.hora_inicio && e.hora_fin) {
      resultado.horarioEspecial = {
        inicio: e.hora_inicio.slice(0, 5),
        fin: e.hora_fin.slice(0, 5),
        motivo: e.motivo ?? undefined,
      };
    } else if (e.tipo === "peluquero_ausente" && e.peluquero_id) {
      resultado.peluquerosAusentes.set(e.peluquero_id, e.motivo ?? null);
    }
  }
  return resultado;
}

async function getExcepcionesDia(fechaIso: string): Promise<ExcepcionRow[]> {
  const res = await pool.query<ExcepcionRow>(
    `SELECT tipo, peluquero_id, hora_inicio, hora_fin, motivo
     FROM excepciones_agenda WHERE fecha = $1`,
    [fechaIso],
  );
  return res.rows;
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
  motivo_cierre?: string;
  peluquero_ausente?: boolean;
  motivo_ausencia?: string;
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

  const excepciones = resolverExcepciones(await getExcepcionesDia(fechaIso));

  if (excepciones.cerrado) {
    return {
      ok: true,
      peluquero: peluquero.nombre,
      fecha: fechaIso,
      cerrado: true,
      motivo_cierre: excepciones.motivoCierre,
      horarios_libres: [],
    };
  }

  if (excepciones.peluquerosAusentes.has(peluquero.id)) {
    return {
      ok: true,
      peluquero: peluquero.nombre,
      fecha: fechaIso,
      cerrado: false,
      peluquero_ausente: true,
      motivo_ausencia: excepciones.peluquerosAusentes.get(peluquero.id) ?? undefined,
      horarios_libres: [],
    };
  }

  const todos = excepciones.horarioEspecial
    ? generateSlotsEnRango(excepciones.horarioEspecial.inicio, excepciones.horarioEspecial.fin)
    : generateSlots(dow);

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
  | {
      ok: false;
      motivo:
        | "peluquero_no_encontrado"
        | "cerrado"
        | "peluquero_ausente"
        | "fuera_de_horario_especial"
        | "ocupado"
        | "horario_fijo"
        | "fuera_de_horario"
        | "error";
      detalle?: string;
    };

export async function crearTurno(input: CrearTurnoInput): Promise<CrearTurnoResult> {
  const peluquero = await getPeluqueroPorNombre(input.peluquero);
  if (!peluquero) return { ok: false, motivo: "peluquero_no_encontrado" };

  const excepciones = resolverExcepciones(await getExcepcionesDia(input.fecha));
  if (excepciones.cerrado) {
    return { ok: false, motivo: "cerrado", detalle: excepciones.motivoCierre };
  }
  if (excepciones.peluquerosAusentes.has(peluquero.id)) {
    return {
      ok: false,
      motivo: "peluquero_ausente",
      detalle: excepciones.peluquerosAusentes.get(peluquero.id) ?? undefined,
    };
  }
  if (excepciones.horarioEspecial) {
    const slotsValidos = generateSlotsEnRango(
      excepciones.horarioEspecial.inicio,
      excepciones.horarioEspecial.fin,
    );
    if (!slotsValidos.includes(input.hora.slice(0, 5))) {
      return { ok: false, motivo: "fuera_de_horario_especial" };
    }
  }

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
  } else if (input.servicio === "rapado_y_barba") {
    // Rapado y barba sí se combinan (son partes distintas: cabeza y
    // barba), a diferencia de corte + rapado que son excluyentes. Mismo
    // servicio_id que "barba_o_rapado" (no hay ítem propio de "rapado" en
    // la tabla servicios), precio sumado sin descuento.
    servicioId = barbaORapado.id;
    servicioLabel = "Rapado + Barba";
    precio = barbaORapado.precio * 2;
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
