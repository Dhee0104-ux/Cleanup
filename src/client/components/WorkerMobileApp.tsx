import React, { useEffect, useState, useRef } from 'react';
import { api, getSocket } from '../api.js';
import { CleaningTask, NearestHubResult, AttendanceRecord, User } from '../types.js';
import { QrScannerModal } from './QrScannerModal.js';
import { EvidenceImageViewer } from './EvidenceImageViewer.js';
import {
  Play,
  CheckCircle,
  Camera,
  MapPin,
  QrCode,
  AlertTriangle,
  History,
  Clock,
  Compass,
  ArrowRight,
  ShieldCheck,
  FileText,
  AlertOctagon,
  RefreshCw,
  Navigation,
  Edit3,
  PlusCircle,
  UploadCloud,
  Send,
  Eye,
  X,
  Trash2
} from 'lucide-react';

interface WorkerMobileAppProps {
  user: User;
}

export const WorkerMobileApp: React.FC<WorkerMobileAppProps> = ({ user }) => {
  const [assignment, setAssignment] = useState<any>(null);
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [currentTask, setCurrentTask] = useState<CleaningTask | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [nearestHub, setNearestHub] = useState<NearestHubResult | null>(null);
  const [userGps, setUserGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  // Active Mobile Tab
  const [activeTab, setActiveTab] = useState<'TASK' | 'NEAREST_HUB' | 'HISTORY'>('TASK');

  // Scanner modal state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanResult, setScanResult] = useState<any | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isVerifyingScan, setIsVerifyingScan] = useState(false);

  // Edit Task Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editKmStart, setEditKmStart] = useState('');
  const [editKmEnd, setEditKmEnd] = useState('');
  const [editRemarks, setEditRemarks] = useState('');

  // New Custom Task Modal State
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newKmStart, setNewKmStart] = useState('');
  const [newKmEnd, setNewKmEnd] = useState('');
  const [newRemarks, setNewRemarks] = useState('');

  // Image Upload State
  const [selectedFileType, setSelectedFileType] = useState<'AFTER_PHOTO' | 'BEFORE_PHOTO' | 'OBSTRUCTION_PHOTO'>('AFTER_PHOTO');
  const [imageCaption, setImageCaption] = useState('');
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Work completion inputs
  const [completionRemarks, setCompletionRemarks] = useState('');
  const [hasObstruction, setHasObstruction] = useState(false);
  const [incidentType, setIncidentType] = useState('ROAD_OBSTRUCTION');
  const [incidentDesc, setIncidentDesc] = useState('');
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchWorkerData = async () => {
    try {
      setLoading(true);
      const [assignData, tasksData, historyData] = await Promise.all([
        api.getMyAssignment().catch(() => null),
        api.getMyTasks().catch(() => []),
        api.getMyAttendanceHistory().catch(() => []),
      ]);

      setAssignment(assignData);
      setTasks(tasksData || []);
      if (tasksData && tasksData.length > 0) {
        // Keep selected task or pick first
        setCurrentTask((prev) => (prev ? tasksData.find((t) => t.id === prev.id) || tasksData[0] : tasksData[0]));
      }
      setAttendanceHistory(historyData);
    } catch (err) {
      console.error('Failed to load worker data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkerData();
    requestGpsLocation();

    const socket = getSocket();
    if (user.employeeId) {
      socket.emit('join', `worker:${user.employeeId}`);
    }

    const handleTaskVerified = () => {
      fetchWorkerData();
    };

    socket.on('task:verified', handleTaskVerified);

    return () => {
      if (user.employeeId) socket.emit('leave', `worker:${user.employeeId}`);
      socket.off('task:verified', handleTaskVerified);
    };
  }, [user.employeeId]);

  // Request GPS & Find Nearest Hub
  const requestGpsLocation = () => {
    setGpsLoading(true);

    if (!navigator.geolocation) {
      const fallback = { lat: 28.4595, lng: 77.0266 };
      setUserGps(fallback);
      fetchNearestHub(fallback.lat, fallback.lng);
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserGps(coords);
        fetchNearestHub(coords.lat, coords.lng);
        setGpsLoading(false);
      },
      () => {
        const fallback = { lat: 28.4595, lng: 77.0266 };
        setUserGps(fallback);
        fetchNearestHub(fallback.lat, fallback.lng);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const fetchNearestHub = async (lat: number, lng: number) => {
    try {
      const res = await api.getNearestHub(lat, lng);
      setNearestHub(res.nearestHub);
    } catch (err) {
      console.error('Error fetching nearest hub:', err);
    }
  };

  // 1. Worker Starts Work
  const handleStartWork = async () => {
    if (!currentTask) return;
    try {
      setIsSubmitting(true);
      const updated = await api.startTask(currentTask.id);
      setCurrentTask(updated);
      alert('Cleaning operation started! Status changed to IN_PROGRESS.');
      await fetchWorkerData();
    } catch (err: any) {
      alert(err.message || 'Failed to start task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Open Edit Task Modal
  const openEditModal = () => {
    if (!currentTask) return;
    setEditTitle(currentTask.title);
    setEditDesc(currentTask.description || '');
    setEditKmStart(String(currentTask.targetKmStart));
    setEditKmEnd(String(currentTask.targetKmEnd));
    setEditRemarks(currentTask.remarks || '');
    setIsEditModalOpen(true);
  };

  const handleSaveTaskEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTask) return;
    try {
      setIsSubmitting(true);
      const updated = await api.updateTask(currentTask.id, {
        title: editTitle,
        description: editDesc,
        targetKmStart: parseFloat(editKmStart),
        targetKmEnd: parseFloat(editKmEnd),
        remarks: editRemarks,
      });

      setCurrentTask(updated);
      setIsEditModalOpen(false);
      alert('Task details successfully updated and logged!');
      await fetchWorkerData();
    } catch (err: any) {
      alert(err.message || 'Failed to update task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Create Custom / Ad-hoc Done Task
  const handleCreateCustomTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const created = await api.createCustomTask({
        title: newTitle,
        description: newDesc,
        targetKmStart: parseFloat(newKmStart || '0'),
        targetKmEnd: parseFloat(newKmEnd || '0'),
        remarks: newRemarks,
        status: 'IN_PROGRESS',
      });

      setIsNewTaskModalOpen(false);
      setNewTitle('');
      setNewDesc('');
      setNewKmStart('');
      setNewKmEnd('');
      setNewRemarks('');
      setCurrentTask(created);
      alert('New task entered and assigned! You can now upload task completion photos.');
      await fetchWorkerData();
    } catch (err: any) {
      alert(err.message || 'Failed to create custom task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. File input change & Image Preview
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setPreviewDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 5. Upload Image Evidence (Direct file or Canvas simulated snapshot)
  const handleUploadImageEvidence = async () => {
    if (!currentTask) return;

    let base64Data = previewDataUrl;

    // If no file was chosen via input, generate high-contrast field camera snapshot
    if (!base64Data) {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = selectedFileType === 'BEFORE_PHOTO' ? '#1E324F' : '#16845B';
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px Inter, sans-serif';
        ctx.fillText(`FIELD EVIDENCE: ${selectedFileType.replace('_', ' ')}`, 40, 60);
        ctx.font = '16px monospace';
        ctx.fillText(`LANE: ${assignment?.lane?.laneCode || 'L01'} | KM: ${currentTask.targetKmStart} - ${currentTask.targetKmEnd}`, 40, 100);
        ctx.fillText(`TASK: ${currentTask.title.substring(0, 36)}...`, 40, 130);
        ctx.fillText(`WORKER: ${user.name} (${user.employeeCode})`, 40, 160);
        ctx.fillText(`TIMESTAMP: ${new Date().toISOString()}`, 40, 190);
        ctx.fillText(`GPS: ${userGps?.lat.toFixed(4)}, ${userGps?.lng.toFixed(4)}`, 40, 220);
      }
      base64Data = canvas.toDataURL('image/jpeg', 0.85);
    }

    try {
      setIsSubmitting(true);
      await api.uploadTaskEvidence(currentTask.id, {
        type: selectedFileType,
        caption: imageCaption || `${selectedFileType.replace('_', ' ')} for ${currentTask.title}`,
        latitude: userGps?.lat,
        longitude: userGps?.lng,
        imageBase64: base64Data,
      });

      setPreviewDataUrl(null);
      setImageCaption('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      alert(`Completed task photo (${selectedFileType.replace('_', ' ')}) uploaded successfully!`);
      await fetchWorkerData();
    } catch (err: any) {
      alert(err.message || 'Failed to upload photo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTask = async (taskId: string, title: string) => {
    const confirmed = window.confirm(`Are you sure you want to delete this pending task:\n\n"${title}"?`);
    if (!confirmed) return;
    try {
      await api.deleteTask(taskId);
      alert('Task deleted successfully.');
      await fetchWorkerData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete task.');
    }
  };

  // 6. Submit Completion & Send to Supervisor
  const handleSubmitAndSendToSupervisor = async () => {
    if (!currentTask) return;
    try {
      setIsSubmitting(true);

      if (showIncidentForm && incidentDesc.trim()) {
        await api.reportIncident(currentTask.id, {
          type: incidentType,
          title: `Reported on ${assignment?.lane?.laneCode || 'Highway'}`,
          description: incidentDesc,
          latitude: userGps?.lat,
          longitude: userGps?.lng,
        });
      }

      const updated = await api.completeTask(
        currentTask.id,
        completionRemarks || currentTask.remarks || 'Cleaning sweep completed successfully.',
        hasObstruction
      );

      setCurrentTask(updated);
      alert('Task marked as COMPLETED and transmitted to your Supervisor! You can now proceed to the nearest hub to scan dynamic QR attendance.');
      setActiveTab('NEAREST_HUB');
      await fetchWorkerData();
    } catch (err: any) {
      alert(err.message || 'Failed to submit work completion.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 7. Worker Scans Dynamic QR Code at Hub
  const handleQrScanned = async (qrPayloadString: string) => {
    setIsScannerOpen(false);
    setScanResult(null);
    setScanError(null);
    setIsVerifyingScan(true);

    try {
      const res = await api.scanAttendance({
        qrPayload: qrPayloadString,
        workerLatitude: userGps?.lat,
        workerLongitude: userGps?.lng,
        accuracyMeters: 10,
      });

      setScanResult(res);
      await fetchWorkerData();
    } catch (err: any) {
      setScanError(err.message || 'QR attendance verification failed.');
    } finally {
      setIsVerifyingScan(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-12">
      {/* Mobile Top App Bar */}
      <div className="bg-[#14243A] text-white p-4 rounded-xl shadow-md border border-[#2A4468]">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-sm tracking-tight text-white">{user.name}</span>
            <span className="text-xs bg-[#1E324F] px-2 py-0.5 rounded font-mono text-amber-400 border border-[#334B67]">
              {user.employeeCode}
            </span>
          </div>

          <button
            onClick={() => fetchWorkerData()}
            className="p-1 text-slate-300 hover:text-white"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Assigned Lane Badge */}
        {assignment ? (
          <div className="mt-3 pt-3 border-t border-[#2A4468] flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-400">Assigned Lane: </span>
              <strong className="text-white font-mono bg-blue-900/60 px-1.5 py-0.5 rounded border border-blue-700">
                {assignment.lane.laneCode}
              </strong>
              <span className="ml-1 text-slate-200">{assignment.lane.name}</span>
            </div>
            <span className="text-slate-400">{assignment.shift.name}</span>
          </div>
        ) : (
          <div className="mt-3 pt-3 border-t border-[#2A4468] text-xs text-amber-300">
            No shift assigned for today. Contact operations supervisor.
          </div>
        )}
      </div>

      {/* Navigation Segment Tabs */}
      <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-lg border border-[#E1E6EC] shadow-sm">
        <button
          onClick={() => setActiveTab('TASK')}
          className={`py-2 text-xs font-bold rounded flex items-center justify-center space-x-1 transition ${
            activeTab === 'TASK' ? 'bg-[#14243A] text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Play className="w-3.5 h-3.5" />
          <span>My Tasks ({tasks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('NEAREST_HUB')}
          className={`py-2 text-xs font-bold rounded flex items-center justify-center space-x-1 transition ${
            activeTab === 'NEAREST_HUB' ? 'bg-[#14243A] text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>Hub & QR</span>
        </button>

        <button
          onClick={() => setActiveTab('HISTORY')}
          className={`py-2 text-xs font-bold rounded flex items-center justify-center space-x-1 transition ${
            activeTab === 'HISTORY' ? 'bg-[#14243A] text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>History</span>
        </button>
      </div>

      {/* Verification Result Banner (if scan just performed) */}
      {isVerifyingScan && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 p-4 rounded-xl text-center space-y-2">
          <RefreshCw className="w-6 h-6 mx-auto animate-spin text-blue-700" />
          <p className="text-xs font-bold">Executing 12-Step Server Verification Engine...</p>
          <p className="text-[11px] text-blue-700">Checking worker shift, task completion, HMAC signature, and hub presence.</p>
        </div>
      )}

      {scanResult && (
        <div className="bg-emerald-50 border-2 border-emerald-500 text-emerald-950 p-5 rounded-xl shadow-md space-y-3">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <h3 className="font-bold text-sm text-emerald-950">Attendance Verified Successfully!</h3>
              <p className="text-xs text-emerald-800">{scanResult.message}</p>
            </div>
          </div>

          <div className="bg-white p-3 rounded-lg border border-emerald-200 text-xs space-y-1 font-mono">
            <div>Receipt ID: <strong className="text-slate-900">{scanResult.recordId}</strong></div>
            <div>Station: <strong className="text-slate-900">{scanResult.hub?.name} ({scanResult.hub?.hubCode})</strong></div>
            <div>Lane: <strong className="text-slate-900">{scanResult.lane?.code} - {scanResult.lane?.name}</strong></div>
            <div>Time: <strong className="text-slate-900">{new Date(scanResult.verifiedAt).toLocaleTimeString()}</strong></div>
            <div>Hub Distance: <strong className="text-slate-900">{scanResult.hub?.distanceMeters}m</strong></div>
          </div>
        </div>
      )}

      {scanError && (
        <div className="bg-rose-50 border-2 border-rose-400 text-rose-950 p-4 rounded-xl space-y-2 shadow-sm">
          <div className="flex items-center space-x-2">
            <AlertOctagon className="w-5 h-5 text-rose-600 shrink-0" />
            <h4 className="font-bold text-xs text-rose-900">Attendance Verification Rejected</h4>
          </div>
          <p className="text-xs text-rose-800">{scanError}</p>
        </div>
      )}

      {/* TAB 1: WORKER TASK EXECUTION & EDITING WORKFLOW */}
      {activeTab === 'TASK' && (
        <div className="space-y-4">
          {/* Action Row: Task Selector + "Enter New Completed Task" Button */}
          <div className="flex items-center justify-between gap-2">
            {tasks.length > 1 && (
              <select
                value={currentTask?.id || ''}
                onChange={(e) => {
                  const t = tasks.find((item) => item.id === e.target.value);
                  if (t) setCurrentTask(t);
                }}
                className="text-xs font-semibold px-2.5 py-2 border border-[#E1E6EC] rounded bg-white text-slate-800 truncate max-w-[200px]"
              >
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.lane.laneCode}: {t.title}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => setIsNewTaskModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-2 bg-[#14243A] hover:bg-[#1E324F] text-white text-xs font-bold rounded shadow-sm ml-auto"
            >
              <PlusCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Enter New Work Done</span>
            </button>
          </div>

          {currentTask ? (
            <div className="bg-white rounded-xl border border-[#E1E6EC] shadow-sm p-5 space-y-5">
              {/* Status & Edit Header */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-3 gap-2">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#14243A] text-white">
                      {currentTask.lane.laneCode}
                    </span>
                    <span className="text-xs font-semibold text-slate-700">{currentTask.lane.name}</span>
                  </div>
                  <h3 className="text-sm font-bold text-[#14243A] mt-1.5">{currentTask.title}</h3>
                  {currentTask.description && (
                    <p className="text-xs text-slate-600 mt-1 italic bg-slate-50 p-2 rounded border border-slate-100">
                      "{currentTask.description}"
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end space-y-1.5 shrink-0">
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold ${
                      currentTask.status === 'VERIFIED'
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                        : currentTask.status === 'COMPLETED'
                        ? 'bg-blue-100 text-blue-900 border border-blue-200'
                        : currentTask.status === 'IN_PROGRESS'
                        ? 'bg-amber-100 text-amber-900 border border-amber-200 animate-pulse'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {currentTask.status}
                  </span>

                  {/* EDIT TASK BUTTON */}
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={openEditModal}
                      className="flex items-center space-x-1 text-xs text-[#334B67] hover:text-[#14243A] bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded font-medium"
                      title="Edit task details or actual work done"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                      <span>Edit</span>
                    </button>

                    {currentTask.status === 'PENDING' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteTask(currentTask.id, currentTask.title)}
                        className="flex items-center space-x-1 text-xs text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded font-medium border border-rose-200"
                        title="Delete this pending task"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Highway Section Coordinates */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200/60 font-mono">
                <div>
                  <span className="text-slate-500">Highway KM:</span>
                  <div className="font-bold text-slate-800">KM {currentTask.targetKmStart} to {currentTask.targetKmEnd}</div>
                </div>
                <div>
                  <span className="text-slate-500">Operation Start:</span>
                  <div className="font-bold text-slate-800">
                    {currentTask.startTime ? new Date(currentTask.startTime).toLocaleTimeString() : 'Not Started'}
                  </div>
                </div>
              </div>

              {/* STEP 1: START WORK BUTTON (If PENDING) */}
              {currentTask.status === 'PENDING' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600">
                    Press <strong>Start Cleaning</strong> when you arrive at your assigned highway section to begin the work timer.
                  </p>
                  <button
                    type="button"
                    onClick={handleStartWork}
                    disabled={isSubmitting}
                    className="w-full btn-field-touch bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm flex items-center justify-center space-x-2 shadow-sm transition"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    <span>START CLEANING WORK</span>
                  </button>
                </div>
              )}

              {/* STEP 2: UPLOAD IMAGES OF COMPLETED TASK */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center space-x-1.5">
                    <Camera className="w-4 h-4 text-blue-600" />
                    <span>Upload Completed Task Photos</span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    {currentTask.evidence.length} Photo(s) Attached
                  </span>
                </div>

                {/* Upload Control */}
                <div className="space-y-3 bg-white p-3 rounded-lg border border-slate-200">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedFileType('AFTER_PHOTO')}
                      className={`py-1.5 px-2 rounded font-semibold text-center border transition ${
                        selectedFileType === 'AFTER_PHOTO'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      Completed Work
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFileType('BEFORE_PHOTO')}
                      className={`py-1.5 px-2 rounded font-semibold text-center border transition ${
                        selectedFileType === 'BEFORE_PHOTO'
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      Before Cleaning
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFileType('OBSTRUCTION_PHOTO')}
                      className={`py-1.5 px-2 rounded font-semibold text-center border transition ${
                        selectedFileType === 'OBSTRUCTION_PHOTO'
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      Road Hazard
                    </button>
                  </div>

                  {/* Image Caption */}
                  <input
                    type="text"
                    placeholder="Photo caption (e.g. Km 14.5 barrier swept clean)..."
                    value={imageCaption}
                    onChange={(e) => setImageCaption(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-[#14243A]"
                  />

                  {/* Hidden File Input */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  {/* Preview if file chosen */}
                  {previewDataUrl && (
                    <div className="relative w-full h-36 rounded overflow-hidden border border-slate-300 bg-black">
                      <img src={previewDataUrl} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setPreviewDataUrl(null)}
                        className="absolute top-2 right-2 bg-black/60 text-white p-1 rounded-full"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-xs font-bold flex items-center justify-center space-x-1.5 border border-slate-300"
                    >
                      <Camera className="w-4 h-4 text-slate-600" />
                      <span>{previewDataUrl ? 'Choose Different File' : 'Pick / Take Photo'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleUploadImageEvidence}
                      disabled={isSubmitting}
                      className="py-2.5 px-3 bg-[#16845B] hover:bg-emerald-700 text-white rounded text-xs font-bold flex items-center justify-center space-x-1.5 shadow-sm"
                    >
                      <UploadCloud className="w-4 h-4" />
                      <span>Upload to Task</span>
                    </button>
                  </div>
                </div>

                {/* Attached Evidence Gallery with Full-Screen Inspection */}
                {currentTask.evidence.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <span className="text-[11px] font-bold text-slate-600 uppercase">
                      Attached Task Photos ({currentTask.evidence.length}) - Tap to Zoom:
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {currentTask.evidence.map((ev) => (
                        <EvidenceImageViewer
                          key={ev.id}
                          evidence={ev}
                          laneCode={currentTask.lane?.laneCode}
                          workerName={user.name}
                          heightClass="h-28"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* STEP 3: SEND TASK & EVIDENCE TO SUPERVISOR */}
              {currentTask.status === 'IN_PROGRESS' && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Final Work Remarks for Supervisor:
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. All assigned 4km swept clean. Median barrier grit removed completely."
                      value={completionRemarks}
                      onChange={(e) => setCompletionRemarks(e.target.value)}
                      className="w-full text-xs p-2.5 border border-[#E1E6EC] rounded focus:outline-none focus:ring-1 focus:ring-[#14243A]"
                    />
                  </div>

                  {/* Road Obstruction / Incident Toggle */}
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs space-y-2">
                    <label className="flex items-center space-x-2 cursor-pointer font-semibold text-amber-900">
                      <input
                        type="checkbox"
                        checked={hasObstruction}
                        onChange={(e) => {
                          setHasObstruction(e.target.checked);
                          setShowIncidentForm(e.target.checked);
                        }}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span>Report Road Hazard / Obstruction Incident</span>
                    </label>

                    {showIncidentForm && (
                      <div className="space-y-2 pt-2 border-t border-amber-200">
                        <select
                          value={incidentType}
                          onChange={(e) => setIncidentType(e.target.value)}
                          className="w-full text-xs p-1.5 border border-amber-300 rounded bg-white"
                        >
                          <option value="ROAD_OBSTRUCTION">Road Obstruction / Heavy Debris</option>
                          <option value="ACCIDENT">Accident / Vehicle Breakdown</option>
                          <option value="HAZARD">Oil Spill / Chemical Spill</option>
                          <option value="OTHER">Other Safety Hazard</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Incident description..."
                          value={incidentDesc}
                          onChange={(e) => setIncidentDesc(e.target.value)}
                          className="w-full text-xs p-1.5 border border-amber-300 rounded bg-white"
                        />
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleSubmitAndSendToSupervisor}
                    disabled={isSubmitting}
                    className="w-full btn-field-touch bg-[#14243A] hover:bg-[#1E324F] text-white rounded-lg font-bold text-sm flex items-center justify-center space-x-2 shadow-md transition"
                  >
                    <Send className="w-5 h-5 text-emerald-400" />
                    <span>SUBMIT WORK & SEND TO SUPERVISOR</span>
                  </button>
                </div>
              )}

              {/* WORK COMPLETED / SENT TO SUPERVISOR STATE */}
              {(currentTask.status === 'COMPLETED' || currentTask.status === 'VERIFIED') && (
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-lg space-y-3">
                  <div className="flex items-center space-x-2 text-emerald-800 text-xs font-bold">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Work Completed & Sent to Supervisor!</span>
                  </div>
                  <p className="text-xs text-emerald-900">
                    Your task photos and remarks are logged. You are now eligible to travel to the nearest authorized hub station and scan the dynamic QR code for attendance verification.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('NEAREST_HUB')}
                    className="w-full py-2.5 bg-[#14243A] text-white rounded text-xs font-semibold flex items-center justify-center space-x-1.5"
                  >
                    <span>Detect Nearest Hub & Scan QR</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-[#E1E6EC] p-8 text-center text-xs text-slate-500 space-y-3">
              <FileText className="w-8 h-8 mx-auto text-slate-300" />
              <p>No task selected. Click "+ Enter New Work Done" above to record unassigned highway cleaning.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: NEAREST HUB DETECTION & QR SCANNER */}
      {activeTab === 'NEAREST_HUB' && (
        <div className="bg-white rounded-xl border border-[#E1E6EC] shadow-sm p-5 space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-bold text-sm text-[#14243A]">Nearest Authorized Hub Detection</h3>
            <p className="text-xs text-[#718096]">
              Real-time Haversine distance and directional navigation to authorized check-in kiosks.
            </p>
          </div>

          {/* GPS Telemetry Pill */}
          <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded border border-slate-200 font-mono">
            <div className="flex items-center space-x-1.5 text-slate-700">
              <Navigation className="w-3.5 h-3.5 text-blue-600" />
              <span>GPS: {userGps ? `${userGps.lat.toFixed(4)}, ${userGps.lng.toFixed(4)}` : 'Detecting...'}</span>
            </div>
            <button
              onClick={requestGpsLocation}
              className="text-[11px] text-blue-600 hover:underline flex items-center space-x-1"
            >
              <RefreshCw className={`w-3 h-3 ${gpsLoading ? 'animate-spin' : ''}`} />
              <span>Refresh GPS</span>
            </button>
          </div>

          {/* Nearest Hub Card */}
          {nearestHub ? (
            <div className="p-4 rounded-xl border-2 border-[#14243A] bg-slate-50 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#14243A] text-white">
                  {nearestHub.hubCode}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded font-mono font-bold ${
                    nearestHub.isWithinGeofence
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  {nearestHub.isWithinGeofence ? 'WITHIN GEOFENCE' : `${nearestHub.distanceKm} KM AWAY`}
                </span>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900">{nearestHub.hubName}</h4>
                <p className="text-xs text-slate-600 mt-0.5">{nearestHub.physicalAddress}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-slate-200">
                <div>
                  <span className="text-slate-400">Distance:</span>
                  <div className="font-bold text-slate-800">{nearestHub.distanceMeters}m ({nearestHub.distanceKm} km)</div>
                </div>
                <div>
                  <span className="text-slate-400">Heading:</span>
                  <div className="font-bold text-slate-800">
                    {nearestHub.bearingDegrees}° ({nearestHub.cardinalDirection})
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-slate-400">
              Detecting nearest authorized company hub...
            </div>
          )}

          {/* BIG OUTDOOR ACTION: SCAN HUB QR CODE */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="w-full btn-field-touch bg-[#14243A] hover:bg-[#1E324F] text-white rounded-xl font-bold text-sm sm:text-base flex items-center justify-center space-x-2 shadow-lg transition"
            >
              <QrCode className="w-6 h-6 text-amber-400" />
              <span>OPEN CAMERA & SCAN HUB QR</span>
            </button>
            <p className="text-[11px] text-center text-slate-500">
              Point your camera directly at the hub kiosk dynamic screen.
            </p>
          </div>
        </div>
      )}

      {/* TAB 3: ATTENDANCE HISTORY */}
      {activeTab === 'HISTORY' && (
        <div className="bg-white rounded-xl border border-[#E1E6EC] shadow-sm p-5 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-bold text-sm text-[#14243A]">Attendance Verification Records</h3>
            <p className="text-xs text-[#718096]">Official cryptographic check-in receipts</p>
          </div>

          <div className="divide-y divide-slate-100">
            {attendanceHistory.length > 0 ? (
              attendanceHistory.map((rec) => (
                <div key={rec.id} className="py-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">{rec.date}</span>
                    <span
                      className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold ${
                        rec.status === 'ATTENDANCE_VERIFIED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : rec.status === 'PENDING_SUPERVISOR_APPROVAL'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {rec.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-slate-600">
                    Station: <strong>{rec.hub.name} ({rec.hub.hubCode})</strong>
                  </div>
                  {rec.verifiedAt && (
                    <div className="text-[11px] text-slate-400 font-mono">
                      Verified at: {new Date(rec.verifiedAt).toLocaleTimeString()}
                    </div>
                  )}
                  {rec.rejectionReason && (
                    <div className="text-[11px] text-rose-600 font-mono">Note: {rec.rejectionReason}</div>
                  )}
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                No previous attendance records found.
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: EDIT TASK DETAILS / ENTER WHAT WAS DONE */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-[#14243A] flex items-center space-x-1.5">
                <Edit3 className="w-4 h-4 text-blue-600" />
                <span>Edit Task / Specify Work Done</span>
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTaskEdit} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700">Task Title / Activity *</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="mt-1 w-full p-2 border border-slate-200 rounded focus:ring-1 focus:ring-[#14243A]"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Description of Actual Work Done</label>
                <textarea
                  rows={2}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Detail what was cleaned, swept, or repaired in the field..."
                  className="mt-1 w-full p-2 border border-slate-200 rounded focus:ring-1 focus:ring-[#14243A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700">Actual Start KM</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editKmStart}
                    onChange={(e) => setEditKmStart(e.target.value)}
                    className="mt-1 w-full p-2 border border-slate-200 rounded focus:ring-1 focus:ring-[#14243A]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">Actual End KM</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editKmEnd}
                    onChange={(e) => setEditKmEnd(e.target.value)}
                    className="mt-1 w-full p-2 border border-slate-200 rounded focus:ring-1 focus:ring-[#14243A]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Completion Remarks / Notes</label>
                <input
                  type="text"
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  placeholder="e.g. Heavy gravel removed; drainage trench cleared."
                  className="mt-1 w-full p-2 border border-slate-200 rounded focus:ring-1 focus:ring-[#14243A]"
                />
              </div>

              <div className="mt-5 flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-[#14243A] text-white rounded font-bold hover:bg-[#1E324F]"
                >
                  Save Task Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ENTER NEW COMPLETED WORK (UNSCHEDULED / AD-HOC) */}
      {isNewTaskModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-[#14243A] flex items-center space-x-1.5">
                <PlusCircle className="w-4 h-4 text-emerald-600" />
                <span>Enter New Completed Highway Work</span>
              </h3>
              <button onClick={() => setIsNewTaskModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomTask} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700">Cleaning Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Emergency Tire Debris Sweep KM 14.8"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="mt-1 w-full p-2 border border-slate-200 rounded focus:ring-1 focus:ring-[#14243A]"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Detailed Description of Work Done</label>
                <textarea
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Describe the cleaning, obstruction clearance, or wash completed..."
                  className="mt-1 w-full p-2 border border-slate-200 rounded focus:ring-1 focus:ring-[#14243A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700">Start KM</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="14.0"
                    value={newKmStart}
                    onChange={(e) => setNewKmStart(e.target.value)}
                    className="mt-1 w-full p-2 border border-slate-200 rounded focus:ring-1 focus:ring-[#14243A]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">End KM</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="16.0"
                    value={newKmEnd}
                    onChange={(e) => setNewKmEnd(e.target.value)}
                    className="mt-1 w-full p-2 border border-slate-200 rounded focus:ring-1 focus:ring-[#14243A]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Completion Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. All glass and plastic fragments swept clean."
                  value={newRemarks}
                  onChange={(e) => setNewRemarks(e.target.value)}
                  className="mt-1 w-full p-2 border border-slate-200 rounded focus:ring-1 focus:ring-[#14243A]"
                />
              </div>

              <div className="mt-5 flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewTaskModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-[#14243A] text-white rounded font-bold hover:bg-[#1E324F]"
                >
                  Create & Assign Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Scanner Camera Modal */}
      <QrScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleQrScanned}
      />
    </div>
  );
};
