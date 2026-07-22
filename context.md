# SRM Smart Attendance System — Project Overview

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 6 + Tailwind CSS 4 + Lucide icons |
| Backend | Express 4 + TypeScript (tsx runner) |
| Database | Flat-file JSON (`db.json`) with in-memory sync |
| Barcode | `@zxing/library` + `sharp` (upscale + grayscale preprocessing) |
| Face matching | Perceptual dHash via `sharp` (64-bit difference hash, Hamming distance) |
| Audio | Web Audio API synthesized tones (no audio files) |

## Running the Project

```bash
# Unified dev server (serves frontend + backend together)
tsx server.ts             # Runs on http://localhost:8000

# Split dev (frontend via Vite, backend via tsx)
npx vite                  # Frontend on port 5173, proxies /api → localhost:8000
tsx server.ts             # Backend API on port 8000
```

The Vite proxy in `vite.config.ts` automatically forwards `/api/*` requests to `http://localhost:8000` when running `npx vite` standalone.

## Architecture

### Role System

Three roles, stored in the `users` table:
- **Student** — views attendance summary per subject
- **Subject Teacher** — takes attendance via face/barcode scanning, manual override, session management
- **Faculty Advisor (FA)** — manages class roster, imports Excel, transfers class responsibility, views attendance summaries

Users with `role: "both"` can switch between Teacher and FA via the role switcher in the navbar.

### Ports

- **Backend API**: `localhost:8000` (server.ts)
- **Frontend dev**: `localhost:5173` (via `npx vite`, proxies `/api` → `:8000`)
- **Unified dev**: `localhost:8000` (via `tsx server.ts`, Vite middleware mode)

## Camera System

### Singleton Pattern (`src/lib/camera.ts`)

The camera is initialized **once** globally — the first call to `initCamera()` calls `getUserMedia()`. All subsequent calls return the same stream/stored `deviceId`. The pattern:

1. `App.tsx` calls `initCamera('environment')` on mount (permission request happens here)
2. `TeacherDashboard` checks `getCameraState()` — if stream exists, uses it; otherwise calls `initCamera()` which returns the existing promise
3. `CameraScanner` receives `mediaStream` as a prop — **never** calls `getUserMedia`

Key rules:
- Only one `getUserMedia` call in the entire app lifecycle
- `state.initPromise` resets on error so the user can retry if permission was denied
- On failure, the catch resets `state.initPromise = null` and re-throws

### CameraScanner Component (`src/components/CameraScanner.tsx`)

- Props: `mediaStream: MediaStream | null` — stream from parent
- The video element's `srcObject` is only updated when `mediaStream` changes (guarded to avoid DOMException)
- `video.play()` errors (`AbortError`, `NotAllowedError`) are silently caught
- The video stream is **never stopped** when switching modes or closing the scanner — the singleton persists it

**Scanning modes** (swap decoder, never stop video):
| Mode | Interval | Endpoint |
|------|----------|----------|
| Barcode (Code128) | 1.5s | `POST /api/scan-barcode` |
| Face recognition | 2.0s | `POST /api/recognize-face` |

Frame capture: canvas element draws current video frame → `toDataURL('image/jpeg', 0.7)` → strips base64 prefix → POSTs to endpoint.

## API Endpoints

### Authentication & Users
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/login` | Authenticate (username/password for faculty, name for students) |
| GET | `/api/students/me` | Student's subject summary + attendance logs |
| POST | `/api/register-face` | Register face image (stores as base64 in `face_encoding`) |

### Classes & Subjects
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/classes/:id/roster` | Full student roster for a class |
| GET | `/api/classes/:id/subjects` | Subjects in a class with teacher names |
| GET | `/api/classes/me` | Classes relevant to current user (by role) |
| GET | `/api/classes/:id/attendance-summary` | Attendance rates per student across subjects |
| POST | `/api/classes/import-excel` | Bulk import students from Excel template |
| POST | `/api/classes/manual-add` | Add single student manually |
| POST | `/api/classes/:id/transfer` | Transfer class FA responsibility |
| POST | `/api/subjects` | Create subject and assign teacher |
| POST | `/api/subjects/assign-teacher` | Assign teacher to subject |

### Sessions & Attendance
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sessions` | Create draft session (or return existing draft) |
| POST | `/api/sessions/:id/start` | Start session timer (`session_start_time`) |
| POST | `/api/sessions/:id/submit` | Submit session (starts 48hr lock window) |
| PUT | `/api/attendance/:id` | Update attendance status with session timing logic |
| GET | `/api/sessions/:id/attendance` | Get enriched attendance records for a session |

### Scanning
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/scan-barcode` | Decode Code128 from image frame via ZXing+sharp, mark student present |
| POST | `/api/recognize-face` | Compare face frame against stored encodings via dHash |

### Utilities
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/excel/template` | Download pre-styled Excel import template |
| GET | `/api/faculty/teachers` | List all faculty users |
| GET | `/api/class-transfers` | View class transfer logs |
| POST | `/api/reset` | Reseed database to defaults (dev route) |

## Barcode Scanning

Uses `@zxing/library` (MultiFormatReader with Code128 hint) + `sharp` for image preprocessing:

1. Frame captured from video → base64 → sharp buffer
2. Upscale 3× (lanczos3 kernel) + grayscale + normalize contrast
3. Convert to RGB → `RGBLuminanceSource` → `BinaryBitmap` → `HybridBinarizer`
4. Decode with `TRY_HARDER` hint
5. Fallback: try original resolution if upscaled decode fails

On successful decode → look up student by `reg_no`. If not found, create new student profile (special case: `RA2311027020047` → "Aditya Sen"). Auto-enroll into class and create attendance record.

## Face Recognition

Uses perceptual image hashing (dHash) via `sharp`:

1. **Hash computation**: Resize to 9×8 → grayscale → compare adjacent horizontal pixels → 64-bit binary string
2. **Matching**: Compare incoming hash against stored `face_encoding` (base64 images from `/api/register-face`)
3. **Scoring**: Hamming distance → confidence = `1 - distance/32`, threshold > 0.55 to match
4. **Silent retry**: Failed matches return `{ confidence: 0 }`, frontend silently retries next frame

Face encodings are stored as the raw base64 image data on the `users` table (`face_encoding` column). Seed data has placeholder values (`"registered_arun"` etc.) that don't produce valid hashes — real face images must be uploaded via the registration endpoint.

## Session Timing Rules

When a student is marked (via scan or manual toggle), the status is determined by elapsed time since `session_start_time`:

| Elapsed | Default Status | Teacher Override |
|---------|---------------|------------------|
| 0–20 min | **Present** | Can toggle to Absent freely |
| 20–30 min | **Late** | Can override to Present (no reason needed) |
| 30+ min | **Absent** | Can override to Present only with **mandatory reason** |

The override reason is stored in `attendance.override_reason` and visible to the FA.

## Database Schema (`db.json`)

Seven tables in a single JSON file:

```
users        → id, name, username, role, reg_no, face_encoding, email, created_at
classes      → id, name, department, specialization, batch_start, batch_end, semester, fa_id
enrollments  → id, student_id, class_id
subjects     → id, name, class_id, teacher_id
sessions     → id, subject_id, date, created_by, submitted_at, locked, session_start_time
attendance   → id, session_id, student_id, status, marked_at, override_reason
class_transfers → id, class_id, from_fa_id, to_fa_id, transferred_at
```

### Seed Data

| User | Username | Password | Role |
|------|----------|----------|------|
| Prof. Krishna | `krishna_fa` | pass123 | both (FA of CS-A) |
| Prof. Rajesh Kumar | `rajesh` | pass123 | both (teacher of Mathematics) |
| Dr. Priya Sen | `priya` | pass123 | both (teacher of Advanced Data Structures) |

Students: Arun Kumar, Bhavya S, Chethan R, Divya Menon, Elan Cheran — all in CS-A with reg_nos `RA2311027020001`–`0005`.

Classes: CS-A (batch 2023–2027, Sem III, AI specialization) and CS-B (Cyber Security specialization).
