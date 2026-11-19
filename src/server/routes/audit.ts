import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireRoles, AuthenticatedRequest } from '../auth.js';

const router = Router();

// Task handler: List security audit logs
const handleGetSystemAuditTrail = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { action, entityType, limit = 50 } = req.query;
    const where: any = {};
    if (action) where.action = String(action);
    if (entityType) where.entityType = String(entityType);

    const logs = await prisma.auditLog.findMany({
      where,
      take: parseInt(String(limit), 10),
      orderBy: { timestamp: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to fetch audit logs.' });
  }
};

// Task-specific route: get-system-audit-trail (and legacy /)
router.get('/get-system-audit-trail', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleGetSystemAuditTrail);
router.get('/', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleGetSystemAuditTrail);

export default router;
