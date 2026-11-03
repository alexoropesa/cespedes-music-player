# Especificación de Requisitos de Software (SRS)
## Plataforma Musical Personal: Catálogo, Integraciones y Piloto Técnico

---

## 1. Introducción

### 1.1 Propósito
Este documento de Especificación de Requisitos de Software (SRS) define los requisitos funcionales, no funcionales y de integración para la **Plataforma Musical Personal** del cliente. El sistema está diseñado exclusivamente para la gestión privada, catalogación, integración de streaming y procesamiento de audio local para escucha personal.

### 1.2 Alcance y Visión
- **Audiencia y Entorno:** Entorno de escritorio local (PC del usuario) que atiende a un único usuario privado. No se contempla difusión pública, receptores FM ni distribución a terceros.
- **Objetivo Principal:** Proveer una aplicación web de back-office con interfaz en inglés (`en-US`) para buscar canciones, gestionar listas de reproducción, reproducir mediante APIs oficiales (Spotify / Apple Music) e ingerir archivos de audio locales.
- **Límites Operativos:** Las integraciones con proveedores de streaming son de solo lectura/reproducción (delimitadas por los SDKs web oficiales). Las descargas y extracción de audio mediante herramientas de terceros (ej. `yt-dlp`, `FreyrJS`) operan como canalizaciones de ingesta local sujeta a disponibilidad de la fuente y cumplimiento normativo.

---

## 2. Descripción General

### 2.1 Contexto del Sistema y Arquitectura
El sistema opera bajo una arquitectura híbrida:
1. **Interfaz de Usuario (Front-Office / Back-Office):** Desarrollada con etiquetas en inglés para navegación de catálogos, búsqueda de pistas, gestión de playlists y reproducción.
2. **Microservicio / Worker de Ingesta Local:** Un proceso en segundo plano en la máquina host encargado de inspeccionar metadatos (`ffprobe`), descargar archivos, validar integridad y normalizar/transcodificar audio (`FFmpeg`).
3. **Integraciones Externas:**
   - **SDKs de Streaming:** Motores de reproducción web oficiales (Spotify Web Playback SDK, MusicKit JS).
   - **Extractores de Ingesta:** Adaptadores de línea de comandos y librerías (`yt-dlp`, `spotDL`, `FreyrJS`, `cobalt API`).

### 2.2 Modos de Operación
- **Modo Streaming Online:** El audio se transmite directamente desde Spotify o Apple Music hacia el navegador. El flujo binario de audio nunca se almacena ni se transfiere al worker de ingesta local.
- **Modo Biblioteca Local:** Los archivos de audio se almacenan en discos locales, se indexan en la base de datos de la aplicación y se reproducen mediante elementos de audio nativos HTML5 sin dependencia de internet.

---

## 3. Requisitos Funcionales y Características del Sistema

### 3.1 Gestión de Catálogo y Búsqueda

#### FR-CAT-01: Agregación de Búsqueda Multifuente
- **Descripción:** El sistema permitirá buscar pistas, artistas y álbumes de manera unificada tanto en la base de datos local como en APIs externas.
- **Entradas:** Cadena de texto de búsqueda (Nombre de Pista, Artista, ISRC o URL Directa).
- **Procesamiento:** Llamadas directas a endpoints de búsqueda o generación de consultas CLI.
- **Salidas:** Despliegue de una tabla de resultados unificada con Título, Artista, Duración, Tipo de Fuente (Local, Spotify, YouTube/Terceros) y Puntuación de Coincidencia.

#### FR-CAT-02: Interfaz de Coincidencia y Verificación de Pistas
- **Descripción:** Al utilizar extractores de terceros (`spotDL`, `FreyrJS`), el sistema registrará y mostrará explícitamente la URL de origen coincidente junto con los metadatos solicitados.
- **Requisitos:**
  - El sistema DEBE almacenar tanto `requested_reference_id` como `resolved_source_url` como campos independientes en la base de datos.
  - El usuario DEBE poder revisar, corregir o aprobar manualmente una coincidencia si la herramienta automática selecciona una versión de audio incorrecta (ej. en vivo vs. estudio, cover vs. original).

---

### 3.2 Integraciones de Streaming (Spotify y Apple Music)

#### FR-STR-01: Reproducción Web de Spotify y OAuth PKCE
- **Descripción:** Implementar la autenticación de Spotify utilizando el flujo Authorization Code con PKCE.
- **Requisitos:**
  - La aplicación NO debe almacenar contraseñas de usuario.
  - El sistema gestionará de forma segura tokens de acceso y renovación, controlando la expiración o revocación de los mismos.
  - La reproducción completa requiere una cuenta Spotify Premium activa y el Web Playback SDK.
  - Los archivos cifrados de descargas offline de aplicaciones móviles/desktop de Spotify NO se exportarán ni se ingerirán en la plataforma.

#### FR-STR-02: Sincronización de Playlists y Control de Instantáneas (`snapshot_id`)
- **Descripción:** Sincronizar listas de reproducción de Spotify/Apple Music con el estado interno.
- **Requisitos:**
  - Rastrear modificaciones mediante el identificador `snapshot_id`.
  - El sistema ofrecerá una acción de "Congelar Selección" que guarda una copia local de los metadatos y orden de las pistas, sin garantizar disponibilidad futura de streaming si el proveedor retira el contenido.

#### FR-STR-03: Integración de Apple Music (MusicKit JS)
- **Descripción:** Reproducción opcional y exploración de catálogo mediante Apple MusicKit JS.
- **Requisitos:** Requiere autenticación por token de desarrollador y suscripción de usuario activa. Los flujos de audio NO deben ser interceptados ni redirigidos al worker de ingesta local.

---

### 3.3 Pipeline de Ingesta Local y Procesamiento de Audio

#### FR-ING-01: Ingesta por URL Directa y Lotes
- **Descripción:** Ingerir audio a partir de URLs proporcionadas por el usuario o referencias externas autorizadas.
- **Requisitos:**
  - El pipeline operará bajo una máquina de estados de ejecución estricta: `PENDING` $\rightarrow$ `DOWNLOADING` $\rightarrow$ `VALIDATING` $\rightarrow$ `READY` (o `FAILED`).
  - Las descargas incompletas NO deben exponerse como pistas reproducibles en la interfaz.

---

## 4. Requisitos Operativos y Restricciones del Sistema

### 4.1 Estándares de Interfaz e Idioma
- **Interfaz de Usuario (UI):** Inglés (`en-US`) obligatorio en todas las pantallas de back-office, botones, tablas y cuadros de diálogo modales.
- **Documentación del Sistema y Registros Internos:** Español (`es-ES`) para notas técnicas, documentos de arquitectura y comentarios de código internos.

### 4.2 Requisitos de Entorno y Ejecución
- **Sistema Host:** PC de escritorio local del cliente.
- **Entorno de Ejecución:**
  - Python 3.11+ requerido para compatibilidad con `yt-dlp` y `ytmusicapi`.
  - Entorno virtual aislado (`venv`) o contenedor para evitar conflictos con el Python del sistema operativo.
  - Dependencias de binarios nativos: `FFmpeg` 7.x / `ffprobe`.

---

## 5. Requisitos No Funcionales (NFR)

| Categoría | Código | Especificación Detallada |
|---|---|---|
| **Seguridad y Autenticación** | NFR-SEC-01 | OAuth 2.0 + PKCE para proveedores de streaming. Cero almacenamiento de contraseñas locales de cuentas de terceros. |
| **Integridad de Datos** | NFR-DAT-01 | Inmutabilidad de los archivos de audio originales ingeridos. Generación de hash SHA-256 para evitar duplicidad de almacenamiento. |
| **Fiabilidad** | NFR-REL-01 | Degradación elegante ante caídas de red o límites de tasa de API. Workers de cola idempotentes. |
| **Rendimiento** | NFR-PER-01 | Las tareas de ingesta en segundo plano no deben bloquear la interactividad de la UI. Latencia de reproducción $< 300\text{ ms}$ para pistas locales. |
| **Cumplimiento** | NFR-CMP-01 | Etiquetado estricto de metadatos para rastrear procedencia legal, límites de licencias y fronteras de uso. |

---

## 6. Criterios de Aceptación y Verificación

| ID de Criterio | Asunto de Verificación | Evidencia / Resultado Exigido |
|---|---|---|
| **AC-01** | Coincidencia de Pistas | El registro de procedencia almacena correctamente `requested_reference_id` y `resolved_source_url` con coincidencia de duración verificada ($\pm 2\text{s}$). |
| **AC-02** | Reproducción Local | El archivo de audio se reproduce offline desde el disco local sin conectividad a internet. |
| **AC-03** | Integridad de Audio | La validación de flujos mediante `ffprobe` pasa sin errores de tramas corruptas. El archivo original permanece intacto tras la normalización. |
| **AC-04** | Integración de Streaming | El flujo OAuth PKCE se completa con éxito; el Web Playback SDK inicia la reproducción para una sesión Spotify Premium autorizada. |
| **AC-05** | Manejo de Errores | La desconexión de red durante la descarga actualiza el estado a `FAILED` y limpia los temporales en `/tmp/ingestion/` sin colapsar la aplicación. |