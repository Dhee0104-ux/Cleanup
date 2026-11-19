import React, { useEffect, useState } from 'react';
import { api, getSocket } from '../api.js';
import { CleaningTask, AttendanceRecord } from '../types.js';
import { EvidenceImageViewer } from './EvidenceImageViewer.js';
import {
  ClipboardCheck,
  Users,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Layers,
  Image as ImageIcon,
  ShieldAlert,
  ArrowRight,
  Eye,
  RefreshCw,
  Plus,
  Trash2,
  MapPin
} from 'lucide-react';

export const SupervisorPortal: React.FC = () => {
  const [teamAssignments, setTeamAssignments] = useState<any[]>([]);
  const [pendingTasks, setPendingTasks] = useState<CleaningTask[]>([]);
  const [pendingAttendance, setPendingAttendance] = useState<AttendanceRecord[]>([]);
  const [selectedTask, setSelectedTask] = useState<CleaningTask | null>(null);
  const [loading, setLoading] = useState(true);

  // Review Modal state
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<'APPROVED' | 'REJECTED' | 'EXCEPTION_APPROVED'>('APPROVED');
  const [reviewNotes, setReviewNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Exception Approval Modal state
  const [selectedException, setSelectedException] = useState<AttendanceRecord | null>(null);
  const [exceptionReasonInput, setExceptionReasonInput] = useState('');

  // Add Task Modal state (Supervisor assigning task to specific employee)
  const [addTaskModalOpen, setAddTaskModalOpen] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<{
    employeeId: string;
    employeeCode: string;
    name: string;
    laneId: string;
    laneCode: string;
    shiftId: string;
  } | null>(null);
  const [newTaskForm, setNewTaskForm] = useState({
    title: '',
    description: '',
    laneCode: 'L01',
    targetKmStart: 12,
    targetKmEnd: 16,
    remarks: '',
  });
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  const fetchSupervisorData = async () => {
    try {
      setLoading(true);
      const [teamData, pendingData] = await Promise.all([
        api.getSupervisorTeam(),
        api.getSupervisorPending(),
      ]);

      setTeamAssignments(teamData);
      setPendingTasks(pendingData.pendingTasks || []);
      setPendingAttendance(pendingData.pendingAttendance || []);
    } catch (err) {
      console.error('Failed to load supervisor data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSupervisorData();

    const socket = getSocket();
    socket.emit('join', 'supervisors');

    const handleUpdate = () => {
      fetchSupervisorData();
    };

    socket.on('task:updated', handleUpdate);
    socket.on('attendance:new', handleUpdate);

    return () => {
      socket.emit('leave', 'supervisors');
      socket.off('task:updated', handleUpdate);
      socket.off('attendance:new', handleUpdate);
    };
  }, []);

  const openReviewModal = (task: CleaningTask) => {
    setSelectedTask(task);
    setReviewDecision('APPROVED');
    setReviewNotes('');
    setRejectionReason('');
    setReviewModalOpen(true);
  };

  const submitReview = async () => {
    if (!selectedTask) return;
    if (reviewDecision === 'REJECTED' && !rejectionReason.trim()) {
      alert('A mandatory rejection reason is required to reject work completion.');
      return;
    }

    try {
      setIsSubmittingReview(true);
      await api.verifyTask(selectedTask.id, {
        status: reviewDecision,
        reviewNotes,
        rejectionReason: reviewDecision === 'REJECTED' ? rejectionReason : undefined,
        isException: reviewDecision === 'EXCEPTION_APPROVED',
      });

      alert(`Task completion verified and marked ${reviewDecision}!`);
      setReviewModalOpen(false);
      setSelectedTask(null);
      await fetchSupervisorData();
    } catch (err: any) {
      alert(err.message || 'Failed to submit review.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleExceptionDecision = async (approved: boolean) => {
    if (!selectedException) return;
    if (!exceptionReasonInput.trim()) {
      alert('A supervisory justification reason is mandatory.');
      return;
    }

    try {
      await api.approveException(selectedException.id, approved, exceptionReasonInput);
      setSelectedException(null);
      setExceptionReasonInput('');
      await fetchSupervisorData();
    } catch (err: any) {
      alert(err.message || 'Failed to process exception.');
    }
  };

  const handleOpenAddTask = (worker: {
    employeeId: string;
    employeeCode: string;
    name: string;
    laneId: string;
    laneCode: string;
    shiftId: string;
  }) => {
    setSelectedWorker({
      employeeId: worker.employeeId,
      employeeCode: worker.employeeCode,
      name: worker.name,
      laneId: worker.laneId,
      laneCode: worker.laneCode || 'L01',
      shiftId: worker.shiftId || 'SHIFT-M',
    });
    setNewTaskForm({
      title: '',
      description: '',
      laneCode: worker.laneCode || 'L01',
      targetKmStart: 12,
      targetKmEnd: 16,
      remarks: '',
    });
    setAddTaskModalOpen(true);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorker) return;
    if (!newTaskForm.title.trim()) {
      alert('Task title is required.');
      return;
    }

    try {
      setIsSubmittingTask(true);
      await api.createTaskForEmployee({
        employeeId: selectedWorker.employeeId,
        title: newTaskForm.title.trim(),
        description: newTaskForm.description.trim(),
        laneCode: newTaskForm.laneCode,
        shiftId: selectedWorker.shiftId,
        targetKmStart: Number(newTaskForm.targetKmStart),
        targetKmEnd: Number(newTaskForm.targetKmEnd),
        remarks: newTaskForm.remarks.trim(),
        status: 'PENDING',
      });

      alert(`Task successfully assigned to ${selectedWorker.name}!`);
      setAddTaskModalOpen(false);
      await fetchSupervisorData();
    } catch (err: any) {
      alert(err.message || 'Failed to assign task.');
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleRemoveTask = async (taskId: string, taskTitle: string, workerName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to remove the task:\n\n"${taskTitle}"\n\nassigned to ${workerName}? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await api.deleteTask(taskId);
      alert(`Task "${taskTitle}" removed successfully.`);
      await fetchSupervisorData();
    } catch (err: any) {
      alert(err.message || 'Failed to remove task.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Supervisor Header */}
      <div className="bg-white p-5 rounded-lg border border-[#E1E6EC] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200 uppercase">
              Field Supervision • Level 3
            </span>
            <span className="text-xs text-slate-500 font-mono">Live Operations Hub</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#14243A] mt-1">Supervisor Control Desk</h1>
          <p className="text-xs text-[#718096]">
            Assign &amp; remove employee tasks, inspect high-resolution photographic evidence, verify cleaning completion, and adjudicate exceptions.
          </p>
        </div>

        <button
          onClick={() => fetchSupervisorData()}
          className="flex items-center space-x-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-[#E1E6EC] rounded text-xs font-medium text-[#334B67] transition self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Desk</span>
        </button>
      </div>

      {/* Verification Queue Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border border-[#E1E6EC] shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-[#718096]">
            <span>Pending Work Verifications</span>
            <ClipboardCheck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600">{pendingTasks.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">Cleaning completed, awaiting photo sign-off</div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-[#E1E6EC] shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-[#718096]">
            <span>Attendance Exceptions</span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-600">{pendingAttendance.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">GPS geofence or hardware override required</div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-[#E1E6EC] shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-[#718096]">
            <span>Supervised Field Crew</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[#14243A]">{teamAssignments.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">Personnel assigned to your sector</div>
        </div>
      </div>

      {/* SECTION: PENDING WORK COMPLETION VERIFICATION QUEUE */}
      <div className="bg-white rounded-lg border border-[#E1E6EC] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E1E6EC] bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ClipboardCheck className="w-5 h-5 text-amber-600" />
            <div>
              <h2 className="text-sm font-bold text-[#14243A]">Work Completion Review Queue</h2>
              <p className="text-xs text-[#718096]">Inspect before/after evidence photos before worker travels to Hub QR</p>
            </div>
          </div>
          <span className="text-xs font-mono bg-white px-2.5 py-1 rounded border border-[#E1E6EC] text-slate-600">
            {pendingTasks.length} Awaiting Verification
          </span>
        </div>

        {pendingTasks.length > 0 ? (
          <div className="divide-y divide-[#E1E6EC]">
            {pendingTasks.map((task) => (
              <div key={task.id} className="p-5 hover:bg-slate-50/60 transition flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#14243A] text-white">
                      {task.lane.laneCode}
                    </span>
                    <span className="text-xs font-semibold text-slate-800">{task.lane.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded font-mono bg-amber-50 text-amber-700 border border-amber-200">
                      COMPLETED
                    </span>
                    {task.hasObstruction && (
                      <span className="text-xs px-2 py-0.5 rounded font-medium bg-rose-50 text-rose-700 border border-rose-200 flex items-center space-x-1">
                        <AlertTriangle className="w-3 h-3 text-rose-600" />
                        <span>Obstruction Reported</span>
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-[#14243A]">{task.title}</h3>
                  {task.description && (
                    <div className="text-xs text-slate-700 bg-slate-50 p-2 rounded border border-slate-200 mt-1">
                      <strong>Worker Work Description:</strong> {task.description}
                    </div>
                  )}

                  <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                      Worker: <strong className="text-slate-700">{task.employee?.user.name} ({task.employee?.employeeCode})</strong>
                    </span>
                    <span>
                      Section KM: <strong className="text-slate-700">{task.targetKmStart} - {task.targetKmEnd}</strong>
                    </span>
                    <span>
                      Completed: <strong className="text-slate-700">{task.completionTime ? new Date(task.completionTime).toLocaleTimeString() : 'N/A'}</strong>
                    </span>
                  </div>

                  {task.remarks && (
                    <div className="text-xs bg-slate-50 text-slate-700 p-2 rounded border border-slate-200 italic">
                      "{task.remarks}"
                    </div>
                  )}

                  <div className="text-xs text-slate-500 flex items-center space-x-2 pt-1">
                    <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                    <span>Evidence Uploads: <strong>{task.evidence.length} photos captured</strong></span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => openReviewModal(task)}
                    className="flex items-center space-x-1.5 px-3 py-2 bg-[#14243A] hover:bg-[#1E324F] text-white rounded text-xs font-medium transition shadow-sm"
                  >
                    <Eye className="w-4 h-4 text-amber-400" />
                    <span>Review Evidence &amp; Approve</span>
                  </button>
                  <button
                    onClick={() => handleRemoveTask(task.id, task.title, task.employee?.user.name || 'Worker')}
                    className="p-2 text-rose-600 hover:bg-rose-50 rounded border border-rose-200 transition"
                    title="Remove Task"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500 text-xs">
            No tasks currently awaiting verification. Check-in operations running normally.
          </div>
        )}
      </div>

      {/* SECTION: ATTENDANCE EXCEPTIONS */}
      {pendingAttendance.length > 0 && (
        <div className="bg-white rounded-lg border border-rose-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-rose-200 bg-rose-50/60 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-rose-600" />
              <div>
                <h2 className="text-sm font-bold text-rose-900">Attendance Exception Adjudication</h2>
                <p className="text-xs text-rose-700">Workers with GPS geofence breaches or mobile device hardware discrepancies</p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-rose-100">
            {pendingAttendance.map((rec) => (
              <div key={rec.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="font-bold text-slate-800">
                      {rec.employee?.user?.name || 'Worker'} ({rec.employee?.employeeCode || rec.id})
                    </span>
                    <span className="text-slate-400">at</span>
                    <span className="font-semibold text-slate-700">{rec.hub?.name} ({rec.hub?.hubCode})</span>
                  </div>
                  <div className="text-xs text-rose-700 mt-1 font-medium">
                    Reason: {rec.rejectionReason || 'Location verification outside geofence boundary'}
                  </div>
                  {rec.locationVerification && (
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                      Distance to Hub: {Math.round(rec.locationVerification.calculatedDistanceM)}m (Allowed: {rec.locationVerification.allowedRadiusM}m)
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => {
                      setSelectedException(rec);
                      setExceptionReasonInput('Verified physical presence via radio/visual confirmation.');
                    }}
                    className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded text-xs font-medium"
                  >
                    Adjudicate Exception
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION: SUPERVISED CREW LANE STATUS & TASK MANAGEMENT */}
      <div className="bg-white rounded-lg border border-[#E1E6EC] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E1E6EC] bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-[#14243A]">Supervised Crew &amp; Task Assignment Desk</h2>
            <p className="text-xs text-[#718096]">
              Add and remove specific cleaning operations for each field worker across highway lanes L01 - L04
            </p>
          </div>
          <span className="text-xs font-mono bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-1 rounded">
            {teamAssignments.length} Assigned Workers
          </span>
        </div>

        <div className="divide-y divide-slate-200">
          {teamAssignments.map((a) => (
            <div key={a.id} className="p-5 hover:bg-slate-50/40 transition">
              {/* Worker Header Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-[#14243A] text-white font-bold flex items-center justify-center text-sm shadow-sm">
                    {a.employee.user.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-slate-900">{a.employee.user.name}</span>
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                        {a.employee.employeeCode}
                      </span>
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200">
                        {a.lane.laneCode} ({a.lane.name})
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Shift: <strong className="text-slate-700">{a.shift.name}</strong> • Section:{' '}
                      <strong className="text-slate-700">{a.lane.highwaySection?.name || 'NH-48 Corridor'}</strong>
                    </div>
                  </div>
                </div>

                {/* + Add Task Button for this specific employee */}
                <button
                  type="button"
                  onClick={() =>
                    handleOpenAddTask({
                      employeeId: a.employee.id,
                      employeeCode: a.employee.employeeCode,
                      name: a.employee.user.name,
                      laneId: a.lane.id,
                      laneCode: a.lane.laneCode,
                      shiftId: a.shift.id,
                    })
                  }
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#16845B] hover:bg-emerald-700 text-white rounded text-xs font-semibold transition shadow-sm self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>Assign Task to {a.employee.user.name.split(' ')[0]}</span>
                </button>
              </div>

              {/* Tasks List for this Employee */}
              <div className="mt-3 space-y-2">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                  <span>Assigned Cleaning Operations ({a.tasks.length}):</span>
                  {a.tasks.length === 0 && (
                    <span className="text-amber-600 font-normal">No tasks assigned yet. Click Assign Task above.</span>
                  )}
                </div>

                {a.tasks.map((task: any) => (
                  <div
                    key={task.id}
                    className="p-3 bg-white rounded-lg border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-slate-300 transition"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-xs text-slate-900">{task.title}</span>
                        <span
                          className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                            task.status === 'VERIFIED'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : task.status === 'COMPLETED'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : task.status === 'IN_PROGRESS'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {task.status}
                        </span>
                        {task.hasObstruction && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-bold border border-rose-200">
                            Obstruction
                          </span>
                        )}
                      </div>

                      {task.description && (
                        <p className="text-xs text-slate-600 line-clamp-1">{task.description}</p>
                      )}

                      <div className="text-[11px] text-slate-500 flex items-center space-x-3 font-mono">
                        <span>
                          Target: KM {task.targetKmStart} - {task.targetKmEnd}
                        </span>
                        <span>•</span>
                        <span>Photos: {task.evidence?.length || 0}</span>
                        {task.remarks && <span>• Remarks: "{task.remarks}"</span>}
                      </div>
                    </div>

                    {/* Actions: Remove Task */}
                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRemoveTask(task.id, task.title, a.employee.user.name)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded transition"
                        title="Remove / Delete this task"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>Remove Task</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Review & Verification Modal */}
      {reviewModalOpen && selectedTask && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full p-6 border border-[#E1E6EC] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#14243A] text-white mr-2">
                  {selectedTask.lane.laneCode}
                </span>
                <span className="text-sm font-bold text-[#14243A]">Work Completion Inspection</span>
              </div>
              <button onClick={() => setReviewModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm">
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Task Details</h4>
                <div className="text-sm font-bold text-slate-800 mt-0.5">{selectedTask.title}</div>
                {selectedTask.description && (
                  <div className="text-xs text-slate-700 bg-slate-50 p-2 rounded border border-slate-200 mt-1">
                    <strong>Worker Work Description:</strong> {selectedTask.description}
                  </div>
                )}
                {selectedTask.remarks && (
                  <div className="text-xs text-slate-700 bg-blue-50/50 p-2 rounded border border-blue-100 mt-1 italic">
                    <strong>Worker Completion Remarks:</strong> "{selectedTask.remarks}"
                  </div>
                )}
                <div className="text-xs text-slate-600 mt-1">
                  Worker: <strong>{selectedTask.employee?.user.name}</strong> | Section: <strong>KM {selectedTask.targetKmStart} - {selectedTask.targetKmEnd}</strong>
                </div>
              </div>

              {/* Before and After Photographic Evidence */}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Photographic Evidence (Click to Zoom &amp; Inspect Telemetry)
                </h4>
                {selectedTask.evidence.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedTask.evidence.map((ev) => (
                      <EvidenceImageViewer
                        key={ev.id}
                        evidence={ev}
                        laneCode={selectedTask.lane.laneCode}
                        workerName={selectedTask.employee?.user.name}
                        heightClass="h-44"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
                    Warning: No photos attached. Inspection requires evidence photos.
                  </div>
                )}
              </div>

              {/* Decision Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Supervisory Decision</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setReviewDecision('APPROVED')}
                    className={`py-2 px-3 rounded border text-xs font-semibold flex items-center justify-center space-x-1.5 transition ${
                      reviewDecision === 'APPROVED'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Approve Completion</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReviewDecision('REJECTED')}
                    className={`py-2 px-3 rounded border text-xs font-semibold flex items-center justify-center space-x-1.5 transition ${
                      reviewDecision === 'REJECTED'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Reject Work</span>
                  </button>
                </div>
              </div>

              {/* Rejection Reason (Mandatory if rejected) */}
              {reviewDecision === 'REJECTED' && (
                <div>
                  <label className="block text-xs font-medium text-rose-700 mb-1">
                    Mandatory Rejection Reason *
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder="e.g. Left shoulder litter sweep incomplete at KM 14.5; debris remains near barrier."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-rose-300 rounded focus:outline-none focus:ring-1 focus:ring-rose-500 bg-rose-50/30"
                  />
                </div>
              )}

              {/* Review Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Supervisor Remarks (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Thoroughly swept, drainage grates checked."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-[#E1E6EC] rounded focus:outline-none focus:ring-1 focus:ring-[#14243A]"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReview}
                disabled={isSubmittingReview}
                className="px-4 py-1.5 text-xs bg-[#14243A] text-white rounded font-medium hover:bg-[#1E324F] disabled:opacity-50"
              >
                {isSubmittingReview ? 'Submitting...' : 'Confirm Decision'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exception Decision Modal */}
      {selectedException && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6 border border-rose-200">
            <h3 className="text-base font-bold text-rose-900">Adjudicate Attendance Exception</h3>
            <p className="text-xs text-slate-600 mt-1">
              Confirm or deny physical attendance for <strong>{selectedException.employee?.user?.name || 'Worker'}</strong>.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Mandatory Supervisory Justification *
              </label>
              <textarea
                rows={3}
                required
                value={exceptionReasonInput}
                onChange={(e) => setExceptionReasonInput(e.target.value)}
                placeholder="Reason for approving or denying this exception..."
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-[#14243A]"
              />
            </div>

            <div className="mt-5 flex justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedException(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleExceptionDecision(false)}
                className="px-3 py-1.5 text-xs bg-rose-600 text-white rounded font-medium hover:bg-rose-700"
              >
                Reject Exception
              </button>
              <button
                type="button"
                onClick={() => handleExceptionDecision(true)}
                className="px-4 py-1.5 text-xs bg-emerald-600 text-white rounded font-medium hover:bg-emerald-700"
              >
                Approve Attendance
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Task for Specific Employee */}
      {addTaskModalOpen && selectedWorker && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 uppercase font-mono">
                  TASK DISPATCH
                </span>
                <h3 className="text-base font-bold text-[#14243A] mt-1">Assign Task to Worker</h3>
              </div>
              <button
                onClick={() => setAddTaskModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="mt-4 space-y-3.5 text-xs">
              {/* Worker Identity Card */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-[11px] text-slate-500 uppercase font-semibold">Assigning To:</div>
                <div className="font-bold text-sm text-slate-900">{selectedWorker.name}</div>
                <div className="text-xs text-slate-500 font-mono">Employee Code: {selectedWorker.employeeCode}</div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Outer Safety Barrier Debris Sweep"
                  value={newTaskForm.title}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, title: e.target.value })}
                  className="mt-1 w-full p-2 border border-slate-200 rounded focus:ring-1 focus:ring-[#14243A]"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Target Working Lane *</label>
                <select
                  value={newTaskForm.laneCode}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, laneCode: e.target.value })}
                  className="mt-1 w-full p-2 border border-slate-200 rounded bg-white"
                >
                  <option value="L01">L01: Highway Left Side (Inner Median &amp; Fast Lane)</option>
                  <option value="L02">L02: Highway Right Side (Outer Shoulder &amp; Barrier)</option>
                  <option value="L03">L03: Service Road Left Side (Walkway &amp; Gutter)</option>
                  <option value="L04">L04: Service Road Right Side (Ramp &amp; Boundary)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700">Start KM Marker</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newTaskForm.targetKmStart}
                    onChange={(e) => setNewTaskForm({ ...newTaskForm, targetKmStart: Number(e.target.value) })}
                    className="mt-1 w-full p-2 border border-slate-200 rounded"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">End KM Marker</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newTaskForm.targetKmEnd}
                    onChange={(e) => setNewTaskForm({ ...newTaskForm, targetKmEnd: Number(e.target.value) })}
                    className="mt-1 w-full p-2 border border-slate-200 rounded"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Operational Instructions / Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Focus on stormwater gutter grates and clear discarded tire rubber."
                  value={newTaskForm.description}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, description: e.target.value })}
                  className="mt-1 w-full p-2 border border-slate-200 rounded"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setAddTaskModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTask}
                  className="px-4 py-1.5 bg-[#16845B] hover:bg-emerald-700 text-white rounded font-bold transition disabled:opacity-50"
                >
                  {isSubmittingTask ? 'Assigning...' : 'Assign Task to Worker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
