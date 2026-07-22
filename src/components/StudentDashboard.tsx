import React, { useEffect, useState } from 'react';
import { User, BookOpen, AlertTriangle, CheckCircle, Flame, ShieldAlert, Sparkles, LogOut, Camera, Clock, History, Check, FileText } from 'lucide-react';
import { User as UserType } from '../types';
import FaceRegistration from './FaceRegistration';

interface StudentDashboardProps {
  user: UserType;
  onLogout: () => void;
  playSound: (type: 'beep' | 'success' | 'click' | 'reset' | 'scan_progress') => void;
  triggerNotification: (message: string, type: 'success' | 'info' | 'error') => void;
}

interface SubjectSummary {
  id: number;
  name: string;
  totalSessions: number;
  attended: number;
  attendanceRate: number;
}

export default function StudentDashboard({
  user,
  onLogout,
  playSound,
  triggerNotification
}: StudentDashboardProps) {
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [detailedLogs, setDetailedLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Check registration status from both user prop AND localStorage (for persistence across refreshes)
  const isFaceEnrolledInDB = !!user.face_encoding &&
    (user.face_encoding.includes('encoding_b64') || user.face_encoding.includes('insightface_enrolled'));
  const [faceRegistered, setFaceRegistered] = useState(
    isFaceEnrolledInDB || localStorage.getItem(`face_registered_${user.id}`) === 'true'
  );
  const [faceRegistrationOpen, setFaceRegistrationOpen] = useState(false);

  const fetchStudentData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/students/me?studentId=${user.id}`);
      const data = await response.json();
      if (response.ok) {
        setSubjects(data.subjects);
        setDetailedLogs(data.detailedLogs || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentData();
  }, [user.id]);

  const handleSelfRegisterFace = () => {
    playSound('click');
    setFaceRegistrationOpen(true);
  };

  const handleFaceRegistrationSuccess = () => {
    setFaceRegistered(true);
    setFaceRegistrationOpen(false);
    // Persist across refreshes
    localStorage.setItem(`face_registered_${user.id}`, 'true');
    playSound('success');
    triggerNotification('Face registered successfully! You can now be recognized by the scanner.', 'success');
  };

  // Overall attendance calculation
  const totalHeld = subjects.reduce((acc, curr) => acc + curr.totalSessions, 0);
  const totalAttended = subjects.reduce((acc, curr) => acc + curr.attended, 0);
  const averageRate = totalHeld > 0 ? Math.round((totalAttended / totalHeld) * 100) : 85;

  const getRateColor = (rate: number) => {
    if (rate >= 75) return 'text-[#137333] bg-[#e6f4ea] border-[#34a853]/20';
    if (rate >= 60) return 'text-[#b06000] bg-[#fef7e0] border-[#fbbc05]/20';
    return 'text-[#c5221f] bg-[#fce8e6] border-[#d93025]/20';
  };

  const getRateBadge = (rate: number) => {
    if (rate >= 75) return 'bg-[#e6f4ea] text-[#137333] border border-[#34a853]/20';
    if (rate >= 60) return 'bg-[#fef7e0] text-[#b06000] border border-[#fbbc05]/20';
    return 'bg-[#fce8e6] text-[#c5221f] border border-[#d93025]/20';
  };

  return (
    <div id="student-dashboard" className="flex-1 h-full overflow-y-auto flex flex-col bg-white text-[#1f1f1f] p-5 max-w-[390px] mx-auto pb-6 animate-fadeIn">
      
      {/* Unregistered Face Alert Banner */}
      {!faceRegistered && (
        <div className="bg-[#fef7e0] border border-[#fbbc05]/40 rounded-2xl p-4 mb-4 flex flex-col gap-3 shadow-sm">
          <div className="flex gap-2.5 items-start">
            <Camera className="w-5 h-5 text-[#b06000] shrink-0 mt-0.5" />
            <div>
              <strong className="text-[#202124] text-xs block font-bold mb-0.5">Face Bio-Sign Required</strong>
              <p className="text-[10.5px] leading-snug text-[#5f6368]">
                You haven't registered your face credentials yet. Instructors cannot use the camera scanner to mark you present until you register.
              </p>
            </div>
          </div>
          <button
            onClick={handleSelfRegisterFace}
            className="w-full bg-[#fbbc05] hover:bg-[#f3b504] text-slate-950 font-bold text-xs py-2 rounded-full transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Register Face Signature Now</span>
          </button>
        </div>
      )}

      {/* Student Profile Overview */}
      <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-5 flex flex-col gap-4 shadow-sm relative overflow-hidden group">
        
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-12 h-12 rounded-full bg-[#1a73e8]/10 text-[#1a73e8] flex items-center justify-center font-bold text-lg shadow-sm border border-[#1a73e8]/20">
            {user.name.split(' ').map(n => n[0]).join('')}
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[9px] font-mono font-bold text-[#1a73e8] tracking-widest block uppercase">Student Profile</span>
            <h2 className="text-sm font-bold text-[#202124] truncate font-sans tracking-tight">{user.name}</h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              <p className="text-[10px] font-mono text-[#5f6368] bg-white px-2 py-0.5 rounded border border-[#dadce0] inline-block">{user.reg_no}</p>
              {faceRegistered && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-[#137333] bg-[#e6f4ea] border border-[#34a853]/30 px-1.5 py-0.5 rounded-full">
                  <Check className="w-2.5 h-2.5" />
                  Face registered ✓
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Dynamic Health Stats Grid */}
        <div className="grid grid-cols-2 gap-3 pt-3.5 border-t border-[#dadce0] relative z-10">
          <div className="bg-white p-3 rounded-xl border border-[#dadce0]/80 text-center flex flex-col justify-center">
            <span className="text-[9px] font-mono text-[#5f6368] uppercase font-bold tracking-wider block">Sem Average</span>
            <span className={`text-xl font-bold block mt-1 tracking-tight ${averageRate >= 75 ? 'text-[#137333]' : averageRate >= 60 ? 'text-[#b06000]' : 'text-[#c5221f]'}`}>
              {averageRate}%
            </span>
          </div>

          <div className="bg-white p-3 rounded-xl border border-[#dadce0]/80 flex flex-col items-center justify-center text-center">
            <span className="text-[9px] font-mono text-[#5f6368] uppercase font-bold tracking-wider block">Exam status</span>
            {averageRate >= 75 ? (
              <span className="text-[9px] font-bold text-[#137333] bg-[#e6f4ea] border border-[#34a853]/20 px-2.5 py-0.5 rounded-full mt-2 tracking-wider">
                ELIGIBLE
              </span>
            ) : (
              <span className="text-[9px] font-bold text-[#c5221f] bg-[#fce8e6] border border-[#d93025]/20 px-2.5 py-0.5 rounded-full mt-2 tracking-wider">
                CRITICAL
              </span>
            )}
          </div>
        </div>

        {/* Warning card for low attendance */}
        {averageRate < 75 && (
          <div className="bg-[#fce8e6] border border-[#d93025]/20 rounded-xl p-3 flex gap-2.5 items-start mt-1 relative z-10">
            <ShieldAlert className="w-4 h-4 text-[#c5221f] shrink-0 mt-0.5" />
            <div className="text-[10.5px] leading-snug text-[#c5221f]">
              <strong className="text-[#202124] block font-bold mb-0.5">Below 75% Limit Warning!</strong>
              Your cumulative rate is deficient. Please write overrides with classroom Faculty Advisors soon.
            </div>
          </div>
        )}
      </div>

      {/* Subject list section */}
      <div className="flex flex-col gap-2.5 mt-5">
        <div className="flex items-center justify-between pl-1">
          <h3 className="text-[10px] font-bold text-[#5f6368] uppercase tracking-wider">Subject Statistics</h3>
          <span className="text-[9px] text-[#5f6368]">Lectures</span>
        </div>

        {loading ? (
          <div className="bg-[#f8f9fa] border border-[#dadce0] p-8 rounded-2xl text-center text-[#5f6368] animate-pulse text-xs">
            Refreshing live attendance grid...
          </div>
        ) : subjects.length === 0 ? (
          <div className="bg-[#f8f9fa] border border-[#dadce0] p-8 rounded-2xl text-center text-[#5f6368] text-xs">
            No active subjects registered in this semester.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {subjects.map((sub) => (
              <div key={sub.id} className="bg-white border border-[#dadce0] hover:border-[#1a73e8]/30 rounded-xl p-3.5 flex justify-between items-center gap-4 transition-all duration-200 group">
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-[#202124] group-hover:text-[#1a73e8] transition-colors font-sans tracking-tight">{sub.name}</h4>
                  <div className="flex items-center gap-2 text-[10px] text-[#5f6368] mt-1 font-mono">
                    <span className="bg-[#f1f3f4] px-1.5 py-0.5 rounded border border-[#dadce0]/60">Held: <strong className="text-[#202124]">{sub.totalSessions}</strong></span>
                    <span className="bg-[#f1f3f4] px-1.5 py-0.5 rounded border border-[#dadce0]/60">Present: <strong className="text-[#137333]">{sub.attended}</strong></span>
                  </div>
                </div>

                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full transition-all font-mono tracking-wider ${getRateBadge(sub.attendanceRate)}`}>
                    {sub.attendanceRate}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live Recorded Check-in Logs */}
      <div className="flex flex-col gap-2.5 mt-5">
        <div className="flex items-center justify-between pl-1">
          <h3 className="text-[10px] font-bold text-[#5f6368] uppercase tracking-wider flex items-center gap-1">
            <History className="w-3 h-3 text-[#1a73e8]" />
            <span>Check-in Log History</span>
          </h3>
          <span className="text-[9px] text-[#5f6368] font-mono">Real-time sync</span>
        </div>

        {loading ? (
          <div className="bg-[#f8f9fa] p-6 rounded-2xl border border-[#dadce0] animate-pulse text-center text-xs text-[#5f6368]">
            Loading log timelines...
          </div>
        ) : detailedLogs.length === 0 ? (
          <div className="bg-[#f8f9fa] border border-[#dadce0] p-6 rounded-2xl text-center text-[#5f6368] text-xs leading-relaxed italic">
            No finalized attendance records captured yet this semester.
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
            {detailedLogs.map((log) => {
              const isPresent = log.status === 'present';
              const isLate = log.status === 'late';
              return (
                <div key={log.id} className="bg-white border border-[#dadce0] rounded-xl p-3 flex flex-col gap-1.5 shadow-sm text-[10px] leading-normal">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-[#202124]">{log.subjectName}</span>
                    <span className="text-[9px] text-[#5f6368] font-mono">{log.date}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#5f6368] flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3 text-[#1a73e8]" />
                      {log.marked_at ? (
                        <span>Marked at: {new Date(log.marked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      ) : (
                        <span className="italic">Time N/A</span>
                      )}
                    </span>
                    <span className={`font-bold px-2 py-0.5 rounded-full border text-[9px] uppercase ${
                      isPresent
                        ? 'text-[#137333] bg-[#e6f4ea] border-[#34a853]/20'
                        : isLate
                        ? 'text-[#b06000] bg-[#fef7e0] border-[#fbbc05]/20'
                        : 'text-[#c5221f] bg-[#fce8e6] border-[#d93025]/20'
                    }`}>
                      {log.status}
                    </span>
                  </div>
                  {log.override_reason && (
                    <div className="bg-[#f8f9fa] border border-[#dadce0] px-2 py-1 rounded text-[#5f6368] flex items-start gap-1 text-[9px]">
                      <FileText className="w-3 h-3 text-[#1a73e8] shrink-0 mt-0.5" />
                      <span><strong>Override Reason:</strong> "{log.override_reason}"</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Face Bio Signatures */}
      <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-4 mt-5 flex flex-col gap-2.5">
        <h4 className="text-[10px] font-bold text-[#5f6368] uppercase tracking-wider pl-1">Attendance Bio-sign</h4>
        <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-[#dadce0]/80">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-full ${faceRegistered ? 'bg-[#e6f4ea] text-[#137333]' : 'bg-[#f1f3f4] text-[#5f6368]'}`}>
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-[#202124] block">Face Authentication File</span>
              <p className="text-[9px] text-[#5f6368] font-mono mt-0.5">
                {faceRegistered ? 'Registered successfully' : 'Not registered'}
              </p>
            </div>
          </div>

          {!faceRegistered ? (
            <button
              onClick={handleSelfRegisterFace}
              className="px-3 py-1.5 bg-[#1a73e8] hover:bg-[#1557b0] text-white rounded-full text-[10px] font-bold transition-all cursor-pointer"
            >
              Register Face
            </button>
          ) : (
            <span className="text-[9px] font-bold text-[#137333] px-2.5 py-0.5 bg-[#e6f4ea] rounded-full border border-[#34a853]/20 uppercase tracking-wider">
              ACTIVE
            </span>
          )}
        </div>
      </div>

      {/* Student notice card */}
      <div className="bg-[#e8f0fe] border border-[#1a73e8]/20 rounded-xl p-3.5 text-[10.5px] leading-normal text-[#174ea6] mt-4 flex gap-2">
        <Sparkles className="w-4 h-4 text-[#1a73e8] shrink-0 mt-0.5" />
        <p>
          Presence logs sync instantly. To write custom reviews or ask for error corrections, contact your class FA before the 48-hour edit limit expires.
        </p>
      </div>

      {/* Face Registration Modal */}
      {faceRegistrationOpen && (
        <FaceRegistration
          regNo={user.reg_no || ''}
          studentId={user.id}
          studentName={user.name}
          onClose={() => setFaceRegistrationOpen(false)}
          onSuccess={handleFaceRegistrationSuccess}
          playSound={playSound}
          triggerNotification={triggerNotification}
        />
      )}

      {/* Logout button */}
      <button
        onClick={() => { playSound('reset'); onLogout(); }}
        className="w-full bg-[#f1f3f4] hover:bg-[#e8eaed] text-[#c5221f] font-bold text-xs py-3 rounded-full transition-all border border-[#dadce0] mt-6 flex items-center justify-center gap-2 cursor-pointer"
      >
        <LogOut className="w-3.5 h-3.5" />
        <span>Log Out Student Session</span>
      </button>

    </div>
  );
}
