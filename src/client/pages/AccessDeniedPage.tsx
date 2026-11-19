import React from 'react';
import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react';
import { User } from '../types.js';

interface AccessDeniedPageProps {
  user: User;
  requiredRole: string;
  onNavigateHome: () => void;
}

export const AccessDeniedPage: React.FC<AccessDeniedPageProps> = ({
  user,
  requiredRole,
  onNavigateHome,
}) => {
  return (
    <div className="max-w-xl mx-auto my-12 bg-white rounded-xl border-2 border-rose-300 p-8 shadow-lg text-center space-y-5">
      <div className="w-16 h-16 rounded-full bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 mx-auto">
        <ShieldAlert className="w-9 h-9" />
      </div>

      <div>
        <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-rose-100 text-rose-900 border border-rose-200 uppercase">
          SECURITY ACCESS VIOLATION
        </span>
        <h2 className="text-xl sm:text-2xl font-bold text-[#14243A] mt-2">
          Access Denied: Hierarchy Level Insufficient
        </h2>
        <p className="text-xs text-slate-600 mt-2 leading-relaxed">
          The highway operations management hierarchy is strictly enforced. Your current account role is{' '}
          <strong className="text-slate-900 font-mono">[{user.role}]</strong>, which does not have authorization
          to view or modify data of superior tier{' '}
          <strong className="text-rose-700 font-mono">[{requiredRole}]</strong>.
        </p>
      </div>

      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs text-slate-700 font-mono text-left space-y-1">
        <div>User Identity: <strong>{user.name}</strong> ({user.employeeCode || user.supervisorCode || user.email})</div>
        <div>Assigned Rank: <strong>{user.role}</strong></div>
        <div>Target Resource: <strong>Restricted Superior Tier Data</strong></div>
        <div>Enforcement Policy: <strong>Fixed Hierarchical RBAC & Subordinate Isolation</strong></div>
      </div>

      <button
        onClick={onNavigateHome}
        className="px-5 py-2.5 bg-[#14243A] hover:bg-[#1E324F] text-white text-xs font-bold rounded-lg shadow-sm flex items-center justify-center space-x-2 mx-auto transition"
      >
        <ArrowLeft className="w-4 h-4 text-amber-400" />
        <span>Return to Your Authorized Operational Workspace</span>
      </button>
    </div>
  );
};
