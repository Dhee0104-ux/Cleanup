import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireRoles, AuthenticatedRequest, createAuditLog } from '../auth.js';
import { realTime } from '../socket.js';

const router = Router();

// Task handler: View assigned workers and their current status
const handleGetSupervisorTeam = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const supervisorId = req.user?.supervisorId;
    const todayStr = new Date().toISOString().split('T')[0];

    // Build filter: if supervisor, show their team; if admin, show all
    const whereClause: any = {};
    if (req.user?.role === 'SUPERVISOR' && supervisorId) {
      whereClause.supervisorId = supervisorId;
    }

    const assignments = await prisma.workerAssignment.findMany({
      where: {
        ...whereClause,
        date: todayStr,
      },
      include: {
        employee: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        lane: { include: { highwaySection: true } },
        shift: true,
        tasks: {
          include: {
            evidence: true,
            verifications: true,
          },
        },
      },
    });

    res.json({ success: true, teamAssignments: assignments });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to fetch team.' });
  }
};

// Task-specific route: get-supervisor-team-roster (and legacy /team)
router.get('/get-supervisor-team-roster', requireAuth, requireRoles('SUPERVISOR', 'SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleGetSupervisorTeam);
router.get('/team', requireAuth, requireRoles('SUPERVISOR', 'SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleGetSupervisorTeam);

// Task handler: Tasks awaiting supervisor completion review
const handleGetPendingVerifications = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const supervisorId = req.user?.supervisorId;
    const whereTask: any = {
      status: 'COMPLETED',
    };

    if (req.user?.role === 'SUPERVISOR' && supervisorId) {
      whereTask.assignment = { supervisorId };
    }

    const pendingTasks = await prisma.cleaningTask.findMany({
      where: whereTask,
      include: {
        employee: { include: { user: true } },
        lane: { include: { highwaySection: true } },
        shift: true,
        evidence: true,
        incidents: true,
      },
      orderBy: { completionTime: 'desc' },
    });

    // Also get attendance records pending exception approval
    const pendingAttendance = await prisma.attendanceRecord.findMany({
      where: { status: 'PENDING_SUPERVISOR_APPROVAL' },
      include: {
        employee: { include: { user: true } },
        hub: true,
        task: { include: { lane: true } },
        locationVerification: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      pendingTasks,
      pendingAttendance,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to fetch pending items.' });
  }
};

// Task-specific route: get-pending-task-verifications (and legacy /pending-verifications)
router.get('/get-pending-task-verifications', requireAuth, requireRoles('SUPERVISOR', 'SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleGetPendingVerifications);
router.get('/pending-verifications', requireAuth, requireRoles('SUPERVISOR', 'SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleGetPendingVerifications);

// Task handler: Approve or reject task completion
const handleVerifyTaskCompletion = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const taskId = req.params.id || req.body.taskId;
    const { status, reviewNotes, rejectionReason, isException, exceptionReason } = req.body;

    if (!status || !['APPROVED', 'REJECTED', 'EXCEPTION_APPROVED'].includes(status)) {
      res.status(400).json({
        success: false,
        error: 'INVALID_STATUS',
        message: 'Status must be APPROVED, REJECTED, or EXCEPTION_APPROVED.',
      });
      return;
    }

    if (status === 'REJECTED' && !rejectionReason) {
      res.status(400).json({
        success: false,
        error: 'REJECTION_REASON_REQUIRED',
        message: 'A mandatory rejection reason is required when rejecting work completion.',
      });
      return;
    }

    const task = await prisma.cleaningTask.findUnique({
      where: { id: taskId },
      include: { employee: true },
    });

    if (!task) {
      res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Task not found.' });
      return;
    }

    const supervisorId = req.user?.supervisorId || 'ADMIN_OVERRIDE';

    const verification = await prisma.taskVerification.create({
      data: {
        taskId,
        supervisorId: req.user?.supervisorId ? req.user.supervisorId : (await prisma.supervisor.findFirst())?.id || 'SYSTEM',
        status,
        reviewNotes,
        rejectionReason: status === 'REJECTED' ? rejectionReason : null,
        isException: Boolean(isException),
        exceptionReason,
      },
    });

    // Update task status accordingly
    const newStatus = status === 'REJECTED' ? 'REJECTED' : 'VERIFIED';
    await prisma.cleaningTask.update({
      where: { id: taskId },
      data: { status: newStatus },
    });

    await createAuditLog({
      userId: req.user?.id,
      action: `TASK_${status}`,
      entityType: 'CLEANING_TASK',
      entityId: taskId,
      details: { status, supervisorId, rejectionReason, exceptionReason },
      ipAddress: req.ip,
    });

    realTime.emitVerificationDecision({
      taskId,
      employeeId: task.employeeId,
      status: newStatus,
      isApproved: status !== 'REJECTED',
      reviewNotes: reviewNotes || rejectionReason,
    });

    res.json({
      success: true,
      verification,
      newStatus,
    });
  } catch (err: any) {
    console.error('Error verifying task:', err);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to record verification.' });
  }
};

// Task-specific route: verify-worker-task-completion (and legacy /verify-task/:id)
router.post('/verify-worker-task-completion/:id', requireAuth, requireRoles('SUPERVISOR', 'SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleVerifyTaskCompletion);
router.post('/verify-worker-task-completion', requireAuth, requireRoles('SUPERVISOR', 'SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleVerifyTaskCompletion);
router.post('/verify-task/:id', requireAuth, requireRoles('SUPERVISOR', 'SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleVerifyTaskCompletion);

// Task handler: Approve an attendance exception
const handleApproveAttendanceException = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const attendanceId = req.params.attendanceId || req.body.attendanceId;
    const { approved, reason } = req.body;

    if (!reason) {
      res.status(400).json({
        success: false,
        error: 'REASON_MANDATORY',
        message: 'A mandatory supervisory justification reason must be documented.',
      });
      return;
    }

    const attendance = await prisma.attendanceRecord.findUnique({
      where: { id: attendanceId },
      include: { employee: true },
    });

    if (!attendance) {
      res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Attendance record not found.' });
      return;
    }

    const finalStatus = approved ? 'ATTENDANCE_VERIFIED' : 'ATTENDANCE_REJECTED';

    const updated = await prisma.attendanceRecord.update({
      where: { id: attendanceId },
      data: {
        status: finalStatus,
        verifiedAt: approved ? new Date() : null,
        rejectionReason: approved ? null : reason,
      },
    });

    await createAuditLog({
      userId: req.user?.id,
      action: approved ? 'EXCEPTION_APPROVED' : 'EXCEPTION_REJECTED',
      entityType: 'ATTENDANCE',
      entityId: attendanceId,
      details: { supervisorReason: reason, employeeId: attendance.employeeId },
      ipAddress: req.ip,
    });

    res.json({ success: true, attendance: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to process exception.' });
  }
};

// Task-specific route: approve-attendance-exception (and legacy /approve-exception/:attendanceId)
router.post('/approve-attendance-exception/:attendanceId', requireAuth, requireRoles('SUPERVISOR', 'SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleApproveAttendanceException);
router.post('/approve-attendance-exception', requireAuth, requireRoles('SUPERVISOR', 'SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleApproveAttendanceException);
router.post('/approve-exception/:attendanceId', requireAuth, requireRoles('SUPERVISOR', 'SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleApproveAttendanceException);

export default router;
