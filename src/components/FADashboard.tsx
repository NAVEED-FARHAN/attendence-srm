import React, { useEffect, useState } from 'react';
import { Download, Upload, UserPlus, RefreshCw, Grid, List, ShieldAlert, CheckCircle, Clock, ChevronDown, User, Users, BookOpen, Settings, AlertTriangle, FileText } from 'lucide-react';
import { User as UserType, ClassObj, Subject } from '../types';

interface FADashboardProps {
  user: UserType;
  playSound: (type: 'beep' | 'success' | 'click' | 'reset') => void;
  triggerNotification: (message: string, type: 'success' | 'info' | 'error') => void;
  onRoleSwitch: (role: 'teacher' | 'fa') => void;
}

interface RosterStudent {
  id: number;
  name: string;
  regNo: string;
  email: string;
  faceRegistered: boolean;
  seat: number;
}

interface AttendanceMatrixRow {
  id: number;
  name: string;
  regNo: string;
  email: string;
  rates: Record<number, number>; // subjectId -> rate%
  averageRate: number;
}

interface TeacherOption {
  id: number;
  name: string;
  username: string | null;
}

export default function FADashboard({
  user,
  playSound,
  triggerNotification,
  onRoleSwitch
}: FADashboardProps) {
  const [activeTab, setActiveTab] = useState<'roster' | 'live' | 'settings'>('roster');
  const [expandedStudentId, setExpandedStudentId] = useState<number | null>(null);
  const [myClass, setMyClass] = useState<ClassObj | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [loading, setLoading] = useState(true);

  // Live Summary Matrix
  const [attendanceSummary, setAttendanceSummary] = useState<{
    subjects: Subject[];
    summary: AttendanceMatrixRow[];
  } | null>(null);

  // Manual Add Student form
  const [manualName, setManualName] = useState('');
  const [manualRegNo, setManualRegNo] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Teacher assigning form
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [selectedTeacherForSubject, setSelectedTeacherForSubject] = useState<Record<number, number>>({});

  // Class Transfer form
  const [transferUsername, setTransferUsername] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

  // Excel upload state
  const [uploadLoading, setUploadLoading] = useState(false);
  const [importReport, setImportReport] = useState<{
    imported: number;
    skipped: number;
    conflicts: Array<{
      reg_no: string;
      name: string;
      other_class: string;
      other_fa: string;
      other_fa_contact: string;
    }>;
  } | null>(null);

  // Add Subject Form State
  const [newSubName, setNewSubName] = useState('');
  const [assignTeacherUsername, setAssignTeacherUsername] = useState('');
  const [subAdding, setSubAdding] = useState(false);

  const fetchFAClassrooms = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/classes/me?userId=${user.id}&activeRole=fa`);
      const data = await response.json();
      if (response.ok && data.length > 0) {
        const primaryClass = data[0];
        setMyClass(primaryClass);
        
        // Fetch roster
        const rosterRes = await fetch(`/api/classes/${primaryClass.id}/roster`);
        const rosterData = await rosterRes.json();
        if (rosterRes.ok) {
          setRoster(rosterData.roster);
        }

        // Fetch subjects
        const subjectsRes = await fetch(`/api/classes/${primaryClass.id}/subjects`);
        const subjectsData = await subjectsRes.json();
        if (subjectsRes.ok) {
          setSubjects(subjectsData);
        }

        // Fetch Attendance Summary Matrix
        const matrixRes = await fetch(`/api/classes/${primaryClass.id}/attendance-summary`);
        const matrixData = await matrixRes.json();
        if (matrixRes.ok) {
          setAttendanceSummary(matrixData);
        }
      } else {
        setMyClass(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableTeachers = async () => {
    try {
      const response = await fetch('/api/faculty/teachers');
      const data = await response.json();
      if (response.ok) {
        setTeachers(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchFAClassrooms();
    fetchAvailableTeachers();
  }, [user.id]);

  const handleDownloadTemplate = () => {
    playSound('click');
    window.open('/api/excel/template', '_blank');
    triggerNotification('Excel template downloading...', 'info');
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !myClass) return;
    playSound('click');
    setUploadLoading(true);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const rawResult = event.target?.result as string;
        const base64 = rawResult.split(',')[1];

        const response = await fetch('/api/classes/import-excel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileBase64: base64,
            classId: myClass.id
          })
        });

        const data = await response.json();
        if (response.ok) {
          setImportReport({
            imported: data.imported,
            skipped: data.skipped,
            conflicts: data.conflicts
          });
          playSound('success');
          triggerNotification(`Excel processing completed. Imported: ${data.imported}`, 'success');
          fetchFAClassrooms(); // refresh
        } else {
          throw new Error(data.error);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      playSound('beep');
      triggerNotification(err.message || 'Failed to process Excel spreadsheet', 'error');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleManualAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim() || !manualRegNo.trim() || !myClass) return;
    playSound('click');

    try {
      const response = await fetch('/api/classes/manual-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: myClass.id,
          name: manualName.trim(),
          regNo: manualRegNo.trim(),
          email: manualEmail.trim()
        })
      });

      const data = await response.json();
      if (response.ok) {
        playSound('success');
        triggerNotification(`Student ${manualName} added successfully!`, 'success');
        setManualName('');
        setManualRegNo('');
        setManualEmail('');
        setShowAddForm(false);
        fetchFAClassrooms();
      } else if (response.status === 409) {
        // Conflict detected
        playSound('beep');
        setImportReport({
          imported: 0,
          skipped: 0,
          conflicts: [data.student]
        });
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      playSound('beep');
      triggerNotification(err.message || 'Failed to add student manually', 'error');
    }
  };

  const handleAssignTeacher = async (subjectId: number, teacherId: number) => {
    playSound('click');
    try {
      const response = await fetch('/api/subjects/assign-teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId, teacherId })
      });

      if (response.ok) {
        playSound('success');
        triggerNotification('Subject teacher updated successfully!', 'success');
        fetchFAClassrooms();
      }
    } catch (e) {
      triggerNotification('Failed to assign teacher', 'error');
    }
  };

  const matchedTeacher = teachers.find(
    (t) => t.username?.toLowerCase() === assignTeacherUsername.trim().toLowerCase()
  );

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubName.trim() || !myClass) return;
    if (!matchedTeacher) {
      playSound('beep');
      triggerNotification('Please type a valid teacher username first.', 'error');
      return;
    }
    playSound('click');
    setSubAdding(true);

    try {
      const response = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSubName.trim(),
          classId: myClass.id,
          teacherId: matchedTeacher.id
        })
      });

      const data = await response.json();
      if (response.ok) {
        playSound('success');
        triggerNotification(`Subject "${newSubName}" created and assigned!`, 'success');
        setNewSubName('');
        setAssignTeacherUsername('');
        fetchFAClassrooms();
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      playSound('beep');
      triggerNotification(err.message || 'Failed to add subject', 'error');
    } finally {
      setSubAdding(false);
    }
  };

  const handleClassTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferUsername.trim() || !myClass) return;
    playSound('click');
    setTransferLoading(true);

    try {
      const response = await fetch(`/api/classes/${myClass.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newFaUsername: transferUsername.trim(),
          currentFaId: user.id
        })
      });

      const data = await response.json();
      if (response.ok) {
        playSound('success');
        triggerNotification(`Classroom responsibility transferred to ${transferUsername}!`, 'success');
        setTransferUsername('');
        // Reload dashboard
        fetchFAClassrooms();
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      playSound('beep');
      triggerNotification(err.message || 'Responsibility transfer failed', 'error');
    } finally {
      setTransferLoading(false);
    }
  };

  const getOverallColor = (rate: number) => {
    if (rate >= 75) return 'text-emerald-400';
    if (rate >= 60) return 'text-amber-400';
    return 'text-rose-400';
  };

  return (
    <div id="fa-dashboard" className="flex-1 h-full overflow-y-auto flex flex-col bg-white text-[#1f1f1f] p-5 max-w-[390px] mx-auto pb-6 animate-fadeIn">
      
      {/* Roster classroom summary banner */}
      <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-5 shadow-sm relative overflow-hidden group">
        <div className="flex justify-between items-center relative z-10">
          <div>
            <span className="text-[9px] font-mono font-bold text-[#1a73e8] uppercase tracking-widest block">Classroom Advisor</span>
            <h2 className="text-base font-bold text-[#202124] mt-1 font-sans tracking-tight">
              {myClass ? `Class: ${myClass.name}` : "No Class Assigned"}
            </h2>
            <p className="text-[10px] text-[#5f6368] font-mono mt-1 flex items-center gap-1.5">
              <span>{myClass ? `${myClass.department}` : `advisor: ${user.name}`}</span>
              {myClass && (
                <>
                  <span className="text-[#dadce0]">•</span>
                  <span>Semester {myClass.semester}</span>
                </>
              )}
            </p>
          </div>
          <div className="w-11 h-11 rounded-full bg-[#1a73e8]/10 text-[#1a73e8] flex items-center justify-center font-bold text-sm border border-[#1a73e8]/20 shadow-sm relative z-10">
            {myClass ? myClass.name : "FA"}
          </div>
        </div>

        {/* Action tabs */}
        <div className="grid grid-cols-3 bg-[#e8eaed] p-1 rounded-xl mt-5 text-[10px] font-bold text-center relative z-10">
          <button
            onClick={() => { setActiveTab('roster'); playSound('click'); }}
            className={`py-2 rounded-lg transition-all duration-200 cursor-pointer ${
              activeTab === 'roster' 
                ? 'bg-white text-[#1a73e8] shadow-sm' 
                : 'text-[#5f6368] hover:text-[#202124]'
            }`}
          >
            My Class
          </button>
          <button
            onClick={() => { setActiveTab('live'); playSound('click'); }}
            className={`py-2 rounded-lg transition-all duration-200 cursor-pointer ${
              activeTab === 'live' 
                ? 'bg-white text-[#1a73e8] shadow-sm' 
                : 'text-[#5f6368] hover:text-[#202124]'
            }`}
          >
            Live Logs
          </button>
          <button
            onClick={() => { setActiveTab('settings'); playSound('click'); }}
            className={`py-2 rounded-lg transition-all duration-200 cursor-pointer ${
              activeTab === 'settings' 
                ? 'bg-white text-[#1a73e8] shadow-sm' 
                : 'text-[#5f6368] hover:text-[#202124]'
            }`}
          >
            Settings
          </button>
        </div>
      </div>

      {/* 1. Tab: My Classroom Roster */}
      {activeTab === 'roster' && (
        <div className="flex flex-col gap-4 mt-4">
          
          {/* Action buttons list */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleDownloadTemplate}
              className="bg-white hover:bg-[#f8f9fa] border border-[#dadce0] rounded-xl p-3 flex flex-col items-center justify-center text-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Download className="w-4 h-4 text-[#1a73e8]" />
              <span className="text-[10px] font-bold text-[#202124]">XLSX Template</span>
            </button>

            <label className="bg-white hover:bg-[#f8f9fa] border border-[#dadce0] rounded-xl p-3 flex flex-col items-center justify-center text-center gap-1.5 cursor-pointer shadow-sm">
              <Upload className="w-4 h-4 text-[#1a73e8]" />
              <span className="text-[10px] font-bold text-[#202124]">Import Students</span>
              <input
                type="file"
                accept=".xlsx"
                onChange={handleExcelUpload}
                className="hidden"
                disabled={uploadLoading}
              />
            </label>
          </div>

          {/* Manual Add Trigger */}
          <button
            onClick={() => { playSound('click'); setShowAddForm(!showAddForm); }}
            className="w-full bg-[#f1f3f4] border border-[#dadce0] hover:bg-[#e8eaed] text-[#3c4043] font-bold text-xs py-2.5 rounded-full flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-sm"
          >
            <UserPlus className="w-4 h-4 text-[#1a73e8]" />
            <span>{showAddForm ? 'Hide Add Form' : 'Manual Add Student'}</span>
          </button>

          {/* Manual Student Addition Form */}
          {showAddForm && (
            <form onSubmit={handleManualAddStudent} className="bg-[#f8f9fa] border border-[#dadce0] rounded-xl p-4 flex flex-col gap-3 shadow-sm">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-bold text-[#5f6368] uppercase tracking-wider">Full Student Name</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pranav Sridhar"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="w-full bg-white border border-[#dadce0] rounded-lg py-2 px-3 text-xs text-[#202124] focus:outline-none focus:border-[#1a73e8]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-bold text-[#5f6368] uppercase tracking-wider">Register Number</span>
                  <input
                    type="text"
                    required
                    placeholder="RA2311027020006"
                    value={manualRegNo}
                    onChange={(e) => setManualRegNo(e.target.value)}
                    className="w-full bg-white border border-[#dadce0] rounded-lg py-2 px-3 text-xs text-[#202124] font-mono focus:outline-none focus:border-[#1a73e8]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-bold text-[#5f6368] uppercase tracking-wider">Email (Optional)</span>
                  <input
                    type="email"
                    placeholder="name@srmist.edu.in"
                    value={manualEmail}
                    onChange={(e) => setManualEmail(e.target.value)}
                    className="w-full bg-white border border-[#dadce0] rounded-lg py-2 px-3 text-xs text-[#202124] focus:outline-none focus:border-[#1a73e8]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-[#1a73e8] hover:bg-[#1557b0] text-white font-bold text-xs py-2 rounded-lg transition-all cursor-pointer"
              >
                Add Student Profile
              </button>
            </form>
          )}

          {/* Teacher Assignments list */}
          <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
            <span className="text-[10px] font-bold text-[#5f6368] uppercase tracking-wider">Assign Subject Teachers</span>
            
            {/* Create New Subject Form */}
            <form onSubmit={handleAddSubject} className="bg-white p-4 rounded-xl border border-[#dadce0] flex flex-col gap-3">
              <span className="text-[9px] font-bold text-[#1a73e8] uppercase tracking-wider block">Add New Course Subject</span>
              
              <div className="flex flex-col gap-1">
                <span className="text-[8px] font-bold text-[#5f6368] uppercase tracking-wider">Subject Name</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mathematics"
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  className="w-full bg-white border border-[#dadce0] rounded-lg py-1.5 px-3 text-xs text-[#202124] focus:outline-none focus:border-[#1a73e8]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[8px] font-bold text-[#5f6368] uppercase tracking-wider">Assign Teacher (Type Username)</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. priya, rajesh"
                  value={assignTeacherUsername}
                  onChange={(e) => setAssignTeacherUsername(e.target.value)}
                  className="w-full bg-white border border-[#dadce0] rounded-lg py-1.5 px-3 text-xs text-[#202124] font-mono focus:outline-none focus:border-[#1a73e8]"
                />
                
                {/* Confirmation Box */}
                {assignTeacherUsername.trim() !== '' && (
                  <div className="mt-1">
                    {matchedTeacher ? (
                      <div className="text-[10px] font-bold text-[#137333] bg-[#e6f4ea] p-2 rounded-lg border border-[#34a853]/20 flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 text-[#137333] shrink-0" />
                        <span>Confirmed: {matchedTeacher.name}</span>
                      </div>
                    ) : (
                      <div className="text-[9px] font-bold text-[#b06000] bg-[#fef7e0] p-2 rounded-lg border border-[#fbbc05]/20 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-[#b06000] shrink-0" />
                        <span>No faculty matches "{assignTeacherUsername}"</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={subAdding || !matchedTeacher || !newSubName.trim()}
                className="w-full bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs py-2 rounded-lg transition-all cursor-pointer mt-1"
              >
                {subAdding ? 'Creating...' : 'Add Subject'}
              </button>
            </form>

            {subjects.length > 0 && (
              <>
                <div className="border-t border-[#dadce0] my-1"></div>
                <span className="text-[9px] font-bold text-[#5f6368] uppercase tracking-wider block">Active Subjects & Teachers</span>
                
                <div className="flex flex-col gap-2">
                  {subjects.map((sub) => (
                    <div key={sub.id} className="bg-white p-3 rounded-xl border border-[#dadce0] flex flex-col gap-2">
                      <div className="flex justify-between items-start min-w-0">
                        <span className="text-[10px] font-bold text-[#202124] truncate max-w-[150px]">{sub.name}</span>
                        <span className="text-[9px] font-mono text-[#5f6368]">Taught by: {sub.teacherName || "Unassigned"}</span>
                      </div>
                      <div className="relative">
                        <select
                           value={sub.teacher_id || ''}
                           onChange={(e) => handleAssignTeacher(sub.id, parseInt(e.target.value))}
                           className="w-full bg-[#f8f9fa] border border-[#dadce0] text-[#202124] text-[10px] py-1.5 px-2 rounded-lg focus:outline-none cursor-pointer"
                        >
                          <option value="">-- Reassign Staff Teacher --</option>
                          {teachers.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Roster Listing */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold text-[#5f6368] uppercase tracking-wider pl-1">Enrolled Students ({roster.length})</span>
            
            {roster.map((st) => (
              <div key={st.id} className="bg-white border border-[#dadce0] hover:border-[#1a73e8]/30 rounded-xl p-3 flex justify-between items-center transition-all duration-200 group shadow-sm">
                <div>
                  <h4 className="text-xs font-bold text-[#202124] group-hover:text-[#1a73e8] transition-colors font-sans tracking-tight">{st.name}</h4>
                  <p className="text-[9px] font-mono text-[#5f6368] mt-1 bg-[#f1f3f4] px-2 py-0.5 rounded border border-[#dadce0] inline-block">{st.regNo}</p>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[9px] font-mono font-bold text-[#1a73e8] bg-[#1a73e8]/10 border border-[#1a73e8]/20 px-2.5 py-1 rounded-full">
                    Row {Math.ceil(st.seat / 6)} • Seat S{st.seat}
                  </span>
                </div>
              </div>
            ))}
          </div>

        </div>
      )}

      {/* 2. Tab: Live Logs Summary Matrix */}
      {activeTab === 'live' && (
        <div className="flex flex-col gap-4 mt-4">
          <span className="text-[10px] font-bold text-[#5f6368] uppercase tracking-wider pl-1">Ongoing Academic Stats</span>

          {!attendanceSummary ? (
            <div className="p-12 text-center text-[#5f6368] text-xs animate-pulse">
              Aggregating course logs...
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {attendanceSummary.summary.map((st) => (
                <div key={st.id} className="bg-white border border-[#dadce0] rounded-xl p-4 flex flex-col gap-3 shadow-sm">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-bold text-[#202124] font-sans tracking-tight">{st.name}</h4>
                      <p className="text-[9px] font-mono text-[#5f6368] mt-1 bg-[#f1f3f4] px-2 py-0.5 rounded border border-[#dadce0] inline-block">{st.regNo}</p>
                    </div>

                    <span className={`text-[10px] font-extrabold px-3 py-1 rounded-full border ${
                      st.averageRate >= 75
                        ? 'text-[#137333] bg-[#e6f4ea] border-[#34a853]/20'
                        : 'text-[#c5221f] bg-[#fce8e6] border-[#d93025]/20'
                    }`}>
                      {st.averageRate}% Average
                    </span>
                  </div>

                  <div className="bg-[#f8f9fa] p-3 rounded-xl border border-[#dadce0] flex flex-col gap-2 text-[10px]">
                    {attendanceSummary.subjects.map((sub) => {
                      const subjRate = st.rates[sub.id] ?? 100;
                      return (
                        <div key={sub.id} className="flex justify-between items-center text-[#202124]">
                          <span className="truncate max-w-[180px] font-medium">{sub.name}</span>
                          <span className={`font-mono font-bold ${
                            subjRate >= 75 ? 'text-[#137333]' : subjRate >= 60 ? 'text-[#b06000]' : 'text-[#c5221f]'
                          }`}>{subjRate}%</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Detailed Attendance History & Overrides */}
                  <div className="pt-2 border-t border-[#dadce0]/50 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        playSound('click');
                        setExpandedStudentId(expandedStudentId === st.id ? null : st.id);
                      }}
                      className="w-full bg-[#f1f3f4] hover:bg-[#e8eaed] text-xs font-bold text-[#1a73e8] py-1.5 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all"
                    >
                      <List className="w-3.5 h-3.5" />
                      <span>{expandedStudentId === st.id ? 'Hide Detailed Log History' : 'View Detailed Log History'}</span>
                    </button>

                    {expandedStudentId === st.id && (
                      <div className="mt-3 flex flex-col gap-2 border-t border-[#dadce0]/30 pt-3 max-h-[160px] overflow-y-auto pr-1">
                        {!(st as any).detailedRecords || (st as any).detailedRecords.length === 0 ? (
                          <p className="text-[9px] text-[#5f6368] text-center italic py-2">No finalized attendance records yet.</p>
                        ) : (
                          (st as any).detailedRecords.map((rec: any) => (
                            <div key={rec.id} className="bg-white border border-[#dadce0] rounded-lg p-2.5 flex flex-col gap-1.5 text-[9px] leading-normal">
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-[#202124]">{rec.subjectName}</span>
                                <span className="text-gray-400">{rec.date}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-gray-500 font-mono">
                                  Marked: {rec.marked_at ? new Date(rec.marked_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'N/A'}
                                </span>
                                <span className={`font-extrabold px-2 py-0.5 rounded-full border text-[8px] uppercase ${
                                  rec.status === 'present'
                                    ? 'text-[#137333] bg-[#e6f4ea] border-[#34a853]/20'
                                    : rec.status === 'late'
                                    ? 'text-[#b06000] bg-[#fef7e0] border-[#fbbc05]/20'
                                    : 'text-[#c5221f] bg-[#fce8e6] border-[#d93025]/20'
                                }`}>
                                  {rec.status}
                                </span>
                              </div>
                              {rec.override_reason && (
                                <div className="bg-[#f8f9fa] border border-[#dadce0] px-2 py-1 rounded text-[#5f6368] flex items-start gap-1">
                                  <FileText className="w-3 h-3 text-[#1a73e8] shrink-0 mt-0.5" />
                                  <span><strong>Override Reason:</strong> "{rec.override_reason}"</span>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. Tab: Settings & Profile Details */}
      {activeTab === 'settings' && (
        <div className="flex flex-col gap-4 mt-4">
          
          {/* Profile Overview */}
          <div className="bg-white border border-[#dadce0] rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
            <span className="text-[10px] font-bold text-[#5f6368] uppercase tracking-wider pl-1">Faculty Profile</span>
            <div className="flex items-center gap-3 bg-[#f8f9fa] p-3 rounded-xl border border-[#dadce0]">
              <User className="w-5 h-5 text-[#1a73e8]" />
              <div>
                <span className="text-xs font-bold text-[#202124] block">{user.name}</span>
                <p className="text-[9px] text-[#5f6368] font-mono mt-0.5">{user.email}</p>
              </div>
            </div>

            {/* Role switcher inside Profile drawer/section */}
            <div className="pt-3 border-t border-[#dadce0]">
              <span className="text-[9px] font-bold text-[#5f6368] uppercase tracking-wider block mb-2">Role Switcher Access</span>
              {user.role === 'both' ? (
                <div className="grid grid-cols-2 bg-[#f1f3f4] p-1 rounded-xl border border-[#dadce0]">
                  <button
                    onClick={() => { playSound('click'); onRoleSwitch('fa'); }}
                    className="py-1.5 text-[10px] font-bold rounded-lg bg-white text-[#1a73e8] shadow-sm cursor-pointer"
                  >
                    Advisor (FA)
                  </button>
                  <button
                    onClick={() => { playSound('click'); onRoleSwitch('teacher'); }}
                    className="py-1.5 text-[10px] font-bold rounded-lg text-[#5f6368] hover:text-[#202124] cursor-pointer"
                  >
                    Subject Teacher
                  </button>
                </div>
              ) : (
                <div className="bg-[#f8f9fa] p-2.5 rounded-xl border border-[#dadce0] text-[10px] text-[#5f6368] text-center">
                  Only one role assigned to this staff account ({user.role.toUpperCase()})
                </div>
              )}
            </div>
          </div>

          {/* Responsibility Classroom Transfer */}
          <form onSubmit={handleClassTransfer} className="bg-white border border-[#dadce0] rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
            <span className="text-[10px] font-bold text-[#5f6368] uppercase tracking-wider pl-1">Classroom Ownership Transfer</span>
            <p className="text-[10px] text-[#5f6368] leading-normal">
              Transfer this classroom and all enrolled student roster details to another Faculty Advisor.
            </p>

            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-bold text-[#5f6368] uppercase tracking-wider">New Advisor Username</span>
              <input
                type="text"
                required
                placeholder="e.g. rajesh"
                value={transferUsername}
                onChange={(e) => setTransferUsername(e.target.value)}
                className="w-full bg-white border border-[#dadce0] rounded-lg py-2 px-3 text-xs text-[#202124] focus:outline-none focus:border-[#1a73e8]"
              />
            </div>

            <button
              type="submit"
              disabled={transferLoading}
              className="w-full bg-[#fce8e6] border border-[#d93025]/20 text-[#c5221f] font-bold text-xs py-2 rounded-lg hover:bg-[#f9d2ce] transition-all cursor-pointer"
            >
              {transferLoading ? 'Processing Transfer...' : 'Execute Responsibility Transfer'}
            </button>
          </form>

        </div>
      )}

      {/* Conflict / Summary report modal */}
      {importReport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-[340px] bg-white border border-[#dadce0] rounded-2xl p-5 shadow-xl flex flex-col gap-4 max-h-[80vh] overflow-y-auto animate-scale-up">
            
            <div className="flex justify-between items-center pb-3 border-b border-[#dadce0]">
              <h4 className="text-xs font-black tracking-wider text-[#202124] uppercase">Spreadsheet Report</h4>
              <button
                onClick={() => setImportReport(null)}
                className="text-[11px] font-bold text-[#1a73e8] cursor-pointer"
              >
                Dismiss
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center text-[10px] font-mono">
              <div className="bg-[#f8f9fa] p-2 rounded-xl border border-[#dadce0]">
                <span className="text-[#5f6368] uppercase block font-bold">Imported</span>
                <span className="text-sm font-black text-[#137333] block mt-0.5">{importReport.imported}</span>
              </div>
              <div className="bg-[#f8f9fa] p-2 rounded-xl border border-[#dadce0]">
                <span className="text-[#5f6368] uppercase block font-bold">Skipped</span>
                <span className="text-sm font-black text-[#202124] block mt-0.5">{importReport.skipped}</span>
              </div>
            </div>

            {importReport.conflicts.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-1.5 items-center text-[#c5221f] bg-[#fce8e6] border border-[#d93025]/20 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Conflict Warning (Enrolled Elsewhere)</span>
                </div>

                <div className="flex flex-col gap-2">
                  {importReport.conflicts.map((conf, index) => (
                    <div key={index} className="bg-[#f8f9fa] p-3 rounded-lg border border-[#dadce0] text-[10px] leading-relaxed text-[#5f6368]">
                      <strong className="text-[#202124] block">{conf.name} ({conf.reg_no})</strong>
                      <div className="mt-1 space-y-0.5">
                        <p>Class: <strong className="text-[#c5221f]">{conf.other_class}</strong></p>
                        <p>Advisor: <strong>{conf.other_fa}</strong></p>
                        <p className="font-mono text-[9px] text-[#5f6368]">{conf.other_fa_contact}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
