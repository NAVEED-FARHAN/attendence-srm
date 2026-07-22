"""
Face Recognition Helper - bridges Node.js server with Python face_recognition library.

Usage:
  Register: python face_recognition_helper.py register --frames frame1.jpg frame2.jpg ...
            Outputs JSON: {"encoding": "<base64_numpy_bytes>", "frames_processed": 10, "frames_skipped": 0}
  
  Recognize: python face_recognition_helper.py recognize --frame test.jpg --encodings <base64_encoding1,student_id1;base64_encoding2,student_id2;...>
             Outputs JSON: {"match": true, "student_id": 101, "name": "...", "reg_no": "...", "confidence": 0.85}
             Or: {"match": false, "result": "unknown"}
"""

import sys
import json
import base64
import io
import argparse
import os
import traceback

import numpy as np
import face_recognition
import cv2


def process_register(frames_paths: list[str]) -> dict:
    """
    Process multiple frames for face registration.
    Returns averaged encoding from all frames with detected faces.
    """
    all_encodings = []
    frames_processed = 0
    frames_skipped = 0

    for frame_path in frames_paths:
        try:
            # Load image using face_recognition (uses PIL internally)
            image = face_recognition.load_image_file(frame_path)
            
            # Detect face locations
            face_locations = face_recognition.face_locations(image, model="hog")
            
            if len(face_locations) == 0:
                frames_skipped += 1
                continue
            
            # Get face encodings
            face_encodings = face_recognition.face_encodings(image, face_locations)
            
            if len(face_encodings) > 0:
                all_encodings.append(face_encodings[0])
                frames_processed += 1
        except Exception as e:
            frames_skipped += 1
            continue

    if frames_processed == 0:
        return {
            "success": False,
            "error": "No face detected in any frame",
            "frames_processed": 0,
            "frames_skipped": frames_skipped
        }

    # Average all encodings into one
    avg_encoding = np.mean(all_encodings, axis=0)
    
    # Serialize to bytes and base64 encode
    encoding_bytes = avg_encoding.tobytes()
    encoding_b64 = base64.b64encode(encoding_bytes).decode('ascii')

    return {
        "success": True,
        "encoding": encoding_b64,
        "frames_processed": frames_processed,
        "frames_skipped": frames_skipped,
        "encoding_shape": list(avg_encoding.shape)
    }


def process_recognize(frame_path: str, encodings_data: list[dict]) -> dict:
    """
    Recognize a face in a single frame against stored encodings.
    
    encodings_data: list of {"student_id": int, "name": str, "reg_no": str, "encoding_b64": str}
    """
    try:
        # Load the test image
        image = face_recognition.load_image_file(frame_path)
        
        # Detect face locations
        face_locations = face_recognition.face_locations(image, model="hog")
        
        if len(face_locations) == 0:
            return {"match": False, "result": "unknown", "reason": "no_face_detected"}
        
        # Get face encodings for all detected faces
        face_encodings = face_recognition.face_encodings(image, face_locations)
        
        if len(face_encodings) == 0:
            return {"match": False, "result": "unknown", "reason": "no_encoding"}
        
        # Decode all stored encodings
        known_encodings = []
        known_students = []
        
        for entry in encodings_data:
            try:
                enc_bytes = base64.b64decode(entry["encoding_b64"])
                enc = np.frombuffer(enc_bytes, dtype=np.float64)
                known_encodings.append(enc)
                known_students.append(entry)
            except Exception:
                continue
        
        if len(known_encodings) == 0:
            return {"match": False, "result": "unknown", "reason": "no_stored_encodings"}
        
        # Compare the first detected face against all known encodings
        # face_recognition.compare_faces returns list of booleans
        # face_recognition.face_distance returns list of distances (lower = better match)
        test_encoding = face_encodings[0]
        
        face_distances = face_recognition.face_distance(known_encodings, test_encoding)
        
        # Find the best match
        best_idx = int(np.argmin(face_distances))
        best_distance = float(face_distances[best_idx])
        
        # Convert distance to confidence score
        # face_distance of 0.0 = perfect match (confidence 1.0)
        # face_distance of 0.6 = weak match (confidence ~0.4)
        # Standard threshold: 0.6 distance = ~0.6 confidence
        confidence = max(0.0, min(1.0, 1.0 - best_distance))
        
        # Use threshold of 0.6 confidence (0.4 distance)
        if confidence >= 0.6:
            best_student = known_students[best_idx]
            return {
                "match": True,
                "student_id": best_student["student_id"],
                "name": best_student["name"],
                "reg_no": best_student["reg_no"],
                "confidence": round(confidence, 4),
                "distance": round(best_distance, 4)
            }
        else:
            return {
                "match": False,
                "result": "unknown",
                "confidence": round(confidence, 4),
                "distance": round(best_distance, 4),
                "closest_name": known_students[best_idx]["name"] if known_students else None
            }
            
    except Exception as e:
        return {"match": False, "result": "unknown", "error": str(e)}


def main():
    parser = argparse.ArgumentParser(description="Face Recognition Helper")
    parser.add_argument("mode", choices=["register", "recognize"], help="Operation mode")
    parser.add_argument("--frames", nargs="+", help="Paths to frame images for registration")
    parser.add_argument("--frame", help="Path to single frame image for recognition")
    parser.add_argument("--encodings", help="JSON string of stored encodings array for recognition")
    
    args = parser.parse_args()
    
    result = {}
    
    if args.mode == "register":
        if not args.frames:
            result = {"success": False, "error": "No frames provided"}
        else:
            result = process_register(args.frames)
    
    elif args.mode == "recognize":
        if not args.frame:
            result = {"match": False, "result": "unknown", "error": "No frame provided"}
        elif not args.encodings:
            result = {"match": False, "result": "unknown", "error": "No encodings provided"}
        else:
            try:
                encodings_data = json.loads(args.encodings)
                result = process_recognize(args.frame, encodings_data)
            except json.JSONDecodeError:
                result = {"match": False, "result": "unknown", "error": "Invalid encodings JSON"}
    
    # Output result as JSON to stdout
    print(json.dumps(result))


if __name__ == "__main__":
    main()
