import { Router, Response } from 'express';
import { prisma } from '../db.js';
import {
  requireAuth,
  requireRoles,
  AuthenticatedRequest,
  hashPassword,
  createAuditLog,
} from '../auth.js';

const router = Router();

// Task handler: List all employees with user and status details
const handleListEmployees = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const employees = await prisma.employee.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        },
        assignments: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            lane: true,
            shift: true,
          },
        },
      },
      orderBy: { employeeCode: 'asc' },
    });

    res.json({ success: true, employees });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to fetch employees.' });
  }
};

// Task-specific route: list-master-workforce (and legacy /)
router.get('/list-master-workforce', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPERVISOR'), handleListEmployees);
router.get('/', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPERVISOR'), handleListEmployees);

// Task handler: Register a new worker or supervisor
const handleRegisterWorker = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { name, email, password, employeeCode, phone, skills, role = 'FIELD_WORKER' } = req.body;

      if (!name || !email || !password || !employeeCode) {
        res.status(400).json({
          success: false,
          error: 'MISSING_FIELDS',
          message: 'Name, email, password, and employee code are required.',
        });
        return;
      }

      // Check for existing email or employeeCode
      const existingUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (existingUser) {
        res.status(409).json({ success: false, error: 'EMAIL_EXISTS', message: 'Email is already registered.' });
        return;
      }

      const existingEmp = await prisma.employee.findUnique({ where: { employeeCode } });
      if (existingEmp) {
        res.status(409).json({ success: false, error: 'CODE_EXISTS', message: 'Employee code already exists.' });
        return;
      }

      const passwordHash = await hashPassword(password);

      // Create User and Employee in transaction
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name,
            email: email.toLowerCase(),
            passwordHash,
            role,
            isActive: true,
          },
        });

        const employee = await tx.employee.create({
          data: {
            userId: user.id,
            employeeCode,
            phone,
            skills,
            status: 'ACTIVE',
          },
        });

        if (role === 'SUPERVISOR') {
          await tx.supervisor.create({
            data: {
              userId: user.id,
              supervisorCode: `SUP-${employeeCode.replace(/\D/g, '')}`,
              phone,
            },
          });
        }

        return { user, employee };
      });

      await createAuditLog({
        userId: req.user?.id,
        action: 'EMPLOYEE_REGISTERED',
        entityType: 'EMPLOYEE',
        entityId: result.employee.id,
        details: { employeeCode, role },
        ipAddress: req.ip,
      });

      res.status(201).json({
        success: true,
        employee: {
          id: result.employee.id,
          employeeCode: result.employee.employeeCode,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role,
        },
      });
    } catch (err: any) {
      console.error('Error creating employee:', err);
      res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to create employee.' });
    }
  };

// Task-specific route: register-field-worker (and legacy /)
router.post('/register-field-worker', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleRegisterWorker);
router.post('/', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleRegisterWorker);

// Task handler: Get employee profile
const handleGetEmployeeProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
        assignments: {
          include: { lane: true, shift: true, tasks: true },
          orderBy: { date: 'desc' },
        },
        attendanceRecords: {
          include: { hub: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!employee) {
      res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Employee not found.' });
      return;
    }

    res.json({ success: true, employee });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to fetch employee.' });
  }
};

// Task-specific route: get-employee-profile/:id (and legacy /:id)
router.get('/get-employee-profile/:id', requireAuth, handleGetEmployeeProfile);
router.get('/:id', requireAuth, handleGetEmployeeProfile);

export default router;
