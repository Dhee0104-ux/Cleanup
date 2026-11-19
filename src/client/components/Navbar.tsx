import React, { useEffect, useState } from 'react';
import { User, UserRole } from '../types.js';
import { getSocket } from '../api.js';
import { Radio, LogOut, Compass, ShieldCheck, ChevronRight, Lock } from 'lucide-react';
import CONFIG from '../../config.js';

interface NavbarProps {
  user: User | null;
  currentPath: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ user, currentPath, onNavigate, onLogout }) => {
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => {
    const s = getSocket();
    setSocketConnected(s.connected);

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, []);

  const userLevel = user ? (CONFIG.HIERARCHY_LEVELS as any)[user.role] || 1 : 1;

  const getRoleBadge = (role?: UserRole) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return <span className="bg-purple-900/60 text-purple-300 border border-purple-700 text-xs px-2.5 py-0.5 rounded font-mono font-bold tracking-wide">LVL 5 • SUPER ADMIN</span>;
      case 'OPERATIONS_ADMIN':
        return <span className="bg-blue-900/60 text-blue-300 border border-blue-700 text-xs px-2.5 py-0.5 rounded font-mono font-bold tracking-wide">LVL 4 • OPS ADMIN</span>;
      case 'SUPERVISOR':
        return <span className="bg-amber-900/60 text-amber-300 border border-amber-700 text-xs px-2.5 py-0.5 rounded font-mono font-bold tracking-wide">LVL 3 • SUPERVISOR</span>;
      case 'HUB_OPERATOR':
        return <span className="bg-emerald-900/60 text-emerald-300 border border-emerald-700 text-xs px-2.5 py-0.5 rounded font-mono font-bold tracking-wide">LVL 2 • HUB OPERATOR</span>;
      case 'FIELD_WORKER':
        return <span className="bg-slate-800 text-slate-300 border border-slate-600 text-xs px-2.5 py-0.5 rounded font-mono font-bold tracking-wide">LVL 1 • FIELD WORKER</span>;
      default:
        return null;
    }
  };

  return (
    <header className="bg-[#14243A] text-white border-b border-[#2A4468] sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Operational Title */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => user && onNavigate((CONFIG.ROLE_ROUTES as any)[user.role])}>
            <div className="w-10 h-10 rounded bg-[#1E324F] border border-[#334B67] flex items-center justify-center text-amber-400 font-bold shadow-inner">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold tracking-tight text-white text-base sm:text-lg">
                  SMART HIGHWAY CLEANING WFM
                </span>
                <span className="hidden md:inline-block bg-[#1E324F] text-[#A0AEC0] text-[11px] font-mono px-2 py-0.5 rounded border border-[#334B67]">
                  NH-48 CORRIDOR
                </span>
              </div>
              <p className="text-xs text-[#A0AEC0] hidden sm:block">
                Strict Hierarchical Workforce Architecture & Dynamic QR Attendance
              </p>
            </div>
          </div>

          {/* Nav Controls */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Real-time Socket Indicator */}
            <div
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-mono border ${
                socketConnected
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400'
                  : 'bg-rose-950/60 border-rose-800 text-rose-400'
              }`}
              title={socketConnected ? 'Real-Time Sync Connected' : 'Reconnecting to live telemetry...'}
            >
              <Radio className={`w-3.5 h-3.5 ${socketConnected ? 'animate-pulse text-emerald-400' : 'text-rose-400'}`} />
              <span className="hidden md:inline">{socketConnected ? 'LIVE SYNC' : 'OFFLINE'}</span>
            </div>

            {/* Hierarchical Workspace Switcher (Superiors can inspect subordinate tiers, but subordinates cannot access superiors) */}
            {user && userLevel >= 3 && (
              <div className="relative group">
                <button
                  type="button"
                  className="flex items-center space-x-1.5 bg-[#1E324F] hover:bg-[#2A4468] text-white border border-[#334B67] text-xs px-2.5 py-1.5 rounded transition"
                >
                  <span className="text-[#A0AEC0]">Workspace:</span>
                  <span className="font-semibold text-amber-400 capitalize">{currentPath.replace('/', '')}</span>
                  <ChevronRight className="w-3 h-3 text-slate-400" />
                </button>
                <div className="absolute right-0 mt-1 w-56 bg-[#14243A] border border-[#334B67] rounded-lg shadow-2xl py-1.5 hidden group-hover:block z-50 text-xs">
                  <div className="px-3 py-1 text-[10px] text-[#A0AEC0] border-b border-[#2A4468] uppercase font-bold tracking-wider">
                    Permitted Hierarchy Workspaces
                  </div>

                  {/* Level 5: Super Admin */}
                  {userLevel >= 5 ? (
                    <button
                      onClick={() => onNavigate('/admin')}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-[#1E324F] ${
                        currentPath === '/admin' ? 'bg-[#1E324F] text-amber-400 font-bold' : 'text-slate-200'
                      }`}
                    >
                      <span>Command Center</span>
                      <span className="text-[10px] font-mono text-purple-400">Level 5</span>
                    </button>
                  ) : (
                    <div className="px-3 py-2 text-slate-500 flex items-center justify-between opacity-50 cursor-not-allowed">
                      <span className="flex items-center space-x-1.5"><Lock className="w-3 h-3" /><span>Command Center</span></span>
                      <span className="text-[10px] font-mono">Level 5 (Locked)</span>
                    </div>
                  )}

                  {/* Level 4: Operations Admin */}
                  {userLevel >= 4 ? (
                    <button
                      onClick={() => onNavigate('/operations')}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-[#1E324F] ${
                        currentPath === '/operations' ? 'bg-[#1E324F] text-amber-400 font-bold' : 'text-slate-200'
                      }`}
                    >
                      <span>Workforce Operations</span>
                      <span className="text-[10px] font-mono text-blue-400">Level 4</span>
                    </button>
                  ) : (
                    <div className="px-3 py-2 text-slate-500 flex items-center justify-between opacity-50 cursor-not-allowed">
                      <span className="flex items-center space-x-1.5"><Lock className="w-3 h-3" /><span>Workforce Ops</span></span>
                      <span className="text-[10px] font-mono">Level 4 (Locked)</span>
                    </div>
                  )}

                  {/* Level 3: Supervisor */}
                  {userLevel >= 3 && (
                    <button
                      onClick={() => onNavigate('/supervisor')}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-[#1E324F] ${
                        currentPath === '/supervisor' ? 'bg-[#1E324F] text-amber-400 font-bold' : 'text-slate-200'
                      }`}
                    >
                      <span>Supervisor Field Desk</span>
                      <span className="text-[10px] font-mono text-amber-400">Level 3</span>
                    </button>
                  )}

                  {/* Level 2: Hub Kiosk */}
                  {userLevel >= 4 && (
                    <button
                      onClick={() => onNavigate('/hub')}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-[#1E324F] ${
                        currentPath === '/hub' ? 'bg-[#1E324F] text-amber-400 font-bold' : 'text-slate-200'
                      }`}
                    >
                      <span>Hub Dynamic QR Kiosk</span>
                      <span className="text-[10px] font-mono text-emerald-400">Level 2</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* User Profile & Badge */}
            {user && (
              <div className="flex items-center space-x-2 pl-2 border-l border-[#2A4468]">
                <div className="hidden sm:block text-right">
                  <div className="text-xs font-semibold text-white truncate max-w-[130px]">{user.name}</div>
                  <div className="text-[10px] text-[#A0AEC0] font-mono">
                    {user.employeeCode || user.supervisorCode || user.email}
                  </div>
                </div>
                {getRoleBadge(user.role)}
                <button
                  onClick={onLogout}
                  className="p-1.5 text-[#A0AEC0] hover:text-white hover:bg-[#1E324F] rounded border border-transparent hover:border-[#334B67] transition ml-1"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
