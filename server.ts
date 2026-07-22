import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

import express from "express";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { createServer as createViteServer } from "vite";
import * as XLSX from "xlsx";
import sharp from "sharp";
import { MultiFormatReader, BarcodeFormat, DecodeHintType, BinaryBitmap, HybridBinarizer, RGBLuminanceSource } from "@zxing/library";
import { isFirebaseConfigured, loadDatabaseFromFirebase, saveDatabaseToFirebase } from "./server/firebase";

const app = express();
const PORT = Number(process.env.PORT) || 8000;
const DB_PATH = path.join(process.cwd(), "db.json");

// Middleware to parse JSON payloads and URL encoded payloads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Types & Interfaces matching Database Schema
interface User {
  id: number;
  name: string;
  username: string | null;
  role: "student" | "teacher" | "fa" | "both";
  reg_no: string | null;
  face_encoding: string | null; // Base64 of a sample image or metadata
  email: string | null;
  created_at: string;
}

interface ClassObj {
  id: number;
  name: string;
  department: string;
  specialization: string;
  batch_start: number;
  batch_end: number;
  semester: string;
  fa_id: number;
}

interface Enrollment {
  id: number;
  student_id: number;
  class_id: number;
}

interface Subject {
  id: number;
  name: string;
  class_id: number;
  teacher_id: number;
}

interface Session {
  id: number;
  subject_id: number;
  date: string;
  created_by: number;
  submitted_at: string | null;
  locked: boolean;
  session_start_time: string | null;
}

interface AttendanceRecord {
  id: number;
  session_id: number;
  student_id: number;
  status: "present" | "absent" | "late";
  marked_at: string;
  override_reason: string | null;
}

interface ClassTransfer {
  id: number;
  class_id: number;
  from_fa_id: number;
  to_fa_id: number;
  transferred_at: string;
}

interface DatabaseSchema {
  users: User[];
  classes: ClassObj[];
  enrollments: Enrollment[];
  subjects: Subject[];
  sessions: Session[];
  attendance: AttendanceRecord[];
  class_transfers: ClassTransfer[];
}

// In-Memory Database Cache for fast synchronous REST responses
let dbCache: DatabaseSchema | null = null;

// Async init for Firebase if configured
if (isFirebaseConfigured()) {
  loadDatabaseFromFirebase(seedData).then((remoteData) => {
    if (remoteData) {
      dbCache = remoteData;
      try {
        fs.writeFileSync(DB_PATH, JSON.stringify(remoteData, null, 2), "utf-8");
      } catch (e) {}
      console.log("🔥 Loaded database state from Firebase Firestore.");
    }
  });
}

// Global In-Memory and File Sync DB Helper
function loadDB(): DatabaseSchema {
  if (dbCache) return dbCache;
  if (!fs.existsSync(DB_PATH)) {
    const initialDB = seedData();
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(initialDB, null, 2), "utf-8");
    } catch (e) {}
    dbCache = initialDB;
    return initialDB;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    dbCache = JSON.parse(raw);
    return dbCache!;
  } catch (e) {
    const initialDB = seedData();
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(initialDB, null, 2), "utf-8");
    } catch (err) {}
    dbCache = initialDB;
    return initialDB;
  }
}

function saveDB(db: DatabaseSchema) {
  dbCache = db;
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
  } catch (e) {}
  if (isFirebaseConfigured()) {
    saveDatabaseToFirebase(db).catch(() => {});
  }
}

function seedData(): DatabaseSchema {
  const users: User[] = [
    // FAs & Teachers
    { id: 1, name: "Prof. Krishna", username: "krishna_fa", role: "both", reg_no: null, face_encoding: null, email: "krishna@srmist.edu.in", created_at: new Date().toISOString() },
    { id: 2, name: "Prof. Rajesh Kumar", username: "rajesh", role: "both", reg_no: null, face_encoding: null, email: "rajesh@srmist.edu.in", created_at: new Date().toISOString() },
    { id: 3, name: "Dr. Priya Sen", username: "priya", role: "both", reg_no: null, face_encoding: null, email: "priya@srmist.edu.in", created_at: new Date().toISOString() },
    
    // Students in CS-A (5 students)
    { id: 101, name: "Arun Kumar", username: null, role: "student", reg_no: "RA2311027020001", face_encoding: "registered_arun", email: "arun.k@srmist.edu.in", created_at: new Date().toISOString() },
    { id: 102, name: "Bhavya S", username: null, role: "student", reg_no: "RA2311027020002", face_encoding: "registered_bhavya", email: "bhavya.s@srmist.edu.in", created_at: new Date().toISOString() },
    { id: 103, name: "Chethan R", username: null, role: "student", reg_no: "RA2311027020003", face_encoding: null, email: "chethan.r@srmist.edu.in", created_at: new Date().toISOString() },
    { id: 104, name: "Divya Menon", username: null, role: "student", reg_no: "RA2311027020004", face_encoding: null, email: "divya.m@srmist.edu.in", created_at: new Date().toISOString() },
    { id: 105, name: "Elan Cheran", username: null, role: "student", reg_no: "RA2311027020005", face_encoding: null, email: "elan.c@srmist.edu.in", created_at: new Date().toISOString() }
  ];

  const classes: ClassObj[] = [
    // CS-A (FA: Krishna)
    { id: 1, name: "CS-A", department: "Computer Science", specialization: "Artificial Intelligence", batch_start: 2023, batch_end: 2027, semester: "III", fa_id: 1 },
    // CS-B (FA: Rajesh)
    { id: 2, name: "CS-B", department: "Computer Science", specialization: "Cyber Security", batch_start: 2023, batch_end: 2027, semester: "III", fa_id: 2 }
  ];

  const enrollments: Enrollment[] = [
    { id: 1, student_id: 101, class_id: 1 },
    { id: 2, student_id: 102, class_id: 1 },
    { id: 3, student_id: 103, class_id: 1 },
    { id: 4, student_id: 104, class_id: 1 },
    { id: 5, student_id: 105, class_id: 1 }
  ];

  const subjects: Subject[] = [
    // Subjects in CS-A
    { id: 1, name: "Mathematics for Engineers", class_id: 1, teacher_id: 2 }, // Taught by Rajesh Kumar
    { id: 2, name: "Advanced Data Structures", class_id: 1, teacher_id: 3 }    // Taught by Priya Sen
  ];

  const sessions: Session[] = [
    { id: 1, subject_id: 1, date: new Date().toISOString().split("T")[0], created_by: 2, submitted_at: new Date().toISOString(), locked: false, session_start_time: new Date().toISOString() }
  ];

  const attendance: AttendanceRecord[] = [
    { id: 1, session_id: 1, student_id: 101, status: "present", marked_at: new Date().toISOString(), override_reason: null },
    { id: 2, session_id: 1, student_id: 102, status: "late", marked_at: new Date().toISOString(), override_reason: null },
    { id: 3, session_id: 1, student_id: 103, status: "absent", marked_at: new Date().toISOString(), override_reason: null },
    { id: 4, session_id: 1, student_id: 104, status: "present", marked_at: new Date().toISOString(), override_reason: null },
    { id: 5, session_id: 1, student_id: 105, status: "absent", marked_at: new Date().toISOString(), override_reason: null }
  ];

  const class_transfers: ClassTransfer[] = [];

  return {
    users,
    classes,
    enrollments,
    subjects,
    sessions,
    attendance,
    class_transfers
  };
}

// Trigger background worker for 48-hour automated session locking
const autoLockSessions = () => {
  const db = loadDB();
  let modified = false;
  const now = new Date();
  
  db.sessions = db.sessions.map((session) => {
    if (session.submitted_at && !session.locked) {
      const submitTime = new Date(session.submitted_at);
      const hoursDiff = (now.getTime() - submitTime.getTime()) / (1000 * 60 * 60);
      if (hoursDiff >= 48) {
        session.locked = true;
        modified = true;
      }
    }
    return session;
  });

  if (modified) {
    saveDB(db);
    console.log("[Background Worker] Locked sessions older than 48 hours successfully.");
  }
};

// Check for locks every 2 minutes
setInterval(autoLockSessions, 2 * 60 * 1000);

// API Endpoints

// 1. POST /api/login -> Authenticate and return user info
app.post("/api/login", (req, res) => {
  const { username, password, roleChoice } = req.body;
  const db = loadDB();

  // Faculty/Professor Authenticator (Using usernames & dummy pass123)
  if (username) {
    const matchedUser = db.users.find(
      (u) => u.username?.toLowerCase() === username.trim().toLowerCase()
    );

    if (!matchedUser) {
      return res.status(401).json({ error: "Invalid username credentials" });
    }

    if (password !== "pass123") {
      return res.status(401).json({ error: "Invalid password credentials" });
    }

    // Return custom role and context
    return res.json({
      success: true,
      user: {
        id: matchedUser.id,
        name: matchedUser.name,
        username: matchedUser.username,
        role: matchedUser.role, // 'fa', 'teacher', 'both'
        email: matchedUser.email,
        activeRole: roleChoice || (matchedUser.role === "both" ? "teacher" : matchedUser.role)
      }
    });
  }

  // Student Direct lookup (Student name direct entry check, no pass)
  const { studentName } = req.body;
  if (studentName) {
    const student = db.users.find(
      (u) =>
        u.role === "student" &&
        u.name.toLowerCase().trim() === studentName.toLowerCase().trim()
    );

    if (!student) {
      return res.status(404).json({ error: "Student profile not found. Verify your name." });
    }

    return res.json({
      success: true,
      user: {
        id: student.id,
        name: student.name,
        role: "student",
        reg_no: student.reg_no,
        face_encoding: student.face_encoding,
        email: student.email,
        activeRole: "student"
      }
    });
  }

  return res.status(400).json({ error: "Missing login details" });
});

// 2. GET /api/students/me -> Get current logged in student's subject summary
app.get("/api/students/me", (req, res) => {
  const studentId = parseInt(req.query.studentId as string);
  if (!studentId) {
    return res.status(400).json({ error: "Student ID required" });
  }

  const db = loadDB();
  const student = db.users.find((u) => u.id === studentId);
  if (!student) {
    return res.status(404).json({ error: "Student not found" });
  }

  // Find their class enrollment
  const enrollment = db.enrollments.find((e) => e.student_id === studentId);
  if (!enrollment) {
    return res.json({ student, subjects: [] });
  }

  // Find subjects in their class
  const classSubjects = db.subjects.filter((s) => s.class_id === enrollment.class_id);

  // Compile calculations per subject
  const summary = classSubjects.map((subject) => {
    // Sessions held for this subject
    const subjectSessions = db.sessions.filter((s) => s.subject_id === subject.id && s.submitted_at);
    const totalSessions = subjectSessions.length;

    // Sessions student attended (present or late)
    const sessionIds = subjectSessions.map((s) => s.id);
    const attendedRecords = db.attendance.filter(
      (a) =>
        a.student_id === studentId &&
        sessionIds.includes(a.session_id) &&
        (a.status === "present" || a.status === "late")
    );
    const attendedCount = attendedRecords.length;

    const rate = totalSessions > 0 ? Math.round((attendedCount / totalSessions) * 100) : 100;

    return {
      id: subject.id,
      name: subject.name,
      totalSessions,
      attended: attendedCount,
      attendanceRate: rate
    };
  });

  // Get all detailed attendance logs for the student
  const detailedLogs = db.attendance
    .filter((a) => a.student_id === studentId)
    .map((a) => {
      const sess = db.sessions.find((s) => s.id === a.session_id);
      if (!sess || !sess.submitted_at) return null;
      const sub = db.subjects.find((s) => s.id === sess.subject_id);
      return {
        id: a.id,
        session_id: a.session_id,
        subjectName: sub ? sub.name : "Unknown",
        date: sess.date,
        status: a.status,
        marked_at: a.marked_at,
        override_reason: a.override_reason || null,
        session_start_time: sess.session_start_time || null
      };
    })
    .filter(Boolean);

  return res.json({
    student,
    subjects: summary,
    detailedLogs
  });
});

// 3. GET /api/classes/:id/roster -> Fetch full roster of enrolled students
app.get("/api/classes/:id/roster", (req, res) => {
  const classId = parseInt(req.params.id);
  const db = loadDB();

  const classObj = db.classes.find((c) => c.id === classId);
  if (!classObj) {
    return res.status(404).json({ error: "Class not found" });
  }

  // Find enrolled student IDs
  const enrolledStudentIds = db.enrollments
    .filter((e) => e.class_id === classId)
    .map((e) => e.student_id);

  const roster = db.users.filter((u) => enrolledStudentIds.includes(u.id));

  return res.json({
    class: classObj,
    roster: roster.map((s, idx) => ({
      id: s.id,
      name: s.name,
      regNo: s.reg_no,
      email: s.email,
      faceRegistered: s.face_encoding !== null,
      seat: idx + 1
    }))
  });
});

// 4. GET /api/classes/:id/subjects -> Get subjects in a class
app.get("/api/classes/:id/subjects", (req, res) => {
  const classId = parseInt(req.params.id);
  const db = loadDB();

  const subjects = db.subjects.filter((s) => s.class_id === classId);
  const detailedSubjects = subjects.map((subj) => {
    const teacher = db.users.find((u) => u.id === subj.teacher_id);
    return {
      ...subj,
      teacherName: teacher ? teacher.name : "Unassigned"
    };
  });

  return res.json(detailedSubjects);
});

// 5. POST /api/sessions -> Create a new session or return existing draft session
app.post("/api/sessions", (req, res) => {
  const { subjectId, teacherId, date } = req.body;
  const db = loadDB();

  const subject = db.subjects.find((s) => s.id === parseInt(subjectId));
  if (!subject) {
    return res.status(404).json({ error: "Subject not found" });
  }

  // If a draft (unsubmitted) session already exists for this subject, return it to prevent duplicates
  const existingSession = db.sessions.find(
    (s) => s.subject_id === parseInt(subjectId) && !s.submitted_at
  );
  if (existingSession) {
    return res.json({ success: true, session: existingSession });
  }

  // Create new session entry
  const newSession: Session = {
    id: db.sessions.length > 0 ? Math.max(...db.sessions.map((s) => s.id)) + 1 : 1,
    subject_id: parseInt(subjectId),
    date: date || new Date().toISOString().split("T")[0],
    created_by: parseInt(teacherId),
    submitted_at: null,
    locked: false,
    session_start_time: null // timer starts when explicitly clicked
  };

  db.sessions.push(newSession);
  saveDB(db);

  // Pre-populate empty attendance logs for all enrolled students in the class
  const enrollments = db.enrollments.filter((e) => e.class_id === subject.class_id);
  enrollments.forEach((enroll) => {
    const newRecord: AttendanceRecord = {
      id: db.attendance.length > 0 ? Math.max(...db.attendance.map((a) => a.id)) + 1 : 1,
      session_id: newSession.id,
      student_id: enroll.student_id,
      status: "absent", // defaults to absent
      marked_at: "", // initialize to empty since not yet marked
      override_reason: null
    };
    db.attendance.push(newRecord);
  });

  saveDB(db);

  return res.json({ success: true, session: newSession });
});

// 5b. POST /api/sessions/:id/start -> Start session timer
app.post("/api/sessions/:id/start", (req, res) => {
  const sessionId = parseInt(req.params.id);
  const db = loadDB();

  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  session.session_start_time = new Date().toISOString();
  saveDB(db);

  return res.json({ success: true, session });
});

// 6. POST /api/sessions/:id/submit -> Submit session + starts 48hr window
app.post("/api/sessions/:id/submit", (req, res) => {
  const sessionId = parseInt(req.params.id);
  const db = loadDB();

  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  session.submitted_at = new Date().toISOString();
  saveDB(db);

  return res.json({ success: true, session });
});

// 7. PUT /api/attendance/:id -> Update single student attendance status with timer logic
app.put("/api/attendance/:id", (req, res) => {
  const attendanceId = parseInt(req.params.id);
  const { status, override_reason, override_to_present } = req.body;
  const db = loadDB();

  const record = db.attendance.find((a) => a.id === attendanceId);
  if (!record) {
    return res.status(404).json({ error: "Attendance log not found" });
  }

  // Check if session is locked
  const session = db.sessions.find((s) => s.id === record.session_id);
  if (session?.locked) {
    return res.status(403).json({ error: "This academic session is locked (exceeded 48 hours)." });
  }

  if (!session?.session_start_time) {
    return res.status(400).json({ error: "Session has not been started yet." });
  }

  const now = new Date();
  record.marked_at = now.toISOString();

  // Calculate late / absent based on difference between marked_at and session_start_time
  const startTime = new Date(session.session_start_time);
  const diffMinutes = (now.getTime() - startTime.getTime()) / (1000 * 60);

  if (override_to_present) {
    // Teacher overrides to Present explicitly
    if (diffMinutes > 30) {
      if (!override_reason || !override_reason.trim()) {
        return res.status(400).json({ error: "An override reason is mandatory for marking present after 30 minutes." });
      }
      record.status = "present";
      record.override_reason = override_reason.trim();
    } else {
      record.status = "present";
      record.override_reason = null; // No reason required within 30 minutes
    }
  } else if (status === "absent") {
    // Cleared/toggled back to absent
    record.status = "absent";
    record.override_reason = null;
  } else {
    // Normal marking (face, barcode, or toggle active)
    if (diffMinutes <= 20) {
      record.status = "present";
      record.override_reason = null;
    } else if (diffMinutes <= 30) {
      record.status = "late";
      record.override_reason = null;
    } else {
      // Marked after 30 minutes, automatically absent
      record.status = "absent";
      record.override_reason = null;
    }
  }

  saveDB(db);

  return res.json({ success: true, record });
});

// 8. GET /api/classes/:id/attendance-summary -> Fetch comprehensive summary across subjects
app.get("/api/classes/:id/attendance-summary", (req, res) => {
  const classId = parseInt(req.params.id);
  const db = loadDB();

  // Enrolled students
  const studentIds = db.enrollments.filter((e) => e.class_id === classId).map((e) => e.student_id);
  const students = db.users.filter((u) => studentIds.includes(u.id));

  // Subjects in class
  const classSubjects = db.subjects.filter((s) => s.class_id === classId);

  const summary = students.map((stu) => {
    const subjectRates: Record<number, number> = {};
    let totalAttendedSum = 0;
    let totalHeldSum = 0;

    classSubjects.forEach((sub) => {
      const subjectSessions = db.sessions.filter((s) => s.subject_id === sub.id && s.submitted_at);
      const heldCount = subjectSessions.length;
      
      const sessionIds = subjectSessions.map((s) => s.id);
      const attendedCount = db.attendance.filter(
        (a) =>
          a.student_id === stu.id &&
          sessionIds.includes(a.session_id) &&
          (a.status === "present" || a.status === "late")
      ).length;

      totalAttendedSum += attendedCount;
      totalHeldSum += heldCount;

      subjectRates[sub.id] = heldCount > 0 ? Math.round((attendedCount / heldCount) * 100) : 100;
    });

    const averageRate = totalHeldSum > 0 ? Math.round((totalAttendedSum / totalHeldSum) * 100) : 85;

    // Detailed records for each student to let the FA inspect sessions and override reasons
    const detailedRecords = db.attendance
      .filter((a) => a.student_id === stu.id)
      .map((a) => {
        const sess = db.sessions.find((s) => s.id === a.session_id);
        if (!sess || !sess.submitted_at) return null;
        const sub = classSubjects.find((s) => s.id === sess.subject_id);
        return {
          id: a.id,
          session_id: a.session_id,
          subjectName: sub ? sub.name : "Unknown",
          date: sess.date,
          status: a.status,
          marked_at: a.marked_at,
          override_reason: a.override_reason || null,
          session_start_time: sess.session_start_time || null
        };
      })
      .filter(Boolean);

    return {
      id: stu.id,
      name: stu.name,
      regNo: stu.reg_no,
      email: stu.email,
      rates: subjectRates,
      averageRate,
      detailedRecords
    };
  });

  return res.json({
    subjects: classSubjects,
    summary
  });
});

// Helper: forward a request to the Python InsightFace microservice
const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL || "http://localhost:8001";

async function callFaceService(endpoint: string, body: object): Promise<any> {
  const resp = await fetch(`${FACE_SERVICE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Face service ${endpoint} returned ${resp.status}: ${txt}`);
  }
  return resp.json();
}

// 9. POST /api/recognize-face -> Face Recognition via InsightFace microservice
app.post("/api/recognize-face", async (req, res) => {
  const { imageFrame, studentId } = req.body;
  const db = loadDB();

  // Manual override: if studentId is supplied directly, bypass face check (dev/testing)
  if (studentId) {
    const matched = db.users.find((u) => u.id === parseInt(studentId) && u.role === "student");
    if (matched) {
      return res.json({ student_id: matched.id, name: matched.name, reg_no: matched.reg_no, confidence: 0.94 });
    }
  }

  if (!imageFrame) {
    return res.status(400).json({ error: "No image frame provided" });
  }

  try {
    console.log(`[FaceRec] Forwarding frame to InsightFace microservice...`);
    const result = await callFaceService("/recognize", { frame: imageFrame });
    console.log(`[FaceRec] Microservice result: match=${result.match} confidence=${result.confidence} uncertain=${result.uncertain}`);

    if (result.match) {
      return res.json({
        student_id: result.student_id,
        name:        result.name,
        reg_no:      result.reg_no,
        confidence:  result.confidence,
      });
    }

    // Uncertain band: face detected but similarity is borderline
    if (result.uncertain) {
      return res.json({ result: "uncertain", confidence: result.confidence, reason: result.reason });
    }

    return res.json({ result: "unknown", confidence: result.confidence || 0, reason: result.reason });
  } catch (err: any) {
    // If the microservice is not running, fall back gracefully
    console.error("[FaceRec] Microservice error:", err.message);
    return res.json({ result: "unknown", error: "Face service unavailable: " + err.message });
  }
});

// Node.js barcode decoder using @zxing/library + sharp preprocessing
// Replaces the old Python pyzbar approach which isn't available in this environment
async function decodeBarcodeWithZXing(base64Image: string): Promise<string | null> {
  try {
    const buffer = Buffer.from(base64Image, "base64");
    const metadata = await sharp(buffer).metadata();
    const origWidth = metadata.width || 640;
    const origHeight = metadata.height || 480;

    // Preprocess: upscale 3x, grayscale, enhance contrast
    // This handles the thin 2.9px Code128 module width the user mentioned
    const { data, info } = await sharp(buffer)
      .resize(origWidth * 3, origHeight * 3, { kernel: "lanczos3" })
      .grayscale()
      .normalize()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // The JS port of RGBLuminanceSource actually expects a flat Uint8ClampedArray of luminance values
    // if not given an Int32Array (ARGB). Since we already have grayscale data (1 byte/pixel),
    // we can pass it directly as a Uint8ClampedArray.
    const luminanceData = new Uint8ClampedArray(data);
    const luminanceSource = new RGBLuminanceSource(luminanceData, info.width, info.height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));

    const reader = new MultiFormatReader();
    const hints = new Map<DecodeHintType, any>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]);
    hints.set(DecodeHintType.TRY_HARDER, true);

    try {
      const result = reader.decode(bitmap, hints);
      if (result && result.getText()) {
        return result.getText();
      }
    } catch (err) {
      // Decode failed, which is normal for frames without barcodes.
    }

    // Try again without upscaling as a fallback
    const { data: origData, info: origInfo } = await sharp(buffer)
      .grayscale()
      .normalize()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const origLuminanceData = new Uint8ClampedArray(origData);
    const origLS = new RGBLuminanceSource(origLuminanceData, origInfo.width, origInfo.height);
    const origBitmap = new BinaryBitmap(new HybridBinarizer(origLS));
    
    try {
      const result2 = reader.decode(origBitmap, hints);
      if (result2 && result2.getText()) {
        return result2.getText();
      }
    } catch (err) {
      // Decode failed
    }

    return null;
  } catch (e) {
    console.error("[Barcode] Decode error:", e);
    return null;
  }
}

// Compute a difference hash (dHash) for an image
// This is a simple perceptual hash used for approximate face matching
async function computeImageHash(base64Image: string): Promise<string | null> {
  try {
    const buffer = Buffer.from(base64Image, "base64");
    // Resize to 9x8 for dHash (produces 64-bit hash)
    const { data } = await sharp(buffer)
      .resize(9, 8, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // dHash: compare adjacent horizontal pixels
    let hash = "";
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const left = data[y * 9 + x];
        const right = data[y * 9 + x + 1];
        hash += left > right ? "1" : "0";
      }
    }
    return hash;
  } catch (err) {
    console.error("Error computing image hash:", err);
    return null;
  }
}

// Compute Hamming distance between two hash strings
function hammingDistance(hash1: string, hash2: string): number {
  let distance = 0;
  const len = Math.min(hash1.length, hash2.length);
  for (let i = 0; i < len; i++) {
    if (hash1[i] !== hash2[i]) distance++;
  }
  return distance + Math.max(hash1.length, hash2.length) - len;
}

// Compare a face frame against stored face encodings
// Returns the best match with confidence score
async function findBestFaceMatch(
  imageHash: string,
  db: DatabaseSchema
): Promise<{ student: User; distance: number; confidence: number } | null> {
  const studentsWithFaces = db.users.filter(
    (u) => u.role === "student" && u.face_encoding &&
      (u.face_encoding.startsWith("data:image") || u.face_encoding.length > 100)
  );

  if (studentsWithFaces.length === 0) return null;

  let bestMatch: { student: User; distance: number } | null = null;

  for (const student of studentsWithFaces) {
    if (!student.face_encoding) continue;
    try {
      const storedHash = await computeImageHash(student.face_encoding);
      if (!storedHash) continue;

      const distance = hammingDistance(imageHash, storedHash);
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { student, distance };
      }
    } catch (_) {}
  }

  if (!bestMatch) return null;

  // Convert Hamming distance to confidence (0-64 range converted to 0-1)
  // Distance of 0 = 1.0 confidence, distance of 32 = 0.5 confidence
  const confidence = Math.max(0, Math.min(1, 1 - bestMatch.distance / 32));

  return {
    student: bestMatch.student,
    distance: bestMatch.distance,
    confidence
  };
}

// 10. POST /api/scan-barcode -> Barcode Processing
app.post("/api/scan-barcode", async (req, res) => {
  const { barcodeVal, studentId, imageFrame, classId } = req.body;
  const db = loadDB();

  let targetRegNo = barcodeVal;

  if (imageFrame) {
    const decoded = await decodeBarcodeWithZXing(imageFrame);
    if (decoded) {
      targetRegNo = decoded;
      console.log(`[Barcode] Decoded: ${decoded}`);
    }
  }

  // Simulate barcode using studentId
  if (!targetRegNo && studentId) {
    const matched = db.users.find((u) => u.id === parseInt(studentId) && u.role === "student");
    if (matched) {
      targetRegNo = matched.reg_no;
    }
  }

  if (!targetRegNo) {
    return res.status(404).json({ error: "Barcode Code128 pattern not detected." });
  }

  // Look up student based on register number
  const studentObj = db.users.find((u) => u.reg_no === targetRegNo && u.role === "student");

  // Barcode was read successfully but this reg_no doesn't belong to any registered student
  if (!studentObj) {
    console.log(`[Barcode] Scanned reg_no "${targetRegNo}" — not found in system.`);
    return res.status(200).json({
      result: "unknown_barcode",
      reg_no: targetRegNo,
      reason: "No student registered with this ID"
    });
  }

  // Enroll student into the class if specified
  if (classId) {
    const targetClassId = parseInt(classId);
    const existingEnrollment = db.enrollments.find(
      (e) => e.student_id === studentObj.id && e.class_id === targetClassId
    );
    if (!existingEnrollment) {
      const newEnrollmentId = db.enrollments.length > 0 ? Math.max(...db.enrollments.map((e) => e.id)) + 1 : 1;
      db.enrollments.push({
        id: newEnrollmentId,
        student_id: studentObj.id,
        class_id: targetClassId
      });
      saveDB(db);
      console.log(`Enrolled student ${studentObj.name} (ID: ${studentObj.id}) into class ${targetClassId}`);
    }

    // Auto-create/update attendance record in active (unsubmitted) sessions of this class
    const classSubjects = db.subjects.filter((s) => s.class_id === targetClassId);
    const classSubjectIds = classSubjects.map((s) => s.id);
    const activeSessions = db.sessions.filter(
      (s) => classSubjectIds.includes(s.subject_id) && !s.submitted_at
    );

    activeSessions.forEach((sess) => {
      const existingRecord = db.attendance.find(
        (a) => a.session_id === sess.id && a.student_id === studentObj.id
      );

      // Determine status based on elapsed time from session start
      let status: "present" | "late" | "absent" = "present";
      let reason: string | null = null;
      if (sess.session_start_time) {
        const start = new Date(sess.session_start_time).getTime();
        const now = new Date().getTime();
        const elapsedMins = (now - start) / (1000 * 60);
        if (elapsedMins > 30) {
          status = "present"; // Override to present upon enroll/scan
          reason = "Enrolled via barcode scan";
        } else if (elapsedMins > 20) {
          status = "late";
        }
      }

      if (!existingRecord) {
        const newRecordId = db.attendance.length > 0 ? Math.max(...db.attendance.map((a) => a.id)) + 1 : 1;
        db.attendance.push({
          id: newRecordId,
          session_id: sess.id,
          student_id: studentObj.id,
          status: status,
          marked_at: new Date().toISOString(),
          override_reason: reason
        });
      } else {
        existingRecord.status = status;
        existingRecord.marked_at = new Date().toISOString();
        if (reason) {
          existingRecord.override_reason = reason;
        }
      }
    });
    saveDB(db);
  }

  return res.json({
    student_id: studentObj.id,
    name: studentObj.name,
    reg_no: studentObj.reg_no,
    confidence: 1.0
  });
});

// 11. GET /api/excel/template -> Pre-styled Excel template download
app.get("/api/excel/template", (req, res) => {
  const headers = [["Register Number", "Full Name", "College Email", "Photo Filename"]];
  const sampleRow = [["RA2311027020006", "Pranav Sridhar", "pranav.s@srmist.edu.in", "RA2311027020006.jpg"]];
  const data = [...headers, ...sampleRow];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "SRM_Import_Template");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=SRM_Attendance_Import_Template.xlsx");
  return res.send(buffer);
});

// 12. POST /api/classes/import-excel -> Parse Excel, perform robust conflict checks
app.post("/api/classes/import-excel", (req, res) => {
  const { fileBase64, classId } = req.body;
  if (!fileBase64 || !classId) {
    return res.status(400).json({ error: "File data and target Class ID are required." });
  }

  const targetClassId = parseInt(classId);
  const db = loadDB();

  const targetClass = db.classes.find((c) => c.id === targetClassId);
  if (!targetClass) {
    return res.status(404).json({ error: "Target Class not found." });
  }

  try {
    const buffer = Buffer.from(fileBase64, "base64");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const rawRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let imported = 0;
    let skipped = 0;
    const conflicts: any[] = [];

    rawRows.forEach((row) => {
      const regNo = (row["Register Number"] || row["register_no"] || "").toString().trim();
      const fullName = (row["Full Name"] || row["full_name"] || row["Name"] || "").toString().trim();
      const email = (row["College Email"] || row["email"] || "").toString().trim();
      const photoFile = (row["Photo Filename"] || row["photo"] || null);

      if (!regNo || !fullName) return; // Skip invalid rows

      // Check conflict logic:
      const existingUser = db.users.find((u) => u.reg_no === regNo && u.role === "student");

      if (existingUser) {
        // Enrolled in which class?
        const currentEnrollment = db.enrollments.find((e) => e.student_id === existingUser.id);
        if (currentEnrollment) {
          if (currentEnrollment.class_id !== targetClassId) {
            // Conflict! Enrolled in a different class
            const otherClass = db.classes.find((c) => c.id === currentEnrollment.class_id);
            const otherFA = db.users.find((u) => u.id === otherClass?.fa_id);
            
            conflicts.push({
              reg_no: regNo,
              name: fullName,
              other_class: otherClass ? otherClass.name : "N/A",
              other_fa: otherFA ? otherFA.name : "N/A",
              other_fa_contact: otherFA ? otherFA.email : "N/A"
            });
          } else {
            // Skip! Already enrolled in this exact class
            skipped++;
          }
        } else {
          // Exists but not enrolled, enroll now
          const newEnrollmentId = db.enrollments.length > 0 ? Math.max(...db.enrollments.map((e) => e.id)) + 1 : 1;
          db.enrollments.push({ id: newEnrollmentId, student_id: existingUser.id, class_id: targetClassId });
          imported++;
        }
      } else {
        // New student! Create profile + enroll
        const newUserId = db.users.length > 0 ? Math.max(...db.users.map((u) => u.id)) + 1 : 101;
        const newUser: User = {
          id: newUserId,
          name: fullName,
          username: null,
          role: "student",
          reg_no: regNo,
          face_encoding: photoFile ? `registered_${regNo}` : null,
          email: email || `${fullName.toLowerCase().replace(/\s+/g, "")}@srmist.edu.in`,
          created_at: new Date().toISOString()
        };

        db.users.push(newUser);

        const newEnrollmentId = db.enrollments.length > 0 ? Math.max(...db.enrollments.map((e) => e.id)) + 1 : 1;
        db.enrollments.push({ id: newEnrollmentId, student_id: newUserId, class_id: targetClassId });
        
        imported++;
      }
    });

    saveDB(db);

    return res.json({
      success: true,
      imported,
      skipped,
      conflicts
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to parse spreadsheet file: " + err.message });
  }
});

// 13. POST /api/classes/:id/transfer -> FA Classroom Responsibility Transfer
app.post("/api/classes/:id/transfer", (req, res) => {
  const classId = parseInt(req.params.id);
  const { newFaUsername, currentFaId } = req.body;
  const db = loadDB();

  const classObj = db.classes.find((c) => c.id === classId);
  if (!classObj) {
    return res.status(404).json({ error: "Classroom not found." });
  }

  if (classObj.fa_id !== parseInt(currentFaId)) {
    return res.status(403).json({ error: "Only the active Classroom FA is authorized to execute transfers." });
  }

  // Find the target FA
  const targetFa = db.users.find(
    (u) =>
      u.username?.toLowerCase() === newFaUsername.trim().toLowerCase() &&
      (u.role === "fa" || u.role === "both")
  );

  if (!targetFa) {
    return res.status(404).json({ error: `No authorized Faculty Advisor found with username: ${newFaUsername}` });
  }

  if (targetFa.id === classObj.fa_id) {
    return res.status(400).json({ error: "Classroom is already assigned to this advisor." });
  }

  // Log class responsibility transfer
  const newTransferId = db.class_transfers.length > 0 ? Math.max(...db.class_transfers.map((t) => t.id)) + 1 : 1;
  const newTransfer: ClassTransfer = {
    id: newTransferId,
    class_id: classId,
    from_fa_id: classObj.fa_id,
    to_fa_id: targetFa.id,
    transferred_at: new Date().toISOString()
  };

  db.class_transfers.push(newTransfer);

  // Update class FA ownership
  classObj.fa_id = targetFa.id;
  saveDB(db);

  return res.json({
    success: true,
    message: `Classroom responsibility transferred successfully to ${targetFa.name}.`,
    class: classObj
  });
});

// 14. POST /api/classes/manual-add -> Manual single student add
app.post("/api/classes/manual-add", (req, res) => {
  const { classId, name, regNo, email } = req.body;
  const db = loadDB();

  const targetClassId = parseInt(classId);
  const targetClass = db.classes.find((c) => c.id === targetClassId);
  if (!targetClass) {
    return res.status(404).json({ error: "Target Class not found." });
  }

  // Conflict Check
  const existingUser = db.users.find((u) => u.reg_no === regNo && u.role === "student");
  if (existingUser) {
    const currentEnrollment = db.enrollments.find((e) => e.student_id === existingUser.id);
    if (currentEnrollment) {
      if (currentEnrollment.class_id !== targetClassId) {
        const otherClass = db.classes.find((c) => c.id === currentEnrollment.class_id);
        const otherFA = db.users.find((u) => u.id === otherClass?.fa_id);
        return res.status(409).json({
          conflict: true,
          student: {
            reg_no: regNo,
            name: existingUser.name,
            other_class: otherClass ? otherClass.name : "N/A",
            other_fa: otherFA ? otherFA.name : "N/A",
            other_fa_contact: otherFA ? otherFA.email : "N/A"
          }
        });
      } else {
        return res.status(400).json({ error: "Student is already enrolled in this class." });
      }
    }
  }

  // Create new user profile + enrollment
  const newUserId = db.users.length > 0 ? Math.max(...db.users.map((u) => u.id)) + 1 : 101;
  const newUser: User = {
    id: newUserId,
    name,
    username: null,
    role: "student",
    reg_no: regNo,
    face_encoding: null,
    email: email || `${name.toLowerCase().replace(/\s+/g, "")}@srmist.edu.in`,
    created_at: new Date().toISOString()
  };

  db.users.push(newUser);

  const newEnrollmentId = db.enrollments.length > 0 ? Math.max(...db.enrollments.map((e) => e.id)) + 1 : 1;
  db.enrollments.push({ id: newEnrollmentId, student_id: newUserId, class_id: targetClassId });

  saveDB(db);

  return res.json({ success: true, student: newUser });
});

// 15. POST /api/subjects/assign-teacher -> Assign Teacher to Subject
app.post("/api/subjects/assign-teacher", (req, res) => {
  const { subjectId, teacherId } = req.body;
  const db = loadDB();

  const subject = db.subjects.find((s) => s.id === parseInt(subjectId));
  if (!subject) {
    return res.status(404).json({ error: "Subject not found." });
  }

  const teacher = db.users.find((u) => u.id === parseInt(teacherId) && (u.role === "teacher" || u.role === "both" || u.role === "fa"));
  if (!teacher) {
    return res.status(404).json({ error: "Teacher not found." });
  }

  subject.teacher_id = teacher.id;
  saveDB(db);

  return res.json({ success: true, subject });
});

// 15b. POST /api/subjects -> Create a subject and assign a teacher
app.post("/api/subjects", (req, res) => {
  const { name, classId, teacherId } = req.body;
  const db = loadDB();

  if (!name || !classId || !teacherId) {
    return res.status(400).json({ error: "Subject name, class ID, and teacher ID are required." });
  }

  const cls = db.classes.find((c) => c.id === parseInt(classId));
  if (!cls) {
    return res.status(404).json({ error: "Class not found." });
  }

  const teacher = db.users.find((u) => u.id === parseInt(teacherId) && (u.role === "teacher" || u.role === "both" || u.role === "fa"));
  if (!teacher) {
    return res.status(404).json({ error: "Teacher not found." });
  }

  const newSubject: Subject = {
    id: db.subjects.length > 0 ? Math.max(...db.subjects.map((s) => s.id)) + 1 : 1,
    name: name.trim(),
    class_id: parseInt(classId),
    teacher_id: teacher.id
  };

  db.subjects.push(newSubject);
  saveDB(db);

  return res.json({ success: true, subject: newSubject });
});

// 16. GET /api/faculty/teachers -> Fetch all available subject teachers
app.get("/api/faculty/teachers", (req, res) => {
  const db = loadDB();
  const teachers = db.users.filter((u) => u.role === "teacher" || u.role === "both" || u.role === "fa");
  return res.json(teachers);
});

// 17. GET /api/classes/me -> Get classes relevant to FA or Teacher
app.get("/api/classes/me", (req, res) => {
  const userId = parseInt(req.query.userId as string);
  const activeRole = req.query.activeRole as string;
  const db = loadDB();

  if (activeRole === "fa") {
    // Return classes where they are the FA
    const classes = db.classes.filter((c) => c.fa_id === userId);
    return res.json(classes);
  } else if (activeRole === "teacher") {
    // Return classes where they teach a subject
    const teacherSubjects = db.subjects.filter((s) => s.teacher_id === userId);
    const classIds = Array.from(new Set(teacherSubjects.map((s) => s.class_id)));
    const classes = db.classes.filter((c) => classIds.includes(c.id));
    return res.json(classes.map(cls => {
      // attach subjects taught by this teacher in this class
      const subs = teacherSubjects.filter(s => s.class_id === cls.id);
      return {
        ...cls,
        subjects: subs
      };
    }));
  }

  return res.json([]);
});

// Helper function to run the Python face_recognition script
function runPythonFaceScript(args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    let pythonPath = "C:\\Users\\Naveed\\AppData\\Local\\Programs\\Python\\Python311\\python.exe";
    if (!fs.existsSync(pythonPath)) {
      pythonPath = "python";
    }
    // Use process.cwd() which works correctly in both ESM and CJS
    const scriptPath = path.join(process.cwd(), "face_recognition_helper.py");
    
    console.log(`[Python] Running: ${pythonPath} ${scriptPath} ${args.slice(0, 2).join(' ')}... (${args.length - 2} more args)`);
    
    const child = spawn(pythonPath, [scriptPath, ...args]);
    
    let stdout = "";
    let stderr = "";
    
    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    
    child.on("close", (code: number) => {
      if (code !== 0) {
        reject(new Error(`Python script exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${stdout}`));
      }
    });
    
    child.on("error", (err: Error) => {
      console.error(`[Python] Spawn error:`, err);
      reject(err);
    });
    
    // Also log stderr even on success for diagnostics
    child.stderr.on("data", (data: Buffer) => {
      const msg = data.toString();
      if (msg.trim()) console.log(`[Python] stderr: ${msg.trim()}`);
    });
  });
}

// Helper to write a temp file from base64 data
// Ensures tmp_frames directory exists (and cleans up old files on startup)
const TMP_FRAMES_DIR = path.join(process.cwd(), "tmp_frames");

// Clean up old temp frames on startup
function initTempDir(): void {
  if (fs.existsSync(TMP_FRAMES_DIR)) {
    const files = fs.readdirSync(TMP_FRAMES_DIR);
    for (const file of files) {
      try { fs.unlinkSync(path.join(TMP_FRAMES_DIR, file)); } catch {}
    }
  } else {
    fs.mkdirSync(TMP_FRAMES_DIR, { recursive: true });
  }
}

initTempDir();

function writeTempFrame(base64Data: string, prefix: string): string {
  if (!fs.existsSync(TMP_FRAMES_DIR)) {
    fs.mkdirSync(TMP_FRAMES_DIR, { recursive: true });
  }
  
  // Decode base64 (strip data URL prefix if present)
  let raw = base64Data;
  if (raw.includes(",")) {
    raw = raw.split(",")[1];
  }
  
  const buffer = Buffer.from(raw, "base64");
  const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.jpg`;
  const filepath = path.join(TMP_FRAMES_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  return filepath;
}

// 18. POST /api/register-face -> Register student face via InsightFace microservice
app.post("/api/register-face", async (req, res) => {
  const { reg_no, frames, studentId } = req.body;
  const db = loadDB();

  let student: User | undefined;
  if (reg_no) {
    student = db.users.find((u) => u.reg_no === reg_no && u.role === "student");
  } else if (studentId) {
    student = db.users.find((u) => u.id === parseInt(studentId) && u.role === "student");
  }

  if (!student) return res.status(404).json({ error: "Student not found" });
  if (!frames || !Array.isArray(frames) || frames.length === 0) {
    return res.status(400).json({ error: "No frames provided" });
  }

  try {
    console.log(`[FaceReg] Registering ${student.name} (${student.reg_no}) — ${frames.length} frames → InsightFace microservice`);

    const result = await callFaceService("/register", {
      student_id:   student.id,
      student_name: student.name,
      reg_no:       student.reg_no,
      frames,
    });

    console.log(`[FaceReg] Microservice result: success=${result.success} processed=${result.frames_processed} skipped=${result.frames_skipped}`);

    if (!result.success) {
      return res.status(400).json({
        error: result.error || "Face registration failed",
        frames_processed: result.frames_processed || 0,
        frames_skipped:   result.frames_skipped   || 0,
      });
    }

    // Mark as enrolled in db.json (actual embedding lives in face_service/face_embeddings.json)
    student.face_encoding = JSON.stringify({
      encoding_b64: "insightface_enrolled",
      registered_at: new Date().toISOString(),
      frames_used: result.frames_processed,
    });
    saveDB(db);

    console.log(`[FaceReg] SUCCESS — enrolled ${student.name}`);
    return res.json({
      success: true,
      message: result.message || "Face registered successfully!",
      frames_processed: result.frames_processed,
      frames_skipped:   result.frames_skipped,
    });
  } catch (err: any) {
    console.error("[FaceReg] Microservice error:", err.message);
    return res.status(500).json({ error: "Face service unavailable: " + err.message });
  }
});

// 19. GET /api/sessions/:id/attendance -> Get attendance records for a session
app.get("/api/sessions/:id/attendance", (req, res) => {
  const sessionId = parseInt(req.params.id);
  const db = loadDB();

  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const subject = db.subjects.find((s) => s.id === session.subject_id);
  const records = db.attendance.filter((a) => a.session_id === sessionId);

  const enriched = records.map((rec) => {
    const student = db.users.find((u) => u.id === rec.student_id);
    return {
      id: rec.id,
      session_id: rec.session_id,
      student_id: rec.student_id,
      status: rec.status,
      marked_at: rec.marked_at,
      override_reason: rec.override_reason || null,
      name: student ? student.name : "Unknown",
      regNo: student ? student.reg_no : "N/A"
    };
  });

  return res.json({
    session,
    subjectName: subject?.name,
    records: enriched
  });
});

// 20. GET /api/class-transfers -> Fetch transfer logs
app.get("/api/class-transfers", (req, res) => {
  const db = loadDB();
  const logs = db.class_transfers.map(log => {
    const cls = db.classes.find(c => c.id === log.class_id);
    const from = db.users.find(u => u.id === log.from_fa_id);
    const to = db.users.find(u => u.id === log.to_fa_id);
    return {
      ...log,
      className: cls?.name || "N/A",
      fromName: from?.name || "N/A",
      toName: to?.name || "N/A"
    };
  });
  return res.json(logs);
});

// 21. POST /api/reset -> Dev route to reseed the database
app.post("/api/reset", (req, res) => {
  const initialDB = seedData();
  saveDB(initialDB);
  return res.json({ success: true, message: "Database reseeded to defaults." });
});


// Vite Dev Server / Static Production Setup
async function startServer() {
  const distIndex = path.join(process.cwd(), "dist", "index.html");
  const isProduction = process.env.NODE_ENV === "production" || fs.existsSync(distIndex);

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(distIndex);
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is booting. Relational persistent database bound successfully.`);
    console.log(`Express routing successfully established on http://localhost:${PORT}`);
  });
}

startServer();
