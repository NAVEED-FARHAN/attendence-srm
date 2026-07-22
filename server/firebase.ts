import admin from "firebase-admin";

export function isFirebaseConfigured(): boolean {
  return !!(
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.FIREBASE_PROJECT_ID
  );
}

let dbInstance: admin.firestore.Firestore | null = null;

function parseServiceAccount(raw: string): any {
  let str = raw.trim();

  // Strip wrapping quotes if user enclosed the value in quotes
  if ((str.startsWith("'") && str.endsWith("'")) || (str.startsWith('"') && str.endsWith('"'))) {
    str = str.slice(1, -1).trim();
  }

  // Extract from first '{' to last '}' to eliminate trailing junk characters/text
  const firstBrace = str.indexOf("{");
  const lastBrace = str.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    str = str.substring(firstBrace, lastBrace + 1);
  }

  // Direct JSON parse attempt
  try {
    return JSON.parse(str);
  } catch (e1) {
    // Attempt 2: Fix literal unescaped newlines in private key
    try {
      // Escape raw unescaped newlines
      const escaped = str.replace(/[\r\n]+/g, "\\n");
      return JSON.parse(escaped);
    } catch (e2) {
      // Attempt 3: Base64 decode fallback (in case user base64 encoded the env var)
      try {
        const decoded = Buffer.from(raw.trim(), "base64").toString("utf-8");
        const fBrace = decoded.indexOf("{");
        const lBrace = decoded.lastIndexOf("}");
        if (fBrace !== -1 && lBrace > fBrace) {
          return JSON.parse(decoded.substring(fBrace, lBrace + 1));
        }
      } catch (e3) {}

      throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT JSON: ${e1}`);
    }
  }
}

export function getFirestoreDB(): admin.firestore.Firestore | null {
  if (dbInstance) return dbInstance;
  if (!isFirebaseConfigured()) return null;

  try {
    if (admin.apps.length === 0) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      } else if (process.env.FIREBASE_PROJECT_ID) {
        admin.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID
        });
      } else {
        admin.initializeApp({
          credential: admin.credential.applicationDefault()
        });
      }
    }
    dbInstance = admin.firestore();
    console.log("🔥 Connected to Firebase Firestore database.");
    return dbInstance;
  } catch (err: any) {
    console.error("⚠️ Firebase initialization error:", err.message);
    return null;
  }
}

export async function loadDatabaseFromFirebase(seedData: any): Promise<any | null> {
  const db = getFirestoreDB();
  if (!db) return null;

  try {
    const docRef = db.collection("attendance_app").doc("database_state");
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      console.log("🔥 Initializing Firebase Firestore with seed data...");
      const initial = seedData();
      await docRef.set(initial);
      return initial;
    }

    const data = docSnap.data();
    return data;
  } catch (err: any) {
    console.error("⚠️ Firestore read failed, using local DB:", err.message);
    return null;
  }
}

export async function saveDatabaseToFirebase(data: any): Promise<void> {
  const db = getFirestoreDB();
  if (!db) return;

  try {
    const docRef = db.collection("attendance_app").doc("database_state");
    await docRef.set(data);
  } catch (err: any) {
    console.error("⚠️ Firestore write failed:", err.message);
  }
}
