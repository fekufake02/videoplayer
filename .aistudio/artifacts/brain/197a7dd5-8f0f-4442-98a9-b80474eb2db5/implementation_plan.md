# Google Drive Public Video Gallery & Backblaze B2 Thumbnail Manager

A standalone, non-intrusive extension to My Vault that introduces `/drive`: a video gallery powered by a publicly accessible Google Drive folder link. Users can browse Drive videos, stream them seamlessly in an in-page modal player, and capture or upload custom thumbnails saved directly to their existing Backblaze B2 cloud storage.

## User Review & Critical Decisions

> [!IMPORTANT]
> All core architectural decisions have been aligned with your preferences:
> - **Zero Regression Guarantee**: Existing B2 vault uploads, video library, watch pages, and settings remain 100% intact with zero changes to existing behaviors.
> - **Public Folder Parser**: The backend extracts video entries directly from the public Google Drive folder link configured in `.env` (`GOOGLE_DRIVE_FOLDER_URL` or `GOOGLE_DRIVE_FOLDER_ID`), with an automatic fallback scraper and direct link generator.
> - **In-Page Modal Player**: Clicking any Google Drive video opens a dark-themed in-page modal player directly on `/drive`, supporting frame-snapping, custom thumbnail upload, and seamless streaming.
> - **Persistent B2 Thumbnails in MongoDB**: Custom thumbnails are uploaded to your Backblaze B2 bucket (Account 2) and mapped in a dedicated `DriveVideo` MongoDB collection.

---

## 1. Overview & Core Concept

- **What It Does**: Adds a dedicated `/drive` page to My Vault that automatically indexes videos hosted in a public Google Drive folder. Users can view metadata, play videos without leaving the page, capture frame snapshots or upload custom artwork, and save them straight to Backblaze B2 so updated thumbnails display across the gallery.
- **Target Persona**: Users who store larger video collections or collaborative media in Google Drive folders but desire a custom, private, high-fidelity gallery interface with custom Backblaze B2 thumbnail curation.
- **Key Value**: Separation of concerns—video storage stays on Google Drive with zero upload overhead, while thumbnail ownership and UI presentation stay securely inside your private Backblaze B2 and MongoDB stack.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Browsing Drive Videos (`/drive`)**:
   - The user navigates to `/drive` via the top navigation bar or direct URL.
   - The page displays a folder header showing folder title, active video count, and a "Sync Folder" refresh button.
   - A video card grid matches the existing My Vault aesthetic (dark `#090d16` canvas, slate cards, subtle borders, amber accents).
   - Each card displays the video title, file size, custom B2 thumbnail (or default Google Drive preview if not customized), and quick actions ("Play", "Change Thumbnail").

2. **In-Page Playback**:
   - Clicking a card opens a modal overlay featuring a responsive video player.
   - The player supports play/pause, scrub bar, volume, full screen, and a "Capture Frame as Thumbnail" button that snaps the current video frame at high resolution.

3. **Thumbnail Customization & B2 Upload**:
   - The user can click "Change Thumbnail" on any card or click "Capture Frame" inside the player.
   - A dedicated thumbnail modal allows:
     1. Frame snapshot at a specific second or current timestamp.
     2. Direct image file upload (PNG/JPG/WebP).
   - Upon confirmation, the optimized WebP thumbnail is uploaded directly to Backblaze B2 via presigned B2 URL, and the reference is stored in MongoDB. The gallery immediately reflects the new thumbnail.

### Visual Identity & Theme Tokens

- **Dominant Neutral Canvas (60%)**: Deep dark background `#090d16` / `#0b0f19` matching existing pages.
- **Structural Surfaces (30%)**: Surface cards `#0f172a`, hairline borders `border-slate-800`, glass navbar `glass-nav`.
- **Accent Budget (10%)**: Amber `#f59e0b` / `#fbbf24` primary buttons and focal badges, emerald status indicators for synced media.
- **Typography**: Clean title typography, unboxed metadata with `·` separators (no pill-box clutter), tabular numbers for sizes and timestamps (`tabular-nums`).

---

## 3. Key Product Decisions & Trade-Offs

- **Dedicated `DriveVideo` MongoDB Model vs Altering `Video` Model**:
  - *Chosen*: Create an isolated `DriveVideo` schema with fields `driveFileId`, `title`, `thumbnailKey`, `thumbnailUrl`, `size`, `mimeType`, `streamUrl`, and `duration`.
  - *Why*: Eliminates risk of polluting or breaking existing B2 video queries, indexes, or batch deletion jobs.

- **In-Page Modal Player vs Dedicated `/drive/watch/[id]` Route**:
  - *Chosen*: High-performance in-page modal player with backdrop blur and keyboard shortcuts (Esc to close, Space to pause).
  - *Why*: User-selected option. Keeps the browsing flow fast and allows rapid thumbnail adjustment while auditioning videos.

- **Resilient Google Drive Public Link Extraction**:
  - *Chosen*: Multi-strategy backend parser:
    1. Extracts file listing from public Drive folder HTML stream or Google Drive public endpoint.
    2. Constructs direct high-speed video stream endpoints (`https://drive.google.com/uc?export=download&id=...` and preview embed fallbacks).
    3. Handles rate-limiting gracefully with a server-side MongoDB cache so folder scans run quickly without repetitive Google requests.

---

## 4. Technical Architecture & Data Strategy

### System Layout & Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                               Frontend                                 │
│                                                                        │
│  Navbar ─────────► /drive (DriveGalleryPage)                           │
│                         │                                              │
│         ┌───────────────┴───────────────┐                              │
│         ▼                               ▼                              │
│  [DriveVideoCard Grid]          [DrivePlayerModal]                     │
│         │                               │                              │
│         └───────────────┬───────────────┘                              │
│                         ▼                                              │
│             [DriveThumbnailModal] ────► Presigned B2 Upload            │
└─────────────────────────┬───────────────────────────────┬──────────────┘
                          │                               │
                          ▼                               ▼
┌─────────────────────────────────────────┐  ┌───────────────────────────┐
│               Backend                   │  │       Backblaze B2        │
│                                         │  │                           │
│  GET  /api/drive/videos                 │  │  Stores custom WebP       │
│  POST /api/drive/sync                   │  │  thumbnails               │
│  POST /api/drive/thumbnails/initiate    │  │  (Account 2 bucket)       │
│  POST /api/drive/videos/:id/thumbnail   │  └───────────────────────────┘
│  GET  /api/drive/videos/:id/stream      │
└──────────────────┬──────────────────────┘
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
┌─────────────────┐ ┌─────────────────────────┐
│   Google Drive  │ │     MongoDB Database    │
│  (Public Folder │ │                         │
│   Stream/Files) │ │  drive_videos collection│
└─────────────────┘ └─────────────────────────┘
```

### Data Model (`DriveVideo`)

- `driveFileId`: string (unique, indexed)
- `title`: string
- `originalFilename`: string
- `mimeType`: string
- `size`: number
- `duration`: number
- `driveViewUrl`: string
- `driveStreamUrl`: string
- `thumbnailKey`: string (optional, B2 storage key)
- `thumbnailStorageAccount`: 'account1' | 'account2'
- `thumbnailUrl`: string (cached presigned B2 URL or Drive fallback)
- `updatedAt` / `createdAt`: Date

### Step-by-Step Implementation Strategy

1. **Backend Integration (Strictly Additive)**:
   - Add `GOOGLE_DRIVE_FOLDER_URL` and `GOOGLE_DRIVE_FOLDER_ID` environment variable support.
   - Create `backend/src/models/DriveVideo.ts`.
   - Create `backend/src/services/driveService.ts` for extracting and syncing public Google Drive files.
   - Create `backend/src/controllers/driveController.ts` for listing, syncing, thumbnail generation, and streaming.
   - Register `/api/drive/*` routes in `backend/src/routes/index.ts` without touching existing routes.

2. **Frontend UI & Components**:
   - Add `/drive` navigation item to `Navbar.tsx` seamlessly alongside existing links.
   - Create `frontend/app/drive/page.tsx` with search, filter, sync button, and responsive video card grid.
   - Create `frontend/components/DriveVideoCard.tsx` with hover preview, custom B2 thumbnail display, and play/edit triggers.
   - Create `frontend/components/DrivePlayerModal.tsx` for smooth in-page streaming and instant frame capture.
   - Create `frontend/components/DriveThumbnailModal.tsx` for manual upload or frame selection to B2.
   - Add API methods in `frontend/lib/api.ts` under a dedicated `driveApi` namespace.

3. **Verification**:
   - Run compilation and linting to ensure zero build errors and strict TypeScript safety.
