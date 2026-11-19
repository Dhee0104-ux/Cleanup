import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireRoles, AuthenticatedRequest, createAuditLog } from '../auth.js';
import CONFIG from '../../config.js';

const router = Router();

// Task handler: Get four operational highway lanes (L01, L02, L03, L04)
const handleGetFourHighwayLanes = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const lanes = await prisma.lane.findMany({
      include: {
        highwaySection: true,
        supervisor: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
        assignments: {
          where: { status: { in: ['ASSIGNED', 'ACTIVE'] } },
          include: {
            employee: {
              include: {
                user: { select: { name: true } },
              },
            },
            shift: true,
            tasks: {
              include: {
                evidence: true,
                verifications: true,
              },
            },
          },
        },
      },
      orderBy: [{ highwaySectionId: 'asc' }, { laneCode: 'asc' }],
    });

    // Format rich operational lane status
    const operationalLanes = lanes.map((lane) => {
      const activeAssignments = lane.assignments;
      const allTasks = activeAssignments.flatMap((a) => a.tasks);
      const inProgressTasks = allTasks.filter((t) => t.status === 'IN_PROGRESS');
      const completedTasks = allTasks.filter((t) => ['COMPLETED', 'VERIFIED'].includes(t.status));
      const pendingReviewTasks = allTasks.filter((t) => t.status === 'COMPLETED');

      // Determine dynamic lane operational status
      let calculatedStatus = 'IDLE';
      if (inProgressTasks.length > 0) {
        calculatedStatus = 'IN_PROGRESS';
      } else if (completedTasks.length > 0 && inProgressTasks.length === 0) {
        calculatedStatus = 'COMPLETED';
      } else if (activeAssignments.length > 0) {
        calculatedStatus = 'ASSIGNED';
      }

      const earliestStart = allTasks
        .filter((t) => t.startTime)
        .map((t) => t.startTime!.getTime())
        .sort((a, b) => a - b)[0];

      const latestCompletion = allTasks
        .filter((t) => t.completionTime)
        .map((t) => t.completionTime!.getTime())
        .sort((a, b) => b - a)[0];

      return {
        id: lane.id,
        laneCode: lane.laneCode,
        name: lane.name,
        category: lane.category,
        direction: lane.direction,
        status: calculatedStatus,
        highwaySection: {
          id: lane.highwaySection.id,
          code: lane.highwaySection.sectionCode,
          name: lane.highwaySection.name,
          startKm: lane.highwaySection.startKm,
          endKm: lane.highwaySection.endKm,
        },
        supervisor: lane.supervisor
          ? {
              id: lane.supervisor.id,
              code: lane.supervisor.supervisorCode,
              name: lane.supervisor.user.name,
              email: lane.supervisor.user.email,
            }
          : null,
        workerCount: activeAssignments.length,
        workers: activeAssignments.map((a) => ({
          employeeId: a.employee.id,
          employeeCode: a.employee.employeeCode,
          name: a.employee.user.name,
          shift: a.shift.name,
          taskStatus: a.tasks[0]?.status || 'PENDING',
        })),
        cleaningStartTime: earliestStart ? new Date(earliestStart).toISOString() : null,
        cleaningCompletionTime: latestCompletion ? new Date(latestCompletion).toISOString() : null,
        totalTasks: allTasks.length,
        inProgressCount: inProgressTasks.length,
        completedCount: completedTasks.length,
        pendingReviewCount: pendingReviewTasks.length,
        evidenceCount: allTasks.flatMap((t) => t.evidence).length,
      };
    });

    res.json({ success: true, lanes: operationalLanes });
  } catch (err: any) {
    console.error('Error fetching lanes:', err);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to fetch lanes.' });
  }
};

// Task-specific route: get-four-highway-lanes (and legacy /)
router.get('/get-four-highway-lanes', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPERVISOR'), handleGetFourHighwayLanes);
router.get('/', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPERVISOR'), handleGetFourHighwayLanes);

// Task handler: List all highway sections
const handleListHighwaySections = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const sections = await prisma.highwaySection.findMany({
      include: {
        lanes: true,
        hubs: true,
      },
      orderBy: { startKm: 'asc' },
    });
    res.json({ success: true, sections });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to fetch sections.' });
  }
};

// Task-specific route: list-highway-sections (and legacy /sections)
router.get('/list-highway-sections', requireAuth, handleListHighwaySections);
router.get('/sections', requireAuth, handleListHighwaySections);

// Task handler: Create a new highway section and auto-provision all four lanes (Admin)
const handleCreateHighwaySection = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { sectionCode, name, startKm, endKm, region } = req.body;
    if (!sectionCode || !name || startKm === undefined || endKm === undefined) {
      res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'Section code, name, startKm, and endKm are required.',
      });
      return;
    }

    const section = await prisma.highwaySection.create({
      data: {
        sectionCode,
        name,
        startKm: parseFloat(startKm),
        endKm: parseFloat(endKm),
        region: region || 'Main Corridor',
      },
    });

    // Automatically initialize all 4 lanes for this section!
    const createdLanes = await Promise.all(
      CONFIG.LANES.map((laneDef) =>
        prisma.lane.create({
          data: {
            laneCode: laneDef.code,
            name: laneDef.name,
            category: laneDef.category,
            highwaySectionId: section.id,
            direction: 'Northbound',
            status: 'IDLE',
          },
        })
      )
    );

    await createAuditLog({
      userId: req.user?.id,
      action: 'SECTION_AND_LANES_CREATED',
      entityType: 'HIGHWAY_SECTION',
      entityId: section.id,
      details: { sectionCode, lanesCount: createdLanes.length },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      section,
      lanes: createdLanes,
    });
  } catch (err: any) {
    console.error('Error creating section:', err);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to create section.' });
  }
};

// Task-specific route: create-highway-section-with-four-lanes (and legacy /sections)
router.post('/create-highway-section-with-four-lanes', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleCreateHighwaySection);
router.post('/sections', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleCreateHighwaySection);

// Task handler: Assign supervisor to lane
const handleAssignSupervisorToLane = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const laneId = req.params.id || req.body.laneId;
    const { supervisorId } = req.body;
    const updatedLane = await prisma.lane.update({
      where: { id: laneId },
      data: { supervisorId: supervisorId || null },
      include: { supervisor: { include: { user: true } } },
    });

    res.json({ success: true, lane: updatedLane });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to assign supervisor.' });
  }
};

// Task-specific route: assign-supervisor-to-lane (and legacy /:id/supervisor)
router.put('/assign-supervisor-to-lane/:id', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleAssignSupervisorToLane);
router.put('/assign-supervisor-to-lane', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleAssignSupervisorToLane);
router.put('/:id/supervisor', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleAssignSupervisorToLane);

export default router;
