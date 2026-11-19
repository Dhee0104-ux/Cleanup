import React, { useEffect, useState } from 'react';
import { api, getSocket } from '../api.js';
import { LaneOperational, DashboardMetrics, Hub } from '../types.js';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Building2,
  Activity,
  Layers,
  ArrowUpRight,
  TrendingUp,
  FileText,
  MapPin,
  RefreshCw,
  PlusCircle,
  Truck
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  AreaChart,
  Area
} from 'recharts';

export const AdminDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [lanes, setLanes] = useState<LaneOperational[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [trends, setTrends] = useState<any[]>([]);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [securityAlerts, setSecurityAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Highway Section creation form state
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [newSection, setNewSection] = useState({
    sectionCode: '',
    name: '',
    startKm: '',
    endKm: '',
    region: 'North Sector National Highway',
  });
  const [isSubmittingSection, setIsSubmittingSection] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [overviewData, lanesData, hubsData, trendsData] = await Promise.all([
        api.getDashboardOverview(),
        api.getLanes(),
        api.getAllHubs(),
        api.getAttendanceTrends(),
      ]);

      setMetrics(overviewData.metrics);
      setLanes(lanesData);
      setHubs(hubsData);
      setTrends(trendsData);
      setRecentEvents(overviewData.recentEvents || []);
      setSecurityAlerts(overviewData.securityAlerts || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load operational dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // Listen for live WebSocket broadcasts
    const socket = getSocket();
    socket.emit('join', 'dashboard');

    const handleAttendanceNew = (event: any) => {
      setRecentEvents((prev) => [
        {
          id: event.recordId,
          type: 'ATTENDANCE_CONFIRMED',
          workerName: event.employeeName,
          hubName: event.hubName,
          hubCode: 'HUB',
          timestamp: event.timestamp,
        },
        ...prev.slice(0, 9),
      ]);
      fetchDashboardData();
    };

    const handleTaskUpdated = () => {
      fetchDashboardData();
    };

    const handleLaneStatus = () => {
      fetchDashboardData();
    };

    socket.on('attendance:new', handleAttendanceNew);
    socket.on('task:updated', handleTaskUpdated);
    socket.on('lane:status_changed', handleLaneStatus);

    return () => {
      socket.emit('leave', 'dashboard');
      socket.off('attendance:new', handleAttendanceNew);
      socket.off('task:updated', handleTaskUpdated);
      socket.off('lane:status_changed', handleLaneStatus);
    };
  }, []);

  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmittingSection(true);
      await api.createHighwaySection({
        sectionCode: newSection.sectionCode,
        name: newSection.name,
        startKm: parseFloat(newSection.startKm),
        endKm: parseFloat(newSection.endKm),
        region: newSection.region,
      });
      setShowSectionModal(false);
      setNewSection({ sectionCode: '', name: '', startKm: '', endKm: '', region: 'North Sector' });
      await fetchDashboardData();
    } catch (err: any) {
      alert(err.message || 'Failed to create section.');
    } finally {
      setIsSubmittingSection(false);
    }
  };

  const getLaneStatusPill = (status: string) => {
    switch (status) {
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse mr-1.5"></span>
            CLEANING IN PROGRESS
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
            WORK COMPLETED
          </span>
        );
      case 'ASSIGNED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            WORKERS ASSIGNED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            IDLE / STANDBY
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-[#E1E6EC] shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#14243A]">
            Highway Operations Command Center
          </h1>
          <p className="text-sm text-[#718096] mt-0.5">
            Real-time telemetry, 4-lane progression, dynamic QR attendance validation & hub dispatch.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchDashboardData()}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-[#E1E6EC] rounded text-xs font-medium text-[#334B67] transition"
            title="Refresh Telemetry"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setShowSectionModal(true)}
            className="flex items-center space-x-1.5 px-3 py-2 bg-[#14243A] hover:bg-[#1E324F] text-white rounded text-xs font-medium transition shadow-sm"
          >
            <PlusCircle className="w-4 h-4 text-amber-400" />
            <span>New Highway Section</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-lg text-sm flex items-center space-x-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Employees & Active */}
        <div className="bg-white p-4 rounded-lg border border-[#E1E6EC] shadow-sm">
          <div className="flex items-center justify-between text-[#718096] text-xs font-medium uppercase tracking-wider">
            <span>Workforce Active</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-[#14243A]">{metrics?.activeWorkers || 0}</span>
            <span className="text-xs text-[#718096]">/ {metrics?.totalEmployees || 0} registered</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>Absent / Off-duty:</span>
            <span className="font-semibold text-slate-700">{metrics?.absentCount || 0}</span>
          </div>
        </div>

        {/* Metric 2: Currently Cleaning */}
        <div className="bg-white p-4 rounded-lg border border-[#E1E6EC] shadow-sm">
          <div className="flex items-center justify-between text-[#718096] text-xs font-medium uppercase tracking-wider">
            <span>Cleaning In Progress</span>
            <Activity className="w-4 h-4 text-amber-600 animate-pulse" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-amber-600">{metrics?.workersCurrentlyCleaning || 0}</span>
            <span className="text-xs text-[#718096]">active operations</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>Pending Hub Check-In:</span>
            <span className="font-semibold text-slate-700">{metrics?.pendingVerification || 0}</span>
          </div>
        </div>

        {/* Metric 3: QR Attendance Verified */}
        <div className="bg-white p-4 rounded-lg border border-[#E1E6EC] shadow-sm">
          <div className="flex items-center justify-between text-[#718096] text-xs font-medium uppercase tracking-wider">
            <span>Attendance Verified</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-emerald-700">{metrics?.attendanceVerified || 0}</span>
            <span className="text-xs text-emerald-700 font-medium">QR Confirmed</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>Rejected / Exceptions:</span>
            <span className="font-semibold text-rose-600">
              {metrics?.attendanceRejected || 0} / {metrics?.pendingApprovals || 0}
            </span>
          </div>
        </div>

        {/* Metric 4: Authorized Physical Hubs */}
        <div className="bg-white p-4 rounded-lg border border-[#E1E6EC] shadow-sm">
          <div className="flex items-center justify-between text-[#718096] text-xs font-medium uppercase tracking-wider">
            <span>Active Hub Stations</span>
            <Building2 className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-[#14243A]">{metrics?.activeHubs || 0}</span>
            <span className="text-xs text-[#718096]">Check-in Kiosks</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>Dynamic QR Validity:</span>
            <span className="font-semibold text-slate-700">45s Rotation</span>
          </div>
        </div>
      </div>

      {/* SECTION: FOUR DISTINCT WORKING LANES OPERATIONAL PANEL */}
      <div className="bg-white rounded-lg border border-[#E1E6EC] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E1E6EC] flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-[#14243A]" />
            <div>
              <h2 className="text-base font-bold text-[#14243A]">Four-Lane Operational Grid</h2>
              <p className="text-xs text-[#718096]">
                Independent lane management (L01 Highway Left, L02 Highway Right, L03 Service Road Left, L04 Service Road Right)
              </p>
            </div>
          </div>
          <span className="text-xs font-mono bg-white px-2.5 py-1 rounded border border-[#E1E6EC] text-slate-600">
            {lanes.length} Active Lanes Configured
          </span>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {lanes.map((lane) => {
            const progress = lane.totalTasks > 0 ? Math.round((lane.completedCount / lane.totalTasks) * 100) : 0;
            return (
              <div
                key={lane.id}
                className="border border-[#E1E6EC] rounded-lg p-4 bg-white hover:border-[#334B67] transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#14243A] text-white">
                      {lane.laneCode}
                    </span>
                    {getLaneStatusPill(lane.status)}
                  </div>

                  <h3 className="mt-2 font-bold text-sm text-[#14243A] tracking-tight">{lane.name}</h3>
                  <div className="text-xs text-[#718096] mt-0.5 truncate">{lane.highwaySection.name}</div>

                  {/* Lane Progress Bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-500 font-medium">Cleaning Progress</span>
                      <span className="font-mono font-semibold text-slate-700">{progress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          progress === 100 ? 'bg-emerald-600' : progress > 0 ? 'bg-amber-500' : 'bg-slate-300'
                        }`}
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Assigned Team & Supervisor */}
                  <div className="mt-4 space-y-1.5 text-xs border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500">Supervisor:</span>
                      <span className="font-medium text-slate-800 truncate max-w-[130px]">
                        {lane.supervisor?.name || 'Unassigned'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500">Active Workers:</span>
                      <span className="font-medium text-slate-800">{lane.workerCount} personnel</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500">Evidence Uploads:</span>
                      <span className="font-medium text-slate-800">{lane.evidenceCount} photos</span>
                    </div>
                  </div>
                </div>

                {/* Assigned worker tags */}
                <div className="mt-3 pt-2 border-t border-slate-100 flex flex-wrap gap-1">
                  {lane.workers.length > 0 ? (
                    lane.workers.map((w) => (
                      <span
                        key={w.employeeId}
                        className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono"
                        title={`${w.name} (${w.shift}) - ${w.taskStatus}`}
                      >
                        {w.employeeCode}: {w.taskStatus}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">No workers assigned currently</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION: CHARTS & VISUALIZATIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance Trends 7-Day Chart */}
        <div className="lg:col-span-2 bg-white p-5 rounded-lg border border-[#E1E6EC] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-sm text-[#14243A]">7-Day Attendance Verification Trend</h3>
              <p className="text-xs text-[#718096]">Confirmed QR Scans vs Exceptions & Rejections</p>
            </div>
            <span className="text-xs font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              Daily Audit Aggregate
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="verifiedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16845B" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#16845B" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="rejectedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#C74646" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#C74646" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF2F7" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#718096' }} />
                <YAxis tick={{ fontSize: 11, fill: '#718096' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#14243A', borderColor: '#334B67', borderRadius: '6px', color: '#fff', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Area type="monotone" dataKey="verified" name="Verified Attendance" stroke="#16845B" strokeWidth={2} fillOpacity={1} fill="url(#verifiedGrad)" />
                <Area type="monotone" dataKey="rejected" name="Rejected / Exception" stroke="#C74646" strokeWidth={2} fillOpacity={1} fill="url(#rejectedGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hub-Wise Check-In Activity */}
        <div className="bg-white p-5 rounded-lg border border-[#E1E6EC] shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-sm text-[#14243A]">Hub Station Check-Ins</h3>
                <p className="text-xs text-[#718096]">Today's physical kiosk check-in volume</p>
              </div>
              <Building2 className="w-4 h-4 text-[#718096]" />
            </div>

            <div className="space-y-3">
              {hubs.map((hub) => (
                <div key={hub.id} className="p-3 rounded border border-slate-100 bg-slate-50/50">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-[#14243A]">{hub.hubCode}</span>
                    <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                      {hub._count?.attendanceRecords || 0} Scans Today
                    </span>
                  </div>
                  <div className="text-xs font-medium text-slate-800 mt-1">{hub.name}</div>
                  <div className="text-[11px] text-[#718096] truncate mt-0.5">{hub.physicalAddress}</div>
                  <div className="mt-2 text-[10px] text-slate-500 flex items-center justify-between border-t border-slate-200/60 pt-1.5 font-mono">
                    <span>GPS: {hub.latitude.toFixed(4)}, {hub.longitude.toFixed(4)}</span>
                    <span>Radius: {hub.geofenceRadiusM}m</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
            <span>Dynamic QR rotation cycle:</span>
            <span className="font-semibold text-slate-700">30–60 Seconds</span>
          </div>
        </div>
      </div>

      {/* SECTION: RECENT ACTIVITY TIMELINE & SECURITY AUDIT ALERTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Real-time Event Feed */}
        <div className="bg-white p-5 rounded-lg border border-[#E1E6EC] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              <h3 className="font-bold text-sm text-[#14243A]">Live Operational Event Stream</h3>
            </div>
            <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-mono">
              WebSocket Live
            </span>
          </div>

          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {recentEvents.length > 0 ? (
              recentEvents.map((evt) => (
                <div key={evt.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <div>
                      <div className="font-semibold text-slate-800">{evt.workerName}</div>
                      <div className="text-[11px] text-slate-500">
                        {evt.type.replace('_', ' ')} at {evt.hubName}
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                No recent events recorded yet.
              </div>
            )}
          </div>
        </div>

        {/* Security & Audit Alerts */}
        <div className="bg-white p-5 rounded-lg border border-[#E1E6EC] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-[#14243A]" />
              <h3 className="font-bold text-sm text-[#14243A]">Immutable Audit Trail & Alerts</h3>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">Security Engine</span>
          </div>

          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto font-mono">
            {securityAlerts.length > 0 ? (
              securityAlerts.map((alert) => (
                <div key={alert.id} className="py-2.5 text-xs flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-800 flex items-center space-x-1.5">
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 text-slate-700">
                        {alert.action}
                      </span>
                      <span className="text-slate-600 text-[11px]">{alert.userName} ({alert.userRole})</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-sm">
                      Target: {alert.entityType} | {JSON.stringify(alert.details)}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                No audit alerts recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: Create Highway Section */}
      {showSectionModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 border border-[#E1E6EC]">
            <h3 className="text-base font-bold text-[#14243A]">Register Highway Section</h3>
            <p className="text-xs text-[#718096] mt-1">
              Adding a section automatically initializes all four operational lanes (L01, L02, L03, L04).
            </p>

            <form onSubmit={handleCreateSection} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">Section Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SEC-NH48-03"
                  value={newSection.sectionCode}
                  onChange={(e) => setNewSection({ ...newSection, sectionCode: e.target.value })}
                  className="mt-1 w-full text-xs px-3 py-2 border border-[#E1E6EC] rounded focus:outline-none focus:ring-1 focus:ring-[#14243A]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Section Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. NH-48 South Link Km 42-65"
                  value={newSection.name}
                  onChange={(e) => setNewSection({ ...newSection, name: e.target.value })}
                  className="mt-1 w-full text-xs px-3 py-2 border border-[#E1E6EC] rounded focus:outline-none focus:ring-1 focus:ring-[#14243A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Start KM</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    placeholder="42.0"
                    value={newSection.startKm}
                    onChange={(e) => setNewSection({ ...newSection, startKm: e.target.value })}
                    className="mt-1 w-full text-xs px-3 py-2 border border-[#E1E6EC] rounded focus:outline-none focus:ring-1 focus:ring-[#14243A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">End KM</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    placeholder="65.0"
                    value={newSection.endKm}
                    onChange={(e) => setNewSection({ ...newSection, endKm: e.target.value })}
                    className="mt-1 w-full text-xs px-3 py-2 border border-[#E1E6EC] rounded focus:outline-none focus:ring-1 focus:ring-[#14243A]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Geographic Region</label>
                <input
                  type="text"
                  value={newSection.region}
                  onChange={(e) => setNewSection({ ...newSection, region: e.target.value })}
                  className="mt-1 w-full text-xs px-3 py-2 border border-[#E1E6EC] rounded focus:outline-none focus:ring-1 focus:ring-[#14243A]"
                />
              </div>

              <div className="mt-5 flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSectionModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSection}
                  className="px-4 py-1.5 text-xs bg-[#14243A] text-white rounded font-medium hover:bg-[#1E324F] disabled:opacity-50"
                >
                  {isSubmittingSection ? 'Creating...' : 'Create Section & Lanes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
