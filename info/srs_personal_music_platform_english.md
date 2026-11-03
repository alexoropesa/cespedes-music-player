# Software Requirements Specification (SRS)
## Personal Music Platform: Catalog, Integrations & Technical Ingestion

---

## 1. Introduction

### 1.1 Purpose
This Software Requirements Specification (SRS) document defines the functional, non-functional, and integration requirements for the client's custom **Personal Music Platform**. The system is designed strictly for private management, cataloging, streaming integration, and localized audio processing for personal listening.

### 1.2 Scope & Vision
- **Target Audience & Deployment:** Desktop environment (local host/PC) serving a single private user. No public streaming, FM broadcasting, or third-party distribution.
- **Core Intent:** Provide a unified back-office web application with an internationalized English UI (`en-US`) to search tracks, manage playlists, stream via official APIs (Spotify / Apple Music), and ingest/process local audio files.
- **Operational Boundaries:** Integrations with third-party streaming providers are read-only / playback-only (bounded by official Web SDKs). Downloads and audio extraction via third-party open-source tools (e.g., `yt-dlp`, `FreyrJS`) operate as local experimental ingestion pipelines subject to source availability and copyright compliance.

---

## 2. Overall Description

### 2.1 System Context & Architecture Overview
The system operates as a hybrid architecture:
1. **Web Front-Office / Back-Office UI:** Developed with English interface labels for catalog browsing, track search, playlist curation, and audio playback.
2. **Local Microservice / Ingestion Worker:** A background process running on the host machine handling media metadata inspection (`ffprobe`), file downloading, validation, and audio normalization/transcoding (`FFmpeg`).
3. **External Integrations:**
   - **Streaming SDKs:** Official web playback engines (Spotify Web Playback SDK, MusicKit JS).
   - **Ingestion Extractors:** CLI and library wrappers (`yt-dlp`, `spotDL`, `FreyrJS`, `cobalt API`).

### 2.2 Operational Modes
- **Online Streaming Mode:** Audio is streamed directly from Spotify or Apple Music to the browser. Audio binary stream is never saved or passed to local ingestion workers.
- **Local Library Mode:** Audio files are stored on local disks, indexed in the application database, and played via native HTML5 audio elements without internet dependency.

---

## 3. System Features & Functional Requirements

### 3.1 Catalog & Search Management

#### FR-CAT-01: Multi-Source Search Aggregation
- **Description:** System shall allow users to search for tracks, artists, and albums across both the local database and external APIs.
- **Inputs:** Text query string (Track Name, Artist, ISRC, or Direct URL).
- **Processing:** Direct API calls to search endpoints or CLI query generation.
- **Outputs:** Display unified search result table containing Title, Artist, Duration, Source Type (Local, Spotify, YouTube/Third-party match), and Match Confidence Score.

#### FR-CAT-02: Track Match & Verification Interface
- **Description:** When using third-party extractors (`spotDL`, `FreyrJS`), system shall explicitly log and display the matched source URL alongside the requested track metadata.
- **Requirements:**
  - System MUST store both `requested_reference_id` and `resolved_source_url` as distinct database fields.
  - User MUST be allowed to manually resolve, override, or approve a search match if automatic matching identifies an incorrect audio version (e.g., live vs. studio, cover vs. original).

---

### 3.2 Third-Party Streaming Integrations (Spotify & Apple Music)

#### FR-STR-01: Spotify Web Playback & OAuth PKCE
- **Description:** Implement Spotify authentication using the Authorization Code Flow with PKCE.
- **Requirements:**
  - Application MUST NOT store user passwords.
  - System MUST securely manage access tokens, refresh tokens, and handle expiration/revocation gracefully.
  - Playback requires an active Spotify Premium account and the Web Playback SDK.
  - Offline encrypted files on mobile/desktop Spotify apps MUST NOT be ingested or exported.

#### FR-STR-02: Playlist Synchronization & Snapshot Tracking
- **Description:** Synchronize Spotify/Apple Music playlists to internal state.
- **Requirements:**
  - Track changes using `snapshot_id`.
  - System MUST offer a "Freeze Selection" action that saves a local copy of track metadata and ordering without guaranteeing future streaming availability if removed by the provider.

#### FR-STR-03: Apple Music Integration (MusicKit JS)
- **Description:** Optional playback and catalog browsing using Apple MusicKit JS.
- **Requirements:** Requires developer token authentication and active user subscription. Audio streams MUST NOT be intercepted or redirected to local ingestion workers.

---

### 3.3 Local Ingestion & Audio Processing Pipeline

#### FR-ING-01: Single URL & Batch Ingestion
- **Description:** Ingest audio from explicit user-provided URLs or approved external references.
- **Requirements:**
  - Pipeline MUST operate under a strict execution state machine: `PENDING` $\rightarrow$ `DOWNLOADING` $\rightarrow$ `VALIDATING` $\rightarrow$ `READY` (or `FAILED`).
  - Unfinished downloads MUST NOT be exposed as playable tracks in the UI.

---

## 4. Operational Requirements & System Constraints

### 4.1 Interface & Data Language Standards
- **User Interface (UI):** English (`en-US`) strictly across all back-office screens, buttons, tables, and modal dialogs.
- **System Documentation & Internal Logs:** Spanish (`es-ES`) for technical notes, architectural documents, and internal code comments.

### 4.2 Environmental & Runtime Requirements
- **Host System:** Client's local desktop PC.
- **Runtime Environment:**
  - Python 3.11+ required for `yt-dlp` and `ytmusicapi` compatibility.
  - Isolated virtual environment (`venv`) or containerized runner to prevent system Python contamination.
  - Native binary dependencies: `FFmpeg` 7.x / `ffprobe`.

---

## 5. Non-Functional Requirements (NFR)

| Category | Requirement Code | Specification Details |
|---|---|---|
| **Security & Auth** | NFR-SEC-01 | OAuth 2.0 + PKCE for streaming providers. No local credential storage for third-party accounts. |
| **Data Integrity** | NFR-DAT-01 | Immutability of original ingested audio files. Hashing via SHA-256 to prevent duplicate storage. |
| **Reliability** | NFR-REL-01 | Graceful degradation during network drops or API rate limiting. Idempotent queue workers. |
| **Performance** | NFR-PER-01 | Background ingestion tasks must not block UI interactivity. Audio playback latency $< 300\text{ ms}$ for local tracks. |
| **Compliance** | NFR-CMP-01 | Explicit metadata tagging tracking legal provenance, licensing limits, and usage boundaries. |

---

## 6. Verification & Acceptance Criteria

| Criteria ID | Verification Subject | Required Evidence / Outcome |
|---|---|---|
| **AC-01** | Track Matching | Provenance record successfully saves `requested_reference_id` and `resolved_source_url` with verified duration match ($\pm 2\text{s}$). |
| **AC-02** | Local Playback | Audio file plays offline from local disk storage without internet connectivity. |
| **AC-03** | Audio Integrity | Bitstream validation passes via `ffprobe` with zero corrupt frame errors logged. Original file remains untouched after normalization. |
| **AC-04** | Streaming Integration | OAuth PKCE handshake completes successfully; Web Playback SDK initiates playback for authorized Spotify Premium session. |
| **AC-05** | Error Handling | Network disconnection during download updates status to `FAILED` and clears temporary `/tmp/ingestion/` files without crashing application. |