# DECISIONS — Back office, fase 1 (Prueba A: biblioteca local)

3 de noviembre de 2026 · Documento interno (español, RD-03). La interfaz está en inglés (RI-UI-01).

Fuentes que se cruzaron para decidir: el encargo de la fase 1, `info/SRS-plataforma-musical-v0.1.md` (requisitos con ID) y `info/PLATAFORMA-MUSICAL-CATALOGO-INTEGRACIONES-Y-PILOTO.md` (documento consolidado). Cuando dos fuentes chocaban, se aplicó la SRS, porque convierte el documento consolidado en requisitos verificables, y se anotó aquí.

Formato de cada entrada: **ambigüedad → decisión → criterio**.

---

## 1. Alcance y arquitectura

**D-01 · "Back office operativo" sin herramientas ni muestra autorizada.**
El encargo pide ingesta, validación y descarga reales. Sin embargo, la SRS no decide framework, cola ni proceso local (TBD-08, TBD-09), la muestra autorizada no se ha recibido (TBD-03) y yt-dlp no está instalado (necesita Python 3.11 o superior).
→ Se construyó el back office completo en Next.js 16 con un **adaptador de simulación** detrás de la misma interfaz que usará el worker real (`src/lib/catalog.ts` + `src/lib/engine.ts`). Además hay una **ruta real** para archivos aportados desde disco: decodificación completa, codec leído de la cabecera, SHA-256 con Web Crypto y detección de duplicados sobre bytes reales.
→ Criterio: RD-01 (no imponer arquitectura antes del piloto), §9 (no descargar nada sin una muestra autorizada) y permitir al cliente evaluar la experiencia ya. La ruta real demuestra RF-04 sin esperar al worker.

**D-02 · Transparencia de la simulación.**
→ La barra superior muestra siempre *Pilot · simulation adapter*. Cada pista simulada indica "Demo workspace" en su ficha y reproduce un **audio sintetizado localmente**, etiquetado como *synthesized preview*. Su duración coincide con los metadatos.
→ Criterio: RF-PRO-05 y CA-03. Nada se presenta como algo que no es.

**D-03 · Repertorio de demostración ficticio.**
→ Los 11 artistas son ficticios: 5 *Established*, 5 *Independent* y "Bitferalda Studio" como contenido propio. Sellos, permisos y URL también son ficticios. Los dominios propios usan el TLD reservado `.example`.
→ Criterio: usar artistas reales con permisos inventados sería fabricar registros de derechos (RC-01). El repertorio cubre artistas conocidos e independientes, como pide el encargo.

**D-04 · Persistencia.**
→ El estado se guarda en `localStorage` y los bytes de audio en IndexedDB, en el propio equipo. Al recargar, las tareas que quedaron en *downloading* o *validating* vuelven a *pending*: se descarta el parcial y se registra en auditoría.
→ Criterio: RNF-FIA-01 (ninguna tarea colgada tras reiniciar). Funciona sin servidor de datos mientras TBD-08 siga abierto.

**D-05 · Next.js 16 (Cache Components + Partial Prefetching).**
→ El segmento de cada ruta se renderiza siempre y queda oculto hasta cargar el espacio de trabajo local, para cumplir la validación de navegación instantánea. Los componentes que leen `useSearchParams` o `params` dinámicos van dentro de `<Suspense>`. Los drawers de detalle se abren desde la URL (`?job=`, `?track=`), así sobreviven a recargas y se pueden enlazar.
→ Criterio: guías de `node_modules/next/dist/docs` (*instant-navigation*, *preserving-ui-state*, *use-search-params*), leídas antes de escribir código como pide AGENTS.md.

---

## 2. Estados, cola y reintentos

**D-06 · "Máx. 3 reintentos" (RF-02) frente a "máximo 3 intentos" (tabla del dashboard).**
→ Se aplica **máximo 3 reintentos**, configurable de 0 a 3 en *Settings › Ingestion*. La interfaz muestra "Retries n/3" y "attempt n of 4". Si el cliente quiere 3 intentos en total, basta con fijar 2.
→ Criterio: RF-02 y RF-ING-07 son requisitos; la tabla del dashboard era una propuesta visual. Ser configurable resuelve ambas lecturas.

**D-07 · Reintento automático o manual.**
→ El reintento es **automático solo para errores transitorios** (`NETWORK`, `INCOMPLETE`), con backoff exponencial y dentro del máximo. Los fallos de política no se reintentan porque el resultado sería el mismo: límite de tamaño o duración, duplicado, acceso adicional requerido, duración distinta a la fuente y coincidencia rechazada. Las tareas canceladas pueden reintentarse a mano.
→ Criterio: RF-ING-07 (nunca reintentos ilimitados) y RF-ING-08 (si falta acceso, se registra la limitación sin sustituir la versión).

**D-08 · Solo cinco estados (RF-03).**
No se añadieron estados nuevos. Lo demás se expresa así:
- **Cancelar** termina en `failed` con motivo `CANCELLED` y limpia el staging.
- **Pausa** es una marca sobre `pending`: "Pending · Paused". Pausar una descarga conserva el progreso; la validación es atómica y no se pausa.
- **Coincidencia dudosa** queda en `validating · Awaiting review`.

→ Criterio: el diagrama de la SRS (Apéndice A) dice que *validating → ready* exige "válido **y aceptado**".

**D-09 · Pausa por tarea y pausa de la cola.**
→ Existen las dos. *Pause queue* deja terminar la tarea activa y no arranca ninguna nueva.
→ Criterio: el encargo pide un botón de pausa sin precisar el ámbito; con las dos se cubre la operación real.

**D-10 · Una tarea a la vez y revisión pendiente.**
→ La concurrencia está fijada en 1 y bloqueada. Una tarea que espera revisión humana **no ocupa el worker**, para no bloquear la cola indefinidamente.
→ Criterio: RF-ING-05 sin convertir una decisión humana en un cuello de botella.

**D-11 · Límites de duración y tamaño.**
→ La **duración** se conoce por los metadatos, así que se bloquea antes de crear la tarea. El **tamaño** estimado no es fiable: se avisa en la vista previa y se aplica durante la descarga, abortando al llegar al límite y borrando el parcial. Los archivos de disco se comprueban antes y después.
→ Criterio: RF-ING-06 (si se supera, la tarea termina en *failed* con el motivo).

---

## 3. Validación y procesamiento

**D-12 · Qué significa cada comprobación.**
- **Completo:** el archivo se decodifica de principio a fin.
- **Codec real:** se lee de la cabecera del stream, nunca de la extensión. Si no coinciden, es un aviso, no un fallo.
- **Duración:** se compara con la fuente con una tolerancia de **±2 s**, ajustable de 0 a 10 s (TBD-10).
- **Hash:** SHA-256 sobre los bytes originales.
- **Duplicado:** mismo hash que un archivo de la biblioteca; no se añade una segunda copia.

→ Criterio: RF-04, RF-PRO-01, RF-PRO-02 y RF-BIB-04. Una extensión engañosa no invalida un archivo íntegro, pero el codec real queda registrado.

**D-13 · Conversión y calidad.**
→ No se convierte por defecto. Un derivado compatible solo se crea si el original no se puede reproducir. La normalización de volumen es opcional, está desactivada y siempre genera un derivado enlazado al original. El original se conserva siempre. La recodificación de FreyrJS (AAC 320) se marca como "re-encoded by engine — not source quality".
→ Criterio: RF-PRO-03 a RF-PRO-05 y §8: subir el bitrate no recupera información y normalizar no es fidelidad.

---

## 4. Procedencia, derechos y canal ≠ artista

**D-14 · Autorización antes de descargar.**
→ Sin un registro de autorización no se puede crear la tarea. Se elige un registro **activo o por expirar**, o se crea uno nuevo en el momento: base, titular, alcance, territorio, vigencia y evidencia. *Copy* y *Retain* son obligatorios. El operador lo confirma de forma explícita y la confirmación queda con usuario e IP.
→ Criterio: RF-05, RF-ING-02, RC-01 y CA-06.

**D-15 · Autorización caducada, revocada o en revisión.**
→ La pista queda **"not usable"**: no se reproduce ni entra en playlists, y el reproductor la salta y lo registra. No se borra.
→ Criterio: RC-09 y RF-REP-04.

**D-16 · Canal y artista.**
→ El canal o *uploader* se muestra siempre como "Channel" con la etiqueta "Not a confirmed artist". El artista lo confirma el operador, y el nivel *Established* o *Independent* también lo asigna el operador.
→ Criterio: RI-UI-03 y §9.

**D-17 · IP y usuario gestor en la auditoría.**
→ La IP sale de la petición real (`/api/whoami`); en la PC del cliente es loopback o LAN. El usuario gestor es el operador configurado en *Settings › Workspace*. No hay login en esta fase.
→ Criterio: RNF de auditabilidad, con SRS §2.3 (un único cliente como administrador) y RI-COM-04 (acceso solo desde su PC).

---

## 5. Búsqueda, revisión y benchmark

**D-18 · Qué hace cada motor.**
→ **yt-dlp** busca y descarga directamente; es el único que acepta URL directas en *Ingest › From URL*. **spotDL** y **FreyrJS** resuelven una *referencia* de catálogo y luego emparejan audio en otra fuente; en la UI se ven ambas cosas: "Reference · Spotify/Apple Music/Deezer" y "Matched on YouTube Music". Un enlace de Spotify o Apple Music en la ingesta por URL se **bloquea** y se ofrece guardarlo como referencia.
→ Criterio: §5 del consolidado, RF-PRO-06 y RC-04.

**D-19 · Decisión por resultado.**
→ Cada resultado ofrece *Keep* (abre la autorización y crea la tarea), *Reference* (sin audio) o *Dismiss*. Los resultados dudosos (duración distinta, directo, cover, edición, vídeo de letra) se etiquetan, muestran *Keep · review* y quedan retenidos tras validarse.
→ Criterio: RF-BUS-03, RF-BUS-04 y CA-01.

**D-20 · Métricas del benchmark.**
→ Se miden tiempo de respuesta, tiempo de descarga, **tasa de éxito**, **precisión de metadatos**, coincidencias exactas y dudosas, y salidas recodificadas, con un corte por repertorio (*Established* / *Independent*). La precisión de metadatos es una heurística ponderada: título 35 %, artista o canal 25–30 %, duración dentro de tolerancia 20–25 % y álbum 13 %.
→ Se avisa de que **las tres herramientas dependen de YouTube** y no son redundantes. Las ejecuciones se exportan a CSV.
→ Criterio: RF-08, CA-08 y RNF-MAN-03. La fórmula es una propuesta para validar con el cliente.

---

## 6. Biblioteca, playlists, reproducción y offline

**D-21 · Referencias fuera de la biblioteca.**
→ Las referencias tienen su propia pestaña, llevan la etiqueta "No audio" y nunca se reproducen.
→ Criterio: RI-UI-06, más "una referencia pendiente no aparece como audio listo" (§9).

**D-22 · Playlists.**
→ Solo admiten pistas *ready* y utilizables. No mezclan referencias online, a la espera de TBD-12. Se pueden crear al estilo Spotify, editar (nombre, descripción y portada), reordenar arrastrando o con botones, quitar pistas y borrar. Borrar una playlist no borra sus pistas.
→ Criterio: RF-06, RF-PLA-01, RF-PLA-02 y RF-ING-03.

**D-23 · Reproducción sin internet.**
→ El audio vive en IndexedDB en el propio equipo y el reproductor HTML5 nunca usa la red. En producción, un *service worker* guarda la aplicación para que recargue sin conexión; se verificó recargando y reproduciendo con la red cortada. `experimental.useOffline` muestra el estado de conexión.
→ Criterio: RF-07 y RF-REP-01; también RNF-FIA-06 (la biblioteca funciona sin proveedores).

**D-24 · Borrado.**
→ Solo con confirmación, escribiendo el código de la pista. Nunca es automático.
→ Criterio: RF-BIB-06.

---

## 7. Conexiones online y alcance excluido

**D-25 · Spotify y Apple Music.**
→ Se incluyen como pestaña porque la SRS pide la sección *Connections* (RI-UI-02), pero **bloqueadas**: falta el acceso de desarrollador (TBD-04) y la decisión sobre Apple Music (TBD-05).
→ La pestaña muestra los botones *Connect* y *Disconnect*, el aviso de alcance RI-UI-08 tal cual y los permisos mínimos. No hay ningún formulario de contraseña. Cada intento de conexión queda en auditoría.
→ Criterio: separar la vía online de la local sin fingir una integración que aún no existe.

**D-26 · Fuera de esta fase.**
→ Calendario y timeline (diferidos en la SRS), anuncios y TikTok, compras, cookies o cuentas personales, contenido de pago, DRM y descarga de playlists enteras. El *Overview* lo recuerda en una línea.

---

## 8. Diseño (Dark Premium)

**D-27 · Solo tema oscuro.**
→ No hay selector de tema. Los tokens están en `src/app/globals.css`: lienzo casi negro, superficies grafito por capas y CTA en píldora blanca. El acento es **iris** (#B19CFF) porque los colores de estado los fija el encargo (gris, azul, amarillo, verde, rojo) y un acento dorado o verde se confundiría con *validating* o *ready*. Tipografía: Figtree para la interfaz y Geist Mono para hashes, rutas y versiones.

**D-28 · Jerga del producto en inglés.**
→ Ingest, Queue monitor, Match review, Provenance register, Rights & provenance, Engine benchmark, Sample set, Staging, Retries, Not usable.

---

## 9. Arranque limpio y cómo probar

**D-29 · Sin datos de demostración (sustituye a D-02, D-03 y a las muestras del piloto).**
→ La app arranca con el espacio de trabajo **vacío**: sin artistas, pistas, autorizaciones, tareas, playlists, referencias ni auditoría precargadas. Todo lo que hay en la biblioteca viene de archivos importados por el operador. *Settings › Workspace › Reset* deja el espacio vacío otra vez. Un estado guardado con un formato anterior (la demo) se descarta al cargar, junto con su audio en IndexedDB.
→ Se retiran de la interfaz las rutas que solo funcionaban con el adaptador de simulación: *From URL*, *Text search*, *Match review* y *Engine benchmark*. Las URL antiguas redirigen a *Import track* o al *Overview*. El código del adaptador queda en `src/lib/catalog.ts` y `src/lib/engine.ts` hasta que exista el worker real.
→ Criterio: el cliente prueba solo funcionamiento real; nada simulado se presenta como si lo fuera.

**D-30 · Solo controles que hacen algo real.**
→ Se retiran *Settings › Engines*, el motor por defecto, la tolerancia de duración, la política de conversión y la normalización opcional: ninguno actuaba sobre la importación local. Desaparece el botón *Normalize (derivative)*, que creaba un derivado con un hash inventado, y la pestaña *Library › References*, que nada podía llenar. Las métricas por tarea son solo las medidas en el equipo (tiempo de lectura de staging, tiempo de validación, disco); se quitan CPU y memoria, que eran estimadas. El progreso de *downloading* es la fracción real de bytes leídos del staging, sin esperas artificiales. Staging y biblioteca se muestran como lo que son: IndexedDB en este navegador.
→ Al borrar una pista también sale de la cola del reproductor y su tarea deja de enlazarla (queda una nota en el log de la tarea); las playlists y los duplicados ya la soltaban.
→ Criterio: D-29 aplicado a toda la interfaz; las pestañas comparten un único estado y una acción en una se refleja en las demás.

**Cómo probar:** en *Import track* sube cualquier audio (FLAC, WAV, MP3, M4A/AAC, Opus/Ogg, WebM). Sin registros previos, el formulario abre directamente *Record new authorization*. La tarea pasa por *pending → downloading (copia a staging) → validating → ready*: decodificación completa, codec real de la cabecera, duración, SHA-256 y duplicados. Si subes el mismo archivo dos veces, la segunda falla como duplicado por SHA-256.

## 10. Pendiente para activar la ingesta por URL, búsqueda y benchmark

1. Muestra autorizada (TBD-03) y SO/recursos de la PC (TBD-01).
2. Worker local aislado con versiones fijadas (Python 3.11+ para yt-dlp, Node para FreyrJS, FFmpeg/ffprobe), detrás de la interfaz de `engine.ts`. Proceso interno o microservicio: TBD-09.
3. Persistencia de servidor y cola duradera (TBD-08), manteniendo la idempotencia de eventos (RNF-FIA-02 a 05).
4. Acordar la tolerancia de duración (TBD-10), los umbrales de rendimiento (TBD-11) y la fórmula de precisión de metadatos (D-20).
5. Acceso al Spotify Developer Dashboard (TBD-04) para activar la Prueba B.
