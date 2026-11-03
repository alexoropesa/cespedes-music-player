# Plataforma musical: catálogo, integraciones y piloto

**Documento consolidado — 3 de noviembre de 2026**

Referencia principal de la investigación sobre adquisición musical, conectores, costes y prueba técnica. Reúne y sustituye para la consulta habitual los documentos separados de esta investigación. No sustituye el diseño visual ni constituye una arquitectura de implementación aprobada.

## 1. Alcance vigente y decisiones

- El cliente aceptó el proyecto, según el usuario.
- Es una **plataforma musical propia**, ya no una estación de radio. La escucha es del cliente; no se presupone audiencia pública, receptores FM ni distribución a terceros.
- El cliente quiere un back office con biblioteca, playlists y reproducción. Quiere buscar canciones, revisar resultados y decidir qué descargar/conservar o añadir a una playlist.
- El repertorio debe contemplar artistas conocidos e independientes.
- Se evaluará también Spotify online con su cuenta y la alternativa equivalente de Apple Music.
- La PC doméstica del cliente sigue siendo el equipo inicial. Un proceso o microservicio local podría encargarse de tareas específicas si hace falta. No se ha aprobado framework, base de datos, cola ni motor de reproducción.
- Musplat es solo un proyecto anterior recordado: su arquitectura no determina la nuestra.
- UI en inglés; documentación interna en español. Calendario, playlists y timeline siguen como requisitos previos sujetos a ajustar al uso actual.
- La petición previa sobre anuncios/TikTok sigue por definir y no se considera cubierta por la escucha personal.

**Estado real:** investigación y revisión estática realizadas; prototipos visuales existentes. No hay servicio musical implementado, herramientas de ingesta instaladas para este piloto, cuentas conectadas, descargas de prueba, compras ni contratos de suministro. El usuario solicitó un piloto para que el cliente evalúe las alternativas; aún no se ejecutó.

## 2. Qué significa integrar música

| Modalidad | Qué guarda nuestra plataforma | Dependencia |
|---|---|---|
| Playlist o referencia externa | Identificadores, selección y orden, según permisos de datos | El audio sigue en el proveedor y puede dejar de estar disponible |
| Reproducción online oficial | Acceso autorizado a catálogo/playlists y reproducción por el SDK del proveedor | Cuenta, suscripción, internet, acceso API y condiciones |
| Archivo adquirido o aportado | Copia de audio en biblioteca local para los usos autorizados | Procedencia y derechos del archivo |
| Herramienta de terceros que busca otra fuente | Referencia original y archivo obtenido de una coincidencia externa | Disponibilidad, correspondencia de grabación y permisos de ambas fuentes |

Conservar un archivo no significa adquirir sus derechos de autor ni permiso general para anuncios, difusión o distribución. El éxito técnico de una descarga no demuestra autorización.

## 3. Spotify online con la cuenta del cliente

La vía oficial combina **Spotify Web API** para datos/control con **Web Playback SDK** para reproducir en el navegador. El SDK de TypeScript de la Web API es una ayuda para llamadas, no el motor de audio.

Recorrido propuesto: **Connect Spotify → autorización oficial → consultar playlists → seleccionar → escuchar → desconectar cuenta**. La aplicación no solicita su contraseña. Acceso mediante OAuth y permisos mínimos; cambios de playlist solo por acción autorizada. Debe manejar expiración/revocación de tokens, errores de cuenta, pérdida de internet y pistas no disponibles.

La reproducción completa por SDK requiere Premium. El audio llega de Spotify al reproductor; no se almacena como archivo propio ni se envía al worker para conversión. Las descargas offline de Spotify en iPhone están cifradas y no son MP3 exportables a nuestra biblioteca.

Para evitar cambios inesperados en una selección se puede proponer una copia no colaborativa en la cuenta del cliente y una versión de referencias/orden gestionada por nuestra aplicación, sujeta a los términos de datos. `snapshot_id` identifica cambios, pero no bloquea una playlist ni conserva la grabación. Congelar una selección no garantiza disponibilidad futura de sus pistas.

La documentación consultada admite hasta cinco usuarios autorizados en modo desarrollo y exige Premium al propietario de la aplicación. No se ha comprobado el acceso real al Developer Dashboard. El piloto de una cuenta no demuestra que se autorice el producto comercial.

La política restringe venta de aplicaciones de streaming, integración con contenido de otros servicios, mezcla/superposición y otros usos. Separar pestañas no autoriza automáticamente el producto combinado. Antes de comprometer Spotify como entrega comercial hay que validar el modelo y los permisos correspondientes. No prometer funcionamiento con el navegador cerrado cuando la reproducción ocurre allí, ni estadísticas derivadas de escucha sin revisar la política.

**Texto propuesto para el cliente:** «Conexión con tu cuenta Spotify para consultar playlists y escuchar online. Opción sujeta a disponibilidad de acceso y condiciones del proveedor; no incluye descarga de archivos ni permiso para retransmitir».

Fuentes: [Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk), [Web API SDK TypeScript](https://github.com/spotify/spotify-web-api-ts-sdk), [OAuth PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow), [cuotas y acceso](https://developer.spotify.com/documentation/web-api/concepts/quota-modes), [playlists y snapshots](https://developer.spotify.com/documentation/web-api/concepts/playlists), [disponibilidad/relinking](https://developer.spotify.com/documentation/web-api/concepts/track-relinking), [almacenamiento offline](https://support.spotify.com/us/article/storage-information/), [política](https://developer.spotify.com/policy).

## 4. Apple Music y YouTube Music

**Apple Music:** MusicKit JS y Apple Music API permiten catálogo, biblioteca, playlists y reproducción con la autorización del usuario y suscripción aplicable. Requieren configuración de desarrollador y tokens; no pedir Apple ID/password en formularios propios. No se crearon claves ni afiliaciones. MusicKit no proporciona archivos para nuestro procesador y sus condiciones restringen descarga, modificación, reproducción fuera de sus herramientas y monetización del acceso. El permiso de un proveedor no cubre al otro. [MusicKit](https://developer.apple.com/musickit/), [acuerdo Apple, apartado MusicKit](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/).

**YouTube Music:** Premium ofrece acceso offline dentro del servicio, con reconexión periódica; no es compra de archivos para nuestra biblioteca. YouTube Data API permite búsqueda de videos/referencias, pero sus políticas restringen guardar contenido y acceso offline sin autorización. Un buscador oficial no concede permiso para extracción de audio. [Descargas offline](https://support.google.com/youtubemusic/answer/6313535?hl=es), [búsqueda](https://developers.google.com/youtube/v3/docs/search/list), [políticas de API](https://developers.google.com/youtube/terms/developer-policies).

No se ha verificado una suscripción ordinaria de Spotify/Apple/YouTube Music que permita descargar y conservar libremente un catálogo conocido en nuestra aplicación.

## 5. Herramientas de terceros comparadas

Las capacidades siguientes proceden de documentación de sus proyectos; no de pruebas realizadas aquí. No implican permiso sobre contenido ni disponibilidad garantizada.

| Herramienta | Función real | Evaluación para el piloto |
|---|---|---|
| **yt-dlp** | Búsqueda YouTube/YouTube Music, metadatos, formatos y descarga de medios | Base propuesta para una primera URL y posterior búsqueda; no conector oficial de Spotify/Apple |
| **FFmpeg / ffprobe** | Inspección, conversión y procesamiento de audio | Complemento local; no fuente de canciones |
| **ytmusicapi** | API no oficial que emula peticiones de YouTube Music para búsqueda, biblioteca y playlists | Opcional para resultados musicales estructurados; no descarga audio por sí sola |
| **spotDL** | Recibe referencias Spotify, encuentra coincidencias en YouTube y descarga de esa fuente con metadatos | Candidata para comparar matching; no extrae la grabación desde Spotify |
| **FreyrJS** | Referencias Spotify, Apple Music y Deezer; metadatos y búsqueda de audio en fuentes como YouTube/YouTube Music | Candidata para ambas plataformas; revisar correspondencia y procesamiento por defecto |
| **cobalt API** | API autogestionada de medios; documentación lista audio de YouTube/SoundCloud, entre otros | Alternativa de ingesta, sin sustituir búsqueda musical o conector de cuentas; no presupone API pública gratuita |
| **NewPipeExtractor** | Biblioteca de extracción de datos para YouTube, SoundCloud, Bandcamp y otros sitios | Alternativa JVM, con GPLv3+ y coste de integración; no conector nativo Spotify/Apple |
| **youtube-dl** | Descargador CLI de propósito general | Referencia frente a yt-dlp; no se ha demostrado ventaja para este caso |
| **Soundiiz API** | Gestión/importación de playlists y transferencia de referencias | Opcional para migraciones; no descarga ni entrega grabaciones |

Fuentes: [yt-dlp](https://github.com/yt-dlp/yt-dlp), [FFmpeg](https://ffmpeg.org/ffmpeg.html), [ytmusicapi](https://ytmusicapi.readthedocs.io/en/stable/), [spotDL](https://github.com/spotDL/spotify-downloader), [FreyrJS](https://github.com/miraclx/freyr-js), [cobalt API](https://github.com/imputnet/cobalt/tree/main/api), [NewPipeExtractor](https://github.com/TeamNewPipe/NewPipeExtractor), [youtube-dl](https://github.com/ytdl-org/youtube-dl), [Soundiiz API](https://soundiiz.com/api).

### Aspectos que pueden cambiar la elección

- spotDL/FreyrJS pueden encontrar un directo, cover, edición diferente o subida incorrecta. Guardar por separado la referencia solicitada y el origen real del archivo, y permitir revisar la coincidencia.
- FreyrJS documenta recodificación AAC/M4A a 320 kbps por defecto. Eso no demuestra fidelidad de máster; comprobar posibilidad de conservar la fuente recibida.
- cobalt recomienda instancia propia; mantenerla es parte del coste. La lista de servicios soportados no prueba cada URL.
- Soundiiz distingue User API con plan Creator de Playlist Import API con enlaces temporales; no se han validado precios ni todas las operaciones de cada conector.
- Las herramientas pueden romperse cuando cambie el proveedor. Dos herramientas que dependen de YouTube no constituyen redundancia garantizada.
- Revisar licencias de software y dependencias para el empaquetado elegido. No copiar credenciales, cookies ni código empresarial anterior por el mero hecho de disponer de él.

## 6. Proveedores de archivos y compras investigados

Estas opciones se conservan como alternativas. El usuario indicó que los precios/modelos presentados no le resolvían la necesidad y pidió avanzar con herramientas de terceros; no constituyen una contratación prioritaria aprobada.

| Proveedor | Qué se verificó documentalmente | Qué falta |
|---|---|---|
| **MassiveMusic / antes 7digital** | Búsqueda, Purchasing API y Download Purchases para usuarios que compran y conservan pistas/álbumes | Contrato, catálogo por país, acceso para nuestro caso, costes/mínimos y condiciones de conservación |
| **Tuned Global** | Catalogue Delivery, Asset Delivery API y apoyo en licencias | Confirmar que ofrece adquisición permanente apropiada, no solo acceso temporal; cotización |
| **Qobuz Download Store** | Compra y descarga de archivos sin suscripción obligatoria de streaming | Repertorio/país/precios; no se acreditó integración automática completa para nuestro panel |
| **Bandcamp** | Compras descargables en MP3, FLAC, WAV y otros formatos, según catálogo | No se acreditó API pública completa de búsqueda, compra y entrega para este flujo |
| **Jamendo** | Búsqueda, licencia por pista y descarga condicionada por `audiodownload_allowed` | Condiciones generales restringen aplicaciones offline y uso comercial: pedir autorización específica antes de adoptar biblioteca permanente |
| **Artistas/sellos directamente** | Entrega según acuerdo con titular | No hay un acuerdo de suministro existente confirmado |

MassiveMusic diferencia compra individual de **Content Delivery** con almacenamiento central: esta segunda modalidad exige acuerdo de licenciantes y gestión de cambios/retiradas; no equivale a conservar una compra personal. Jamendo publica términos antiguos; confirmar el acuerdo aplicable, sin concluir que una URL descargable aprueba todo el producto.

Fuentes: [MassiveMusic Purchasing](https://docs.massivemusic.com/reference/about-the-purchasing-api), [descargas](https://docs.massivemusic.com/reference/download-1), [búsqueda](https://docs.massivemusic.com/reference/track-search), [Content Delivery](https://docs.massivemusic.com/docs/building-a-content-delivery-service), [Tuned Global servicios](https://www.tunedglobal.com/contact), [licencias](https://www.tunedglobal.com/streaming-services/music-licensing), [Qobuz compras](https://help.qobuz.com/en/articles/10168-how-to-download-albums-tracks-collections-or-complete-works), [Bandcamp formatos](https://get.bandcamp.help/en/articles/15263234-in-which-formats-can-i-download-my-purchases), [condiciones Bandcamp](https://bandcamp.com/terms_of_use), [Jamendo tracks](https://developer.jamendo.com/v3.0/tracks), [descarga Jamendo](https://developer.jamendo.com/v3.0/tracks/file), [condiciones API Jamendo](https://devportal.jamendo.com/api_terms_of_use).

## 7. Costes: datos comprobados y límites

| Concepto | Situación |
|---|---|
| MassiveMusic API | No se encontró una tarifa pública verificable aplicable al proyecto; cotización pendiente |
| Tuned Global API | Cotización de acceso, entrega y derechos pendiente |
| Herramientas de terceros | No se contrató una suscripción de suministro; desarrollo, mantenimiento, dependencias, energía y almacenamiento siguen teniendo coste |
| Spotify/Apple online | Cuenta/suscripción del cliente y condiciones de desarrollador; integración y mantenimiento separados. No se fijó precio de suscripción por país |
| Compra manual Bandcamp | Precio fijado por artista. Ejemplos consultados: «No Cash», Digitalism, 1 EUR; «Da», automaten, 1,50 EUR o más |
| Qobuz | Precio según compra y formato; sin precio universal por canción comprobado para el repertorio del cliente |

Ejemplo **hipotético**, no cotización: si cada pista elegida costara 1–1,50 EUR, 100 pistas costarían 100–150 EUR y 400 pistas, 400–600 EUR. No incluye API, desarrollo ni otros posibles cargos de compra. No extrapolar esos ejemplos a todos los artistas.

Para una cotización B2B separar acceso API, alta/integración si existe, mínimos contractuales, adquisición/entrega, derechos, transferencia y mantenimiento. Esas partidas se preguntan; no todas están confirmadas como obligatorias. No hay base para prometer una cuota de descargas ilimitadas autorizadas.

Fuentes consultadas: [MassiveMusic modelos comerciales](https://massivemusic.com/faq), [Tuned Global contacto](https://www.tunedglobal.com/contact), [precios definidos por artistas](https://get.bandcamp.help/en/articles/15263322-what-pricing-performs-best), [Digitalism: No Cash](https://digitalism.bandcamp.com/track/no-cash), [automaten: Da](https://automaten937298.bandcamp.com/track/da). Importes observados el 3 de noviembre de 2026, susceptibles de cambio; no presupuestar con ellos sin confirmar el catálogo y checkout.

## 8. Procesamiento local: propuesta limitada

Si se necesita, un proceso en la PC podrá inspeccionar codec/metadatos, validar integridad y duración, detectar duplicados y generar un derivado compatible o ajustar niveles. Conservar el original y su procedencia. No convertir por defecto si ya es adecuado.

Aumentar bitrate o convertir audio comprimido a WAV no recupera información descartada. Normalización de volumen y fidelidad son propiedades distintas. Los archivos de terceros no se presentan como másteres por tener extensión FLAC/WAV o un bitrate nominal alto.

Audio online del SDK Spotify/MusicKit no entra en ese procesador. No se decide todavía entre proceso interno y microservicio ni se hereda AWS, Glacier, SQS o Laravel de Musplat.

## 9. Piloto técnico propuesto

### Prueba A: biblioteca local

1. Recibir una URL concreta de contenido propio o con permiso de descarga.
2. Obtener metadatos/formatos y mostrar origen, título, canal y duración; no asumir que canal identifica al artista.
3. Descargar la muestra elegida en carpeta aislada, una tarea simultánea y límites de duración/tamaño.
4. Validar archivo completo, codec y duración; guardar identificación de origen y hash.
5. Añadir a biblioteca/playlist y comprobar reproducción desde archivo sin internet.
6. Ampliar a búsqueda por texto y comparar yt-dlp, spotDL y FreyrJS, con revisión explícita de coincidencias.

Estados propuestos: pendiente, descargando, validando, listo y fallido. Una referencia pendiente no aparece como audio listo. No comprar automáticamente por añadir una pista ni descargar playlists enteras por defecto. Sin reintentos ilimitados.

El alcance definido del piloto no incluye automatizar cookies/cuentas personales, contenido de pago, DRM ni elusión de controles. Si una muestra exige acceso adicional o falla, registrar la limitación; no sustituir silenciosamente la versión solicitada.

### Prueba B: Spotify online

Registro/acceso de desarrollador y cuenta autorizada → OAuth → consulta de selección → reproducción personal por SDK → prueba de desconexión/revocación. Sin descarga, captura ni unión a cola local. La delimitación de prueba no demuestra cumplimiento de un producto combinado.

### Prueba C: Apple Music online

Evaluación equivalente con MusicKit si el cliente quiere usar Apple Music. Permisos, claves y condiciones propios de Apple; no se considera incluida por haber probado Spotify.

### Criterios de aceptación y métricas

| Comprobación | Evidencia exigida |
|---|---|
| Coincidencia musical | Grabación/versión elegida, duración y origen identificados; ambiguos para revisión |
| Archivo local | Decodificable y reproducible offline; original conservado |
| Calidad | Codec real y escucha comparativa, sin atribuir mejora a recodificación |
| Duplicados/fallos | Reintento controlado, estado claro y ausencia de archivos parciales publicados |
| Rendimiento | Tiempo de descarga/proceso y consumo/espacio medidos |
| Online | Autorización, inicio por usuario, controles y tratamiento de revocación/errors |
| Mantenimiento | Versiones, fallos por proveedor y dependencias registrados |

No se ha cumplido todavía ninguno mediante ejecución del piloto. El cliente evalúa técnica y experiencia; esa evaluación no sustituye permisos musicales o condiciones de servicio.

### Entorno observado

Máquina de desarrollo, no PC del cliente: FFmpeg 7.1 en `/opt/homebrew/bin/ffmpeg`; `python3` del PATH es 3.9.6; yt-dlp no apareció mediante `command -v`. No descarta otros intérpretes. No se instaló nada.

La documentación de yt-dlp consultada indica Python 3.11+ y dependencias adicionales para soporte completo de YouTube; ytmusicapi documenta Python 3.10+. Elegir entorno aislado/distribución compatible y versiones fijadas antes de ejecutar. No reemplazar Python del sistema. [Requisitos yt-dlp](https://github.com/yt-dlp/yt-dlp), [dependencias YouTube](https://github.com/yt-dlp/yt-dlp/wiki/EJS), [ytmusicapi](https://ytmusicapi.readthedocs.io/en/stable/).

## 10. Musplat: antecedente revisado, no arquitectura del producto

Se revisaron en lectura las carpetas `fe_musplat`, `be_musplat` y `workers_musplat` bajo `/Users/yoan/Documents/Code/DECSKILL/Telefonica/Code/`. Frontend JavaScript/Webpack, backend PHP/Laravel y worker Node/TypeScript. No se ejecutaron scripts/tests ni se usaron credenciales. Había cambios locales preexistentes; no se modificaron esos repositorios.

El código inspeccionado importa metadatos Spotify/Apple, recupera archivos previamente almacenados en **Glacier vaults**, consulta recuperaciones con cron `0 */12 * * *`, convierte mediante FFmpeg y usa S3/SQS para archivos/eventos. También acepta carga manual. No se demostró quién obtuvo el audio antes de archivarlo ni una descarga desde Spotify/Apple. El cron corresponde a horarios 00:00/12:00 de la zona del proceso, no a doce horas desde cada solicitud.

Cinco hallazgos estáticos relevantes, sin reproducción en producción:

| Hallazgo | Evidencia local | Consecuencia para una eventual reutilización |
|---|---|---|
| Subida con bytes originales y nombre del convertido | [glacierService.ts:442](/Users/yoan/Documents/Code/DECSKILL/Telefonica/Code/workers_musplat/src/services/glacierService.ts:442) | Validar/subir el derivado real |
| Mensajes SQS borrados antes de aplicar el resultado | [AmazonSqsService.php:108](/Users/yoan/Documents/Code/DECSKILL/Telefonica/Code/be_musplat/app/Services/AmazonSqsService.php:108) | Confirmar después de persistir e implementar idempotencia |
| Cron en memoria y retorno falso inmediato sin respuesta HTTP alternativa | [glacierService.ts:255](/Users/yoan/Documents/Code/DECSKILL/Telefonica/Code/workers_musplat/src/services/glacierService.ts:255), [glacierController.ts:57](/Users/yoan/Documents/Code/DECSKILL/Telefonica/Code/workers_musplat/src/controllers/glacierController.ts:57) | Persistir/recuperar trabajos y responder aceptación explícita |
| Callback de procesamiento no esperado antes de limpiar cron | [glacierService.ts:185](/Users/yoan/Documents/Code/DECSKILL/Telefonica/Code/workers_musplat/src/services/glacierService.ts:185) | Esperar escritura, conversión y publicación |
| Borrado del original Glacier después de derivados | [glacierService.ts:229](/Users/yoan/Documents/Code/DECSKILL/Telefonica/Code/workers_musplat/src/services/glacierService.ts:229) | No heredar esa política de retención |

La normalización aparece como operación independiente; no asumir que toda recuperación la ejecutaba. El cálculo BPM usa estado global/espera fija y debe revisarse si se reutiliza. El manifest worker pide Node 18 y el Dockerfile utiliza Node 17.3: no heredar ese entorno sin revisión.

Hay licencias visibles de plantilla/software, pero no se acreditó titularidad de todo el desarrollo empresarial ni de recursos premium. La referencia útil es el problema que resolvía; cualquier reutilización de código requeriría aclarar derechos y corregir defectos. El usuario confirmó que no es necesario reutilizarlo.

## 11. Derechos y TikTok pendientes

Registrar procedencia del archivo y permisos para el uso concreto: adquisición/copia, conservación, derivados, territorios y vigencia. La antigua afirmación de que una emisora gestionaba licencias no acredita el alcance actual. No se emitió dictamen jurídico local ni se verificaron contratos del cliente.

Si se retoma TikTok, separar publicación orgánica, campañas pagadas y LIVE. Content Posting API exige auditoría para levantar restricciones y sus directrices excluyen herramientas limitadas al uso interno; no prometer acceso para nuestro panel privado. La biblioteca comercial TikTok no se presume autorizada para abastecer nuestra biblioteca local. Los usos publicitarios necesitan evaluación propia. [Directrices de publicación](https://developers.tiktok.com/docs/en/content-sharing-guidelines), [Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-get-started), [música comercial](https://support.tiktok.com/en/business-and-creator/creator-and-business-accounts/commercial-use-of-music-on-tiktok?lang=en).

## 12. Próximos pasos y decisiones abiertas

1. Recibir muestra propia/autorizada para primera descarga. Solicitada; aún no recibida.
2. Preparar y ejecutar prueba local aislada; informar resultados y límites, sin elegir arquitectura del producto por anticipado.
3. Validar acceso de desarrollador y cuenta Spotify del cliente para una prueba online independiente; no solicitar contraseñas.
4. Evaluar MusicKit si el cliente lo desea.
5. Registrar si las coincidencias, calidad y mantenimiento satisfacen al cliente y resolver el encaje contractual antes de comprometer comercialmente las integraciones.

Siguen pendientes: SO/recursos reales de la PC, país/cuentas, muestras de repertorio, presupuesto/volumen y monetización. No hay compras o mensajes a terceros autorizados por este documento. Los documentos previos separados quedan conservados como antecedentes; este archivo es la referencia consolidada para continuar esta investigación.
