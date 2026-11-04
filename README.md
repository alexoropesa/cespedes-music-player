# Bitferalda — Back office (fase 1)

Back office interno para la ingesta autorizada, validación, biblioteca, playlists y reproducción sin internet de pistas musicales (Prueba A del piloto). Interfaz en inglés y tema único *Dark Premium*.

Las decisiones de diseño y las ambigüedades resueltas están en [DECISIONS.md](DECISIONS.md). Los requisitos están en [`info/`](info/).

## Ejecutar

```bash
npm install
npm run dev        # http://localhost:3000
```

Producción, con el *service worker* para recargar sin conexión:

```bash
npm run build && npm run start
```

## Secciones

| Sección | Contenido |
|---|---|
| Overview | KPIs, tarea activa, motores, alertas de derechos, actividad |
| Ingest | From URL (asistente en 4 pasos; yt-dlp / spotDL / FreyrJS / Match) — los archivos propios entran por Library › Folders |
| Queue monitor | Jobs (estados, pausa, cancelar, reintento acotado, detalle) · Worker & sandbox (métricas, fallos por herramienta) |
| Library | Tracks · Artists · References · Duplicates |
| Playlists | Rejilla y detalle (reordenar, añadir y editar) |
| Engine benchmark | Comparison · Runs (CSV) · Sample set |
| Rights & provenance | Authorizations · Provenance register (CSV) |
| Audit log | Eventos con operador e IP, filtros y CSV |
| Connections | Spotify / Apple Music (vía online, bloqueada en esta fase) |
| Settings | Ingestion · Engines · Validation & storage · Workspace |

## Estructura

- `src/lib/`: modelo (`types.ts`), store persistente (`store.ts`), worker de ingesta (`engine.ts`), adaptador de simulación (`catalog.ts`), validación real de audio (`audio-inspect.ts`), reproductor (`player.ts`).
- `src/components/`: shell, primitivas de UI y vistas por sección.
- `src/app/`: rutas (App Router, Cache Components).
