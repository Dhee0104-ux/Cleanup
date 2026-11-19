import { io, Socket } from 'socket.io-client';
import {
  User,
  LaneOperational,
  Hub,
  CleaningTask,
  NearestHubResult,
  AttendanceRecord,
  DashboardMetrics,
} from './types.js';

const API_BASE = '/api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(window.location.origin, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      autoConnect: true,
    });
  }
  return socket;
}

export function getStoredToken(): string | null {
  return localStorage.getItem('token');
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP error ${res.status}`);
  }

  return data;
}

export const api = {
  // Auth Tasks
  async login(email: string, password: string): Promise<{ user: User; tokens: { accessToken: string } }> {
    const data = await request<{ success: boolean; user: User; tokens: { accessToken: string } }>('/auth/login-user', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(data.tokens.accessToken);
    return data;
  },

  async getMe(): Promise<{ user: User }> {
    return request<{ user: User }>('/auth/get-current-user-profile');
  },

  async logout(): Promise<void> {
    try {
      await request('/auth/logout-user', { method: 'POST' });
    } finally {
      setStoredToken(null);
    }
  },

  // Lanes & Sections Tasks
  async getLanes(): Promise<LaneOperational[]> {
    const data = await request<{ lanes: LaneOperational[] }>('/lanes/get-four-highway-lanes');
    return data.lanes;
  },

  async getHighwaySections(): Promise<any[]> {
    const data = await request<{ sections: any[] }>('/lanes/list-highway-sections');
    return data.sections;
  },

  async createHighwaySection(payload: {
    sectionCode: string;
    name: string;
    startKm: number;
    endKm: number;
    region?: string;
  }): Promise<any> {
    return request('/lanes/create-highway-section-with-four-lanes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Worker Tasks & Workforce Dispatch Tasks
  async getMyAssignment(): Promise<any> {
    const data = await request<{ assignment: any }>('/assignments/get-my-active-assignment');
    return data.assignment;
  },

  async getAssignments(params?: {
    date?: string;
    laneId?: string;
    employeeId?: string;
    status?: string;
  }): Promise<any[]> {
    const query = new URLSearchParams(params as any).toString();
    const data = await request<{ assignments: any[] }>(`/assignments/list-daily-dispatches${query ? '?' + query : ''}`);
    return data.assignments;
  },

  async createAssignment(payload: {
    employeeId: string;
    laneId: string;
    shiftId: string;
    supervisorId?: string;
    date?: string;
    taskTitle?: string;
    startKm?: number | string;
    endKm?: number | string;
    status?: string;
  }): Promise<{ success: boolean; message: string; assignment: any; task: any; wasUpdated?: boolean }> {
    return request('/assignments/dispatch-worker-to-lane', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateAssignment(
    id: string,
    payload: { laneId?: string; shiftId?: string; supervisorId?: string; status?: string }
  ): Promise<{ success: boolean; message: string; assignment: any }> {
    return request(`/assignments/reassign-worker-lane/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteAssignment(id: string): Promise<{ success: boolean; message: string }> {
    return request(`/assignments/revoke-worker-dispatch/${id}`, {
      method: 'DELETE',
    });
  },

  async getAssignmentMeta(): Promise<{
    shifts: any[];
    lanes: any[];
    supervisors: any[];
    employees: any[];
  }> {
    return request('/assignments/get-dispatch-metadata');
  },

  async getShifts(): Promise<any[]> {
    const data = await request<{ shifts: any[] }>('/assignments/get-operational-shifts');
    return data.shifts;
  },

  async getMyTasks(): Promise<CleaningTask[]> {
    const data = await request<{ tasks: CleaningTask[] }>('/tasks/get-my-assigned-tasks');
    return data.tasks;
  },

  async startTask(taskId: string): Promise<CleaningTask> {
    const data = await request<{ task: CleaningTask }>(`/tasks/start-cleaning-task/${taskId}`, { method: 'POST' });
    return data.task;
  },

  async uploadTaskEvidence(
    taskId: string,
    payload: {
      type: 'BEFORE_PHOTO' | 'AFTER_PHOTO' | 'OBSTRUCTION_PHOTO';
      caption?: string;
      latitude?: number;
      longitude?: number;
      imageBase64?: string;
      file?: File;
    }
  ): Promise<any> {
    if (payload.file) {
      const formData = new FormData();
      formData.append('image', payload.file);
      formData.append('type', payload.type);
      if (payload.caption) formData.append('caption', payload.caption);
      if (payload.latitude) formData.append('latitude', String(payload.latitude));
      if (payload.longitude) formData.append('longitude', String(payload.longitude));

      return request(`/tasks/upload-task-evidence/${taskId}`, {
        method: 'POST',
        body: formData,
      });
    }

    return request(`/tasks/upload-task-evidence/${taskId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async completeTask(taskId: string, remarks?: string, hasObstruction: boolean = false): Promise<CleaningTask> {
    const data = await request<{ task: CleaningTask }>(`/tasks/submit-task-completion/${taskId}`, {
      method: 'POST',
      body: JSON.stringify({ remarks, hasObstruction }),
    });
    return data.task;
  },

  async updateTask(
    taskId: string,
    payload: {
      title?: string;
      description?: string;
      targetKmStart?: number;
      targetKmEnd?: number;
      remarks?: string;
      hasObstruction?: boolean;
    }
  ): Promise<CleaningTask> {
    const data = await request<{ task: CleaningTask }>(`/tasks/update-cleaning-task/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return data.task;
  },

  async createCustomTask(payload: {
    title: string;
    description?: string;
    targetKmStart?: number;
    targetKmEnd?: number;
    remarks?: string;
    hasObstruction?: boolean;
    status?: 'IN_PROGRESS' | 'COMPLETED';
  }): Promise<CleaningTask> {
    const data = await request<{ task: CleaningTask }>('/tasks/log-worker-custom-task', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.task;
  },

  async createTaskForEmployee(payload: {
    employeeId: string;
    title: string;
    description?: string;
    laneId?: string;
    laneCode?: string;
    shiftId?: string;
    targetKmStart?: number;
    targetKmEnd?: number;
    remarks?: string;
    status?: 'PENDING' | 'IN_PROGRESS';
  }): Promise<{ success: boolean; message: string; task: CleaningTask }> {
    return request('/tasks/assign-task-to-employee', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async deleteTask(taskId: string): Promise<{ success: boolean; message: string; taskId: string }> {
    return request(`/tasks/delete-cleaning-task/${taskId}`, {
      method: 'DELETE',
    });
  },

  async reportIncident(
    taskId: string,
    incident: {
      type: string;
      title: string;
      description: string;
      severity?: string;
      latitude?: number;
      longitude?: number;
    }
  ): Promise<any> {
    return request(`/tasks/report-road-incident/${taskId}`, {
      method: 'POST',
      body: JSON.stringify(incident),
    });
  },

  // Hubs & Geolocation Tasks
  async getAllHubs(): Promise<Hub[]> {
    const data = await request<{ hubs: Hub[] }>('/hubs/list-company-hubs');
    return data.hubs;
  },

  async getNearestHub(lat: number, lng: number): Promise<{
    nearestHub: NearestHubResult;
    allHubs: NearestHubResult[];
  }> {
    return request<{ nearestHub: NearestHubResult; allHubs: NearestHubResult[] }>(
      `/hubs/calculate-nearest-hub-distance?lat=${lat}&lng=${lng}`
    );
  },

  // QR Code Generation & Verification Tasks
  async generateHubQr(hubId: string, validitySeconds: number = 45): Promise<{
    qrDataUrl: string;
    payloadString: string;
    expiresAt: string;
    secondsRemaining: number;
  }> {
    return request(`/hubs/generate-dynamic-qr-token/${hubId}`, {
      method: 'POST',
      body: JSON.stringify({ validitySeconds }),
    });
  },

  async getLatestHubQr(hubId: string): Promise<{
    qrDataUrl: string;
    payloadString: string;
    expiresAt: string;
    secondsRemaining: number;
  }> {
    return request(`/hubs/get-latest-active-hub-qr/${hubId}`);
  },

  async scanAttendance(payload: {
    qrPayload: string;
    workerLatitude?: number;
    workerLongitude?: number;
    accuracyMeters?: number;
    isExceptionRequest?: boolean;
    exceptionReason?: string;
  }): Promise<{
    success: boolean;
    verified: boolean;
    status: string;
    recordId: string;
    verifiedAt: string;
    message: string;
    hub: { id: string; hubCode: string; name: string; distanceMeters: number };
    lane: { code: string; name: string };
  }> {
    return request('/attendance/verify-hub-qr-attendance', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getMyAttendanceHistory(): Promise<AttendanceRecord[]> {
    const data = await request<{ records: AttendanceRecord[] }>('/attendance/get-worker-attendance-history');
    return data.records;
  },

  // Supervisor Operations Tasks
  async getSupervisorTeam(): Promise<any[]> {
    const data = await request<{ teamAssignments: any[] }>('/supervisor/get-supervisor-team-roster');
    return data.teamAssignments;
  },

  async getSupervisorPending(): Promise<{
    pendingTasks: CleaningTask[];
    pendingAttendance: AttendanceRecord[];
  }> {
    return request('/supervisor/get-pending-task-verifications');
  },

  async verifyTask(
    taskId: string,
    payload: {
      status: 'APPROVED' | 'REJECTED' | 'EXCEPTION_APPROVED';
      reviewNotes?: string;
      rejectionReason?: string;
      isException?: boolean;
      exceptionReason?: string;
    }
  ): Promise<any> {
    return request(`/supervisor/verify-worker-task-completion/${taskId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async approveException(attendanceId: string, approved: boolean, reason: string): Promise<any> {
    return request(`/supervisor/approve-attendance-exception/${attendanceId}`, {
      method: 'POST',
      body: JSON.stringify({ approved, reason }),
    });
  },

  // Dashboard & Command Center Tasks
  async getDashboardOverview(): Promise<{
    metrics: DashboardMetrics;
    laneProgress: any[];
    hubActivity: any[];
    recentEvents: any[];
    securityAlerts: any[];
  }> {
    return request('/dashboard/get-command-center-metrics');
  },

  async getAttendanceTrends(): Promise<any[]> {
    const data = await request<{ trends: any[] }>('/dashboard/get-attendance-trends-analytics');
    return data.trends;
  },

  async getAuditLogs(limit: number = 30): Promise<any[]> {
    const data = await request<{ logs: any[] }>(`/audit/get-system-audit-trail?limit=${limit}`);
    return data.logs;
  },
};
