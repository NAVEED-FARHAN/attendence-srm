import React, { useEffect, useRef, useState } from 'react';
import { X, ShieldCheck, UserX, Bug, ChevronDown, ChevronRight, Barcode, ScanFace } from 'lucide-react';
import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';

interface CameraScannerProps {
  onClose: () => void;
  onStudentMarked: (studentId: number, status: 'present' | 'late') => void;
  activeClassId: number;
  activeSubjectName: string;
  playSound: (type: 'beep' | 'success' | 'click' | 'scan_progress') => void;
  triggerNotification: (message: string, type: 'success' | 'info' | 'error') => void;
  students: any[];
  mediaStream: MediaStream | null;
}

export default function CameraScanner({
  onClose,
  onStudentMarked,
  activeClassId,
  activeSubjectName,
  playSound,
  triggerNotification,
  students,
  mediaStream,
}: CameraScannerProps) {
  const [scanMode, setScanMode] = useState<'face' | 'barcode'>('face');
  const [scanResult, setResult] = useState<{ name: string; regNo: string; confidence: number } | null>(null);
  const [showUnknown, setShowUnknown] = useState(false);
  const [unknownBarcode, setUnknownBarcode] = useState<{ reg_no: string } | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugLogs, setDebugLogs] = useState<{ time: string; msg: string; type: 'info' | 'error' | 'success' }[]>([]);
  const [lastResponse, setLastResponse] = useState('');
  const [scanCount, setScanCount] = useState(0);

  const cameraError = mediaStream ? null : 'Camera not available. Please grant camera permissions.';

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const debugLogsRef = useRef<{ time: string; msg: string; type: 'info' | 'error' | 'success' }[]>([]);
  const scanCountRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const videoReadyRef = useRef(false);

  // Timers
  const faceScanTimer = useRef<NodeJS.Timeout | null>(null);
  const resultTimerRef = useRef<NodeJS.Timeout | null>(null);
  const unknownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const unknownBarcodeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const showUnknownRef = useRef(false);
  const lastMatchedStudentIdRef = useRef<number | null>(null);

  // ZXing browser reader for client-side barcode decoding
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const barcodeScanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const barcodeLockedRef = useRef(false); // prevent duplicate scans of same code

  // Refs for callbacks to avoid stale closures
  const handleSuccessfulScanRef = useRef<(data: any, endpoint: string) => void>(() => {});
  const handleUnknownScanRef = useRef<() => void>(() => {});

  const addDebugLog = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    const entry = { time: new Date().toLocaleTimeString(), msg, type };
    debugLogsRef.current = [...debugLogsRef.current.slice(-49), entry];
    setDebugLogs([...debugLogsRef.current]);
    console.log(`[Scanner] ${msg}`);
  };

  // Keep callback refs in sync every render
  useEffect(() => {
    streamRef.current = mediaStream;
    handleSuccessfulScanRef.current = handleSuccessfulScan;
    handleUnknownScanRef.current = handleUnknownScan;
  });

  // Attach camera stream to video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !mediaStream) return;
    videoReadyRef.current = false;
    if (video.srcObject !== mediaStream) video.srcObject = mediaStream;

    const onReady = () => {
      addDebugLog(`Video ready: ${video.videoWidth}x${video.videoHeight}`, 'success');
      videoReadyRef.current = true;
    };

    if (video.videoWidth > 0) {
      videoReadyRef.current = true;
    } else {
      video.addEventListener('loadedmetadata', onReady, { once: true });
    }
    video.play().catch(() => {});
    return () => video.removeEventListener('loadedmetadata', onReady);
  }, [mediaStream]);

  // ─── FACE MODE: interval-based server calls ─────────────────────────────────
  useEffect(() => {
    if (scanMode !== 'face' || !mediaStream) return;

    stopBarcodeScanner();

    const interval = setInterval(() => {
      captureAndPostFace();
    }, 2000);
    faceScanTimer.current = interval;
    setTimeout(() => captureAndPostFace(), 200);

    return () => {
      clearInterval(interval);
      faceScanTimer.current = null;
    };
  }, [scanMode, mediaStream]);

  // ─── BARCODE MODE: browser-side ZXing decoding ─────────────────────────────
  useEffect(() => {
    if (scanMode !== 'barcode' || !mediaStream) return;

    // Stop face scan
    if (faceScanTimer.current) { clearInterval(faceScanTimer.current); faceScanTimer.current = null; }

    startBarcodeScanner();

    return () => stopBarcodeScanner();
  }, [scanMode, mediaStream]);

  const startBarcodeScanner = () => {
    stopBarcodeScanner();

    const hints = new Map<DecodeHintType, any>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,
      BarcodeFormat.QR_CODE,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 300 });
    zxingReaderRef.current = reader;

    addDebugLog('Browser barcode scanner started', 'info');

    const scan = async () => {
      if (!videoRef.current || barcodeLockedRef.current) return;
      const video = videoRef.current;
      if (!videoReadyRef.current || video.videoWidth === 0) return;

      try {
        const result = await reader.decodeOnceFromVideoElement(video);
        if (result) {
          const text = result.getText();
          addDebugLog(`Barcode decoded: ${text}`, 'success');
          scanCountRef.current++;
          setScanCount(scanCountRef.current);
          await lookupBarcodeStudent(text);
        }
      } catch {
        // NotFoundException is thrown when no barcode visible — completely normal
        scanCountRef.current++;
        setScanCount(scanCountRef.current);
      }
    };

    // Run scan on an interval
    barcodeScanIntervalRef.current = setInterval(scan, 400);
    // Kick off immediately
    setTimeout(scan, 100);
  };

  const stopBarcodeScanner = () => {
    if (barcodeScanIntervalRef.current) {
      clearInterval(barcodeScanIntervalRef.current);
      barcodeScanIntervalRef.current = null;
    }
    if (zxingReaderRef.current) {
      zxingReaderRef.current = null;
    }
  };

  // Send decoded barcode value to server to look up student
  const lookupBarcodeStudent = async (barcodeVal: string) => {
    barcodeLockedRef.current = true; // lock to prevent rapid duplicates

    try {
      const response = await fetch('/api/scan-barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcodeVal, classId: activeClassId }),
      });

      const data = await response.json();
      setLastResponse(JSON.stringify(data).substring(0, 200));

      if (data.result === 'unknown_barcode') {
        addDebugLog(`Unknown barcode: ${data.reg_no}`, 'error');
        playSound('beep');
        setUnknownBarcode({ reg_no: data.reg_no });
        if (unknownBarcodeTimerRef.current) clearTimeout(unknownBarcodeTimerRef.current);
        unknownBarcodeTimerRef.current = setTimeout(() => {
          setUnknownBarcode(null);
          barcodeLockedRef.current = false; // unlock after toast gone
        }, 4000);
      } else if (data.student_id) {
        handleSuccessfulScanRef.current(data, '/api/scan-barcode');
      }
    } catch (e: any) {
      addDebugLog('Lookup error: ' + e.message, 'error');
      barcodeLockedRef.current = false;
    }
  };

  // ─── FACE: capture frame & POST to server ───────────────────────────────────
  const captureAndPostFace = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return;
    if (!videoReadyRef.current || video.videoWidth === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64Frame = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
    const frameSize = Math.round((base64Frame.length * 3) / 4);
    scanCountRef.current++;
    setScanCount(scanCountRef.current);
    addDebugLog(`Face scan #${scanCountRef.current}: ${frameSize.toLocaleString()} bytes`);

    try {
      const response = await fetch('/api/recognize-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageFrame: base64Frame, classId: activeClassId }),
      });
      const responseBody = await response.text();
      setLastResponse(responseBody.substring(0, 200));

      if (response.ok) {
        const data = JSON.parse(responseBody);
        if (data.student_id && data.confidence != null && data.confidence > 0.30) {
          addDebugLog(`MATCH: ${data.name} (${Math.round(data.confidence * 100)}%)`, 'success');
          handleSuccessfulScanRef.current(data, '/api/recognize-face');
        } else if (data.result === 'uncertain') {
          handleUnknownScanRef.current();
        } else if (data.result === 'unknown') {
          if (data.reason !== 'No face detected in frame' && data.reason !== 'no_registered_faces') {
            handleUnknownScanRef.current();
          }
        }
      }
    } catch (e: any) {
      addDebugLog('Face error: ' + e?.message, 'error');
    }
  };

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const handleSuccessfulScan = (data: any, endpoint: string) => {
    if (data.student_id === lastMatchedStudentIdRef.current) {
      addDebugLog('Duplicate match skipped: ' + data.name);
      barcodeLockedRef.current = false;
      return;
    }
    playSound('success');
    setResult({ name: data.name, regNo: data.reg_no, confidence: data.confidence });
    lastMatchedStudentIdRef.current = data.student_id;

    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    resultTimerRef.current = setTimeout(() => {
      setResult(null);
      setTimeout(() => {
        if (lastMatchedStudentIdRef.current === data.student_id) {
          lastMatchedStudentIdRef.current = null;
          barcodeLockedRef.current = false;
        }
      }, 2000);
    }, 3000);

    onStudentMarked(data.student_id, 'present');
    const modeLabel = endpoint.includes('barcode') ? 'Barcode' : 'Face';
    triggerNotification(`[${modeLabel}] Verified: ${data.name}`, 'success');
  };

  const handleUnknownScan = () => {
    if (showUnknownRef.current) return;
    playSound('beep');
    showUnknownRef.current = true;
    setShowUnknown(true);
    if (unknownTimerRef.current) clearTimeout(unknownTimerRef.current);
    unknownTimerRef.current = setTimeout(() => {
      showUnknownRef.current = false;
      setShowUnknown(false);
    }, 1500);
  };

  const handleDismissResult = () => {
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    setResult(null);
    lastMatchedStudentIdRef.current = null;
    barcodeLockedRef.current = false;
    playSound('click');
  };

  const handleSimulateScan = async (studentId: number) => {
    playSound('click');
    const endpoint = scanMode === 'face' ? '/api/recognize-face' : '/api/scan-barcode';
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, classId: activeClassId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      handleSuccessfulScan(data, endpoint);
    } catch (err: any) {
      playSound('beep');
      triggerNotification(err.message || 'Simulation error', 'error');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopBarcodeScanner();
      if (faceScanTimer.current) clearInterval(faceScanTimer.current);
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      if (unknownTimerRef.current) clearTimeout(unknownTimerRef.current);
      if (unknownBarcodeTimerRef.current) clearTimeout(unknownBarcodeTimerRef.current);
    };
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-slate-50 z-50 flex flex-col max-w-[390px] mx-auto h-dvh overflow-hidden select-none">

      {/* Header */}
      <div className="shrink-0 flex justify-between items-center bg-white px-4 py-3 border-b border-slate-200 shadow-sm">
        <div>
          <span className="text-[9px] font-bold font-mono text-blue-600 uppercase tracking-widest block leading-tight">
            Smart Attendance Scanner
          </span>
          <p className="text-xs font-bold text-slate-800 truncate max-w-[220px] mt-0.5">{activeSubjectName}</p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition-all cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mode Toggle — right below header */}
      <div className="shrink-0 px-4 pt-3">
        <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => { setScanMode('face'); playSound('click'); barcodeLockedRef.current = false; }}
            className={`flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              scanMode === 'face'
                ? 'bg-white text-blue-600 shadow-sm border border-slate-200/50'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <ScanFace className="w-3.5 h-3.5" />
            Face Recognition
          </button>
          <button
            onClick={() => { setScanMode('barcode'); playSound('click'); barcodeLockedRef.current = false; }}
            className={`flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              scanMode === 'barcode'
                ? 'bg-white text-amber-600 shadow-sm border border-slate-200/50'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Barcode className="w-3.5 h-3.5" />
            ID Card Barcode
          </button>
        </div>
      </div>

      {/* Camera Stage */}
      <div
        className="relative shrink-0 mx-4 mt-3 rounded-2xl overflow-hidden bg-black"
        style={{ height: 'calc(45vh)' }}
      >
        <canvas ref={canvasRef} className="hidden" />

        {cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <p className="text-xs text-slate-400 leading-normal">{cameraError}</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${scanMode === 'face' ? 'scale-x-[-1]' : ''}`}
          />
        )}

        {/* Mode-specific viewfinder */}
        {!cameraError && !scanResult && (
          scanMode === 'barcode' ? (
            <div className="absolute left-[6%] right-[6%] top-1/2 -translate-y-1/2 h-[22%] pointer-events-none">
              <div className="absolute inset-0 border border-amber-400/50 rounded-lg animate-pulse" />
              <div className="absolute -top-0.5 -left-0.5 w-5 h-5 border-t-2 border-l-2 border-amber-400 rounded-tl" />
              <div className="absolute -top-0.5 -right-0.5 w-5 h-5 border-t-2 border-r-2 border-amber-400 rounded-tr" />
              <div className="absolute -bottom-0.5 -left-0.5 w-5 h-5 border-b-2 border-l-2 border-amber-400 rounded-bl" />
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 border-b-2 border-r-2 border-amber-400 rounded-br" />
              <div className="absolute top-1/2 left-0 right-0 h-px bg-amber-400/60 shadow-[0_0_6px_2px_rgba(245,158,11,0.4)]" />
              <p className="absolute -bottom-6 left-0 right-0 text-center text-[9px] font-mono text-amber-300/90 font-bold">
                Hold ID card barcode here
              </p>
            </div>
          ) : (
            <div className="absolute inset-[18%] pointer-events-none">
              <div className="absolute inset-0 border border-blue-400/30 rounded-2xl animate-pulse" />
              <div className="absolute -top-0.5 -left-0.5 w-4 h-4 border-t-2 border-l-2 border-blue-400 rounded-tl" />
              <div className="absolute -top-0.5 -right-0.5 w-4 h-4 border-t-2 border-r-2 border-blue-400 rounded-tr" />
              <div className="absolute -bottom-0.5 -left-0.5 w-4 h-4 border-b-2 border-l-2 border-blue-400 rounded-bl" />
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 border-b-2 border-r-2 border-blue-400 rounded-br" />
              <div className="absolute top-1/2 left-0 right-0 h-px bg-blue-400/40 animate-scan shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            </div>
          )
        )}

        {/* Active indicator pill */}
        {!cameraError && !scanResult && (
          <div className={`absolute top-2.5 left-2.5 rounded-full px-2.5 py-1 flex items-center gap-1.5 ${
            scanMode === 'barcode' ? 'bg-amber-500/90' : 'bg-blue-600/90'
          }`}>
            <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            <span className="text-[9px] font-mono text-white font-bold uppercase tracking-wider">
              {scanMode === 'barcode' ? `ID Scan · ${scanCount}` : `Face · ${scanCount}`}
            </span>
          </div>
        )}

        {/* Unknown face toast */}
        {showUnknown && !scanResult && (
          <div className="absolute top-2.5 right-2.5 bg-rose-600/90 rounded-full px-2.5 py-1 flex items-center gap-1.5">
            <UserX className="w-3 h-3 text-white" />
            <span className="text-[9px] font-bold text-white">Unknown Face</span>
          </div>
        )}

        {/* Unknown barcode toast */}
        {unknownBarcode && !scanResult && (
          <div className="absolute bottom-3 left-3 right-3 bg-slate-900/90 backdrop-blur-md rounded-xl px-3 py-2.5 border border-amber-400/30">
            <div className="flex items-center gap-2 mb-1">
              <UserX className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[10px] font-bold text-amber-300">Unknown Student</span>
            </div>
            <p className="text-[8px] text-slate-400 mb-1.5">Barcode read — not registered in system</p>
            <div className="bg-slate-800 rounded-md px-2 py-1 border border-slate-600">
              <span className="text-[10px] font-mono font-bold text-white tracking-widest break-all">{unknownBarcode.reg_no}</span>
            </div>
          </div>
        )}

        {/* Mark Recorded overlay */}
        {scanResult && (
          <div className="absolute inset-0 bg-emerald-950/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4">
            <div className="bg-white rounded-2xl p-5 shadow-2xl flex flex-col items-center gap-2 text-center max-w-[220px] w-full">
              <div className="w-12 h-12 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-emerald-500" />
              </div>
              <p className="text-[9px] font-mono text-emerald-600 tracking-widest font-bold uppercase">Mark Recorded</p>
              <h4 className="text-sm font-bold text-slate-800">{scanResult.name}</h4>
              <p className="text-[10px] font-mono text-slate-400">{scanResult.regNo}</p>
              <p className="text-[9px] font-mono text-slate-400">
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
              <button
                onClick={handleDismissResult}
                className="mt-1 w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Dismiss
              </button>
              <p className="text-[8px] text-slate-400">Scanning continues automatically</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls area */}
      <div className="flex-1 flex flex-col gap-2.5 px-4 pt-3 pb-3 min-h-0 overflow-y-auto">

        {/* Test simulator */}
        {students.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Test Controls</span>
            <div className="flex flex-wrap gap-1.5">
              {students.map((st: any) => (
                <button
                  key={st.id}
                  onClick={() => handleSimulateScan(st.id)}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-all cursor-pointer border border-slate-200/50"
                >
                  {st.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Debug panel */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setDebugOpen(!debugOpen)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-[10px] font-mono text-slate-500 hover:text-slate-700 transition-all cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Bug className="w-3.5 h-3.5" />
              <span className="font-semibold">Debug · {scanCount} frames</span>
            </span>
            {debugOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          {debugOpen && (
            <div className="border-t border-slate-100 px-3 pb-3 pt-2 max-h-[100px] overflow-y-auto bg-slate-50/50">
              <div className="text-[8px] font-mono font-bold text-slate-400 mb-1">LAST RESPONSE:</div>
              <div className="text-[8px] font-mono text-slate-600 bg-slate-200/50 rounded p-1.5 mb-2 break-all border border-slate-200">
                {lastResponse || '(none yet)'}
              </div>
              <div className="flex flex-col gap-0.5">
                {debugLogs.slice(-10).map((log, i) => (
                  <div key={i} className={`text-[8px] font-mono flex gap-1.5 ${
                    log.type === 'error' ? 'text-rose-500' : log.type === 'success' ? 'text-emerald-600' : 'text-slate-400'
                  }`}>
                    <span className="shrink-0 text-slate-300">{log.time}</span>
                    <span>{log.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="shrink-0 w-full py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-sm font-bold transition-all cursor-pointer shadow-sm"
        >
          Close Scanner
        </button>
      </div>
    </div>
  );
}
