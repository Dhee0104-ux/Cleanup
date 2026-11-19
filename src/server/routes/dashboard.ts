import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireRoles, AuthenticatedRequest } from '../auth.js';

const router = Router();

// Task handler: Get command center operational metrics & real-time stats (Admin Only)
const handleGetCommandCenterMetrics = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Employee metrics
    const totalEmployees = await prisma.employee.count();
    const activeWorkers = await prisma.employee.count({ where: { status: 'ACTIVE' } });

    // 2. Active assignments & cleaning status today
    const todayAssignments = await prisma.workerAssignment.findMany({
      where: { date: todayStr },
      include: {
        tasks: {
          include: {
            evidence: true,
            verifications: true,
          },
        },
        lane: true,
      },
    });

    const assignedWorkerIds = new Set(todayAssignments.map((a) => a.employeeId));
    const absentCount = Math.max(0, activeWorkers - assignedWorkerIds.size);

    const allTasksToday = todayAssignments.flatMap((a) => a.tasks);
    const workersCurrentlyCleaning = allTasksToday.filter((t) => t.status === 'IN_PROGRESS').length;
    const completedTasks = allTasksToday.filter((t) => ['COMPLETED', 'VERIFIED'].includes(t.status)).length;
    const pendingVerification = allTasksToday.filter((t) => t.status === 'COMPLETED').length;

    // 3. Attendance metrics today
    const attendanceRecordsToday = await prisma.attendanceRecord.findMany({
      where: { date: todayStr },
      include: { hub: true },
    });

    const attendanceVerified = attendanceRecordsToday.filter(
      (r) => r.status === 'ATTENDANCE_VERIFIED'
    ).length;
    const attendanceRejected = attendanceRecordsToday.filter(
      (r) => r.status === 'ATTENDANCE_REJECTED'
    ).length;
    const pendingApprovals = attendanceRecordsToday.filter(
      (r) => r.status === 'PENDING_SUPERVISOR_APPROVAL'
    ).length;

    // 4. Active Hubs
    const activeHubs = await prisma.hub.count({ where: { isActive: true } });

    // 5. Four-Lane cleaning progress breakdown
    const lanes = await prisma.lane.findMany({
      include: {
        highwaySection: true,
        assignments: {
          where: { date: todayStr },
          include: { tasks: true },
        },
      },
      orderBy: { laneCode: 'asc' },
    });

    const laneProgress = lanes.map((lane) => {
      const laneTasks = lane.assignments.flatMap((a) => a.tasks);
      const total = laneTasks.length;
      const completed = laneTasks.filter((t) => ['COMPLETED', 'VERIFIED'].includes(t.status)).length;
      const inProgress = laneTasks.filter((t) => t.status === 'IN_PROGRESS').length;
      const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

      return {
        laneId: lane.id,
        laneCode: lane.laneCode,
        name: lane.name,
        category: lane.category,
        direction: lane.direction,
        sectionName: lane.highwaySection.name,
        assignedWorkers: lane.assignments.length,
        totalTasks: total,
        completedTasks: completed,
        inProgressTasks: inProgress,
        completionPercentage: percentage,
        status: inProgress > 0 ? 'IN_PROGRESS' : completed > 0 ? 'COMPLETED' : 'IDLE',
      };
    });

    // 6. Hub-wise check-in activity
    const hubs = await prisma.hub.findMany({
      include: {
        attendanceRecords: {
          where: { date: todayStr },
        },
      },
    });

    const hubActivity = hubs.map((hub) => ({
      hubId: hub.id,
      hubCode: hub.hubCode,
      name: hub.name,
      checkInsToday: hub.attendanceRecords.length,
      verifiedCount: hub.attendanceRecords.filter((a) => a.status === 'ATTENDANCE_VERIFIED').length,
      exceptionCount: hub.attendanceRecords.filter((a) => a.status === 'PENDING_SUPERVISOR_APPROVAL').length,
    }));

    // 7. Recent activity timeline (latest 10 events)
    const recentEvents = await prisma.attendanceEvent.findMany({
      take: 10,
      orderBy: { timestamp: 'desc' },
      include: {
        employee: { include: { user: { select: { name: true } } } },
        hub: { select: { hubCode: true, name: true } },
      },
    });

    // 8. Recent Audit & Security Alerts
    const securityAlerts = await prisma.auditLog.findMany({
      take: 8,
      orderBy: { timestamp: 'desc' },
      include: {
        user: { select: { name: true, email: true, role: true } },
      },
    });

    res.json({
      success: true,
      metrics: {
        totalEmployees,
        activeWorkers,
        workersCurrentlyCleaning,
        completedTasks,
        pendingVerification,
        attendanceVerified,
        attendanceRejected,
        pendingApprovals,
        absentCount,
        activeHubs,
      },
      laneProgress,
      hubActivity,
      recentEvents: recentEvents.map((e) => ({
        id: e.id,
        type: e.eventType,
        workerName: e.employee.user.name,
        hubName: e.hub?.name || 'Field',
        hubCode: e.hub?.hubCode || 'N/A',
        timestamp: e.timestamp.toISOString(),
      })),
      securityAlerts: securityAlerts.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        userName: a.user?.name || 'System',
        userRole: a.user?.role || 'SYSTEM',
        timestamp: a.timestamp.toISOString(),
        details: a.details ? JSON.parse(a.details) : {},
      })),
    });
  } catch (err: any) {
    console.error('Error fetching dashboard overview:', err);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to fetch dashboard metrics.' });
  }
};

// Task-specific route: get-command-center-metrics (and legacy /overview)
router.get('/get-command-center-metrics', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleGetCommandCenterMetrics);
router.get('/overview', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleGetCommandCenterMetrics);

// Task handler: Historical 7-day attendance trend analytics
const handleGetAttendanceTrendsAnalytics = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Generate dates for the last 7 days
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const records = await prisma.attendanceRecord.findMany({
      where: { date: { in: dates } },
    });

    const trends = dates.map((dateStr) => {
      const dayRecords = records.filter((r) => r.date === dateStr);
      const verified = dayRecords.filter((r) => r.status === 'ATTENDANCE_VERIFIED').length;
      const rejected = dayRecords.filter((r) => r.status === 'ATTENDANCE_REJECTED').length;
      const pending = dayRecords.filter((r) => r.status === 'PENDING_SUPERVISOR_APPROVAL').length;

      // Extract short day name (e.g. "Mon")
      const dayName = new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' });

      return {
        date: dateStr,
        day: dayName,
        verified,
        rejected,
        pending,
        total: dayRecords.length,
      };
    });

    res.json({ success: true, trends });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to fetch trends.' });
  }
};

// Task-specific route: get-attendance-trends-analytics (and legacy /attendance-trends)
router.get('/get-attendance-trends-analytics', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPERVISOR'), handleGetAttendanceTrendsAnalytics);
router.get('/attendance-trends', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPERVISOR'), handleGetAttendanceTrendsAnalytics);

export default router;
