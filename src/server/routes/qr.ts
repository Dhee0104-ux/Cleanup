import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireRoles, AuthenticatedRequest, createAuditLog } from '../auth.js';
import { generateDynamicHubQr } from '../qr.js';
import { realTime } from '../socket.js';
import CONFIG from '../../config.js';

const router = Router();

// Task handler: Generate dynamic short-lived QR code
const handleGenerateDynamicHubQr = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const hubId = req.params.id || req.body.hubId;
    const { validitySeconds = CONFIG.QR.VALIDITY_SECONDS } = req.body;

    const hub = await prisma.hub.findUnique({ where: { id: hubId } });
    if (!hub) {
      res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Hub not found.' });
      return;
    }

    if (!hub.isActive) {
      res.status(400).json({ success: false, error: 'HUB_INACTIVE', message: 'Cannot generate QR for inactive hub.' });
      return;
    }

    // If user is HUB_OPERATOR, check authorization to operate this hub
    if (req.user?.role === 'HUB_OPERATOR' && hub.operatorUserId && hub.operatorUserId !== req.user.id) {
      res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'You are not assigned as operator for this hub.',
      });
      return;
    }

    const qrResult = await generateDynamicHubQr(hub.id, hub.hubCode, validitySeconds);

    await createAuditLog({
      userId: req.user?.id,
      action: 'DYNAMIC_QR_GENERATED',
      entityType: 'HUB',
      entityId: hub.id,
      details: { hubCode: hub.hubCode, nonce: qrResult.nonce, expiresAt: qrResult.expiresAt },
      ipAddress: req.ip,
    });

    realTime.emitQrRefresh(hub.id, {
      expiresAt: qrResult.expiresAt.toISOString(),
      secondsRemaining: qrResult.secondsRemaining,
      tokenString: qrResult.qrPayloadString,
    });

    res.json({
      success: true,
      hub: {
        id: hub.id,
        hubCode: hub.hubCode,
        name: hub.name,
      },
      qrDataUrl: qrResult.qrDataUrl,
      payloadString: qrResult.qrPayloadString,
      expiresAt: qrResult.expiresAt.toISOString(),
      secondsRemaining: qrResult.secondsRemaining,
    });
  } catch (err: any) {
    console.error('Error generating hub QR:', err);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to generate QR.' });
  }
};

// Task-specific route: generate-dynamic-hub-qr and generate-dynamic-qr-token (and legacy /:id/qr/generate)
router.post('/generate-dynamic-hub-qr/:id', requireAuth, requireRoles('HUB_OPERATOR', 'SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleGenerateDynamicHubQr);
router.post('/generate-dynamic-qr-token/:id', requireAuth, requireRoles('HUB_OPERATOR', 'SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleGenerateDynamicHubQr);
router.post('/generate-dynamic-hub-qr', requireAuth, requireRoles('HUB_OPERATOR', 'SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleGenerateDynamicHubQr);
router.post('/generate-dynamic-qr-token', requireAuth, requireRoles('HUB_OPERATOR', 'SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleGenerateDynamicHubQr);
router.post('/:id/qr/generate', requireAuth, requireRoles('HUB_OPERATOR', 'SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleGenerateDynamicHubQr);

// Task handler: Get current dynamic active QR or regenerate if expired
const handleGetLatestActiveHubQr = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const hubId = req.params.id || (req.query.hubId as string);
    const hub = await prisma.hub.findUnique({ where: { id: hubId } });
    if (!hub) {
      res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Hub not found.' });
      return;
    }

    // Check if there is an unconsumed, unexpired token
    const now = new Date();
    const existingToken = await prisma.hubQrToken.findFirst({
      where: {
        hubId,
        isConsumed: false,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingToken) {
      const secondsRemaining = Math.max(
        1,
        Math.round((existingToken.expiresAt.getTime() - now.getTime()) / 1000)
      );

      // Generate data URL for existing token
      const QRCode = (await import('qrcode')).default;
      const qrDataUrl = await QRCode.toDataURL(existingToken.token, {
        errorCorrectionLevel: 'H',
        margin: 2,
        scale: 8,
        color: { dark: '#14243A', light: '#FFFFFF' },
      });

      res.json({
        success: true,
        hub: { id: hub.id, hubCode: hub.hubCode, name: hub.name },
        qrDataUrl,
        payloadString: existingToken.token,
        expiresAt: existingToken.expiresAt.toISOString(),
        secondsRemaining,
      });
      return;
    }

    // Generate a fresh one if expired
    const qrResult = await generateDynamicHubQr(hub.id, hub.hubCode);
    res.json({
      success: true,
      hub: { id: hub.id, hubCode: hub.hubCode, name: hub.name },
      qrDataUrl: qrResult.qrDataUrl,
      payloadString: qrResult.qrPayloadString,
      expiresAt: qrResult.expiresAt.toISOString(),
      secondsRemaining: qrResult.secondsRemaining,
    });
  } catch (err: any) {
    console.error('Error fetching latest hub QR:', err);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Failed to retrieve QR.' });
  }
};

// Task-specific route: get-latest-active-hub-qr (and legacy /:id/qr/latest)
router.get('/get-latest-active-hub-qr/:id', requireAuth, requireRoles('HUB_OPERATOR', 'SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleGetLatestActiveHubQr);
router.get('/get-latest-active-hub-qr', requireAuth, requireRoles('HUB_OPERATOR', 'SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleGetLatestActiveHubQr);
router.get('/:id/qr/latest', requireAuth, requireRoles('HUB_OPERATOR', 'SUPER_ADMIN', 'OPERATIONS_ADMIN'), handleGetLatestActiveHubQr);

export default router;
