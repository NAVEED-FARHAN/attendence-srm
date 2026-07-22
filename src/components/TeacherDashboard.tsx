import React, { useEffect, useState, useRef } from 'react';
import { Camera, Calendar, CheckSquare, Square, Save, ArrowLeft, Clock, History, AlertTriangle, FileText, Check, AlertCircle } from 'lucide-react';
import { User, ClassObj, Subject, Session, AttendanceRecord } from '../types';
import CameraScanner from './CameraScanner';
import { initCamera, getCameraState, isCameraInitialized } from '../lib/camera';

interface TeacherDashboardProps {
  user: User;
  playSound: (type: 'beep' | 'success' | 'click' | 'reset' | 'scan_progress') => void;
  triggerNotification: (message: string, type: 'success' | 'info' | 'error') => void;
}

interface EnrichedClassroom extends ClassObj {
  subjects: Subject[];
}

interface EnrichedAttendanceLog {
  id: number;
  student_id: number;
  name: string;
  regNo: string;
  status: 'present' | 'absent' | 'late';
}

export default function TeacherDashboard({
  user,
  playSound,
  triggerNotification
}: TeacherDashboardProps) {
  const [classrooms, setClassrooms] = useState<EnrichedClassroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeClassroom, setActiveClassroom] = useState<EnrichedClassroom | null>(null);
  const [activeSubject, setActiveSubject] = useState<Subject | null>(null);

  // Attendance marking states
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]); // holds logs with marked_at and override_reason
  const [cameraOpen, setCameraOpen] = useState(false);
  const [markingLoading, setMarkingLoading] = useState(false);

  // Camera stream managed globally - initialized once and kept alive across modal open/close
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const cameraInitRef = useRef(false);

  // Initialize camera once on dashboard mount (if not already initialized)
  useEffect(() => {
    if (!cameraInitRef.current) {
      cameraInitRef.current = true;
      // Check if already initialized globally
      const existing = getCameraState();
      if (existing.stream) {
        setMediaStream(existing.stream);
      } else {
        // Initialize camera (this happens only once app-wide)
        initCamera('environment')
          .then(({ stream }) => {
            setMediaStream(stream);
            console.log('[Camera] Initialized successfully, deviceId stored globally');
          })
          .catch((err) => {
            console.warn('[Camera] Initialization failed:', err);
            cameraInitRef.current = false; // Allow retry
          });
      }
    }
  }, []);

  // Release camera on unmount (TeacherDashboard disappears)
  useEffect(() => {
    return () => {
      // Don't release - the camera manager is module-level singleton
      // It persists across component lifecycle
    };
  }, []);

  // Timer & override states
  const [elapsedTimeStr, setElapsedTimeStr] = useState('');
  const [overrideStudentId, setOverrideStudentId] = useState<number | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  // Flash green animation on face match
  const [flashStudentId, setFlashStudentId] = useState<number | null>(null);

  // Live session timer ticking logic
  useEffect(() => {
    if (!currentSession?.session_start_time) {
      setElapsedTimeStr('');
      return;
    }
    const updateTimer = () => {
      const start = new Date(currentSession.session_start_time!).getTime();
      const now = new Date().getTime();
      const diffSecs = Math.max(0, Math.floor((now - start) / 1000));
      const mins = Math.floor(diffSecs / 60);
      const secs = diffSecs % 60;
      if (mins === 0) {
        setElapsedTimeStr(`Session started ${secs}s ago`);
      } else {
        setElapsedTimeStr(`Session started ${mins} mins ago`);
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 5000); // refresh every 5 seconds
    return () => clearInterval(timer);
  }, [currentSession?.session_start_time]);

  const fetchClassrooms = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/classes/me?userId=${user.id}&activeRole=teacher`);
      const data = await response.json();
      if (response.ok) {
        setClassrooms(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClassrooms();
  }, [user.id]);

  const handleSelectClassroom = async (cls: EnrichedClassroom, sub: Subject) => {
    playSound('click');
    setActiveClassroom(cls);
    setActiveSubject(sub);
    setMarkingLoading(true);

    try {
      // 1. Look for any active unsubmitted session or create a draft session
      const todayStr = new Date().toISOString().split('T')[0];
      
      const initResponse = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId: sub.id,
          teacherId: user.id,
          date: todayStr
        })
      });

      const initData = await initResponse.json();
      if (initResponse.ok && initData.session) {
        const sessionObj: Session = initData.session;
        setCurrentSession(sessionObj);

        // Fetch attendance logs for this session
        const attResponse = await fetch(`/api/sessions/${sessionObj.id}/attendance`);
        const attData = await attResponse.json();
        if (attResponse.ok) {
          setAttendanceLogs(attData.records);
        }
      }
    } catch (e) {
      console.error('Session loading failed', e);
      triggerNotification('Failed to initialize attendance session', 'error');
    } finally {
      setMarkingLoading(false);
    }
  };

  const handleStartSession = async () => {
    if (!currentSession) return;
    playSound('success');
    setMarkingLoading(true);

    try {
      const response = await fetch(`/api/sessions/${currentSession.id}/start`, {
        method: 'POST'
      });
      const data = await response.json();
      if (response.ok && data.session) {
        setCurrentSession(data.session);
        triggerNotification('Attendance session timer started!', 'success');

        // Reload logs to make sure everything is in sync
        const attResponse = await fetch(`/api/sessions/${currentSession.id}/attendance`);
        const attData = await attResponse.json();
        if (attResponse.ok) {
          setAttendanceLogs(attData.records);
        }
      } else {
        throw new Error(data.error);
      }
    } catch (e: any) {
      playSound('beep');
      triggerNotification(e.message || 'Failed to start session', 'error');
    } finally {
      setMarkingLoading(false);
    }
  };

  const handleMarkStudent = async (logId: number, targetStatus: 'present' | 'absent', reason?: string) => {
    if (currentSession?.locked) {
      triggerNotification('Session is locked. Updates not allowed after 48 hours.', 'error');
      playSound('beep');
      return;
    }

    if (!currentSession?.session_start_time) {
      triggerNotification('Please start the session first.', 'error');
      playSound('beep');
      return;
    }

    // Determine if override reason modal is needed
    if (targetStatus === 'present') {
      const start = new Date(currentSession.session_start_time).getTime();
      const now = new Date().getTime();
      const elapsedMins = (now - start) / (1000 * 60);

      // If > 30 minutes, we need an override reason
      if (elapsedMins > 30 && !reason) {
        setOverrideStudentId(logId);
        setOverrideReason('');
        return;
      }
    }

    playSound('click');

    try {
      const body: any = {};
      if (targetStatus === 'absent') {
        body.status = 'absent';
      } else {
        body.override_to_present = true;
        if (reason) {
          body.override_reason = reason;
        }
      }

      const response = await fetch(`/api/attendance/${logId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }

      // Close modal if open
      setOverrideStudentId(null);
      setOverrideReason('');

      // Refresh attendance logs
      const attResponse = await fetch(`/api/sessions/${currentSession.id}/attendance`);
      const attData = await attResponse.json();
      if (attResponse.ok) {
        setAttendanceLogs(attData.records);
        triggerNotification('Attendance log updated successfully.', 'success');
      }
    } catch (e: any) {
      playSound('beep');
      triggerNotification(e.message || 'Failed to update attendance', 'error');
    }
  };

  const handleStudentMarkedViaCamera = async (studentId: number, status: 'present' | 'late') => {
    // Flash this student row green
    setFlashStudentId(studentId);
    setTimeout(() => setFlashStudentId(null), 3000);

    // Reload attendance logs from the backend first to ensure we have any newly enrolled students in our local state
    if (currentSession) {
      try {
        const attResponse = await fetch(`/api/sessions/${currentSession.id}/attendance`);
        const attData = await attResponse.json();
        if (attResponse.ok) {
          setAttendanceLogs(attData.records);
          
          // Now look for the student in the updated logs list
          const targetLog = attData.records.find((log: any) => log.student_id === studentId);
          if (targetLog && targetLog.status !== 'present') {
            await handleMarkStudent(targetLog.id, 'present');
          }
        }
      } catch (e) {
        console.error('Error synchronizing after camera scan:', e);
      }
    }
  };

  const handleSubmitSession = async () => {
    if (!currentSession) return;
    playSound('success');

    try {
      const response = await fetch(`/api/sessions/${currentSession.id}/submit`, {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentSession(data.session);
        triggerNotification('Session attendance record submitted. 48hr edit window started.', 'success');
      }
    } catch (e) {
      triggerNotification('Submission error', 'error');
    }
  };

  const handleBackToDashboard = () => {
    playSound('click');
    setActiveClassroom(null);
    setActiveSubject(null);
    setCurrentSession(null);
    setAttendanceLogs([]);
  };

  // Compute stats
  const presentCount = attendanceLogs.filter((l) => l.status === 'present' || l.status === 'late').length;
  const absentCount = attendanceLogs.filter((l) => l.status === 'absent').length;

  return (
    <div id="teacher-dashboard" className="flex-1 h-full overflow-y-auto flex flex-col bg-white text-[#1f1f1f] p-5 max-w-[390px] mx-auto pb-6 animate-fadeIn">
      
      {/* 1. General Dashboard View */}
      {!activeClassroom ? (
        <div className="flex flex-col gap-5">
          <div className="flex justify-between items-center bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-5 shadow-sm relative overflow-hidden group">
            <div className="relative z-10">
              <span className="text-[9px] font-mono font-bold text-[#1a73e8] uppercase tracking-widest block">Welcome Faculty</span>
              <h2 className="text-base font-bold text-[#202124] mt-1 font-sans tracking-tight">{user.name}</h2>
              <p className="text-[10px] text-[#5f6368] font-mono mt-1 bg-white border border-[#dadce0] px-2 py-0.5 rounded-lg inline-block">{user.email}</p>
            </div>
            <div className="w-11 h-11 rounded-full bg-[#1a73e8]/10 text-[#1a73e8] flex items-center justify-center font-bold text-base shadow-sm border border-[#1a73e8]/25 relative z-10">
              {user.name.split(' ').map(n => n[0]).join('')}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-[10px] font-bold text-[#5f6368] uppercase tracking-wider pl-1">Your Assigned Classrooms</h3>

            {loading ? (
              <div className="bg-[#f8f9fa] border border-[#dadce0] p-8 rounded-2xl text-center text-[#5f6368] animate-pulse text-xs">
                Analyzing faculty schedules...
              </div>
            ) : classrooms.length === 0 ? (
              <div className="bg-[#f8f9fa] border border-[#dadce0] p-8 rounded-2xl text-center text-[#5f6368] text-xs leading-relaxed">
                No classrooms currently assigned. Contact active FA to add you to subjects.
              </div>
            ) : (
              classrooms.map((cls) => (
                <div key={cls.id} className="flex flex-col gap-2.5">
                  {cls.subjects.map((sub) => (
                    <div
                      key={sub.id}
                      onClick={() => handleSelectClassroom(cls, sub)}
                      className="bg-white border border-[#dadce0] hover:border-[#1a73e8]/40 rounded-xl p-4 transition-all duration-200 cursor-pointer flex justify-between items-center gap-4 group shadow-sm"
                    >
                      <div className="min-w-0">
                        <span className="text-[9px] font-bold text-[#1a73e8] bg-[#1a73e8]/10 px-2.5 py-0.5 rounded-full border border-[#1a73e8]/20 inline-block uppercase tracking-wider">
                          Class: {cls.name}
                        </span>
                        <h4 className="text-sm font-bold text-[#202124] mt-2 truncate group-hover:text-[#1a73e8] transition-colors font-sans tracking-tight">
                          {sub.name}
                        </h4>
                        <p className="text-[10px] text-[#5f6368] font-mono mt-1 flex items-center gap-1.5">
                          <span>Dep: {cls.department}</span>
                          <span className="text-[#dadce0]">•</span>
                          <span>{cls.specialization}</span>
                        </p>
                      </div>

                      <div className="w-8 h-8 rounded-full bg-[#f1f3f4] border border-[#dadce0] flex items-center justify-center text-[#5f6368] group-hover:text-white group-hover:bg-[#1a73e8] group-hover:border-[#1a73e8] transition-all duration-200">
                        <span className="text-xs font-bold">→</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* 2. Attendance Marking View */
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleBackToDashboard}
              className="w-9 h-9 rounded-full bg-[#f1f3f4] border border-[#dadce0] hover:bg-[#e8eaed] text-[#5f6368] flex items-center justify-center transition-all cursor-pointer duration-200"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <span className="text-[9px] font-mono font-bold text-[#1a73e8] tracking-wider block uppercase">CLASSROOM ROSTER • {activeClassroom.name}</span>
              <h2 className="text-sm font-bold text-[#202124] truncate font-sans tracking-tight">{activeSubject?.name}</h2>
            </div>
          </div>

          {/* Start Session / Timer Banner */}
          {!currentSession?.session_start_time ? (
            <div className="bg-[#e6f4ea] border border-[#34a853]/30 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-[#137333] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-xs font-bold text-[#137333]">Session Attendance Timer</h3>
                  <p className="text-[10px] text-[#137333]/90 mt-1 leading-relaxed">
                    Start the session to enable student check-ins. Status classifications:
                  </p>
                  <ul className="list-disc pl-4 text-[9px] text-[#137333]/85 mt-1 space-y-1">
                    <li>0–20 mins: Marked as <strong>Present</strong></li>
                    <li>20–30 mins: Marked as <strong>Late</strong> (overrideable)</li>
                    <li>After 30 mins: Automatically <strong>Absent</strong> (override requires a mandatory reason)</li>
                  </ul>
                </div>
              </div>
              <button
                onClick={handleStartSession}
                className="w-full bg-[#137333] hover:bg-[#0f5b27] text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all"
              >
                <Clock className="w-4 h-4" />
                <span>Start Session Now</span>
              </button>
            </div>
          ) : (
            <div className="bg-[#e8f0fe] border border-[#1a73e8]/20 rounded-2xl p-4.5 flex flex-col gap-3 shadow-sm">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-[#1a73e8]">
                  <Clock className="w-4 h-4 animate-pulse" />
                  <span className="text-xs font-bold tracking-tight">{elapsedTimeStr || "Timer active"}</span>
                </div>
                <span className="text-[9px] font-bold text-[#137333] bg-[#e6f4ea] border border-[#34a853]/25 px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                  Session Active
                </span>
              </div>
            </div>
          )}

          {/* Camera Access Box (Disabled if session not started) */}
          <button
            disabled={!currentSession?.session_start_time}
            onClick={() => { playSound('click'); setCameraOpen(true); }}
            className={`w-full font-bold text-xs py-3 rounded-full transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer duration-200 ${
              currentSession?.session_start_time
                ? 'bg-[#1a73e8] hover:bg-[#1557b0] text-white'
                : 'bg-[#dadce0] text-[#80868b] cursor-not-allowed'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Open Smart Scanner Mode</span>
          </button>

          {/* Session metadata cards */}
          <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-4.5 flex flex-col gap-3.5 shadow-sm">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[9px] font-mono text-[#5f6368] font-bold uppercase tracking-wider block">Session Control</span>
                <p className="text-xs font-bold text-[#202124] mt-1 flex items-center gap-1.5 font-sans">
                  <Calendar className="w-4 h-4 text-[#1a73e8]" />
                  Date: {currentSession?.date}
                </p>
              </div>

              {currentSession?.submitted_at ? (
                <span className="text-[9px] font-bold text-[#137333] bg-[#e6f4ea] border border-[#34a853]/25 px-2.5 py-0.5 rounded-full flex items-center gap-1 animate-pulse tracking-wider">
                  <Check className="w-3 h-3" />
                  SUBMITTED
                </span>
              ) : (
                <span className="text-[9px] font-bold text-[#b06000] bg-[#fef7e0] border border-[#fbbc05]/25 px-2.5 py-0.5 rounded-full tracking-wider">
                  DRAFT MODE
                </span>
              )}
            </div>

            {/* Attendance Counters */}
            <div className="grid grid-cols-2 gap-3 bg-white p-2.5 rounded-xl border border-[#dadce0]">
              <div className="text-center py-2">
                <span className="text-[9px] font-mono text-[#5f6368] uppercase tracking-wider font-bold block">Present</span>
                <span className="text-base font-extrabold text-[#137333] block mt-0.5 tracking-tight">{presentCount}</span>
              </div>
              <div className="text-center py-2 border-l border-[#dadce0]">
                <span className="text-[9px] font-mono text-[#5f6368] uppercase tracking-wider font-bold block">Absent</span>
                <span className="text-base font-extrabold text-[#c5221f] block mt-0.5 tracking-tight">{absentCount}</span>
              </div>
            </div>

            {/* 48-Hour Lock Banner if submitted */}
            {currentSession?.submitted_at && (
              <div className="bg-[#e8f0fe] p-2.5 rounded-xl border border-[#1a73e8]/10 text-[10px] text-[#174ea6] flex items-center gap-2 leading-relaxed">
                <Clock className="w-3.5 h-3.5 text-[#1a73e8] shrink-0" />
                <span>
                  Submitted successfully. Editable until: <strong>48 hours from submission</strong>.
                </span>
              </div>
            )}
          </div>

          {/* Student Roster Lists */}
          <div className="flex flex-col gap-2.5 mt-2">
            <span className="text-[10px] font-bold text-[#5f6368] uppercase tracking-wider pl-1">Enrolled Student Roll</span>

            {markingLoading ? (
              <div className="p-12 text-center text-[#5f6368] text-xs animate-pulse">
                Synchronizing attendance sheets...
              </div>
            ) : !currentSession?.session_start_time ? (
              <div className="bg-[#f8f9fa] border border-[#dadce0] p-6 rounded-2xl text-center text-[#5f6368] text-xs leading-relaxed">
                Please click <strong className="text-[#137333]">"Start Session Now"</strong> above to begin taking and adjusting attendance.
              </div>
            ) : attendanceLogs.length === 0 ? (
              <div className="bg-[#f8f9fa] border border-[#dadce0] p-8 rounded-2xl text-center text-[#5f6368] text-xs">
                No enrolled students detected in this classroom roster.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {attendanceLogs.map((log) => {
                  const isPresent = log.status === 'present';
                  const isLate = log.status === 'late';
                  const isAbsent = log.status === 'absent';
                  const isFlashing = flashStudentId === log.student_id;
                  
                  return (
                    <div
                      key={log.id}
                      className={`bg-white border rounded-xl p-3.5 flex flex-col gap-2.5 shadow-sm transition-all duration-500 ${
                        isFlashing
                          ? 'border-emerald-400 bg-emerald-50/80 ring-2 ring-emerald-400/30 scale-[1.02]'
                          : 'border-[#dadce0]'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-[#202124] font-sans tracking-tight">{log.name}</h4>
                          <div className="flex flex-wrap gap-1.5 items-center mt-1">
                            <span className="text-[9px] font-mono text-[#5f6368] bg-[#f1f3f4] px-2 py-0.5 rounded border border-[#dadce0]">{log.regNo}</span>
                            {log.marked_at && (log.status === 'present' || log.status === 'late') && (
                              <span className="text-[9px] font-mono text-[#1a73e8] bg-[#e8f0fe] border border-[#1a73e8]/20 px-2 py-0.5 rounded flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                {new Date(log.marked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0">
                          {isPresent ? (
                            <div className="flex items-center gap-1 text-[#137333] bg-[#e6f4ea] border border-[#34a853]/25 px-2.5 py-1 rounded-full text-[10px] font-bold">
                              <Check className="w-3.5 h-3.5" />
                              <span>Present</span>
                            </div>
                          ) : isLate ? (
                            <div className="flex items-center gap-1 text-[#b06000] bg-[#fef7e0] border border-[#fbbc05]/25 px-2.5 py-1 rounded-full text-[10px] font-bold">
                              <Clock className="w-3.5 h-3.5 animate-pulse" />
                              <span>Late</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-[#c5221f] bg-[#fce8e6] border border-[#d93025]/25 px-2.5 py-1 rounded-full text-[10px] font-bold">
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>Absent</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {log.override_reason && (
                        <div className="text-[9px] text-[#5f6368] bg-[#f8f9fa] border border-[#dadce0] px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 leading-normal">
                          <FileText className="w-3.5 h-3.5 text-[#1a73e8] shrink-0" />
                          <span><strong className="text-[#202124]">Override Reason:</strong> "{log.override_reason}"</span>
                        </div>
                      )}

                      {/* Action buttons inside the card */}
                      {!currentSession?.submitted_at && (
                        <div className="flex gap-2 pt-1 border-t border-[#dadce0]/50 mt-1">
                          {isAbsent ? (
                            <button
                              onClick={() => handleMarkStudent(log.id, 'present')}
                              className="flex-1 bg-[#e8f0fe] hover:bg-[#d2e3fc] text-[#1a73e8] border border-[#1a73e8]/10 text-[10px] font-bold py-1.5 rounded-lg transition-all cursor-pointer text-center"
                            >
                              Mark Present
                            </button>
                          ) : (
                            <button
                              onClick={() => handleMarkStudent(log.id, 'absent')}
                              className="flex-1 bg-[#f1f3f4] hover:bg-[#e8eaed] text-[#5f6368] border border-[#dadce0] text-[10px] font-medium py-1.5 rounded-lg transition-all cursor-pointer text-center"
                            >
                              Set to Absent
                            </button>
                          )}

                          {isLate && (
                            <button
                              onClick={() => handleMarkStudent(log.id, 'present', 'Direct override')}
                              className="flex-1 bg-[#e6f4ea] hover:bg-[#ceead6] text-[#137333] border border-[#34a853]/15 text-[10px] font-bold py-1.5 rounded-lg transition-all cursor-pointer text-center"
                            >
                              Set Present (Override)
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action Footer */}
          {!currentSession?.submitted_at && currentSession?.session_start_time && attendanceLogs.length > 0 && (
            <button
              onClick={handleSubmitSession}
              className="w-full bg-[#1a73e8] hover:bg-[#1557b0] text-white rounded-full py-3 text-xs font-bold tracking-wider transition-all mt-4 flex items-center justify-center gap-2 cursor-pointer duration-200 shadow-sm"
            >
              <Save className="w-4 h-4" />
              <span>Submit Attendance Logs</span>
            </button>
          )}
        </div>
      )}

      {/* Camera overlay modal - stream persists from parent, never re-initialized */}
      {cameraOpen && activeClassroom && activeSubject && (
        <CameraScanner
          onClose={() => setCameraOpen(false)}
          onStudentMarked={handleStudentMarkedViaCamera}
          activeClassId={activeClassroom.id}
          activeSubjectName={activeSubject.name}
          playSound={playSound}
          triggerNotification={triggerNotification}
          students={attendanceLogs}
          mediaStream={mediaStream}
        />
      )}

      {/* Mandatory Override Reason Modal Dialog */}
      {overrideStudentId !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-[340px] bg-white border border-[#dadce0] rounded-2xl p-5 shadow-xl flex flex-col gap-4 animate-scale-up">
            <div className="flex justify-between items-center pb-2 border-b border-[#dadce0]">
              <h4 className="text-xs font-bold text-[#202124] flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-[#c5221f]" />
                Mandatory Override Reason
              </h4>
              <button
                onClick={() => {
                  setOverrideStudentId(null);
                  setOverrideReason('');
                }}
                className="text-[10px] font-bold text-[#5f6368] hover:text-[#202124]"
              >
                Cancel
              </button>
            </div>

            <p className="text-[10px] text-[#5f6368] leading-relaxed">
              This student is being marked present <strong>after 30 minutes</strong>. Provide a mandatory reason for this manual override.
            </p>

            <textarea
              required
              rows={3}
              placeholder="e.g. Medical approval / Bus late / Special permission"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="w-full bg-white border border-[#dadce0] rounded-lg p-2.5 text-xs text-[#202124] focus:outline-none focus:border-[#1a73e8] resize-none"
            />

            <button
              onClick={() => {
                if (!overrideReason.trim()) {
                  triggerNotification('Please type a valid reason.', 'error');
                  return;
                }
                handleMarkStudent(overrideStudentId, 'present', overrideReason);
              }}
              className="w-full bg-[#1a73e8] hover:bg-[#1557b0] text-white font-bold text-xs py-2 rounded-lg transition-all"
            >
              Confirm and Save Present
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
