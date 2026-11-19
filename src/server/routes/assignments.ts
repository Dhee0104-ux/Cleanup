import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireRoles, AuthenticatedRequest, createAuditLog } from '../auth.js';
import { realTime } from '../socket.js';

const router = Router();

// Task handler: Get current logged-in worker's active assignment
const handleGetMyAssignment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      res.status(403).json({
        success: false,
        error: 'NOT_A_WORKER',
        message: 'Current user does not have a linked employee record.',
      });
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // Find assignment for today or latest active assignment
    let assignment = await prisma.workerAssignment.findFirst({
      where: {
        employeeId,
        date: todayStr,
      },
      include: {
        lane: {
          include: {
            highwaySection: true,
            supervisor: { include: { user: { select: { name: true } } } },
          },
        },
        shift: true,
        tasks: {
          include: {
            evidence: true,
            verifications: true,
            incidents: true,
          },
        },
      },
    });

    if (!assignment) {
      // Fallback to most recent assignment
      assignment = await prisma.workerAssignment.findFirst({
        where: { employeeId },
        orderBy: { date: 'desc' },
        include: {
          lane: {
            include: {
              highwaySection: true,
              supervisor: { include: { user: { select: { name: true } } } },
            },
          },
          shift: true,
          tasks: {
            include: {
              evidence: true,
              verifications: true,
              incidents: true,
            },
          },
        },
      });
    }

    if (!assignment) {
      res.status(404).json({
        success: false,
        error: 'NO_ASSIGNMENT_FOUND',
        message: 'No active shift or lane assignment found for your profile.',
      });
      return;
    }

    res.json({
      success: true,
      assignment,
    });
  } catch (err: any) {
    console.error('Error fetching my assignment:', err);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to fetch assignment.' });
  }
};

// Task-specific route: get-my-active-assignment (and legacy /my)
router.get('/get-my-active-assignment', requireAuth, handleGetMyAssignment);
router.get('/my', requireAuth, handleGetMyAssignment);

// Task handler: Fetch meta options (shifts, lanes, supervisors, workers) for dispatch
const handleGetDispatchMetadata = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const [shifts, lanes, supervisors, employees] = await Promise.all([
      prisma.shift.findMany({
        where: { isActive: true },
        orderBy: { startTime: 'asc' },
      }),
      prisma.lane.findMany({
        include: {
          highwaySection: true,
          supervisor: { include: { user: { select: { name: true } } } },
        },
        orderBy: { laneCode: 'asc' },
      }),
      prisma.supervisor.findMany({
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { supervisorCode: 'asc' },
      }),
      prisma.employee.findMany({
        where: { status: 'ACTIVE' },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { employeeCode: 'asc' },
      }),
    ]);

    res.json({
      success: true,
      shifts,
      lanes,
      supervisors,
      employees,
    });
  } catch (err: any) {
    console.error('Error fetching dispatch meta:', err);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to fetch dispatch meta.' });
  }
};

// Task-specific route: get-dispatch-metadata (and legacy /meta)
router.get('/get-dispatch-metadata', requireAuth, handleGetDispatchMetadata);
router.get('/meta', requireAuth, handleGetDispatchMetadata);

// Task handler: Fetch available operational shifts
const handleGetOperationalShifts = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const shifts = await prisma.shift.findMany({
      where: { isActive: true },
      orderBy: { startTime: 'asc' },
    });
    res.json({ success: true, shifts });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to fetch shifts.' });
  }
};

// Task-specific route: get-operational-shifts (and legacy /shifts)
router.get('/get-operational-shifts', requireAuth, handleGetOperationalShifts);
router.get('/shifts', requireAuth, handleGetOperationalShifts);

// Task handler: List daily dispatches
const handleListDailyDispatches = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { date, laneId, employeeId, status } = req.query;
    const where: any = {};
    if (date) where.date = String(date);
    if (laneId) where.laneId = String(laneId);
    if (employeeId) where.employeeId = String(employeeId);
    if (status) where.status = String(status);

    const assignments = await prisma.workerAssignment.findMany({
      where,
      include: {
        employee: { include: { user: { select: { name: true, email: true } } } },
        lane: { include: { highwaySection: true } },
        shift: true,
        tasks: {
          include: {
            evidence: true,
            verifications: true,
          },
        },
        supervisor: { include: { user: { select: { name: true } } } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    res.json({ success: true, assignments });
  } catch (err: any) {
    console.error('Error fetching assignments:', err);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to fetch assignments.' });
  }
};

// Task-specific route: list-daily-dispatches (and legacy /)
router.get('/list-daily-dispatches', requireAuth, handleListDailyDispatches);
router.get('/', requireAuth, handleListDailyDispatches);

// Helper: Resolve employee by ID, employeeCode, or userId
async function resolveEmployee(identifier: string) {
  return prisma.employee.findFirst({
    where: {
      OR: [
        { id: identifier },
        { employeeCode: identifier },
        { userId: identifier },
      ],
    },
    include: { user: true },
  });
}

// Helper: Resolve lane by ID or laneCode
async function resolveLane(identifier: string) {
  return prisma.lane.findFirst({
    where: {
      OR: [
        { id: identifier },
        { laneCode: identifier },
      ],
    },
    include: {
      highwaySection: true,
      supervisor: { include: { user: { select: { name: true } } } },
    },
  });
}

// Helper: Resolve shift by ID or code
async function resolveShift(identifier: string) {
  return prisma.shift.findFirst({
    where: {
      OR: [
        { id: identifier },
        { code: identifier },
      ],
    },
  });
}

// Helper: Resolve supervisor by ID, supervisorCode, or userId
async function resolveSupervisor(identifier?: string) {
  if (!identifier) return null;
  return prisma.supervisor.findFirst({
    where: {
      OR: [
        { id: identifier },
        { supervisorCode: identifier },
        { userId: identifier },
      ],
    },
  });
}

// Task handler: Dispatch worker to lane & shift, create initial cleaning task
const handleDispatchWorker = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const {
        employeeId,
        laneId,
        shiftId,
        supervisorId,
        date = new Date().toISOString().split('T')[0],
        taskTitle,
        startKm,
        endKm,
        status = 'ASSIGNED',
      } = req.body;

      if (!employeeId || !laneId || !shiftId) {
        res.status(400).json({
          success: false,
          error: 'MISSING_FIELDS',
          message: 'employeeId, laneId, and shiftId are required.',
        });
        return;
      }

      // Resolve Employee
      const employee = await resolveEmployee(String(employeeId));
      if (!employee) {
        res.status(404).json({
          success: false,
          error: 'EMPLOYEE_NOT_FOUND',
          message: `Employee not found for identifier "${employeeId}".`,
        });
        return;
      }

      // Resolve Lane
      const lane = await resolveLane(String(laneId));
      if (!lane) {
        res.status(404).json({
          success: false,
          error: 'LANE_NOT_FOUND',
          message: `Target lane not found for identifier "${laneId}".`,
        });
        return;
      }

      // Resolve Shift
      const shift = await resolveShift(String(shiftId));
      if (!shift) {
        res.status(404).json({
          success: false,
          error: 'SHIFT_NOT_FOUND',
          message: `Work shift not found for identifier "${shiftId}".`,
        });
        return;
      }

      // Resolve Supervisor
      let resolvedSupervisorId: string | null = null;
      if (supervisorId) {
        const sup = await resolveSupervisor(String(supervisorId));
        if (sup) resolvedSupervisorId = sup.id;
      }
      if (!resolvedSupervisorId) {
        resolvedSupervisorId = req.user?.supervisorId || lane.supervisorId || null;
      }

      // Compute section KM limits
      const targetStart =
        startKm !== undefined && startKm !== null && startKm !== ''
          ? parseFloat(String(startKm))
          : lane.highwaySection?.startKm ?? 0;
      const targetEnd =
        endKm !== undefined && endKm !== null && endKm !== ''
          ? parseFloat(String(endKm))
          : lane.highwaySection?.endKm ?? 10;

      const result = await prisma.$transaction(async (tx) => {
        // Upsert assignment for employee + date + shift
        const existing = await tx.workerAssignment.findUnique({
          where: {
            employeeId_date_shiftId: {
              employeeId: employee.id,
              date,
              shiftId: shift.id,
            },
          },
          include: { tasks: true },
        });

        let assignment;
        let task;

        if (existing) {
          // Worker was already assigned for this shift today -> Update lane and status
          assignment = await tx.workerAssignment.update({
            where: { id: existing.id },
            data: {
              laneId: lane.id,
              supervisorId: resolvedSupervisorId,
              status,
              updatedAt: new Date(),
            },
            include: {
              employee: { include: { user: { select: { name: true, email: true } } } },
              lane: { include: { highwaySection: true } },
              shift: true,
              tasks: true,
              supervisor: { include: { user: { select: { name: true } } } },
            },
          });

          // Check if there is a pending cleaning task to reassign or create a new one
          const pendingTask = existing.tasks.find((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS');
          if (pendingTask) {
            task = await tx.cleaningTask.update({
              where: { id: pendingTask.id },
              data: {
                laneId: lane.id,
                shiftId: shift.id,
                title: taskTitle || pendingTask.title,
                targetKmStart: targetStart,
                targetKmEnd: targetEnd,
              },
            });
          } else {
            const title =
              taskTitle ||
              `${lane.name} (${lane.laneCode}) Litter & Debris Sweep KM ${targetStart} - ${targetEnd}`;
            task = await tx.cleaningTask.create({
              data: {
                assignmentId: assignment.id,
                employeeId: employee.id,
                laneId: lane.id,
                shiftId: shift.id,
                title,
                targetKmStart: targetStart,
                targetKmEnd: targetEnd,
                status: 'PENDING',
              },
            });
          }
        } else {
          // Brand new assignment
          assignment = await tx.workerAssignment.create({
            data: {
              employeeId: employee.id,
              laneId: lane.id,
              shiftId: shift.id,
              supervisorId: resolvedSupervisorId,
              date,
              status,
            },
            include: {
              employee: { include: { user: { select: { name: true, email: true } } } },
              lane: { include: { highwaySection: true } },
              shift: true,
              tasks: true,
              supervisor: { include: { user: { select: { name: true } } } },
            },
          });

          const title =
            taskTitle ||
            `${lane.name} (${lane.laneCode}) Litter & Debris Sweep KM ${targetStart} - ${targetEnd}`;

          task = await tx.cleaningTask.create({
            data: {
              assignmentId: assignment.id,
              employeeId: employee.id,
              laneId: lane.id,
              shiftId: shift.id,
              title,
              targetKmStart: targetStart,
              targetKmEnd: targetEnd,
              status: 'PENDING',
            },
          });
        }

        // Activate lane status to IN_PROGRESS if IDLE
        if (lane.status === 'IDLE') {
          await tx.lane.update({
            where: { id: lane.id },
            data: { status: 'IN_PROGRESS' },
          });
        }

        return { assignment, task, wasUpdated: !!existing };
      });

      // Audit Log
      await createAuditLog({
        userId: req.user?.id,
        action: result.wasUpdated ? 'WORKER_REASSIGNED_TO_LANE' : 'WORKER_ASSIGNED_TO_LANE',
        entityType: 'ASSIGNMENT',
        entityId: result.assignment.id,
        details: {
          employeeCode: employee.employeeCode,
          employeeName: employee.user?.name,
          laneCode: lane.laneCode,
          shiftCode: shift.code,
          date,
        },
        ipAddress: req.ip,
      });

      // Real-time broadcast
      realTime.emitAssignmentUpdate({
        assignmentId: result.assignment.id,
        employeeId: employee.id,
        laneCode: lane.laneCode,
        shiftCode: shift.code,
        status: result.assignment.status,
        action: result.wasUpdated ? 'REASSIGNED' : 'DISPATCHED',
        timestamp: new Date().toISOString(),
      });

      realTime.emitTaskUpdate({
        taskId: result.task.id,
        employeeId: employee.id,
        employeeName: employee.user?.name || '',
        laneCode: lane.laneCode,
        laneName: lane.name,
        status: result.task.status,
        updatedAt: new Date().toISOString(),
      });

      res.status(201).json({
        success: true,
        message: result.wasUpdated
          ? `Worker ${employee.user.name} (${employee.employeeCode}) reassigned to ${lane.name} (${lane.laneCode}).`
          : `Worker ${employee.user.name} (${employee.employeeCode}) successfully dispatched to ${lane.name} (${lane.laneCode}).`,
        assignment: result.assignment,
        task: result.task,
        wasUpdated: result.wasUpdated,
      });
    } catch (err: any) {
      console.error('Error creating assignment:', err);
      res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to assign worker: ' + (err.message || '') });
    }
  };

// Task-specific route: dispatch-worker-to-lane (and legacy /)
router.post('/dispatch-worker-to-lane', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPERVISOR'), handleDispatchWorker);
router.post('/', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPERVISOR'), handleDispatchWorker);

// Task handler: Update an active assignment (reassign lane, change shift, change status)
const handleReassignWorkerLane = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id || req.body.assignmentId || req.body.id;
    const { laneId, shiftId, supervisorId, status } = req.body;

    const assignment = await prisma.workerAssignment.findUnique({
      where: { id },
      include: { lane: true, shift: true, employee: { include: { user: true } } },
    });

    if (!assignment) {
      res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Assignment not found.' });
      return;
    }

    const updateData: any = {};

    if (laneId) {
      const lane = await resolveLane(String(laneId));
      if (!lane) {
        res.status(404).json({ success: false, error: 'LANE_NOT_FOUND', message: 'Target lane not found.' });
        return;
      }
      updateData.laneId = lane.id;
    }

    if (shiftId) {
      const shift = await resolveShift(String(shiftId));
      if (!shift) {
        res.status(404).json({ success: false, error: 'SHIFT_NOT_FOUND', message: 'Shift not found.' });
        return;
      }
      updateData.shiftId = shift.id;
    }

    if (supervisorId !== undefined) {
      if (supervisorId) {
        const sup = await resolveSupervisor(String(supervisorId));
        if (sup) updateData.supervisorId = sup.id;
      } else {
        updateData.supervisorId = null;
      }
    }

    if (status) {
      updateData.status = status;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.workerAssignment.update({
        where: { id },
        data: updateData,
        include: {
          employee: { include: { user: { select: { name: true, email: true } } } },
          lane: { include: { highwaySection: true } },
          shift: true,
          tasks: true,
          supervisor: { include: { user: { select: { name: true } } } },
        },
      });

      // If lane changed, update pending tasks
      if (updateData.laneId) {
        await tx.cleaningTask.updateMany({
          where: { assignmentId: id, status: { in: ['PENDING', 'IN_PROGRESS'] } },
          data: { laneId: updateData.laneId },
        });
      }

      return res;
    });

    await createAuditLog({
      userId: req.user?.id,
      action: 'WORKER_ASSIGNMENT_UPDATED',
      entityType: 'ASSIGNMENT',
      entityId: id,
      details: { updateData },
      ipAddress: req.ip,
    });

    realTime.emitAssignmentUpdate({
      assignmentId: updated.id,
      employeeId: updated.employeeId,
      laneCode: updated.lane.laneCode,
      shiftCode: updated.shift.code,
      status: updated.status,
      action: 'REASSIGNED',
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Assignment updated successfully.',
      assignment: updated,
    });
  } catch (err: any) {
    console.error('Error updating assignment:', err);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to update assignment.' });
  }
};

// Task-specific route: reassign-worker-lane (and legacy /:id)
router.put('/reassign-worker-lane/:id', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPERVISOR'), handleReassignWorkerLane);
router.put('/reassign-worker-lane', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPERVISOR'), handleReassignWorkerLane);
router.put('/:id', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPERVISOR'), handleReassignWorkerLane);

// Task handler: Cancel / Revoke a worker dispatch
const handleRevokeWorkerDispatch = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id || req.body.assignmentId || req.body.id;

    const assignment = await prisma.workerAssignment.findUnique({
      where: { id },
      include: { lane: true, shift: true, tasks: true, employee: { include: { user: true } } },
    });

    if (!assignment) {
      res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Assignment not found.' });
      return;
    }

    // Check if there are completed tasks or verified attendance
    const hasCompletedWork = assignment.tasks.some((t) => t.status === 'COMPLETED' || t.status === 'VERIFIED');

    if (hasCompletedWork) {
      // Soft cancel so historical records are retained
      await prisma.$transaction(async (tx) => {
        await tx.workerAssignment.update({
          where: { id },
          data: { status: 'CANCELLED' },
        });
        await tx.cleaningTask.updateMany({
          where: { assignmentId: id, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
      });
    } else {
      // Delete pending tasks and assignment cleanly
      await prisma.$transaction(async (tx) => {
        await tx.cleaningTask.deleteMany({
          where: { assignmentId: id },
        });
        await tx.workerAssignment.delete({
          where: { id },
        });
      });
    }

    await createAuditLog({
      userId: req.user?.id,
      action: 'WORKER_ASSIGNMENT_CANCELLED',
      entityType: 'ASSIGNMENT',
      entityId: id,
      details: {
        employeeCode: assignment.employee.employeeCode,
        laneCode: assignment.lane.laneCode,
      },
      ipAddress: req.ip,
    });

    realTime.emitAssignmentUpdate({
      assignmentId: id,
      employeeId: assignment.employeeId,
      laneCode: assignment.lane.laneCode,
      shiftCode: assignment.shift.code,
      status: 'CANCELLED',
      action: 'CANCELLED',
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: `Dispatch for worker ${assignment.employee.user.name} (${assignment.employee.employeeCode}) revoked.`,
    });
  } catch (err: any) {
    console.error('Error revoking assignment:', err);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to revoke assignment.' });
  }
};

// Task-specific route: revoke-worker-dispatch (and legacy /:id)
router.delete('/revoke-worker-dispatch/:id', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPERVISOR'), handleRevokeWorkerDispatch);
router.delete('/revoke-worker-dispatch', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPERVISOR'), handleRevokeWorkerDispatch);
router.delete('/:id', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPERVISOR'), handleRevokeWorkerDispatch);

export default router;
