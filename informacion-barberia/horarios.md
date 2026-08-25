# Horarios de atención — Barbería Don Isidoro

## Local (atención presencial)
- **Martes a viernes:** de 9:30 a 13:00 y de 16:30 a 21:00
- **Sábados:** de 9:00 a 16:00
- **Domingos y lunes:** cerrado

## Turnos
- Se reservan con antelación, con **agenda separada para cada peluquero** (Ignacio / Chino), conectada en tiempo real a la base de turnos.
- Duración aproximada de cada turno: **30 minutos**.
- Se puede cancelar o reprogramar hasta **1 hora antes** del turno (esto lo gestiona una persona del local, el bot todavía no puede cancelar ni reprogramar).

## Atención del bot
- El bot responde **las 24 horas, todos los días**, aunque el local esté
  cerrado.
- El bot consulta la disponibilidad real de cada peluquero y **confirma el
  turno en el momento** si el horario está libre. No hay recordatorio
  automático todavía (queda para una próxima etapa).

## Excepciones puntuales
Estos horarios son los habituales, pero puede haber excepciones para una
fecha específica: el local cerrado por feriado, un peluquero puntualmente
ausente, o un horario especial reducido. Esos casos no están escritos acá
porque cambian — el bot siempre los ve reflejados en el resultado real de
`consultar_disponibilidad` para esa fecha, nunca hay que adivinarlos.

---
*Regla para el bot: si el cliente pide un turno fuera del horario de atención
del local, aclarar el horario real y ofrecer el horario más cercano dentro de
esos rangos. Nunca confirmar un turno sin haber consultado la disponibilidad
real primero.*
