import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, CheckCircle, AlertCircle, X, RefreshCw } from 'lucide-react';

interface FaceRegistrationProps {
  regNo: string;
  studentId: number;
  studentName: string;
  onClose: () => void;
  onSuccess: () => void;
  playSound: (type: 'beep' | 'success' | 'click' | 'reset' | 'scan_progress') => void;
  triggerNotification: (message: string, type: 'success' | 'info' | 'error') => void;
}

type CaptureState = 'countdown' | 'capturing' | 'uploading' | 'success' | 'error';

export default function FaceRegistration({
  regNo,
  studentId,
  studentName,
  onClose,
  onSuccess,
  playSound,
  triggerNotification
}: FaceRegistrationProps) {
  const TOTAL_FRAMES = 10;
  const CAPTURE_INTERVAL_MS = 350; // ~3.5 seconds total for 10 frames

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const framesRef = useRef<string[]>([]);
  const countRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [captureState, setCaptureState] = useState<CaptureState>('countdown');
  const [capturedCount, setCapturedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [countdownSec, setCountdownSec] = useState(3);
  const [retryCount, setRetryCount] = useState(0);

  // Initialize front camera on mount
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 }
          }
        });

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err: any) {
        setErrorMessage('Camera access denied. Please grant camera permissions.');
        setCaptureState('error');
      }
    };

    init();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Run countdown then start capturing
  useEffect(() => {
    if (captureState !== 'countdown') return;

    const countdownTimer = setInterval(() => {
      setCountdownSec((prev) => {
        if (prev <= 1) {
          clearInterval(countdownTimer);
          playSound('click');
          setCaptureState('capturing');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownTimer);
  }, [captureState, playSound]);

  // Capture frames with retry logic for skipped frames
  useEffect(() => {
    if (captureState !== 'capturing') return;

    const captureFrame = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Mirror the image (front camera)
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      const base64Frame = canvas.toDataURL('image/jpeg', 0.8);

      framesRef.current.push(base64Frame);
      const newCount = countRef.current + 1;
      countRef.current = newCount;
      setCapturedCount(newCount);
      playSound('scan_progress');

      if (newCount >= TOTAL_FRAMES) {
        // Done capturing this batch
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        await uploadFrames();
      }
    };

    timerRef.current = setInterval(captureFrame, CAPTURE_INTERVAL_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [captureState]);

  const uploadFrames = async () => {
    setCaptureState('uploading');

    try {
      const response = await fetch('/api/register-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reg_no: regNo,
          studentId: studentId,
          frames: framesRef.current
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      // If no frames had a face detected, retry capturing
      if (data.frames_processed === 0) {
        const newRetry = retryCount + 1;
        setRetryCount(newRetry);
        setSkippedCount((prev) => prev + data.frames_skipped);
        
        if (newRetry >= 5) {
          // Too many retries, give up
          throw new Error('No face detected after multiple attempts. Please ensure good lighting and face the camera directly.');
        }

        // Retry - capture another batch
        framesRef.current = [];
        countRef.current = 0;
        setCapturedCount(0);
        setCaptureState('capturing');
        triggerNotification(`No face detected. Retrying... (attempt ${newRetry}/5)`, 'info');
        return;
      }

      playSound('success');
      setCaptureState('success');
      setSkippedCount((prev) => prev + (data.frames_skipped || 0));
      triggerNotification('Face registered successfully!', 'success');
    } catch (err: any) {
      playSound('beep');
      setErrorMessage(err.message || 'Failed to register face');
      setCaptureState('error');
    }
  };

  const handleRetry = () => {
    framesRef.current = [];
    countRef.current = 0;
    setCapturedCount(0);
    setSkippedCount(0);
    setRetryCount(0);
    setErrorMessage('');
    setCountdownSec(3);
    setCaptureState('countdown');
  };

  const progress = TOTAL_FRAMES > 0 ? (capturedCount / TOTAL_FRAMES) * 100 : 0;
  const circumference = 2 * Math.PI * 54; // r=54
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center select-none">
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera feed - full screen background */}
      {captureState !== 'success' && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
        />
      )}

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Close button */}
      <button
        onClick={() => {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
          }
          // If already succeeded, treat X as "Continue" — update parent state
          if (captureState === 'success') {
            onSuccess();
          } else {
            onClose();
          }
        }}
        className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md text-white flex items-center justify-center hover:bg-white/20 transition-all cursor-pointer"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-6 text-center">

        {/* Countdown */}
        {captureState === 'countdown' && (
          <div className="flex flex-col items-center gap-4 animate-fadeIn">
            <div className="w-24 h-24 rounded-full bg-white/10 backdrop-blur-md border-2 border-white/30 flex items-center justify-center">
              <span className="text-5xl font-bold text-white">{countdownSec}</span>
            </div>
            <p className="text-white/80 text-sm font-medium">Get ready to position your face</p>
            <p className="text-white/50 text-xs">Face registration will begin shortly</p>
          </div>
        )}

        {/* Capturing - Circular Progress */}
        {captureState === 'capturing' && (
          <div className="flex flex-col items-center gap-4 animate-fadeIn">
            {/* Circular progress */}
            <div className="relative w-32 h-32">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                {/* Background circle */}
                <circle
                  cx="60" cy="60" r="54"
                  fill="none"
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth="6"
                />
                {/* Progress circle */}
                <circle
                  cx="60" cy="60" r="54"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-300 ease-out"
                />
              </svg>
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Camera className="w-8 h-8 text-white mb-1 animate-pulse" />
                <span className="text-2xl font-bold text-white">{capturedCount}</span>
                <span className="text-xs text-white/60">of {TOTAL_FRAMES}</span>
              </div>
            </div>
            <p className="text-white/80 text-sm font-medium">Capturing face frames...</p>
            <p className="text-white/50 text-xs">Please hold still and face the camera</p>
          </div>
        )}

        {/* Uploading */}
        {captureState === 'uploading' && (
          <div className="flex flex-col items-center gap-4 animate-fadeIn">
            <div className="w-16 h-16 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
            <p className="text-white text-sm font-medium">Processing your face signature...</p>
            <p className="text-white/50 text-xs">Generating biometric encoding</p>
          </div>
        )}

        {/* Success */}
        {captureState === 'success' && (
          <div className="flex flex-col items-center gap-4 animate-fadeIn">
            <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-white text-lg font-bold">Face registered successfully!</h3>
              <p className="text-white/60 text-xs mt-1">
                {skippedCount > 0
                  ? `${capturedCount} frames captured, ${skippedCount} frames without face (skipped)`
                  : `All ${capturedCount} frames processed successfully`}
              </p>
            </div>
            <p className="text-white/50 text-xs">Your biometric signature is now stored securely</p>
            <button
              onClick={() => {
                if (streamRef.current) {
                  streamRef.current.getTracks().forEach(t => t.stop());
                }
                onSuccess();
              }}
              className="mt-4 px-8 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-full text-sm transition-all cursor-pointer"
            >
              Continue to Dashboard
            </button>
          </div>
        )}

        {/* Error */}
        {captureState === 'error' && (
          <div className="flex flex-col items-center gap-4 animate-fadeIn">
            <div className="w-24 h-24 rounded-full bg-red-500/20 border-2 border-red-500/40 flex items-center justify-center">
              <AlertCircle className="w-12 h-12 text-red-400" />
            </div>
            <div>
              <h3 className="text-white text-lg font-bold">Registration failed</h3>
              <p className="text-white/60 text-xs mt-1">{errorMessage}</p>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleRetry}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-full text-sm font-bold transition-all flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry</span>
              </button>
              <button
                onClick={() => {
                  if (streamRef.current) {
                    streamRef.current.getTracks().forEach(t => t.stop());
                  }
                  onClose();
                }}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white/70 border border-white/10 rounded-full text-sm transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Student info badge */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-5 py-2 flex items-center gap-2">
        <span className="text-white/60 text-xs">Registering:</span>
        <span className="text-white text-xs font-bold">{studentName}</span>
        <span className="text-white/40 text-xs">|</span>
        <span className="text-white/50 text-xs font-mono">{regNo}</span>
      </div>
    </div>
  );
}
