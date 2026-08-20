# Carpeta de información del negocio

Esta carpeta es la **memoria del bot** de Barbería Don Isidoro. Acá vive toda la info que el bot consulta para responder. Se carga una vez y queda: no hace falta repetírsela en cada mensaje.

## Qué hay en cada archivo

- **horarios.md** — cuándo atiende el local y cuándo responde el bot.
- **servicios.md** — qué servicios se ofrecen, precios y quiénes atienden.
- **datos-contacto.md** — ubicación, canales y qué puede/no puede compartir el bot.
- **preguntas-frecuentes.md** — cómo responder las consultas más comunes.
- **project.md** — el cerebro: quién es el bot, su tono y sus reglas (a definir aparte).

## Cómo se usa

1. Dejá todos estos archivos dentro de la carpeta del proyecto.
2. **No** pegues esta info directo en el chat: si la pegás en el chat se pierde al cerrar la sesión. En archivos queda para siempre.
3. Cuando algo cambie (un precio, un horario), **editás el archivo**, no le reexplicás nada al bot.

## Regla de oro

Si un dato no está en estos archivos, el bot **no lo inventa**: toma los datos del interesado y deriva a un encargado humano.
