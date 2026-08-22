import pg from "pg";
import { generateSlots } from "./slots";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export interface Peluquero {
  id: string;
  nombre: string;
}

export interface HorarioFijo {
  id: string;
  peluquero_id: string;
  dia_semana: number;
  hora: string;
  cliente_nombre: string | null;
  activo: boolean;
  created_at: string;
}

export interface Servicio {
  id: string;
  nombre: string;
  precio: number;
}

export type ServicioPedido = "corte" | "barba_o_rapado" | "combo";

export type TurnoEstado = "pendiente" | "confirmado" | "rechazado" | "cancelado";

export interface Turno {
  id: string;
  peluquero_nombre: string;
  servicio_nombre: string;
  fecha: string;
  hora: string;
  cliente_nombre: string;
  cliente_whatsapp: string;
  estado: TurnoEstado;
  es_fijo?: boolean;
}

export { generateSlots };

export async function listPeluqueros(): Promise<Peluquero[]> {
  const res = await pool.query<Peluquero>(
    `SELECT id, nombre FROM peluqueros WHERE activo = true ORDER BY nombre`,
  );
  return res.rows;
}

export async function listHorariosFijos(
  peluqueroId: string,
): Promise<HorarioFijo[]> {
  const res = await pool.query<HorarioFijo>(
    `SELECT id, peluquero_id, dia_semana, hora, cliente_nombre, activo, created_at
     FROM horarios_fijos
     WHERE peluquero_id = $1
     ORDER BY dia_semana, hora`,
    [peluqueroId],
  );
  return res.rows;
}

export async function createHorarioFijo(input: {
  peluqueroId: string;
  diaSemana: number;
  hora: string;
  clienteNombre: string | null;
}): Promise<HorarioFijo> {
  const res = await pool.query<HorarioFijo>(
    `INSERT INTO horarios_fijos (peluquero_id, dia_semana, hora, cliente_nombre, activo)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id, peluquero_id, dia_semana, hora, cliente_nombre, activo, created_at`,
    [input.peluqueroId, input.diaSemana, input.hora, input.clienteNombre],
  );
  return res.rows[0];
}

export async function setHorarioFijoActivo(
  id: string,
  activo: boolean,
): Promise<void> {
  await pool.query(`UPDATE horarios_fijos SET activo = $2 WHERE id = $1`, [
    id,
    activo,
  ]);
}

export async function deleteHorarioFijo(id: string): Promise<void> {
  await pool.query(`DELETE FROM horarios_fijos WHERE id = $1`, [id]);
}

export async function listTurnos(fechaIso: string): Promise<Turno[]> {
  const dow = dowFromFechaIso(fechaIso);

  const [turnosRes, fijosRes] = await Promise.all([
    pool.query<Turno>(
      `SELECT t.id, p.nombre AS peluquero_nombre, s.nombre AS servicio_nombre,
              t.fecha, t.hora, t.cliente_nombre, t.cliente_whatsapp, t.estado
       FROM turnos t
       JOIN peluqueros p ON p.id = t.peluquero_id
       JOIN servicios s ON s.id = t.servicio_id
       WHERE t.fecha = $1`,
      [fechaIso],
    ),
    pool.query<{
      id: string;
      peluquero_nombre: string;
      hora: string;
      cliente_nombre: string | null;
    }>(
      `SELECT hf.id, p.nombre AS peluquero_nombre, hf.hora, hf.cliente_nombre
       FROM horarios_fijos hf
       JOIN peluqueros p ON p.id = hf.peluquero_id
       WHERE hf.dia_semana = $1 AND hf.activo = true`,
      [dow],
    ),
  ]);

  const fijosComoTurnos: Turno[] = fijosRes.rows.map((f) => ({
    id: `fijo:${f.id}`,
    peluquero_nombre: f.peluquero_nombre,
    servicio_nombre: "Turno fijo",
    fecha: fechaIso,
    hora: f.hora,
    cliente_nombre: f.cliente_nombre || "Turno fijo",
    cliente_whatsapp: "",
    estado: "confirmado",
    es_fijo: true,
  }));

  return [...turnosRes.rows, ...fijosComoTurnos].sort((a, b) => {
    if (a.peluquero_nombre !== b.peluquero_nombre) {
      return a.peluquero_nombre.localeCompare(b.peluquero_nombre);
    }
    return a.hora.localeCompare(b.hora);
  });
}

export async function setTurnoEstado(
  id: string,
  estado: TurnoEstado,
): Promise<void> {
  await pool.query(`UPDATE turnos SET estado = $2 WHERE id = $1`, [id, estado]);
}

export async function listServicios(): Promise<Servicio[]> {
  const res = await pool.query<Servicio>(
    `SELECT id, nombre, precio::float AS precio FROM servicios WHERE activo = true`,
  );
  return res.rows;
}

async function getServiciosMap(): Promise<{ corte: Servicio; barbaORapado: Servicio } | null> {
  const rows = await listServicios();
  const corte = rows.find((s) => s.nombre === "Corte de pelo");
  const barbaORapado = rows.find((s) => s.nombre === "Barba o rapado");
  if (!corte || !barbaORapado) return null;
  return { corte, barbaORapado };
}

// dow según extract(dow) de Postgres: 0 = domingo ... 6 = sábado. Se calcula
// en UTC para no depender de la zona horaria del proceso.
function dowFromFechaIso(fechaIso: string): number {
  const [y, m, d] = fechaIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export async function consultarDisponibilidad(
  peluqueroId: string,
  fechaIso: string,
): Promise<string[]> {
  const dow = dowFromFechaIso(fechaIso);
  const todos = generateSlots(dow);
  if (todos.length === 0) return [];

  const [ocupadosRes, fijosRes] = await Promise.all([
    pool.query<{ hora: string }>(
      `SELECT hora FROM turnos WHERE peluquero_id = $1 AND fecha = $2 AND estado IN ('pendiente','confirmado')`,
      [peluqueroId, fechaIso],
    ),
    pool.query<{ hora: string }>(
      `SELECT hora FROM horarios_fijos WHERE peluquero_id = $1 AND dia_semana = $2 AND activo = true`,
      [peluqueroId, dow],
    ),
  ]);

  const ocupados = new Set([
    ...ocupadosRes.rows.map((r) => r.hora.slice(0, 5)),
    ...fijosRes.rows.map((r) => r.hora.slice(0, 5)),
  ]);

  return todos.filter((t) => !ocupados.has(t));
}

export interface CrearTurnoManualInput {
  peluqueroId: string;
  servicio: ServicioPedido;
  fecha: string;
  hora: string;
  clienteNombre: string;
  clienteWhatsapp: string;
}

export type CrearTurnoManualResult =
  | { ok: true }
  | { ok: false; motivo: "servicios_no_encontrados" | "ocupado" | "horario_fijo" | "fuera_de_horario" | "error"; detalle?: string };

export async function crearTurnoManual(
  input: CrearTurnoManualInput,
): Promise<CrearTurnoManualResult> {
  const servicios = await getServiciosMap();
  if (!servicios) return { ok: false, motivo: "servicios_no_encontrados" };
  const { corte, barbaORapado } = servicios;

  const servicioId =
    input.servicio === "barba_o_rapado" ? barbaORapado.id : corte.id;

  try {
    await pool.query(
      `INSERT INTO turnos (peluquero_id, servicio_id, fecha, hora, cliente_nombre, cliente_whatsapp, estado)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmado')`,
      [input.peluqueroId, servicioId, input.fecha, input.hora, input.clienteNombre, input.clienteWhatsapp],
    );
    return { ok: true };
  } catch (err) {
    const pgErr = err as { code?: string; message?: string };
    if (pgErr.code === "23505") return { ok: false, motivo: "ocupado" };
    if (pgErr.code === "23514" && pgErr.message?.includes("reservado de forma fija")) {
      return { ok: false, motivo: "horario_fijo" };
    }
    if (pgErr.code === "23514") return { ok: false, motivo: "fuera_de_horario" };
    return { ok: false, motivo: "error", detalle: pgErr.message };
  }
}
