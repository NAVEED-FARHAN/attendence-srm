import React, { useState } from 'react';
import { Shield, User, BookOpen, Key, AlertTriangle } from 'lucide-react';
import { User as UserType } from '../types';

interface LoginProps {
  onLoginSuccess: (user: UserType & { activeRole: 'student' | 'teacher' | 'fa' }) => void;
  playSound: (type: 'beep' | 'success' | 'click' | 'reset') => void;
}

export default function Login({ onLoginSuccess, playSound }: LoginProps) {
  const [activeTab, setActiveTab] = useState<'student' | 'professor'>('student');
  const [studentName, setStudentName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [profRoleChoice, setProfRoleChoice] = useState<'teacher' | 'fa'>('teacher');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) {
      setError('Please enter your full name');
      return;
    }
    setError(null);
    setLoading(true);
    playSound('click');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentName }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      playSound('success');
      onLoginSuccess(data.user);
    } catch (err: any) {
      playSound('beep');
      setError(err.message || 'Verification failed. Try: Arun Kumar, Bhavya S, Chethan R');
    } finally {
      setLoading(false);
    }
  };

  const handleProfessorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please provide username and password credentials');
      return;
    }
    setError(null);
    setLoading(true);
    playSound('click');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
          roleChoice: profRoleChoice
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      playSound('success');
      onLoginSuccess({
        ...data.user,
        activeRole: profRoleChoice
      });
    } catch (err: any) {
      playSound('beep');
      setError(err.message || 'Credentials invalid. Try: rajesh / pass123, krishna_fa / pass123');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-screen" className="flex-1 flex flex-col justify-center items-center p-6 bg-[#f0f4f9] text-[#1f1f1f] h-full overflow-y-auto relative">
      {/* Google-like subtle decorative ambient light blue/teal blobs */}
      <div className="absolute top-10 left-10 w-64 h-64 bg-[#1a73e8]/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-[#34a853]/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-[370px] bg-white border border-[#dadce0] rounded-3xl p-7 shadow-xl flex flex-col gap-6 animate-fadeIn relative z-10">
        
        {/* Brand Header */}
        <div className="text-center flex flex-col items-center gap-3">
          <div className="w-12 h-12 bg-[#1a73e8]/10 text-[#1a73e8] rounded-full flex items-center justify-center shadow-sm">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-[#202124] font-sans">SRM University</h1>
            <p className="text-[10px] text-[#5f6368] tracking-widest font-bold uppercase mt-0.5">Smart Attendance Suite</p>
          </div>
        </div>

        {/* Tab Switcher - Rounded Material Pill */}
        <div className="grid grid-cols-2 bg-[#f1f3f4] p-1 rounded-full border border-[#dadce0]/80">
          <button
            type="button"
            onClick={() => { setActiveTab('student'); setError(null); playSound('click'); }}
            className={`py-2 text-[11px] font-bold rounded-full transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'student'
                ? 'bg-[#1a73e8] text-white shadow-sm'
                : 'text-[#5f6368] hover:text-[#202124]'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Student Portal</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('professor'); setError(null); playSound('click'); }}
            className={`py-2 text-[11px] font-bold rounded-full transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'professor'
                ? 'bg-[#1a73e8] text-white shadow-sm'
                : 'text-[#5f6368] hover:text-[#202124]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Faculty Portal</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex gap-2.5 p-3 rounded-xl bg-[#fce8e6] border border-[#d93025]/20 text-[#c5221f] animate-fadeIn">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-tight text-xs font-medium">{error}</p>
          </div>
        )}

        {/* Student Mode Form */}
        {activeTab === 'student' && (
          <form onSubmit={handleStudentLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-[#5f6368] tracking-wider pl-1">
                Full Student Name
              </label>
              <div className="relative">
                <input
                  id="student-name-input"
                  type="text"
                  required
                  placeholder="e.g. Arun Kumar"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="w-full bg-[#f8f9fa] border border-[#dadce0] rounded-xl py-3 pl-3.5 pr-10 text-xs text-[#202124] placeholder-[#80868b] focus:outline-none focus:border-[#1a73e8] focus:bg-white transition-all duration-200"
                />
                <User className="absolute right-3.5 top-3.5 w-4 h-4 text-[#5f6368]" />
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {['Arun Kumar', 'Bhavya S', 'Chethan R'].map(name => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setStudentName(name);
                      playSound('click');
                    }}
                    className="px-3 py-1 text-[10px] font-medium bg-[#f1f3f4] border border-[#dadce0] rounded-full text-[#3c4043] hover:bg-[#e8eaed] hover:border-[#5f6368]/30 transition-all cursor-pointer duration-200"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <button
              id="student-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full bg-[#1a73e8] hover:bg-[#1557b0] text-white font-bold text-xs py-3 rounded-full transition-all mt-2 active:scale-98 shadow-md hover:shadow-lg flex items-center justify-center gap-1.5 cursor-pointer duration-200"
            >
              {loading ? "Verifying..." : "Verify & Access Portal"}
            </button>
          </form>
        )}

        {/* Professor Mode Form */}
        {activeTab === 'professor' && (
          <form onSubmit={handleProfessorLogin} className="flex flex-col gap-4">
            {/* Preferred Role Toggle */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-[#5f6368] tracking-wider pl-1">
                Immediate Entry Role
              </label>
              <div className="grid grid-cols-2 bg-[#f1f3f4] p-1 rounded-full border border-[#dadce0]/80">
                <button
                  type="button"
                  onClick={() => { setProfRoleChoice('teacher'); playSound('click'); }}
                  className={`py-1.5 text-[10px] font-bold rounded-full transition-all cursor-pointer ${
                    profRoleChoice === 'teacher'
                      ? 'bg-white text-[#1a73e8] shadow-sm'
                      : 'text-[#5f6368]'
                  }`}
                >
                  Subject Teacher
                </button>
                <button
                  type="button"
                  onClick={() => { setProfRoleChoice('fa'); playSound('click'); }}
                  className={`py-1.5 text-[10px] font-bold rounded-full transition-all cursor-pointer ${
                    profRoleChoice === 'fa'
                      ? 'bg-white text-[#1a73e8] shadow-sm'
                      : 'text-[#5f6368]'
                  }`}
                >
                  Faculty Advisor
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase text-[#5f6368] tracking-wider pl-1">
                  Staff Username
                </label>
                <div className="relative">
                  <input
                    id="username-input"
                    type="text"
                    required
                    placeholder="e.g. rajesh"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dadce0] rounded-xl py-3 pl-3.5 pr-10 text-xs text-[#202124] placeholder-[#80868b] focus:outline-none focus:border-[#1a73e8] focus:bg-white transition-all duration-200"
                  />
                  <User className="absolute right-3.5 top-3.5 w-4 h-4 text-[#5f6368]" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase text-[#5f6368] tracking-wider pl-1">
                  Staff Password
                </label>
                <div className="relative">
                  <input
                    id="password-input"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dadce0] rounded-xl py-3 pl-3.5 pr-10 text-xs text-[#202124] placeholder-[#80868b] focus:outline-none focus:border-[#1a73e8] focus:bg-white transition-all duration-200"
                  />
                  <Key className="absolute right-3.5 top-3.5 w-4 h-4 text-[#5f6368]" />
                </div>
              </div>
            </div>

            <div className="bg-[#f8f9fa] p-3 rounded-2xl border border-[#dadce0] flex flex-col gap-2">
              <span className="text-[9px] font-mono font-bold text-[#5f6368] uppercase tracking-wider block">Autofill Demo Staff Credentials:</span>
              <div className="flex flex-col gap-1.5">
                {[
                  { u: 'rajesh', p: 'pass123', label: 'Advisor + Teacher (Dual)', r: 'fa' as const },
                  { u: 'krishna_fa', p: 'pass123', label: 'Faculty Advisor only', r: 'fa' as const },
                  { u: 'priya', p: 'pass123', label: 'Subject Teacher only', r: 'teacher' as const },
                ].map(item => (
                  <button
                    key={item.u}
                    type="button"
                    onClick={() => {
                      setUsername(item.u);
                      setPassword(item.p);
                      setProfRoleChoice(item.r);
                      playSound('click');
                    }}
                    className="w-full flex justify-between items-center text-left px-3 py-1.5 rounded-xl border border-[#dadce0] hover:border-[#1a73e8]/40 bg-white hover:bg-[#f1f3f4] text-[10.5px] text-[#3c4043] transition-all cursor-pointer duration-200 group"
                  >
                    <span className="font-mono text-[#1a73e8] font-bold group-hover:text-[#1557b0]">{item.u}</span>
                    <span className="text-[9px] text-[#5f6368] font-medium group-hover:text-[#202124]">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              id="professor-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full bg-[#1a73e8] hover:bg-[#1557b0] text-white font-bold text-xs py-3 rounded-full transition-all mt-2 active:scale-98 shadow-md hover:shadow-lg flex items-center justify-center gap-1.5 cursor-pointer duration-200"
            >
              {loading ? "Authenticating..." : "Login Staff"}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
