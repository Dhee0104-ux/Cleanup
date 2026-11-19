export type UserRole =
  | 'SUPER_ADMIN'
  | 'OPERATIONS_ADMIN'
  | 'SUPERVISOR'
  | 'HUB_OPERATOR'
  | 'FIELD_WORKER';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  employeeId?: string;
  employeeCode?: string;
  supervisorId?: string;
  supervisorCode?: string;
  hubId?: string;
}

export interface HighwaySection {
  id: string;
  sectionCode: string;
  name: string;
  startKm: number;
  endKm: number;
  region: string;
}

export interface LaneOperational {
  id: string;
  laneCode: 'L01' | 'L02' | 'L03' | 'L04';
  name: string;
  category: string;
  direction: string;
  status: 'IDLE' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'MAINTENANCE';
  highwaySection: {
    id: string;
    code: string;
    name: string;
    startKm: number;
    endKm: number;
  };
  supervisor: {
    id: string;
    code: string;
    name: string;
    email: string;
  } | null;
  workerCount: number;
  workers: Array<{
    employeeId: string;
    employeeCode: string;
    name: string;
    shift: string;
    taskStatus: string;
  }>;
  cleaningStartTime: string | null;
  cleaningCompletionTime: string | null;
  totalTasks: number;
  inProgressCount: number;
  completedCount: number;
  pendingReviewCount: number;
  evidenceCount: number;
}

export interface Hub {
  id: string;
  hubCode: string;
  name: string;
  physicalAddress: string;
  latitude: number;
  longitude: number;
  geofenceRadiusM: number;
  isActive: boolean;
  operator?: {
    id: string;
    name: string;
    email: string;
  };
  _count?: {
    attendanceRecords: number;
  };
}

export interface Shift {
  id: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

export interface WorkerAssignment {
  id: string;
  employeeId: string;
  laneId: string;
  shiftId: string;
  supervisorId: string | null;
  date: string;
  status: 'ASSIGNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
  employee?: {
    id: string;
    employeeCode: string;
    phone?: string;
    skills?: string;
    user: {
      id: string;
      name: string;
      email: string;
    };
  };
  lane?: {
    id: string;
    laneCode: string;
    name: string;
    category?: string;
    direction?: string;
    highwaySection?: {
      id: string;
      sectionCode: string;
      name: string;
      startKm: number;
      endKm: number;
    };
  };
  shift?: Shift;
  supervisor?: {
    id: string;
    supervisorCode: string;
    user: {
      name: string;
    };
  } | null;
  tasks?: CleaningTask[];
}

export interface CleaningTask {
  id: string;
  assignmentId: string;
  employeeId: string;
  laneId: string;
  shiftId: string;
  title: string;
  description?: string;
  targetKmStart: number;
  targetKmEnd: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'VERIFIED' | 'REJECTED';
  startTime?: string;
  completionTime?: string;
  remarks?: string;
  hasObstruction: boolean;
  lane: {
    laneCode: string;
    name: string;
    highwaySection?: HighwaySection;
  };
  shift?: {
    name: string;
    startTime: string;
    endTime: string;
  };
  employee?: {
    employeeCode: string;
    user: {
      name: string;
    };
  };
  evidence: Array<{
    id: string;
    type: 'BEFORE_PHOTO' | 'AFTER_PHOTO' | 'OBSTRUCTION_PHOTO';
    imageUrl: string;
    caption?: string;
    capturedAt: string;
  }>;
  verifications?: Array<{
    id: string;
    status: string;
    reviewNotes?: string;
    rejectionReason?: string;
    isException: boolean;
    reviewedAt: string;
  }>;
}

export interface NearestHubResult {
  hubId: string;
  hubCode: string;
  hubName: string;
  latitude: number;
  longitude: number;
  physicalAddress: string;
  distanceMeters: number;
  distanceKm: number;
  bearingDegrees: number;
  cardinalDirection: string;
  geofenceRadiusM: number;
  isWithinGeofence: boolean;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  status: 'ATTENDANCE_VERIFIED' | 'ATTENDANCE_REJECTED' | 'PENDING_SUPERVISOR_APPROVAL';
  verifiedAt?: string;
  rejectionReason?: string;
  hubDistanceMeters?: number;
  employee?: {
    employeeCode: string;
    user: {
      name: string;
      email?: string;
    };
  };
  hub: {
    hubCode: string;
    name: string;
  };
  task?: {
    title: string;
    lane: {
      laneCode: string;
      name: string;
    };
  };
  locationVerification?: {
    isWithinRadius: boolean;
    calculatedDistanceM: number;
    allowedRadiusM: number;
    workerLatitude: number;
    workerLongitude: number;
  };
}

export interface DashboardMetrics {
  totalEmployees: number;
  activeWorkers: number;
  workersCurrentlyCleaning: number;
  completedTasks: number;
  pendingVerification: number;
  attendanceVerified: number;
  attendanceRejected: number;
  pendingApprovals: number;
  absentCount: number;
  activeHubs: number;
}
