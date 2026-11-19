import React, { useEffect, useState, useMemo } from 'react';
import { api, getSocket } from '../api.js';
import { LaneOperational, User } from '../types.js';
import {
  Users,
  UserPlus,
  Layers,
  Calendar,
  Clock,
  CheckCircle2,
  RefreshCw,
  PlusCircle,
  AlertCircle,
  Trash2,
  Edit3,
  MapPin,
  Search,
  Filter,
  ShieldCheck,
  Check,
  X,
  Compass,
  ArrowRight
} from 'lucide-react';

interface OperationsPageProps {
  user: User;
}

export const OperationsPage: React.FC<OperationsPageProps> = ({ user }) => {
  const [lanes, setLanes] = useState<LaneOperational[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Search & Filter state for Active Dispatches
  const [laneFilter, setLaneFilter] = useState<string>('ALL');
  const [shiftFilter, setShiftFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [dispatchSearch, setDispatchSearch] = useState<string>('');

  // Search for Worker Roster
  const [workerSearch, setWorkerSearch] = useState<string>('');

  // Modals state
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);

  // Selected assignment for Reassign or Add Task
  const [selectedAssignment, setSelectedAssignment] = useState<any | null>(null);

  // New Worker Form
  const [newWorker, setNewWorker] = useState({
    name: '',
    email: '',
    password: 'password123',
    employeeCode: '',
    phone: '',
    skills: '',
    role: 'FIELD_WORKER',
  });

  // Dispatch / Assign Form
  const [assignForm, setAssignForm] = useState({
    employeeId: '',
    laneId: '',
    shiftId: '',
    supervisorId: '',
    taskTitle: '',
    startKm: '',
    endKm: '',
  });

  // Reassign Form
  const [reassignForm, setReassignForm] = useState({
    laneId: '',
    shiftId: '',
    supervisorId: '',
    status: 'ASSIGNED',
  });

  // Add Task to Dispatch Form
  const [addTaskForm, setAddTaskForm] = useState({
    title: '',
    startKm: '',
    endKm: '',
    remarks: '',
  });

  // Show auto-dismissing toast
  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [lanesData, metaData, assignData] = await Promise.all([
        api.getLanes(),
        api.getAssignmentMeta().catch(() => ({ shifts: [], lanes: [], supervisors: [], employees: [] })),
        api.getAssignments().catch(() => []),
      ]);

      setLanes(lanesData || []);
      setEmployees(metaData.employees || []);
      setShifts(metaData.shifts || []);
      setSupervisors(metaData.supervisors || []);
      setAssignments(assignData || []);

      // Pre-select defaults for assign form if empty
      if (lanesData && lanesData.length > 0 && !assignForm.laneId) {
        setAssignForm((prev) => ({
          ...prev,
          laneId: lanesData[0].id,
          shiftId: metaData.shifts?.[0]?.id || 'SHIFT-M',
          startKm: String(lanesData[0].highwaySection?.startKm || 12.0),
          endKm: String(lanesData[0].highwaySection?.endKm || 42.0),
        }));
      }
    } catch (err) {
      console.error('Failed to load operations data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const socket = getSocket();
    socket.emit('join', 'dashboard');

    const handleUpdate = () => {
      fetchData();
    };

    socket.on('assignment:updated', handleUpdate);
    socket.on('task:updated', handleUpdate);
    socket.on('lane:status_changed', handleUpdate);
    socket.on('attendance:new', handleUpdate);

    return () => {
      socket.emit('leave', 'dashboard');
      socket.off('assignment:updated', handleUpdate);
      socket.off('task:updated', handleUpdate);
      socket.off('lane:status_changed', handleUpdate);
      socket.off('attendance:new', handleUpdate);
    };
  }, []);

  // When selecting a lane in Assign Form, auto-update default Start KM and End KM
  const handleAssignLaneChange = (laneId: string) => {
    const lane = lanes.find((l) => l.id === laneId);
    setAssignForm((prev) => ({
      ...prev,
      laneId,
      startKm: lane ? String(lane.highwaySection.startKm) : prev.startKm,
      endKm: lane ? String(lane.highwaySection.endKm) : prev.endKm,
    }));
  };

  // 1. Register Worker Action
  const handleRegisterWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await fetch('/api/employees/register-field-worker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(newWorker),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to register worker');

      showToast('success', `Worker ${newWorker.name} registered with Employee ID ${newWorker.employeeCode}!`);
      setShowWorkerModal(false);
      setNewWorker({
        name: '',
        email: '',
        password: 'password123',
        employeeCode: '',
        phone: '',
        skills: '',
        role: 'FIELD_WORKER',
      });
      await fetchData();
    } catch (err: any) {
      showToast('error', err.message || 'Worker registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  // 2. Dispatch Worker Action
  const handleAssignWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await api.createAssignment({
        employeeId: assignForm.employeeId,
        laneId: assignForm.laneId,
        shiftId: assignForm.shiftId,
        supervisorId: assignForm.supervisorId || undefined,
        taskTitle: assignForm.taskTitle || undefined,
        startKm: assignForm.startKm ? parseFloat(assignForm.startKm) : undefined,
        endKm: assignForm.endKm ? parseFloat(assignForm.endKm) : undefined,
      });

      showToast('success', res.message || 'Worker successfully dispatched to lane & shift!');
      setShowAssignModal(false);
      setAssignForm({
        employeeId: '',
        laneId: lanes[0]?.id || '',
        shiftId: shifts[0]?.id || 'SHIFT-M',
        supervisorId: '',
        taskTitle: '',
        startKm: String(lanes[0]?.highwaySection?.startKm || 12),
        endKm: String(lanes[0]?.highwaySection?.endKm || 42),
      });
      await fetchData();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to dispatch worker');
    } finally {
      setSubmitting(false);
    }
  };

  // 3. Reassign Lane / Shift Action
  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment) return;

    try {
      setSubmitting(true);
      const res = await api.updateAssignment(selectedAssignment.id, {
        laneId: reassignForm.laneId || undefined,
        shiftId: reassignForm.shiftId || undefined,
        supervisorId: reassignForm.supervisorId || undefined,
        status: reassignForm.status || undefined,
      });

      showToast('success', res.message || 'Worker assignment successfully updated!');
      setShowReassignModal(false);
      setSelectedAssignment(null);
      await fetchData();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to update assignment');
    } finally {
      setSubmitting(false);
    }
  };

  // 4. Revoke / Cancel Dispatch Action
  const handleRevokeDispatch = async (assignment: any) => {
    const workerName = assignment.employee?.user?.name || assignment.employee?.employeeCode;
    const laneCode = assignment.lane?.laneCode;
    const confirm = window.confirm(
      `Are you sure you want to revoke the dispatch for ${workerName} on lane ${laneCode}?\nThis will cancel the active shift assignment and associated pending tasks.`
    );
    if (!confirm) return;

    try {
      setLoading(true);
      const res = await api.deleteAssignment(assignment.id);
      showToast('success', res.message || 'Dispatch revoked successfully.');
      await fetchData();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to revoke dispatch');
    } finally {
      setLoading(false);
    }
  };

  // 5. Add Additional Task to Active Dispatch
  const handleAddTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment) return;

    try {
      setSubmitting(true);
      const res = await api.createTaskForEmployee({
        employeeId: selectedAssignment.employeeId,
        laneId: selectedAssignment.laneId,
        shiftId: selectedAssignment.shiftId,
        title: addTaskForm.title,
        targetKmStart: addTaskForm.startKm ? parseFloat(addTaskForm.startKm) : undefined,
        targetKmEnd: addTaskForm.endKm ? parseFloat(addTaskForm.endKm) : undefined,
        remarks: addTaskForm.remarks || undefined,
      });

      showToast('success', res.message || 'New cleaning task assigned to worker!');
      setShowAddTaskModal(false);
      setSelectedAssignment(null);
      setAddTaskForm({ title: '', startKm: '', endKm: '', remarks: '' });
      await fetchData();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to add task');
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered Dispatches
  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      if (laneFilter !== 'ALL' && a.lane?.laneCode !== laneFilter) return false;
      if (shiftFilter !== 'ALL' && a.shift?.code !== shiftFilter && a.shiftId !== shiftFilter) return false;
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
      if (dispatchSearch) {
        const query = dispatchSearch.toLowerCase();
        const empName = a.employee?.user?.name?.toLowerCase() || '';
        const empCode = a.employee?.employeeCode?.toLowerCase() || '';
        const laneName = a.lane?.name?.toLowerCase() || '';
        const taskMatch = a.tasks?.some((t: any) => t.title.toLowerCase().includes(query));
        if (!empName.includes(query) && !empCode.includes(query) && !laneName.includes(query) && !taskMatch) {
          return false;
        }
      }
      return true;
    });
  }, [assignments, laneFilter, shiftFilter, statusFilter, dispatchSearch]);

  // Filtered Workers
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (!workerSearch) return true;
      const query = workerSearch.toLowerCase();
      return (
        emp.employeeCode?.toLowerCase().includes(query) ||
        emp.user?.name?.toLowerCase().includes(query) ||
        emp.user?.email?.toLowerCase().includes(query) ||
        emp.skills?.toLowerCase().includes(query)
      );
    });
  }, [employees, workerSearch]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg border flex items-center space-x-2 text-xs font-semibold animate-fade-in ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600" />
          )}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Operations Admin Banner */}
      <div className="bg-white p-5 rounded-lg border border-[#E1E6EC] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-200 uppercase font-mono">
              OPERATIONS ADMINISTRATION • LEVEL 4
            </span>
            <span className="text-xs text-slate-500 font-mono">Workforce Logistics Desk</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#14243A] mt-1">
            Highway Workforce Scheduling & Lane Dispatch
          </h1>
          <p className="text-xs text-[#718096]">
            Register field personnel, manage daily shifts, dispatch workers across all four highway lanes (L01-L04), and monitor real-time operational coverage.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-[#E1E6EC] rounded text-xs font-medium text-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setShowWorkerModal(true)}
            className="flex items-center space-x-1.5 px-3 py-2 bg-[#14243A] hover:bg-[#1E324F] text-white rounded text-xs font-medium transition shadow-sm"
          >
            <UserPlus className="w-4 h-4 text-amber-400" />
            <span>Register Worker</span>
          </button>
          <button
            onClick={() => {
              setAssignForm({
                employeeId: employees[0]?.id || '',
                laneId: lanes[0]?.id || '',
                shiftId: shifts[0]?.id || 'SHIFT-M',
                supervisorId: '',
                taskTitle: '',
                startKm: String(lanes[0]?.highwaySection?.startKm || 12),
                endKm: String(lanes[0]?.highwaySection?.endKm || 42),
              });
              setShowAssignModal(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-2 bg-[#16845B] hover:bg-emerald-700 text-white rounded text-xs font-medium transition shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Dispatch to Lane</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-[#E1E6EC] shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase">Registered Workers</div>
          <div className="mt-2 text-2xl font-bold text-[#14243A]">{employees.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Active workforce profiles</div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-[#E1E6EC] shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase">Active Dispatches Today</div>
          <div className="mt-2 text-2xl font-bold text-blue-600">{assignments.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Lane assignments published</div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-[#E1E6EC] shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase">Operational Lanes</div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{lanes.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">L01, L02, L03, L04 online</div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-[#E1E6EC] shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase">Supervisors on Duty</div>
          <div className="mt-2 text-2xl font-bold text-purple-600">{supervisors.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Overseeing field sectors</div>
        </div>
      </div>

      {/* SECTION 1: FOUR-LANE COVERAGE OVERVIEW */}
      <div className="bg-white rounded-lg border border-[#E1E6EC] shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-[#14243A]" />
            <h2 className="text-sm font-bold text-[#14243A]">Four-Lane Field Workforce Deployment</h2>
          </div>
          <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700">
            NH-48 Express Corridor
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {lanes.map((lane) => {
            const laneDispatches = assignments.filter((a) => a.laneId === lane.id || a.lane?.laneCode === lane.laneCode);
            return (
              <div key={lane.id} className="border border-slate-200 rounded-lg p-3.5 bg-slate-50 space-y-2 relative overflow-hidden">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-bold bg-[#14243A] text-white px-2 py-0.5 rounded shadow-xs">
                    {lane.laneCode}
                  </span>
                  <span
                    className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                      lane.status === 'IN_PROGRESS'
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : lane.status === 'COMPLETED'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {lane.status}
                  </span>
                </div>
                <div className="font-bold text-xs text-slate-800">{lane.name}</div>
                <div className="text-[11px] text-slate-500">
                  <span className="font-bold text-slate-800">{laneDispatches.length}</span> workers deployed today
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  KM {lane.highwaySection.startKm} - {lane.highwaySection.endKm} ({lane.direction})
                </div>
                <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
                  <span>
                    Sup: <strong>{lane.supervisor?.name || 'Unassigned'}</strong>
                  </span>
                  <button
                    onClick={() => {
                      setAssignForm((prev) => ({
                        ...prev,
                        laneId: lane.id,
                        startKm: String(lane.highwaySection.startKm),
                        endKm: String(lane.highwaySection.endKm),
                      }));
                      setShowAssignModal(true);
                    }}
                    className="text-[10px] text-blue-600 hover:text-blue-800 font-bold underline"
                  >
                    + Dispatch Here
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: ACTIVE DISPATCHES & FIELD ASSIGNMENTS (CORE DISPATCH DASHBOARD) */}
      <div className="bg-white rounded-lg border border-[#E1E6EC] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E1E6EC] bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Compass className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-[#14243A]">Active Dispatches & Daily Shift Deployments</h3>
            <span className="text-xs font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">
              {filteredAssignments.length} Active
            </span>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Lane Filter */}
            <div className="flex items-center space-x-1">
              <span className="text-slate-500">Lane:</span>
              <select
                value={laneFilter}
                onChange={(e) => setLaneFilter(e.target.value)}
                className="p-1.5 border border-slate-200 rounded bg-white text-slate-700 font-medium"
              >
                <option value="ALL">All Lanes (L01-L04)</option>
                <option value="L01">L01: Highway Left</option>
                <option value="L02">L02: Highway Right</option>
                <option value="L03">L03: Service Road Left</option>
                <option value="L04">L04: Service Road Right</option>
              </select>
            </div>

            {/* Shift Filter */}
            <div className="flex items-center space-x-1">
              <span className="text-slate-500">Shift:</span>
              <select
                value={shiftFilter}
                onChange={(e) => setShiftFilter(e.target.value)}
                className="p-1.5 border border-slate-200 rounded bg-white text-slate-700 font-medium"
              >
                <option value="ALL">All Shifts</option>
                <option value="SHIFT-M">Morning Shift</option>
                <option value="SHIFT-A">Afternoon Shift</option>
                <option value="SHIFT-N">Night Patrol</option>
              </select>
            </div>

            {/* Search input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-slate-400" />
              <input
                type="text"
                placeholder="Search worker or task..."
                value={dispatchSearch}
                onChange={(e) => setDispatchSearch(e.target.value)}
                className="pl-7 pr-2 py-1.5 border border-slate-200 rounded text-xs w-44"
              />
            </div>
          </div>
        </div>

        {/* Dispatch Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[#E1E6EC] text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[11px]">
              <tr>
                <th className="px-4 py-3 text-left">Worker</th>
                <th className="px-4 py-3 text-left">Target Lane</th>
                <th className="px-4 py-3 text-left">Shift & Hours</th>
                <th className="px-4 py-3 text-left">Supervisor</th>
                <th className="px-4 py-3 text-left">Assigned Tasks</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Dispatch Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E6EC] bg-white">
              {filteredAssignments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No active dispatches found for today matching the filters. Click "Dispatch to Lane" above to deploy workers.
                  </td>
                </tr>
              ) : (
                filteredAssignments.map((a) => {
                  const tasksCount = a.tasks?.length || 0;
                  const activeTask = a.tasks?.[0];
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/70 transition">
                      {/* Worker info */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{a.employee?.user?.name || 'Unnamed Worker'}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {a.employee?.employeeCode} • {a.employee?.phone || 'No phone'}
                        </div>
                      </td>

                      {/* Lane info */}
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono font-bold bg-[#14243A] text-white px-2 py-0.5 rounded text-[10px]">
                            {a.lane?.laneCode || 'L??'}
                          </span>
                          <span className="font-semibold text-slate-800">{a.lane?.name}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {a.lane?.highwaySection?.name || 'NH-48'} ({a.lane?.direction || 'Northbound'})
                        </div>
                      </td>

                      {/* Shift info */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{a.shift?.name || 'Standard Shift'}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {a.shift?.startTime} - {a.shift?.endTime} ({a.shift?.code})
                        </div>
                      </td>

                      {/* Supervisor */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">
                          {a.supervisor?.user?.name || a.lane?.supervisor?.name || 'Unassigned'}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {a.supervisor?.supervisorCode || 'SUPERVISOR'}
                        </div>
                      </td>

                      {/* Tasks */}
                      <td className="px-4 py-3">
                        {activeTask ? (
                          <div>
                            <div className="font-medium text-slate-800 truncate max-w-xs">{activeTask.title}</div>
                            <div className="flex items-center space-x-2 mt-0.5">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  activeTask.status === 'VERIFIED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : activeTask.status === 'COMPLETED'
                                    ? 'bg-blue-100 text-blue-800'
                                    : activeTask.status === 'IN_PROGRESS'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {activeTask.status}
                              </span>
                              {activeTask.targetKmStart !== null && (
                                <span className="text-[10px] font-mono text-slate-500">
                                  KM {activeTask.targetKmStart} - {activeTask.targetKmEnd}
                                </span>
                              )}
                              {tasksCount > 1 && (
                                <span className="text-[10px] bg-slate-200 text-slate-700 px-1 rounded">
                                  +{tasksCount - 1} more
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No tasks assigned</span>
                        )}
                      </td>

                      {/* Dispatch Status */}
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                            a.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : a.status === 'ACTIVE'
                              ? 'bg-amber-100 text-amber-800'
                              : a.status === 'CANCELLED'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>

                      {/* Action buttons */}
                      <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAssignment(a);
                            setReassignForm({
                              laneId: a.laneId,
                              shiftId: a.shiftId,
                              supervisorId: a.supervisorId || '',
                              status: a.status,
                            });
                            setShowReassignModal(true);
                          }}
                          className="inline-flex items-center space-x-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium transition"
                          title="Reassign Lane or Shift"
                        >
                          <Edit3 className="w-3 h-3 text-slate-600" />
                          <span>Reassign</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAssignment(a);
                            setAddTaskForm({
                              title: `${a.lane?.name} Additional Sweep KM ${a.lane?.highwaySection?.startKm || 12} - ${a.lane?.highwaySection?.endKm || 42}`,
                              startKm: String(a.lane?.highwaySection?.startKm || 12),
                              endKm: String(a.lane?.highwaySection?.endKm || 42),
                              remarks: '',
                            });
                            setShowAddTaskModal(true);
                          }}
                          className="inline-flex items-center space-x-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-[11px] font-medium transition"
                          title="Add Additional Cleaning Task"
                        >
                          <PlusCircle className="w-3 h-3 text-emerald-600" />
                          <span>Add Task</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRevokeDispatch(a)}
                          className="inline-flex items-center space-x-1 px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-[11px] font-medium transition"
                          title="Cancel / Revoke Dispatch"
                        >
                          <Trash2 className="w-3 h-3 text-rose-600" />
                          <span>Revoke</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 3: WORKER ROSTER TABLE */}
      <div className="bg-white rounded-lg border border-[#E1E6EC] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E1E6EC] bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-[#14243A]">Employee Master Registry</h3>
            <span className="text-xs font-mono text-slate-500">({filteredEmployees.length} of {employees.length})</span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              placeholder="Search worker name, code, skill..."
              value={workerSearch}
              onChange={(e) => setWorkerSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded text-xs w-60"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[#E1E6EC] text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[11px]">
              <tr>
                <th className="px-4 py-3 text-left">Code</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Skills / Specialization</th>
                <th className="px-4 py-3 text-left">Today's Dispatch</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E6EC] bg-white">
              {filteredEmployees.map((emp) => {
                const todayDispatch = assignments.find((a) => a.employeeId === emp.id);
                return (
                  <tr key={emp.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{emp.employeeCode}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{emp.user.name}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono">{emp.user.email}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-800">
                        {emp.user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{emp.skills || 'General Highway Cleaning'}</td>
                    <td className="px-4 py-3">
                      {todayDispatch ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded text-[10px] font-bold font-mono">
                          <span>{todayDispatch.lane?.laneCode}</span>
                          <span>•</span>
                          <span>{todayDispatch.shift?.name?.split(' ')[0]}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Not Dispatched</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {emp.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setAssignForm({
                            employeeId: emp.id,
                            laneId: lanes[0]?.id || '',
                            shiftId: shifts[0]?.id || 'SHIFT-M',
                            supervisorId: '',
                            taskTitle: '',
                            startKm: String(lanes[0]?.highwaySection?.startKm || 12),
                            endKm: String(lanes[0]?.highwaySection?.endKm || 42),
                          });
                          setShowAssignModal(true);
                        }}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[11px] font-semibold transition"
                      >
                        <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{todayDispatch ? 'Re-Dispatch' : 'Dispatch'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: REGISTER NEW WORKER */}
      {showWorkerModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-[#14243A]">Register Field Employee</h3>
            <p className="text-xs text-slate-500 mt-1">Issue official company employee ID and credentials.</p>

            <form onSubmit={handleRegisterWorker} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Balram Singh"
                  value={newWorker.name}
                  onChange={(e) => setNewWorker({ ...newWorker, name: e.target.value })}
                  className="mt-1 w-full p-2 border border-slate-200 rounded focus:ring-1 focus:ring-[#14243A]"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700">Official Email *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. balram@highway.gov"
                  value={newWorker.email}
                  onChange={(e) => setNewWorker({ ...newWorker, email: e.target.value })}
                  className="mt-1 w-full p-2 border border-slate-200 rounded focus:ring-1 focus:ring-[#14243A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700">Employee Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="EMP-1007"
                    value={newWorker.employeeCode}
                    onChange={(e) => setNewWorker({ ...newWorker, employeeCode: e.target.value })}
                    className="mt-1 w-full p-2 border border-slate-200 rounded focus:ring-1 focus:ring-[#14243A]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Phone</label>
                  <input
                    type="text"
                    placeholder="+91-9811100007"
                    value={newWorker.phone}
                    onChange={(e) => setNewWorker({ ...newWorker, phone: e.target.value })}
                    className="mt-1 w-full p-2 border border-slate-200 rounded focus:ring-1 focus:ring-[#14243A]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700">Skills / Operational Specialty</label>
                <input
                  type="text"
                  placeholder="e.g. Median Barrier Scrub, Debris Sort"
                  value={newWorker.skills}
                  onChange={(e) => setNewWorker({ ...newWorker, skills: e.target.value })}
                  className="mt-1 w-full p-2 border border-slate-200 rounded focus:ring-1 focus:ring-[#14243A]"
                />
              </div>

              <div className="mt-5 flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowWorkerModal(false)}
                  disabled={submitting}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-[#14243A] text-white rounded font-bold hover:bg-[#1E324F] transition"
                >
                  {submitting ? 'Registering...' : 'Register Worker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: DISPATCH WORKER TO LANE & SHIFT */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-[#14243A]">Dispatch Field Worker to Lane</h3>
            <p className="text-xs text-slate-500 mt-1">Assign worker to today's highway cleaning shift and sector.</p>

            <form onSubmit={handleAssignWorker} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700">Select Field Worker *</label>
                <select
                  required
                  value={assignForm.employeeId}
                  onChange={(e) => setAssignForm({ ...assignForm, employeeId: e.target.value })}
                  className="mt-1 w-full p-2 border border-slate-200 rounded bg-white text-slate-800"
                >
                  <option value="">-- Choose Worker --</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.employeeCode}: {e.user.name} ({e.skills || 'Cleaner'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700">Target Lane (L01-L04) *</label>
                  <select
                    required
                    value={assignForm.laneId}
                    onChange={(e) => handleAssignLaneChange(e.target.value)}
                    className="mt-1 w-full p-2 border border-slate-200 rounded bg-white text-slate-800"
                  >
                    <option value="">-- Choose Lane --</option>
                    {lanes.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.laneCode}: {l.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700">Select Work Shift *</label>
                  <select
                    required
                    value={assignForm.shiftId}
                    onChange={(e) => setAssignForm({ ...assignForm, shiftId: e.target.value })}
                    className="mt-1 w-full p-2 border border-slate-200 rounded bg-white text-slate-800"
                  >
                    <option value="">-- Choose Shift --</option>
                    {shifts.length > 0 ? (
                      shifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.startTime} - {s.endTime})
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="SHIFT-M">Morning Shift (06:00 - 14:00)</option>
                        <option value="SHIFT-A">Afternoon Shift (14:00 - 22:00)</option>
                        <option value="SHIFT-N">Night Patrol (22:00 - 06:00)</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700">Designated Supervisor (Optional)</label>
                <select
                  value={assignForm.supervisorId}
                  onChange={(e) => setAssignForm({ ...assignForm, supervisorId: e.target.value })}
                  className="mt-1 w-full p-2 border border-slate-200 rounded bg-white text-slate-800"
                >
                  <option value="">-- Lane Default Supervisor --</option>
                  {supervisors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.supervisorCode}: {s.user?.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700">Initial Cleaning Task Title</label>
                <input
                  type="text"
                  placeholder="e.g. Outer Safety Barrier Debris Clearance"
                  value={assignForm.taskTitle}
                  onChange={(e) => setAssignForm({ ...assignForm, taskTitle: e.target.value })}
                  className="mt-1 w-full p-2 border border-slate-200 rounded"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700">Target Start KM</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="12.0"
                    value={assignForm.startKm}
                    onChange={(e) => setAssignForm({ ...assignForm, startKm: e.target.value })}
                    className="mt-1 w-full p-2 border border-slate-200 rounded"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Target End KM</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="42.0"
                    value={assignForm.endKm}
                    onChange={(e) => setAssignForm({ ...assignForm, endKm: e.target.value })}
                    className="mt-1 w-full p-2 border border-slate-200 rounded"
                  />
                </div>
              </div>

              <div className="mt-5 flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  disabled={submitting}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-[#16845B] text-white rounded font-bold hover:bg-emerald-700 transition"
                >
                  {submitting ? 'Dispatching...' : 'Dispatch Worker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: REASSIGN LANE / SHIFT / STATUS */}
      {showReassignModal && selectedAssignment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-[#14243A]">Reassign Lane or Shift</h3>
            <p className="text-xs text-slate-500 mt-1">
              Transfer <strong>{selectedAssignment.employee?.user?.name}</strong> to a different lane or shift today.
            </p>

            <form onSubmit={handleReassignSubmit} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700">Target Lane (L01-L04) *</label>
                <select
                  required
                  value={reassignForm.laneId}
                  onChange={(e) => setReassignForm({ ...reassignForm, laneId: e.target.value })}
                  className="mt-1 w-full p-2 border border-slate-200 rounded bg-white"
                >
                  {lanes.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.laneCode}: {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700">Work Shift *</label>
                <select
                  required
                  value={reassignForm.shiftId}
                  onChange={(e) => setReassignForm({ ...reassignForm, shiftId: e.target.value })}
                  className="mt-1 w-full p-2 border border-slate-200 rounded bg-white"
                >
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.startTime} - {s.endTime})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700">Overseeing Supervisor</label>
                <select
                  value={reassignForm.supervisorId}
                  onChange={(e) => setReassignForm({ ...reassignForm, supervisorId: e.target.value })}
                  className="mt-1 w-full p-2 border border-slate-200 rounded bg-white"
                >
                  <option value="">-- Lane Default --</option>
                  {supervisors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.supervisorCode}: {s.user?.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700">Dispatch Status</label>
                <select
                  value={reassignForm.status}
                  onChange={(e) => setReassignForm({ ...reassignForm, status: e.target.value })}
                  className="mt-1 w-full p-2 border border-slate-200 rounded bg-white"
                >
                  <option value="ASSIGNED">ASSIGNED</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>

              <div className="mt-5 flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowReassignModal(false)}
                  disabled={submitting}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-[#14243A] text-white rounded font-bold hover:bg-[#1E324F] transition"
                >
                  {submitting ? 'Updating...' : 'Save Reassignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: ADD ADDITIONAL TASK TO DISPATCH */}
      {showAddTaskModal && selectedAssignment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-[#14243A]">Assign Additional Cleaning Task</h3>
            <p className="text-xs text-slate-500 mt-1">
              Worker: <strong>{selectedAssignment.employee?.user?.name}</strong> • Lane: <strong>{selectedAssignment.lane?.laneCode}</strong>
            </p>

            <form onSubmit={handleAddTaskSubmit} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Service Road Drain Unclog KM 18"
                  value={addTaskForm.title}
                  onChange={(e) => setAddTaskForm({ ...addTaskForm, title: e.target.value })}
                  className="mt-1 w-full p-2 border border-slate-200 rounded focus:ring-1 focus:ring-[#14243A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700">Target Start KM</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="18.0"
                    value={addTaskForm.startKm}
                    onChange={(e) => setAddTaskForm({ ...addTaskForm, startKm: e.target.value })}
                    className="mt-1 w-full p-2 border border-slate-200 rounded"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Target End KM</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="22.0"
                    value={addTaskForm.endKm}
                    onChange={(e) => setAddTaskForm({ ...addTaskForm, endKm: e.target.value })}
                    className="mt-1 w-full p-2 border border-slate-200 rounded"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700">Supervisor Remarks / Special Instructions</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Check storm water culverts before marking complete"
                  value={addTaskForm.remarks}
                  onChange={(e) => setAddTaskForm({ ...addTaskForm, remarks: e.target.value })}
                  className="mt-1 w-full p-2 border border-slate-200 rounded"
                />
              </div>

              <div className="mt-5 flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddTaskModal(false)}
                  disabled={submitting}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-[#16845B] text-white rounded font-bold hover:bg-emerald-700 transition"
                >
                  {submitting ? 'Assigning...' : 'Assign Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
