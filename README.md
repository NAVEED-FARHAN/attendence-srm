# SRM Smart Attendance System 🎓📸

An AI-powered Smart Attendance Management System built with **React**, **Express (Node.js)**, **FastAPI (Python InsightFace)**, **ZXing Barcode Engine**, and **Firebase Cloud Firestore**.

---

## 🌟 Key Features

- **📸 AI Face Recognition**: High-precision facial recognition powered by InsightFace (`buffalo_sc` ArcFace model).
- **💳 ID Card Barcode Scanner**: In-browser instant Code128 / Code39 / QR ID card scanner using `@zxing/browser`.
- **⏱️ Attendance Timer Engine**: Live session timer with automatic status classification (*Present*, *Late*, *Absent*).
- **🔥 Firebase Cloud Firestore**: Persistent cloud database sync for users, classes, subjects, attendance sessions, and leave requests.
- **🐳 Single-Container Deployment**: Fully configured Docker container ready to deploy on **Render**.

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies

```bash
# Install Node dependencies
npm install --legacy-peer-deps
```

### 2. Run Python InsightFace Microservice

```bash
cd face_service
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8001
```

### 3. Run Development Server

```bash
# In the root directory
npm run dev
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

---

## 🌐 Cloud Deployment (Render + Firebase)

For detailed deployment instructions to host live on **Render** with **Firebase Cloud Firestore**, see [DEPLOYMENT.md](DEPLOYMENT.md).

---

## 🛠️ Tech Stack

- **Frontend**: React 19, Tailwind CSS, Lucide Icons, Vite
- **Backend API**: Express.js (Node.js)
- **Face AI Microservice**: FastAPI, InsightFace, ONNX Runtime, OpenCV
- **Barcode Engine**: `@zxing/browser`
- **Database**: Firebase Cloud Firestore / Local JSON fallback
