# Production Deployment Guide: Render + Firebase Firestore

This guide provides instructions to deploy [attendence-srm](https://github.com/NAVEED-FARHAN/attendence-srm) live on the web using **Render** and **Firebase Cloud Firestore**.

---

## Part 1: Setup Firebase Firestore (Cloud Database)

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add Project** (or select an existing project) and name it `attendence-srm`.
3. In the left menu, go to **Build** -> **Firestore Database**.
4. Click **Create database**, select a region near your users (e.g., `asia-south1` or `us-central`), and choose **Start in test mode** or **production mode**.
5. Go to **Project Settings** (gear icon at top left) -> **Service Accounts**.
6. Click **Generate new private key** and download the `.json` file (Service Account Key).
7. Open the downloaded `.json` file in a text editor — copy the **entire JSON string** (you will paste this into Render as an environment variable).

---

## Part 2: Deploy to Render

1. Log in to [Render Console](https://dashboard.render.com/).
2. Click **New +** -> **Web Service**.
3. Select **Build and deploy from a Git repository** and connect your GitHub repository:
   `https://github.com/NAVEED-FARHAN/attendence-srm`
4. Fill in the configuration details:
   - **Name**: `attendence-srm`
   - **Region**: Singapore or Oregon (US)
   - **Language / Runtime**: **Docker**
   - **Instance Type**: Starter or Free
5. Scroll down to **Environment Variables** and add the following:
   - `FIREBASE_SERVICE_ACCOUNT`: Paste the full contents of the downloaded Firebase service account `.json` file.
   - `FACE_SERVICE_URL`: `http://127.0.0.1:8001`
   - `PORT`: `8000`
6. Click **Create Web Service**.

Render will pull your code, build the Docker container (Python InsightFace microservice + Express Node server + React frontend), and deploy it automatically.

---

## Part 3: Push Local Changes to GitHub

To ensure your GitHub repository has all deployment files (`Dockerfile`, `start.sh`, `render.yaml`, `server/firebase.ts`), commit and push:

```bash
git add .
git commit -m "Add Render Docker deployment setup and Firebase Firestore database integration"
git push origin main
```

Once pushed, Render will automatically trigger a deployment build.

---

## Verification & Health Check

- Your app will be live at `https://attendence-srm.onrender.com` (or your custom Render URL).
- Both Face Recognition (`/api/recognize-face`) and Barcode Scanner (`/api/scan-barcode`) will connect to the co-located InsightFace Python service.
- All attendance records, sessions, and student data will be persistently stored in Cloud Firestore!
