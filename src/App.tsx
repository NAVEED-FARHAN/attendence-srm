import React, { useState, useEffect } from 'react';
import { Shield, Volume2, VolumeX, AlertCircle, CheckCircle, Info, LogOut } from 'lucide-react';
import { User as UserType } from './types';
import Login from './components/Login';
import StudentDashboard from './components/StudentDashboard';
import TeacherDashboard from './components/TeacherDashboard';
import FADashboard from './components/FADashboard';
import { initCamera } from './lib/camera';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserType | null>(() => {
    const saved = localStorage.getItem('srm_current_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('srm_sound_enabled');
    return saved ? JSON.parse(saved) : true;
  });

  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'info' | 'error';
  } | null>(null);

  // Initialize camera on app load - ask for permission once, store deviceId globally
  // This prevents the 'choose camera' conflict popup later
  useEffect(() => {
    initCamera('environment').then(({ deviceId }) => {
      console.log('[App] Camera initialized on app load, deviceId:', deviceId);
    }).catch((err) => {
      console.warn('[App] Camera init on load deferred:', err.message);
      // Not critical - camera will be initialized on first use if needed
    });
  }, []);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('srm_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('srm_current_user');
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('srm_sound_enabled', JSON.stringify(soundEnabled));
  }, [soundEnabled]);

  const triggerNotification = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  // Audio Synthesizer Engine
  const playSound = (type: 'beep' | 'success' | 'click' | 'reset' | 'scan_progress') => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'beep') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else if (type === 'scan_progress') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      } else if (type === 'success') {
        const osc2 = ctx.createOscillator();
        const osc3 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        const gain3 = ctx.createGain();

        osc2.connect(gain2); gain2.connect(ctx.destination);
        osc3.connect(gain3); gain3.connect(ctx.destination);

        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08); // E5
        osc3.frequency.setValueAtTime(783.99, ctx.currentTime + 0.16); // G5

        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

        gain2.gain.setValueAtTime(0.08, ctx.currentTime + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

        gain3.gain.setValueAtTime(0.08, ctx.currentTime + 0.16);
        gain3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

        osc.start(); osc.stop(ctx.currentTime + 0.5);
        osc2.start(); osc2.stop(ctx.currentTime + 0.5);
        osc3.start(); osc3.stop(ctx.currentTime + 0.6);
      } else if (type === 'click') {
        osc.frequency.setValueAtTime(1000, ctx.currentTime);
        gain.gain.setValueAtTime(0.03, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
        osc.start();
        osc.stop(ctx.currentTime + 0.04);
      } else if (type === 'reset') {
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch (e) {
      console.warn("Audio blocked:", e);
    }
  };

  const handleRoleSwitch = (newRole: 'teacher' | 'fa') => {
    if (!currentUser) return;
    setCurrentUser({
      ...currentUser,
      activeRole: newRole
    });
    triggerNotification(`Switched role to: ${newRole === 'fa' ? 'Faculty Advisor' : 'Subject Teacher'}`, 'info');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    triggerNotification('Logged out successfully', 'info');
  };

  return (
    <div className="bg-[#f0f4f9] text-[#1f1f1f] h-screen font-sans flex flex-col overflow-hidden">
      
      {/* Top Universal Navbar (Compact & Slick - Google Style) */}
      <header className="border-b border-[#dadce0] bg-[#ffffff]/90 backdrop-blur-md sticky top-0 z-40 max-w-[390px] w-full mx-auto px-5 py-3.5 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#1a73e8]/10 flex items-center justify-center text-[#1a73e8] shadow-sm">
            <Shield className="w-4.5 h-4.5" />
          </div>
          <span className="text-sm font-bold tracking-tight text-[#202124]">SRM Portal</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Audio toggle */}
          <button
            onClick={() => {
              const nextVal = !soundEnabled;
              setSoundEnabled(nextVal);
              if (nextVal) setTimeout(() => playSound('click'), 100);
            }}
            className="p-2 rounded-full bg-[#f1f3f4] hover:bg-[#e8eaed] text-[#5f6368] hover:text-[#1f1f1f] transition-all cursor-pointer"
            title="Toggle Synthesizer Audio"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Quick exit if logged in */}
          {currentUser && (
            <button
              onClick={handleLogout}
              className="p-2 rounded-full bg-[#fce8e6] hover:bg-[#fad2cf] text-[#d93025] transition-all cursor-pointer"
              title="Logout Session"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Persistent "Senseless" Mode Switcher for Dual-Role Faculty */}
      {currentUser && (currentUser.role === 'both' || currentUser.role === 'fa' || currentUser.role === 'teacher') && (
        <div className="max-w-[390px] w-full mx-auto px-5 py-2.5 bg-[#ffffff] border-b border-[#dadce0] flex items-center justify-between gap-3 animate-fade-in shrink-0 shadow-sm">
          <span className="text-[11px] font-bold text-[#5f6368] uppercase tracking-wider shrink-0">
            Active Role:
          </span>
          <div className="grid grid-cols-2 bg-[#f1f3f4] p-1 rounded-full border border-[#dadce0] w-[240px]">
            <button
              onClick={() => handleRoleSwitch('fa')}
              className={`py-1.5 text-[10px] font-bold rounded-full transition-all duration-200 cursor-pointer text-center ${
                currentUser.activeRole === 'fa'
                  ? 'bg-[#1a73e8] text-white font-bold shadow-sm'
                  : 'text-[#5f6368] hover:text-[#1f1f1f]'
              }`}
            >
              Advisor (FA)
            </button>
            <button
              onClick={() => handleRoleSwitch('teacher')}
              className={`py-1.5 text-[10px] font-bold rounded-full transition-all duration-200 cursor-pointer text-center ${
                currentUser.activeRole === 'teacher'
                  ? 'bg-[#1a73e8] text-white font-bold shadow-sm'
                  : 'text-[#5f6368] hover:text-[#1f1f1f]'
              }`}
            >
              Teacher
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area View Handler */}
      <main className="flex-1 w-full max-w-[390px] mx-auto bg-[#ffffff] flex flex-col overflow-hidden shadow-lg border-x border-[#dadce0]/60">
        {!currentUser ? (
          <Login onLoginSuccess={setCurrentUser} playSound={playSound} />
        ) : currentUser.activeRole === 'student' ? (
          <StudentDashboard
            user={currentUser}
            onLogout={handleLogout}
            playSound={playSound}
            triggerNotification={triggerNotification}
          />
        ) : currentUser.activeRole === 'teacher' ? (
          <TeacherDashboard
            user={currentUser}
            playSound={playSound}
            triggerNotification={triggerNotification}
          />
        ) : (
          <FADashboard
            user={currentUser}
            playSound={playSound}
            triggerNotification={triggerNotification}
            onRoleSwitch={handleRoleSwitch}
          />
        )}
      </main>

      {/* Notification Banner */}
      {notification && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-[350px] px-4 animate-scale-up">
          <div className={`p-4 rounded-2xl border flex gap-3 shadow-2xl items-center ${
            notification.type === 'success'
              ? 'bg-[#e6f4ea] border-[#34a853]/20 text-[#137333]'
              : notification.type === 'error'
              ? 'bg-[#fce8e6] border-[#d93025]/20 text-[#c5221f]'
              : 'bg-[#e8f0fe] border-[#1a73e8]/20 text-[#174ea6]'
          }`}>
            {notification.type === 'success' && <CheckCircle className="w-4 h-4 text-[#34a853] shrink-0" />}
            {notification.type === 'error' && <AlertCircle className="w-4 h-4 text-[#d93025] shrink-0" />}
            {notification.type === 'info' && <Info className="w-4 h-4 text-[#1a73e8] shrink-0" />}
            <p className="text-xs leading-snug font-semibold">{notification.message}</p>
          </div>
        </div>
      )}


    </div>
  );
}
