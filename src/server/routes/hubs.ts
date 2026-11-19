import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireRoles, AuthenticatedRequest, createAuditLog } from '../auth.js';
import { findNearestHubs, GeoCoordinate } from '../geo.js';

const router = Router();

// Task handler: List all registered company hubs
const handleListCompanyHubs = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const hubs = await prisma.hub.findMany({
      include: {
        highwaySection: true,
        operator: { select: { id: true, name: true, email: true } },
        _count: {
          select: { attendanceRecords: true },
        },
      },
      orderBy: { hubCode: 'asc' },
    });

    res.json({ success: true, hubs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to fetch hubs.' });
  }
};

// Task-specific route: list-company-hubs (and legacy /)
router.get('/list-company-hubs', requireAuth, handleListCompanyHubs);
router.get('/', requireAuth, handleListCompanyHubs);

// Task handler: Calculate nearest authorized hub from worker coordinates
const handleCalculateNearestHubDistance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      res.status(400).json({
        success: false,
        error: 'COORDINATES_REQUIRED',
        message: 'Query parameters "lat" and "lng" are required.',
      });
      return;
    }

    const workerCoord: GeoCoordinate = {
      latitude: parseFloat(String(lat)),
      longitude: parseFloat(String(lng)),
    };

    if (isNaN(workerCoord.latitude) || isNaN(workerCoord.longitude)) {
      res.status(400).json({
        success: false,
        error: 'INVALID_COORDINATES',
        message: 'Latitude and Longitude must be valid decimal numbers.',
      });
      return;
    }

    const hubs = await prisma.hub.findMany({
      where: { isActive: true },
    });

    if (hubs.length === 0) {
      res.status(404).json({
        success: false,
        error: 'NO_ACTIVE_HUBS',
        message: 'No active company hubs registered in the system.',
      });
      return;
    }

    const sortedHubs = findNearestHubs(workerCoord, hubs);
    const nearestHub = sortedHubs[0];

    res.json({
      success: true,
      workerCoordinates: workerCoord,
      nearestHub,
      allHubs: sortedHubs,
    });
  } catch (err: any) {
    console.error('Error finding nearest hub:', err);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to compute nearest hub.' });
  }
};

// Task-specific route: calculate-nearest-hub-distance (and legacy /nearest)
router.get('/calculate-nearest-hub-distance', requireAuth, handleCalculateNearestHubDistance);
router.get('/nearest', requireAuth, handleCalculateNearestHubDistance);

// Task handler: Register a new company hub (Admin)
const handleRegisterCompanyHub = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      hubCode,
      name,
      physicalAddress,
      latitude,
      longitude,
      geofenceRadiusM = 500,
      highwaySectionId,
      operatorUserId,
    } = req.body;

    if (!hubCode || !name || !physicalAddress || latitude === undefined || longitude === undefined) {
      res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'Hub code, name, address, latitude, and longitude are required.',
      });
      return;
    }

    const hub = await prisma.hub.create({
      data: {
        hubCode,
        name,
        physicalAddress,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        geofenceRadiusM: parseFloat(geofenceRadiusM),
        highwaySectionId: highwaySectionId || null,
        operatorUserId: operatorUserId || null,
        isActive: true,
      },
    });

    await createAuditLog({
      userId: req.user?.id,
      action: 'HUB_REGISTERED',
      entityType: 'HUB',
      entityId: hub.id,
      details: { hubCode, name, latitude, longitude },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, hub });
  } catch (err: any) {
    console.error('Error creating hub:', err);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to create hub.' });
  }
};

// Task-specific route: register-company-hub (and legacy /)
router.post('/register-company-hub', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleRegisterCompanyHub);
router.post('/', requireAuth, requireRoles('SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleRegisterCompanyHub);

export default router;
