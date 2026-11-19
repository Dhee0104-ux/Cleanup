// Safe environment detection for both Node.js and Browser environments
const isBrowser = typeof window !== 'undefined';
const env: Record<string, string | undefined> =
  typeof process !== 'undefined' && process.env ? process.env : {};
const cwd: string =
  typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '';

/**
 * UNIFIED CONFIGURATION SYSTEM
 * Consolidates all environment variables, security settings,
 * role permissions, four-lane specifications, and operational parameters
 * in a single source of truth. Safe for both Browser and Node.js runtimes.
 */
export const CONFIG = {
  // --- SERVER ENVIRONMENT ---
  SERVER: {
    PORT: parseInt(env.PORT || '4001', 10),
    NODE_ENV: env.NODE_ENV || 'development',
    HOST: env.HOST || '0.0.0.0',
    CLIENT_ORIGIN: env.CLIENT_ORIGIN || 'http://localhost:5173',
  },

  // --- DATABASE CONFIGURATION ---
  DATABASE: {
    URL: env.DATABASE_URL || 'file:./dev.db',
    TYPE: env.DB_TYPE || 'sqlite', // 'sqlite' or 'postgresql'
  },

  // --- SECURITY & CRYPTOGRAPHY ---
  SECURITY: {
    JWT_SECRET: env.JWT_SECRET || 'super-secure-highway-wfm-jwt-secret-key-2026',
    JWT_EXPIRES_IN: env.JWT_EXPIRES_IN || '8h',
    REFRESH_SECRET: env.REFRESH_SECRET || 'super-secure-highway-refresh-secret-2026',
    REFRESH_EXPIRES_IN: env.REFRESH_EXPIRES_IN || '7d',
    BCRYPT_SALT_ROUNDS: 10,
    HMAC_QR_SECRET: env.QR_HMAC_SECRET || 'qr-dynamic-token-hmac-sha256-signing-secret-999',
    RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    RATE_LIMIT_MAX_REQUESTS: 250, // requests per window
    AUTH_RATE_LIMIT_MAX: 15,
  },

  // --- DYNAMIC QR CODE CONFIGURATION ---
  QR: {
    /** QR code validity window in seconds (Strictly 30 - 60 seconds as required) */
    VALIDITY_SECONDS: parseInt(env.QR_VALIDITY_SECONDS || '45', 10),
    MIN_VALIDITY_SECONDS: 30,
    MAX_VALIDITY_SECONDS: 60,
    /** Token payload signature algorithm */
    ALGORITHM: 'sha256',
    /** Allow small grace period for clock drift (seconds) */
    CLOCK_DRIFT_GRACE_SECONDS: 5,
    /** Single-use token enforcement */
    SINGLE_USE_ENFORCED: true,
  },

  // --- GEOLOCATION & HUB GEOFENCING ---
  GEO: {
    /** Earth mean radius in kilometers for Haversine computation */
    EARTH_RADIUS_KM: 6371.0,
    /** Maximum allowed distance from hub to scan QR code (meters) */
    DEFAULT_HUB_RADIUS_METERS: 500.0,
    /** Strict location verification toggle (can be overridden by supervisor exception) */
    ENFORCE_GEOFENCE: process.env.ENFORCE_GEOFENCE === 'true' || false,
    /** Maximum acceptable GPS accuracy threshold in meters */
    MAX_GPS_ACCURACY_METERS: 150.0,
  },

  // --- FOUR DISTINCT HIGHWAY LANES SPECIFICATION ---
  LANES: [
    {
      code: 'L01',
      name: 'Highway Left',
      category: 'HIGHWAY_LEFT',
      description: 'Main highway high-speed outer/left lane & median shoulder'
    },
    {
      code: 'L02',
      name: 'Highway Right',
      category: 'HIGHWAY_RIGHT',
      description: 'Main highway high-speed inner/right lane & safety barrier'
    },
    {
      code: 'L03',
      name: 'Service Road Left',
      category: 'SERVICE_ROAD_LEFT',
      description: 'Parallel service arterial road left boundary & drainage trench'
    },
    {
      code: 'L04',
      name: 'Service Road Right',
      category: 'SERVICE_ROAD_RIGHT',
      description: 'Parallel service arterial road right boundary & curb walkway'
    }
  ] as const,

  // --- ROLE-BASED ACCESS CONTROL (RBAC) & FIXED HIERARCHY ---
  ROLES: {
    SUPER_ADMIN: 'SUPER_ADMIN',
    OPERATIONS_ADMIN: 'OPERATIONS_ADMIN',
    SUPERVISOR: 'SUPERVISOR',
    HUB_OPERATOR: 'HUB_OPERATOR',
    FIELD_WORKER: 'FIELD_WORKER',
  } as const,

  // Fixed Operational Hierarchy Levels (Higher level = higher authority)
  HIERARCHY_LEVELS: {
    SUPER_ADMIN: 5,
    OPERATIONS_ADMIN: 4,
    SUPERVISOR: 3,
    HUB_OPERATOR: 2,
    FIELD_WORKER: 1,
  } as const,

  // Dedicated Page Routes for each Role in the Hierarchy
  ROLE_ROUTES: {
    SUPER_ADMIN: '/admin',
    OPERATIONS_ADMIN: '/operations',
    SUPERVISOR: '/supervisor',
    HUB_OPERATOR: '/hub',
    FIELD_WORKER: '/worker',
  } as const,

  ROLE_PERMISSIONS: {
    SUPER_ADMIN: [
      'manage:all',
      'manage:users',
      'manage:hubs',
      'manage:sections',
      'manage:lanes',
      'view:audit_logs',
      'configure:system',
      'view:reports',
      'manage:exceptions'
    ],
    OPERATIONS_ADMIN: [
      'register:workers',
      'assign:lanes',
      'create:shifts',
      'assign:supervisors',
      'view:attendance',
      'monitor:progress',
      'generate:reports'
    ],
    SUPERVISOR: [
      'view:team',
      'assign:tasks',
      'monitor:workers',
      'verify:tasks',
      'approve:exceptions',
      'view:team_reports'
    ],
    HUB_OPERATOR: [
      'access:hub_portal',
      'generate:hub_qr',
      'view:incoming_scans',
      'verify:checkin'
    ],
    FIELD_WORKER: [
      'access:worker_app',
      'view:assigned_lane',
      'view:tasks',
      'start:work',
      'complete:work',
      'upload:evidence',
      'scan:hub_qr',
      'view:attendance_history'
    ]
  },

  // --- OPERATIONAL STATUS ENUMS ---
  STATUS: {
    TASK: {
      PENDING: 'PENDING',
      IN_PROGRESS: 'IN_PROGRESS',
      COMPLETED: 'COMPLETED',
      VERIFIED: 'VERIFIED',
      REJECTED: 'REJECTED'
    },
    ATTENDANCE: {
      WORK_STARTED: 'WORK_STARTED',
      IN_PROGRESS: 'IN_PROGRESS',
      WORK_COMPLETED: 'WORK_COMPLETED',
      ATTENDANCE_VERIFIED: 'ATTENDANCE_VERIFIED',
      ATTENDANCE_REJECTED: 'ATTENDANCE_REJECTED',
      PENDING_SUPERVISOR_APPROVAL: 'PENDING_SUPERVISOR_APPROVAL'
    },
    VERIFICATION: {
      APPROVED: 'APPROVED',
      REJECTED: 'REJECTED',
      EXCEPTION_APPROVED: 'EXCEPTION_APPROVED'
    },
    INCIDENT_SEVERITY: {
      LOW: 'LOW',
      MEDIUM: 'MEDIUM',
      HIGH: 'HIGH',
      CRITICAL: 'CRITICAL'
    }
  },

  // --- EVIDENCE & FILE STORAGE CONFIGURATION ---
  STORAGE: {
    UPLOAD_DIR: isBrowser
      ? '/uploads'
      : (cwd ? cwd.replace(/[\\/]$/, '') + '/uploads' : 'uploads'),
    MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
    ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
  }
} as const;

export type UserRole = keyof typeof CONFIG.ROLES;
export type TaskStatus = keyof typeof CONFIG.STATUS.TASK;
export type AttendanceStatus = keyof typeof CONFIG.STATUS.ATTENDANCE;
export default CONFIG;
