"""
Face Recognition Microservice - InsightFace / ArcFace
======================================================
Replaces the old dlib-based face_recognition_helper.py subprocess.
Runs as an always-on FastAPI server on port 8001.

Endpoints:
  POST /register   { student_id, student_name, reg_no, frames: [base64, ...] }
  POST /recognize  { frame: base64 }
  GET  /health
"""

from __future__ import annotations
import os, json, base64, time, logging
from pathlib import Path
from typing import Optional

import numpy as np
import cv2
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import insightface
from insightface.app import FaceAnalysis

# Config
EMBED_DB_PATH  = Path(__file__).parent / "face_embeddings.json"
SIM_THRESHOLD  = 0.35   # cosine similarity floor for a match
UNCERTAIN_LOW  = 0.25   # below this = definitely unknown

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [FaceSvc] %(levelname)s %(message)s")
log = logging.getLogger("face_service")

# Load model once at startup
log.info("Loading InsightFace model (buffalo_sc - fast CPU model)...")
FACE_APP = FaceAnalysis(name="buffalo_sc", providers=["CPUExecutionProvider"])
FACE_APP.prepare(ctx_id=0, det_size=(640, 640))
log.info("InsightFace model ready.")


def _load_db() -> dict:
    if EMBED_DB_PATH.exists():
        try:
            return json.loads(EMBED_DB_PATH.read_text())
        except Exception:
            pass
    return {}

def _save_db(db: dict) -> None:
    EMBED_DB_PATH.write_text(json.dumps(db, indent=2))

def _b64_to_img(b64: str):
    try:
        raw = b64
        if "," in raw:
            raw = raw.split(",", 1)[1]
        data = base64.b64decode(raw)
        arr  = np.frombuffer(data, np.uint8)
        img  = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        log.warning(f"b64_to_img error: {e}")
        return None

def _get_embedding(img):
    try:
        faces = FACE_APP.get(img)
        if not faces:
            return None
        face = max(faces, key=lambda f: f.det_score)
        emb  = np.array(face.normed_embedding, dtype=np.float32)
        return emb
    except Exception as e:
        log.warning(f"_get_embedding error: {e}")
        return None

def _cosine_sim(a, b) -> float:
    return float(np.dot(a, b))


app = FastAPI(title="SRM Face Recognition Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class RegisterRequest(BaseModel):
    student_id:   int
    student_name: str
    reg_no:       str
    frames:       list

class RegisterResponse(BaseModel):
    success:          bool
    frames_processed: int
    frames_skipped:   int
    message:          str = ""
    error:            str = ""

class RecognizeRequest(BaseModel):
    frame: str

class RecognizeResponse(BaseModel):
    match:      bool
    student_id: Optional[int]   = None
    name:       Optional[str]   = None
    reg_no:     Optional[str]   = None
    confidence: Optional[float] = None
    uncertain:  bool            = False
    reason:     Optional[str]   = None


@app.get("/health")
def health():
    return {"status": "ok", "model": "InsightFace/buffalo_sc", "threshold": SIM_THRESHOLD}


@app.post("/register", response_model=RegisterResponse)
def register(req: RegisterRequest):
    t0 = time.time()
    log.info(f"[Register] student_id={req.student_id} name={req.student_name} frames={len(req.frames)}")

    embeddings = []
    skipped = 0

    for i, b64 in enumerate(req.frames):
        img = _b64_to_img(b64)
        if img is None:
            log.warning(f"  frame {i}: failed to decode")
            skipped += 1
            continue

        emb = _get_embedding(img)
        if emb is None:
            log.warning(f"  frame {i}: no face detected")
            skipped += 1
            continue

        embeddings.append(emb)
        log.info(f"  frame {i}: OK (det_score logged by InsightFace)")

    if not embeddings:
        log.error("[Register] No faces detected in any frame")
        return RegisterResponse(
            success=False,
            frames_processed=0,
            frames_skipped=skipped,
            error="No face detected in any frame. Ensure good lighting and face the camera directly."
        )

    avg_emb = np.mean(embeddings, axis=0)
    norm    = np.linalg.norm(avg_emb)
    if norm > 0:
        avg_emb = avg_emb / norm

    db  = _load_db()
    key = str(req.student_id)
    db[key] = {
        "student_id":   req.student_id,
        "student_name": req.student_name,
        "reg_no":       req.reg_no,
        "embedding":    avg_emb.tolist(),
        "frame_count":  len(embeddings),
        "enrolled_at":  time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    _save_db(db)

    elapsed = round(time.time() - t0, 2)
    log.info(f"[Register] SUCCESS - {len(embeddings)} frames used, {skipped} skipped, {elapsed}s")
    return RegisterResponse(
        success=True,
        frames_processed=len(embeddings),
        frames_skipped=skipped,
        message=f"Face enrolled successfully using {len(embeddings)} frames."
    )


@app.post("/recognize", response_model=RecognizeResponse)
def recognize(req: RecognizeRequest):
    img = _b64_to_img(req.frame)
    if img is None:
        return RecognizeResponse(match=False, reason="Failed to decode image frame")

    query_emb = _get_embedding(img)
    if query_emb is None:
        return RecognizeResponse(match=False, reason="No face detected in frame")

    db = _load_db()
    if not db:
        return RecognizeResponse(match=False, reason="No students enrolled yet")

    best_sim     = -1.0
    best_student = None

    for key, record in db.items():
        stored_emb = np.array(record["embedding"], dtype=np.float32)
        sim = _cosine_sim(query_emb, stored_emb)
        if sim > best_sim:
            best_sim     = sim
            best_student = record

    log.info(f"[Recognize] best_sim={best_sim:.4f} student={best_student['student_name'] if best_student else 'n/a'}")

    if best_sim >= SIM_THRESHOLD:
        return RecognizeResponse(
            match=True,
            student_id  = best_student["student_id"],
            name        = best_student["student_name"],
            reg_no      = best_student["reg_no"],
            confidence  = round(best_sim, 4),
            uncertain   = False,
        )
    elif best_sim >= UNCERTAIN_LOW:
        return RecognizeResponse(
            match=False,
            confidence = round(best_sim, 4),
            uncertain  = True,
            reason     = "Low-confidence match - scanning again",
        )
    else:
        return RecognizeResponse(match=False, reason="No match found", confidence=round(best_sim, 4))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")
