import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireRoles, AuthenticatedRequest, createAuditLog } from '../auth.js';
import { verifyScannedQrPayload } from '../qr.js';
import { calculateHaversineDistance } from '../geo.js';
import { realTime } from '../socket.js';
import CONFIG from '../../config.js';

const router = Router();

// POST /api/attendance/verify-hub-qr-attendance (and alias /scan) - Complete 12-Step Attendance Verification Engine
const handleAttendanceScan = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { qrPayload, workerLatitude, workerLongitude, accuracyMeters, isExceptionRequest, exceptionReason } = req.body;

    if (!qrPayload) {
      res.status(400).json({
        success: false,
        verified: false,
        error: 'QR_PAYLOAD_REQUIRED',
        message: 'Scanned QR payload is required.',
      });
      return;
    }

    // Step 2 & 3: Identify worker & verify employee account active
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      res.status(403).json({
        success: false,
        verified: false,
        error: 'NOT_REGISTERED_WORKER',
        message: 'Only registered field workers with active employee records can check in.',
      });
      return;
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: true },
    });

    if (!employee || employee.status !== 'ACTIVE' || !employee.user.isActive) {
      res.status(403).json({
        success: false,
        verified: false,
        error: 'EMPLOYEE_INACTIVE',
        message: 'Your employee profile is inactive or suspended. Contact operations administrator.',
      });
      return;
    }

    // Step 4: Verify worker has a valid shift & assignment
    const todayStr = new Date().toISOString().split('T')[0];
    const assignment = await prisma.workerAssignment.findFirst({
      where: {
        employeeId,
        date: todayStr,
      },
      include: {
        lane: { include: { highwaySection: true } },
        shift: true,
        tasks: {
          include: { evidence: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!assignment) {
      await createAuditLog({
        userId: req.user?.id,
        action: 'ATTENDANCE_REJECTED_NO_SHIFT',
        entityType: 'ATTENDANCE',
        entityId: employeeId,
        details: { date: todayStr },
        ipAddress: req.ip,
      });

      res.status(400).json({
        success: false,
        verified: false,
        error: 'NO_SHIFT_ASSIGNED',
        message: 'No active shift or lane assignment found for you today. Cannot check in.',
      });
      return;
    }

    // Step 5 & 6: Verify assigned cleaning task and work completion state
    const currentTask = assignment.tasks[0];
    if (!currentTask) {
      res.status(400).json({
        success: false,
        verified: false,
        error: 'NO_TASK_FOUND',
        message: 'No cleaning task was assigned for your shift today.',
      });
      return;
    }

    // Rule: Scanning QR code MUST NOT automatically mean work is completed.
    // Worker MUST have submitted work completion or been verified!
    const allowedCompletionStatuses = ['COMPLETED', 'VERIFIED'];
    if (!allowedCompletionStatuses.includes(currentTask.status)) {
      await createAuditLog({
        userId: req.user?.id,
        action: 'ATTENDANCE_REJECTED_WORK_INCOMPLETE',
        entityType: 'ATTENDANCE',
        entityId: currentTask.id,
        details: { taskStatus: currentTask.status, laneCode: assignment.lane.laneCode },
        ipAddress: req.ip,
      });

      res.status(400).json({
        success: false,
        verified: false,
        error: 'WORK_NOT_COMPLETED',
        message: `Attendance rejected! Your cleaning work on ${assignment.lane.name} (${assignment.lane.laneCode}) is currently "${currentTask.status}". You must finish cleaning and submit work completion evidence before scanning at the hub.`,
      });
      return;
    }

    // Step 7, 8, 9: Cryptographic HMAC signature, server expiration, replay protection
    const qrVerification = await verifyScannedQrPayload(qrPayload, undefined, employeeId);
    if (!qrVerification.isValid) {
      await createAuditLog({
        userId: req.user?.id,
        action: 'QR_VERIFICATION_FAILED',
        entityType: 'ATTENDANCE',
        entityId: employeeId,
        details: { errorCode: qrVerification.errorCode, message: qrVerification.errorMessage },
        ipAddress: req.ip,
      });

      res.status(400).json({
        success: false,
        verified: false,
        error: qrVerification.errorCode || 'QR_INVALID',
        message: qrVerification.errorMessage || 'Invalid or expired QR code.',
      });
      return;
    }

    // Step 10: Verify target Hub exists and is active
    const hub = await prisma.hub.findUnique({
      where: { id: qrVerification.hubId! },
    });

    if (!hub || !hub.isActive) {
      res.status(400).json({
        success: false,
        verified: false,
        error: 'HUB_UNAVAILABLE',
        message: 'The hub where this QR was generated is currently inactive.',
      });
      return;
    }

    // Step 11: Validate GPS location if provided and enabled
    let calculatedDistanceM = 0;
    let isWithinRadius = true;

    if (workerLatitude !== undefined && workerLongitude !== undefined) {
      const lat = parseFloat(String(workerLatitude));
      const lng = parseFloat(String(workerLongitude));
      if (!isNaN(lat) && !isNaN(lng)) {
        calculatedDistanceM = calculateHaversineDistance(
          { latitude: lat, longitude: lng },
          { latitude: hub.latitude, longitude: hub.longitude }
        );
        isWithinRadius = calculatedDistanceM <= hub.geofenceRadiusM;
      }
    }

    // Determine final status:
    // If strict geofence is violated and no supervisor exception, route to PENDING_SUPERVISOR_APPROVAL
    let attendanceStatus: string = CONFIG.STATUS.ATTENDANCE.ATTENDANCE_VERIFIED;
    let isPendingApproval = false;

    if (CONFIG.GEO.ENFORCE_GEOFENCE && !isWithinRadius) {
      attendanceStatus = CONFIG.STATUS.ATTENDANCE.PENDING_SUPERVISOR_APPROVAL;
      isPendingApproval = true;
    }

    if (isExceptionRequest) {
      attendanceStatus = CONFIG.STATUS.ATTENDANCE.PENDING_SUPERVISOR_APPROVAL;
      isPendingApproval = true;
    }

    // Check if worker already has a verified attendance record today
    const existingAttendance = await prisma.attendanceRecord.findFirst({
      where: {
        employeeId,
        date: todayStr,
        status: CONFIG.STATUS.ATTENDANCE.ATTENDANCE_VERIFIED,
      },
    });

    if (existingAttendance) {
      res.status(409).json({
        success: false,
        verified: false,
        error: 'ALREADY_CHECKED_IN',
        message: `You have already verified attendance for today (${todayStr}) at ${existingAttendance.verifiedAt?.toLocaleTimeString() || 'earlier'}.`,
      });
      return;
    }

    // Step 12: Record attendance securely in transaction
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      // Create attendance record
      const record = await tx.attendanceRecord.create({
        data: {
          employeeId,
          hubId: hub.id,
          taskId: currentTask.id,
          date: todayStr,
          status: attendanceStatus,
          verifiedAt: isPendingApproval ? null : now,
          hubDistanceMeters: calculatedDistanceM,
          qrTokenUsed: qrVerification.tokenId,
          rejectionReason: isPendingApproval ? (exceptionReason || 'Geofence radius breach / exception filed') : null,
        },
      });

      // Record immutable attendance audit event
      await tx.attendanceEvent.create({
        data: {
          attendanceRecordId: record.id,
          employeeId,
          hubId: hub.id,
          eventType: isPendingApproval ? 'EXCEPTION_FILED' : 'ATTENDANCE_CONFIRMED',
          payload: JSON.stringify({
            hubCode: hub.hubCode,
            hubName: hub.name,
            laneCode: assignment.lane.laneCode,
            distanceMeters: calculatedDistanceM,
            status: attendanceStatus,
          }),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] as string,
        },
      });

      // Record location verification telemetry if GPS was supplied
      if (workerLatitude !== undefined && workerLongitude !== undefined) {
        await tx.locationVerification.create({
          data: {
            attendanceRecordId: record.id,
            workerLatitude: parseFloat(String(workerLatitude)),
            workerLongitude: parseFloat(String(workerLongitude)),
            hubLatitude: hub.latitude,
            hubLongitude: hub.longitude,
            calculatedDistanceM,
            allowedRadiusM: hub.geofenceRadiusM,
            isWithinRadius,
            accuracyMeters: accuracyMeters ? parseFloat(String(accuracyMeters)) : null,
          },
        });
      }

      // If verified, mark assignment status as COMPLETED
      if (!isPendingApproval) {
        await tx.workerAssignment.update({
          where: { id: assignment.id },
          data: { status: 'COMPLETED' },
        });

        // Also update task status to VERIFIED if not already
        await tx.cleaningTask.update({
          where: { id: currentTask.id },
          data: { status: 'VERIFIED' },
        });
      }

      return record;
    });

    // Step 13: Broadcast real-time event to supervisor & admin dashboards
    realTime.emitAttendanceCheckIn({
      recordId: result.id,
      employeeName: employee.user.name,
      employeeCode: employee.employeeCode,
      hubId: hub.id,
      hubName: hub.name,
      laneCode: assignment.lane.laneCode,
      laneName: assignment.lane.name,
      status: attendanceStatus,
      timestamp: now.toISOString(),
    });

    await createAuditLog({
      userId: req.user?.id,
      action: isPendingApproval ? 'ATTENDANCE_QUEUED_APPROVAL' : 'ATTENDANCE_VERIFIED',
      entityType: 'ATTENDANCE',
      entityId: result.id,
      details: {
        hubCode: hub.hubCode,
        distanceMeters: calculatedDistanceM,
        laneCode: assignment.lane.laneCode,
      },
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      verified: !isPendingApproval,
      status: attendanceStatus,
      recordId: result.id,
      verifiedAt: now.toISOString(),
      hub: {
        id: hub.id,
        hubCode: hub.hubCode,
        name: hub.name,
        distanceMeters: Math.round(calculatedDistanceM),
      },
      lane: {
        code: assignment.lane.laneCode,
        name: assignment.lane.name,
      },
      message: isPendingApproval
        ? 'Attendance submitted and forwarded for supervisor exception approval.'
        : 'Attendance and cleaning work successfully verified at company hub!',
    });
  } catch (err: any) {
    console.error('Error during attendance scan verification:', err);
    res.status(500).json({
      success: false,
      verified: false,
      error: 'SERVER_ERROR',
      message: 'Failed to verify attendance. Server encountered an unexpected condition.',
    });
  }
};

// Task-specific route: verify-hub-qr-attendance (and legacy /scan)
router.post('/verify-hub-qr-attendance', requireAuth, handleAttendanceScan);
router.post('/scan', requireAuth, handleAttendanceScan);

// Handler: List attendance records (Admin / Supervisor)
const handleListAttendance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { date, status, employeeId, hubId } = req.query;
    const where: any = {};
    if (date) where.date = String(date);
    if (status) where.status = String(status);
    if (employeeId) where.employeeId = String(employeeId);
    if (hubId) where.hubId = String(hubId);

    const records = await prisma.attendanceRecord.findMany({
      where,
      include: {
        employee: { include: { user: { select: { name: true, email: true } } } },
        hub: true,
        task: { include: { lane: true } },
        locationVerification: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({ success: true, records });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to fetch attendance.' });
  }
};

// Task-specific route: list-attendance-records (and legacy /)
router.get('/list-attendance-records', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPERVISOR'), handleListAttendance);
router.get('/', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPERVISOR'), handleListAttendance);

// Handler: Worker fetches their attendance history
const handleGetWorkerAttendanceHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      res.status(403).json({ success: false, error: 'NOT_A_WORKER', message: 'Employee profile required.' });
      return;
    }

    const records = await prisma.attendanceRecord.findMany({
      where: { employeeId },
      include: {
        hub: true,
        task: { include: { lane: true } },
        locationVerification: true,
      },
      orderBy: { date: 'desc' },
      take: 30,
    });

    res.json({ success: true, records });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to fetch history.' });
  }
};

// Task-specific route: get-worker-attendance-history (and legacy /my)
router.get('/get-worker-attendance-history', requireAuth, handleGetWorkerAttendanceHistory);
router.get('/my', requireAuth, handleGetWorkerAttendanceHistory);

export default router;
