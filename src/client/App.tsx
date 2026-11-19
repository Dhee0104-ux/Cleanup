import React, { useEffect, useState } from 'react';
import { api, setStoredToken, getStoredToken } from './api.js';
import { User, UserRole } from './types.js';
import { Navbar } from './components/Navbar.js';
import { AdminDashboard } from './components/AdminDashboard.js';
import { OperationsPage } from './pages/OperationsPage.js';
import { SupervisorPortal } from './components/SupervisorPortal.js';
import { HubOperatorPortal } from './components/HubOperatorPortal.js';
import { WorkerMobileApp } from './components/WorkerMobileApp.js';
import { AccessDeniedPage } from './pages/AccessDeniedPage.js';
import CONFIG from '../config.js';
import { Compass, Lock, Mail, ArrowRight, ShieldCheck, Layers, Users, Building2, HardHat } from 'lucide-react';

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState<string>(window.location.pathname || '/login');

  // Login form state
  const [email, setEmail] = useState('admin@highway.gov');
  const [password, setPassword] = useState('password123');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Sync with browser history
  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    window.history.pushState({}, '', path);
  };

  // Check existing session
  useEffect(() => {
    const checkAuth = async () => {
      const token = getStoredToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await api.getMe();
        setUser(res.user);

        // If on root or login, redirect to designated role route
        const designatedRoute = (CONFIG.ROLE_ROUTES as any)[res.user.role] || '/worker';
        if (window.location.pathname === '/' || window.location.pathname === '/login') {
          navigateTo(designatedRoute);
        } else {
          setCurrentPath(window.location.pathname);
        }
      } catch (err) {
        setStoredToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    try {
      const res = await api.login(email, password);
      setUser(res.user);

      // Enforce strict automatic redirection to designated role page
      const designatedRoute = (CONFIG.ROLE_ROUTES as any)[res.user.role] || '/worker';
      navigateTo(designatedRoute);
    } catch (err: any) {
      setLoginError(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleQuickLogin = async (quickEmail: string) => {
    setEmail(quickEmail);
    setPassword('password123');
    setLoginError(null);
    setIsLoggingIn(true);

    try {
      const res = await api.login(quickEmail, 'password123');
      setUser(res.user);

      const designatedRoute = (CONFIG.ROLE_ROUTES as any)[res.user.role] || '/worker';
      navigateTo(designatedRoute);
    } catch (err: any) {
      setLoginError(err.message || 'Quick login failed.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
    navigateTo('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F6F8] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-[#14243A] border-t-amber-500 rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-mono text-slate-500">Authenticating Hierarchical Access Clearance...</p>
        </div>
      </div>
    );
  }

  // Not Logged In - Enterprise Authentication Screen with Fixed Hierarchy Display
  if (!user) {
    return (
      <div className="min-h-screen bg-[#F4F6F8] flex flex-col justify-center py-10 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <div className="w-12 h-12 rounded-xl bg-[#14243A] border border-[#334B67] flex items-center justify-center text-amber-400 mx-auto shadow-md">
            <Compass className="w-7 h-7" />
          </div>
          <h2 className="mt-3 text-xl sm:text-2xl font-bold tracking-tight text-[#14243A]">
            SMART HIGHWAY CLEANING WFM
          </h2>
          <p className="mt-1 text-xs text-[#718096]">
            Strict Hierarchical Workforce Architecture & Dynamic QR Attendance
          </p>
        </div>

        <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4">
          <div className="bg-white py-7 px-6 shadow-sm border border-[#E1E6EC] rounded-xl sm:px-10">
            {loginError && (
              <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded text-xs">
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">Official Email</label>
                <div className="mt-1 relative rounded shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-9 text-xs py-2.5 border border-[#E1E6EC] rounded focus:outline-none focus:ring-1 focus:ring-[#14243A]"
                    placeholder="officer@highway.gov"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Security Password</label>
                <div className="mt-1 relative rounded shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-9 text-xs py-2.5 border border-[#E1E6EC] rounded focus:outline-none focus:ring-1 focus:ring-[#14243A]"
                    placeholder="••••••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-2.5 px-4 bg-[#14243A] hover:bg-[#1E324F] disabled:opacity-50 text-white rounded font-medium text-xs shadow-sm transition flex items-center justify-center space-x-1.5"
              >
                <span>{isLoggingIn ? 'Verifying Clearance...' : 'Sign In to Designated Page'}</span>
                <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
              </button>
            </form>

            {/* Fixed Hierarchy Table & 1-Click Access */}
            <div className="mt-6 pt-5 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">
                  Fixed Role Hierarchy & Direct Portals:
                </span>
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>

              <div className="space-y-1.5 text-xs">
                {/* Level 5 */}
                <button
                  type="button"
                  onClick={() => handleQuickLogin('admin@highway.gov')}
                  className="w-full p-2 border border-purple-200 bg-purple-50/70 hover:bg-purple-100 text-left rounded flex items-center justify-between transition"
                >
                  <div>
                    <div className="font-bold text-purple-950 flex items-center space-x-1.5">
                      <span className="text-[10px] font-mono bg-purple-200 text-purple-900 px-1 rounded">LVL 5</span>
                      <span>Super Admin Portal</span>
                    </div>
                    <div className="text-[10px] text-purple-700 mt-0.5">Rajesh Sharma • /admin</div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-purple-600" />
                </button>

                {/* Level 4 */}
                <button
                  type="button"
                  onClick={() => handleQuickLogin('ops@highway.gov')}
                  className="w-full p-2 border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-left rounded flex items-center justify-between transition"
                >
                  <div>
                    <div className="font-bold text-blue-950 flex items-center space-x-1.5">
                      <span className="text-[10px] font-mono bg-blue-200 text-blue-900 px-1 rounded">LVL 4</span>
                      <span>Operations Admin Page</span>
                    </div>
                    <div className="text-[10px] text-blue-700 mt-0.5">Priya Nair • /operations</div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
                </button>

                {/* Level 3 */}
                <button
                  type="button"
                  onClick={() => handleQuickLogin('supervisor1@highway.gov')}
                  className="w-full p-2 border border-amber-200 bg-amber-50/70 hover:bg-amber-100 text-left rounded flex items-center justify-between transition"
                >
                  <div>
                    <div className="font-bold text-amber-950 flex items-center space-x-1.5">
                      <span className="text-[10px] font-mono bg-amber-200 text-amber-900 px-1 rounded">LVL 3</span>
                      <span>Supervisor Field Desk</span>
                    </div>
                    <div className="text-[10px] text-amber-700 mt-0.5">Vikram Singh • /supervisor</div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-amber-600" />
                </button>

                {/* Level 2 */}
                <button
                  type="button"
                  onClick={() => handleQuickLogin('hubop1@highway.gov')}
                  className="w-full p-2 border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 text-left rounded flex items-center justify-between transition"
                >
                  <div>
                    <div className="font-bold text-emerald-950 flex items-center space-x-1.5">
                      <span className="text-[10px] font-mono bg-emerald-200 text-emerald-900 px-1 rounded">LVL 2</span>
                      <span>Hub Dynamic QR Kiosk</span>
                    </div>
                    <div className="text-[10px] text-emerald-700 mt-0.5">Kavita Patel • /hub</div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                </button>

                {/* Level 1 */}
                <button
                  type="button"
                  onClick={() => handleQuickLogin('worker2@highway.gov')}
                  className="w-full p-2 border border-slate-300 bg-slate-100 hover:bg-slate-200 text-left rounded flex items-center justify-between transition"
                >
                  <div>
                    <div className="font-bold text-slate-900 flex items-center space-x-1.5">
                      <span className="text-[10px] font-mono bg-slate-300 text-slate-900 px-1 rounded">LVL 1</span>
                      <span>Field Worker Mobile App</span>
                    </div>
                    <div className="text-[10px] text-slate-600 mt-0.5">Ramesh Verma (EMP-1002) • /worker</div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-700" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Logged-in Hierarchical Routing Guard Engine
  const userLevel = (CONFIG.HIERARCHY_LEVELS as any)[user.role] || 1;
  const userHomeRoute = (CONFIG.ROLE_ROUTES as any)[user.role] || '/worker';

  // Renders the authorized dedicated page or strict Access Denied barrier
  const renderCurrentPage = () => {
    switch (currentPath) {
      case '/admin':
        if (userLevel < 5) {
          return (
            <AccessDeniedPage
              user={user}
              requiredRole="SUPER_ADMIN (Level 5)"
              onNavigateHome={() => navigateTo(userHomeRoute)}
            />
          );
        }
        return <AdminDashboard />;

      case '/operations':
        if (userLevel < 4) {
          return (
            <AccessDeniedPage
              user={user}
              requiredRole="OPERATIONS_ADMIN (Level 4)"
              onNavigateHome={() => navigateTo(userHomeRoute)}
            />
          );
        }
        return <OperationsPage user={user} />;

      case '/supervisor':
        if (userLevel < 3) {
          return (
            <AccessDeniedPage
              user={user}
              requiredRole="SUPERVISOR (Level 3)"
              onNavigateHome={() => navigateTo(userHomeRoute)}
            />
          );
        }
        return <SupervisorPortal />;

      case '/hub':
        // Hub operator or Super Admin
        if (user.role !== 'HUB_OPERATOR' && userLevel < 4) {
          return (
            <AccessDeniedPage
              user={user}
              requiredRole="HUB_OPERATOR (Level 2)"
              onNavigateHome={() => navigateTo(userHomeRoute)}
            />
          );
        }
        return <HubOperatorPortal />;

      case '/worker':
        return <WorkerMobileApp user={user} />;

      default:
        // Default to user's assigned home route
        if (user.role === 'SUPER_ADMIN') return <AdminDashboard />;
        if (user.role === 'OPERATIONS_ADMIN') return <OperationsPage user={user} />;
        if (user.role === 'SUPERVISOR') return <SupervisorPortal />;
        if (user.role === 'HUB_OPERATOR') return <HubOperatorPortal />;
        return <WorkerMobileApp user={user} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6F8] flex flex-col">
      <Navbar
        user={user}
        currentPath={currentPath}
        onNavigate={navigateTo}
        onLogout={handleLogout}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {renderCurrentPage()}
      </main>

      <footer className="bg-white border-t border-[#E1E6EC] py-3 text-center text-xs text-slate-500 font-mono">
        SMART HIGHWAY CLEANING WFM • STRICT FIXED HIERARCHICAL RBAC (LEVEL 1 TO 5 ENFORCED)
      </footer>
    </div>
  );
};
