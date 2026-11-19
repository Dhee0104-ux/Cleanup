import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../db.js';
import { requireAuth, requireRoles, AuthenticatedRequest, createAuditLog } from '../auth.js';
import { realTime } from '../socket.js';
import CONFIG from '../../config.js';

const router = Router();

// Ensure upload directory exists
if (!fs.existsSync(CONFIG.STORAGE.UPLOAD_DIR)) {
  fs.mkdirSync(CONFIG.STORAGE.UPLOAD_DIR, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, CONFIG.STORAGE.UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `evidence-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: CONFIG.STORAGE.MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (CONFIG.STORAGE.ALLOWED_MIME_TYPES.includes(file.mimetype as any)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image file type. Only JPEG, PNG, and WebP are accepted.'));
    }
  },
});

// Task handler: Worker fetches their daily tasks
const handleGetMyAssignedTasks = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      res.status(403).json({ success: false, error: 'NOT_A_WORKER', message: 'Employee profile required.' });
      return;
    }

    const tasks = await prisma.cleaningTask.findMany({
      where: { employeeId },
      include: {
        lane: { include: { highwaySection: true } },
        shift: true,
        evidence: true,
        verifications: true,
        incidents: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, tasks });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to fetch tasks.' });
  }
};

// Task-specific route: get-my-assigned-tasks (and legacy /my)
router.get('/get-my-assigned-tasks', requireAuth, handleGetMyAssignedTasks);
router.get('/my', requireAuth, handleGetMyAssignedTasks);

// Task handler: Worker starts cleaning
const handleStartCleaningTask = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const taskId = req.params.id || req.body.taskId || req.body.id;
    const task = await prisma.cleaningTask.findUnique({
      where: { id: taskId },
      include: { lane: true, employee: { include: { user: true } } },
    });

    if (!task) {
      res.status(404).json({ success: false, error: 'TASK_NOT_FOUND', message: 'Task not found.' });
      return;
    }

    // Verify task belongs to authenticated worker or supervisor
    if (req.user?.role === 'FIELD_WORKER' && task.employeeId !== req.user.employeeId) {
      res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Cannot start another worker task.' });
      return;
    }

    if (task.status !== 'PENDING') {
      res.status(400).json({
        success: false,
        error: 'INVALID_STATUS_TRANSITION',
        message: `Task is already in state: ${task.status}. Only PENDING tasks can be started.`,
      });
      return;
    }

    const updatedTask = await prisma.cleaningTask.update({
      where: { id: taskId },
      data: {
        status: 'IN_PROGRESS',
        startTime: new Date(),
      },
      include: { lane: true },
    });

    // Also update lane status if idle
    await prisma.lane.update({
      where: { id: task.laneId },
      data: { status: 'IN_PROGRESS' },
    });

    // Record attendance lifecycle event
    await prisma.attendanceEvent.create({
      data: {
        employeeId: task.employeeId,
        eventType: 'WORK_STARTED',
        payload: JSON.stringify({ taskId, laneCode: task.lane.laneCode, startTime: new Date() }),
        ipAddress: req.ip,
      },
    });

    await createAuditLog({
      userId: req.user?.id,
      action: 'TASK_STARTED',
      entityType: 'CLEANING_TASK',
      entityId: taskId,
      details: { laneCode: task.lane.laneCode },
      ipAddress: req.ip,
    });

    realTime.emitTaskUpdate({
      taskId,
      employeeId: task.employeeId,
      employeeName: task.employee.user.name,
      laneCode: task.lane.laneCode,
      laneName: task.lane.name,
      status: 'IN_PROGRESS',
      updatedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Cleaning operation started successfully.',
      task: updatedTask,
    });
  } catch (err: any) {
    console.error('Error starting task:', err);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to start task.' });
  }
};

// Task-specific route: start-cleaning-task (and legacy /:id/start)
router.post('/start-cleaning-task/:id', requireAuth, handleStartCleaningTask);
router.post('/start-cleaning-task', requireAuth, handleStartCleaningTask);
router.post('/:id/start', requireAuth, handleStartCleaningTask);

// Task handler: Upload photographic evidence (BEFORE, AFTER, OBSTRUCTION)
const handleUploadTaskEvidence = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const taskId = req.params.id;
      const { type = 'BEFORE_PHOTO', latitude, longitude, caption, imageBase64 } = req.body;

      const task = await prisma.cleaningTask.findUnique({ where: { id: taskId } });
      if (!task) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Task not found.' });
        return;
      }

      let imageUrl = '';
      if (req.file) {
        imageUrl = `/uploads/${req.file.filename}`;
      } else if (imageBase64) {
        // Support direct base64 data URLs from mobile camera canvas
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        const filename = `evidence-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
        const filePath = path.join(CONFIG.STORAGE.UPLOAD_DIR, filename);
        fs.writeFileSync(filePath, base64Data, 'base64');
        imageUrl = `/uploads/${filename}`;
      } else {
        res.status(400).json({
          success: false,
          error: 'NO_IMAGE_PROVIDED',
          message: 'An image file or base64 data must be provided.',
        });
        return;
      }

      const evidence = await prisma.taskEvidence.create({
        data: {
          taskId,
          type,
          imageUrl,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          caption,
        },
      });

      res.status(201).json({
        success: true,
        evidence,
      });
    } catch (err: any) {
      console.error('Error uploading evidence:', err);
      res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to upload evidence.' });
    }
  };

// Task-specific route: upload-task-evidence (and legacy /:id/evidence)
router.post('/upload-task-evidence/:id', requireAuth, upload.single('image'), handleUploadTaskEvidence);
router.post('/upload-task-evidence', requireAuth, upload.single('image'), handleUploadTaskEvidence);
router.post('/:id/evidence', requireAuth, upload.single('image'), handleUploadTaskEvidence);

// Task handler: Submit work completion
const handleSubmitTaskCompletion = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const taskId = req.params.id || req.body.taskId || req.body.id;
    const { remarks, hasObstruction = false } = req.body;

    const task = await prisma.cleaningTask.findUnique({
      where: { id: taskId },
      include: {
        lane: true,
        employee: { include: { user: true } },
        evidence: true,
      },
    });

    if (!task) {
      res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Task not found.' });
      return;
    }

    if (task.status !== 'IN_PROGRESS') {
      res.status(400).json({
        success: false,
        error: 'INVALID_STATUS',
        message: `Task must be IN_PROGRESS before completing. Current status: ${task.status}`,
      });
      return;
    }

    // Verify minimum evidence requirement (at least 1 photo uploaded)
    if (task.evidence.length === 0) {
      res.status(400).json({
        success: false,
        error: 'EVIDENCE_REQUIRED',
        message: 'Must upload at least one cleaning evidence photograph before marking completion.',
      });
      return;
    }

    const updatedTask = await prisma.cleaningTask.update({
      where: { id: taskId },
      data: {
        status: 'COMPLETED',
        completionTime: new Date(),
        remarks: remarks || null,
        hasObstruction: Boolean(hasObstruction),
      },
      include: {
        evidence: true,
        lane: true,
      },
    });

    // Record attendance event
    await prisma.attendanceEvent.create({
      data: {
        employeeId: task.employeeId,
        eventType: 'WORK_COMPLETED',
        payload: JSON.stringify({ taskId, completionTime: new Date(), remarks }),
        ipAddress: req.ip,
      },
    });

    await createAuditLog({
      userId: req.user?.id,
      action: 'WORK_COMPLETED_SUBMITTED',
      entityType: 'CLEANING_TASK',
      entityId: taskId,
      details: { laneCode: task.lane.laneCode, remarks },
      ipAddress: req.ip,
    });

    realTime.emitTaskUpdate({
      taskId,
      employeeId: task.employeeId,
      employeeName: task.employee.user.name,
      laneCode: task.lane.laneCode,
      laneName: task.lane.name,
      status: 'COMPLETED',
      hasObstruction: Boolean(hasObstruction),
      updatedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Work completion submitted. You may now proceed to nearest hub to scan QR attendance.',
      task: updatedTask,
    });
  } catch (err: any) {
    console.error('Error completing task:', err);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to complete task.' });
  }
};

// Task-specific route: submit-task-completion (and legacy /:id/complete)
router.post('/submit-task-completion/:id', requireAuth, handleSubmitTaskCompletion);
router.post('/submit-task-completion', requireAuth, handleSubmitTaskCompletion);
router.post('/:id/complete', requireAuth, handleSubmitTaskCompletion);

// Task handler: Record road hazard or incident
const handleReportRoadIncident = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const taskId = req.params.id || req.body.taskId || req.body.id;
    const { type, title, description, severity = 'MEDIUM', latitude, longitude, imageUrl } = req.body;

    if (!type || !title || !description) {
      res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'Incident type, title, and description are required.',
      });
      return;
    }

    const task = await prisma.cleaningTask.findUnique({ where: { id: taskId } });
    if (!task) {
      res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Task not found.' });
      return;
    }

    const incident = await prisma.incident.create({
      data: {
        taskId,
        employeeId: task.employeeId,
        type,
        title,
        description,
        severity,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        imageUrl: imageUrl || null,
      },
    });

    // Mark task hasObstruction flag
    await prisma.cleaningTask.update({
      where: { id: taskId },
      data: { hasObstruction: true },
    });

    await createAuditLog({
      userId: req.user?.id,
      action: 'INCIDENT_REPORTED',
      entityType: 'INCIDENT',
      entityId: incident.id,
      details: { taskId, severity, type },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, incident });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to report incident.' });
  }
};

// Task-specific route: report-road-incident (and legacy /:id/incident)
router.post('/report-road-incident/:id', requireAuth, handleReportRoadIncident);
router.post('/report-road-incident', requireAuth, handleReportRoadIncident);
router.post('/:id/incident', requireAuth, handleReportRoadIncident);

// Task handler: Worker logs custom task
const handleLogWorkerCustomTask = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      res.status(403).json({ success: false, error: 'NOT_A_WORKER', message: 'Employee profile required.' });
      return;
    }

    const { title, description, targetKmStart, targetKmEnd, remarks, hasObstruction = false, status = 'IN_PROGRESS' } = req.body;
    if (!title) {
      res.status(400).json({ success: false, error: 'TITLE_REQUIRED', message: 'Task title is required.' });
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    let assignment = await prisma.workerAssignment.findFirst({
      where: { employeeId, date: todayStr },
      include: { lane: true, shift: true },
    });

    if (!assignment) {
      assignment = await prisma.workerAssignment.findFirst({
        where: { employeeId },
        orderBy: { date: 'desc' },
        include: { lane: true, shift: true },
      });
    }

    if (!assignment) {
      res.status(400).json({
        success: false,
        error: 'NO_ASSIGNMENT',
        message: 'Must have an active lane assignment to enter custom work tasks.',
      });
      return;
    }

    const now = new Date();
    const isCompleted = status === 'COMPLETED';

    const task = await prisma.cleaningTask.create({
      data: {
        assignmentId: assignment.id,
        employeeId,
        laneId: assignment.laneId,
        shiftId: assignment.shiftId,
        title,
        description: description || null,
        targetKmStart: targetKmStart ? parseFloat(String(targetKmStart)) : 0,
        targetKmEnd: targetKmEnd ? parseFloat(String(targetKmEnd)) : 0,
        status: isCompleted ? 'COMPLETED' : 'IN_PROGRESS',
        startTime: now,
        completionTime: isCompleted ? now : null,
        remarks: remarks || null,
        hasObstruction: Boolean(hasObstruction),
      },
      include: {
        lane: true,
        employee: { include: { user: true } },
        evidence: true,
      },
    });

    await createAuditLog({
      userId: req.user?.id,
      action: 'CUSTOM_TASK_ENTERED_BY_WORKER',
      entityType: 'CLEANING_TASK',
      entityId: task.id,
      details: { title, laneCode: assignment.lane.laneCode, status },
      ipAddress: req.ip,
    });

    realTime.emitTaskUpdate({
      taskId: task.id,
      employeeId,
      employeeName: task.employee.user.name,
      laneCode: assignment.lane.laneCode,
      laneName: assignment.lane.name,
      status: task.status,
      hasObstruction: task.hasObstruction,
      updatedAt: now.toISOString(),
    });

    res.status(201).json({
      success: true,
      message: 'Custom task created and entered successfully.',
      task,
    });
  } catch (err: any) {
    console.error('Error creating custom task:', err);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to create task.' });
  }
};

// Task-specific route: log-worker-custom-task (and legacy /custom)
router.post('/log-worker-custom-task', requireAuth, handleLogWorkerCustomTask);
router.post('/custom', requireAuth, handleLogWorkerCustomTask);

// Task handler: Update cleaning task details
const handleUpdateCleaningTask = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const taskId = req.params.id || req.body.taskId || req.body.id;
    const { title, description, targetKmStart, targetKmEnd, remarks, hasObstruction } = req.body;

    const task = await prisma.cleaningTask.findUnique({
      where: { id: taskId },
      include: { lane: true, employee: { include: { user: true } } },
    });

    if (!task) {
      res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Task not found.' });
      return;
    }

    // Worker can edit their own task; supervisor/admin can edit any task
    if (req.user?.role === 'FIELD_WORKER' && task.employeeId !== req.user.employeeId) {
      res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Cannot edit another worker task.' });
      return;
    }

    const updatedTask = await prisma.cleaningTask.update({
      where: { id: taskId },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(targetKmStart !== undefined && { targetKmStart: parseFloat(String(targetKmStart)) }),
        ...(targetKmEnd !== undefined && { targetKmEnd: parseFloat(String(targetKmEnd)) }),
        ...(remarks !== undefined && { remarks }),
        ...(hasObstruction !== undefined && { hasObstruction: Boolean(hasObstruction) }),
      },
      include: {
        lane: true,
        employee: { include: { user: true } },
        evidence: true,
      },
    });

    await createAuditLog({
      userId: req.user?.id,
      action: 'TASK_EDITED_BY_WORKER',
      entityType: 'CLEANING_TASK',
      entityId: taskId,
      details: { title: updatedTask.title, remarks: updatedTask.remarks },
      ipAddress: req.ip,
    });

    realTime.emitTaskUpdate({
      taskId,
      employeeId: task.employeeId,
      employeeName: task.employee.user.name,
      laneCode: task.lane.laneCode,
      laneName: task.lane.name,
      status: updatedTask.status,
      hasObstruction: updatedTask.hasObstruction,
      updatedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Task details updated successfully.',
      task: updatedTask,
    });
  } catch (err: any) {
    console.error('Error updating task:', err);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to update task.' });
  }
};

// Task-specific route: update-cleaning-task (and legacy /:id)
router.put('/update-cleaning-task/:id', requireAuth, handleUpdateCleaningTask);
router.put('/update-cleaning-task', requireAuth, handleUpdateCleaningTask);
router.put('/:id', requireAuth, handleUpdateCleaningTask);

// Task handler: Supervisor or Operations Admin adds/assigns a new task to a specific employee
const handleAssignTaskToEmployee = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
        employeeId,
        title,
        description,
        laneId,
        laneCode,
        shiftId,
        targetKmStart = 0,
        targetKmEnd = 0,
        remarks,
        status = 'PENDING',
      } = req.body;

      if (!employeeId || !title) {
        res.status(400).json({
          success: false,
          error: 'MISSING_FIELDS',
          message: 'Target employee ID and task title are required.',
        });
        return;
      }

      // Verify employee exists and is active
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        include: { user: true },
      });

      if (!employee || !employee.user.isActive) {
        res.status(404).json({
          success: false,
          error: 'EMPLOYEE_NOT_FOUND',
          message: 'Target employee profile not found or is deactivated.',
        });
        return;
      }

      // Resolve Lane
      let targetLane = null;
      if (laneId) {
        targetLane = await prisma.lane.findUnique({ where: { id: laneId } });
      } else if (laneCode) {
        targetLane = await prisma.lane.findFirst({ where: { laneCode } });
      }

      if (!targetLane) {
        targetLane = await prisma.lane.findFirst();
      }

      if (!targetLane) {
        res.status(400).json({
          success: false,
          error: 'LANE_NOT_FOUND',
          message: 'Specified highway lane not found.',
        });
        return;
      }

      // Resolve Shift
      let targetShift = null;
      if (shiftId) {
        targetShift = await prisma.shift.findFirst({
          where: { OR: [{ id: shiftId }, { code: shiftId }] },
        });
      }
      if (!targetShift) {
        targetShift =
          (await prisma.shift.findFirst({ where: { code: 'SHIFT-M' } })) ||
          (await prisma.shift.findFirst());
      }

      if (!targetShift) {
        res.status(400).json({
          success: false,
          error: 'SHIFT_NOT_FOUND',
          message: 'Valid operational shift not found.',
        });
        return;
      }

      const todayStr = new Date().toISOString().split('T')[0];

      // Find or create worker assignment for today
      let assignment = await prisma.workerAssignment.findFirst({
        where: {
          employeeId,
          date: todayStr,
        },
      });

      if (!assignment) {
        assignment = await prisma.workerAssignment.create({
          data: {
            employeeId,
            laneId: targetLane.id,
            shiftId: targetShift.id,
            supervisorId: req.user?.supervisorId || null,
            date: todayStr,
            status: 'ASSIGNED',
          },
        });
      }

      const now = new Date();
      const task = await prisma.cleaningTask.create({
        data: {
          assignmentId: assignment.id,
          employeeId,
          laneId: targetLane.id,
          shiftId: targetShift.id,
          title,
          description: description || null,
          targetKmStart: parseFloat(String(targetKmStart)) || 0,
          targetKmEnd: parseFloat(String(targetKmEnd)) || 0,
          status: status || 'PENDING',
          remarks: remarks || null,
          startTime: status === 'IN_PROGRESS' ? now : null,
        },
        include: {
          lane: { include: { highwaySection: true } },
          shift: true,
          employee: { include: { user: true } },
          evidence: true,
        },
      });

      await createAuditLog({
        userId: req.user?.id,
        action: 'TASK_ASSIGNED_TO_EMPLOYEE',
        entityType: 'CLEANING_TASK',
        entityId: task.id,
        details: {
          targetEmployee: employee.user.name,
          employeeCode: employee.employeeCode,
          title,
          laneCode: targetLane.laneCode,
        },
        ipAddress: req.ip,
      });

      realTime.emitTaskUpdate({
        taskId: task.id,
        employeeId,
        employeeName: employee.user.name,
        laneCode: targetLane.laneCode,
        laneName: targetLane.name,
        status: task.status,
        updatedAt: now.toISOString(),
      });

      res.status(201).json({
        success: true,
        message: `Task successfully assigned to ${employee.user.name} (${employee.employeeCode}).`,
        task,
      });
    } catch (err: any) {
      console.error('Error creating task for employee:', err);
      res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to assign task.' });
    }
  };

// Task-specific route: assign-task-to-employee (and legacy /)
router.post('/assign-task-to-employee', requireAuth, requireRoles('SUPERVISOR', 'OPERATIONS_ADMIN', 'SUPER_ADMIN'), handleAssignTaskToEmployee);
router.post('/', requireAuth, requireRoles('SUPERVISOR', 'OPERATIONS_ADMIN', 'SUPER_ADMIN'), handleAssignTaskToEmployee);

// Task handler: Remove / delete a task
const handleDeleteCleaningTask = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const taskId = req.params.id || req.body.taskId || req.body.id;

    const task = await prisma.cleaningTask.findUnique({
      where: { id: taskId },
      include: {
        employee: { include: { user: true } },
        lane: true,
      },
    });

    if (!task) {
      res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Task not found.' });
      return;
    }

    // Role verification: Field worker can only remove their own task if it is still PENDING
    if (req.user?.role === 'FIELD_WORKER') {
      if (task.employeeId !== req.user.employeeId) {
        res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Cannot delete another worker task.' });
        return;
      }
      if (task.status !== 'PENDING') {
        res.status(400).json({
          success: false,
          error: 'TASK_ALREADY_STARTED',
          message: 'Cannot delete a task that is already in progress or completed.',
        });
        return;
      }
    }

    // Cascade remove / unlink associated records
    await prisma.locationVerification.deleteMany({
      where: { attendanceRecord: { taskId } },
    });

    await prisma.attendanceRecord.updateMany({
      where: { taskId },
      data: { taskId: null },
    });

    await prisma.taskVerification.deleteMany({
      where: { taskId },
    });

    await prisma.taskEvidence.deleteMany({
      where: { taskId },
    });

    await prisma.incident.deleteMany({
      where: { taskId },
    });

    await prisma.cleaningTask.delete({
      where: { id: taskId },
    });

    await createAuditLog({
      userId: req.user?.id,
      action: 'TASK_DELETED',
      entityType: 'CLEANING_TASK',
      entityId: taskId,
      details: {
        taskTitle: task.title,
        employeeName: task.employee.user.name,
        laneCode: task.lane.laneCode,
        removedByRole: req.user?.role,
      },
      ipAddress: req.ip,
    });

    realTime.emitTaskUpdate({
      taskId,
      employeeId: task.employeeId,
      employeeName: task.employee.user.name,
      laneCode: task.lane.laneCode,
      laneName: task.lane.name,
      status: 'DELETED',
      updatedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: `Task "${task.title}" has been successfully removed.`,
      taskId,
    });
  } catch (err: any) {
    console.error('Error removing task:', err);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to remove task.' });
  }
};

// Task-specific route: delete-cleaning-task (and legacy /:id)
router.delete('/delete-cleaning-task/:id', requireAuth, handleDeleteCleaningTask);
router.delete('/delete-cleaning-task', requireAuth, handleDeleteCleaningTask);
router.delete('/:id', requireAuth, handleDeleteCleaningTask);

export default router;
