import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';
import {
  hashPassword,
  verifyPassword,
  generateTokens,
  requireAuth,
  AuthenticatedRequest,
  createAuditLog,
} from '../auth.js';
import jwt from 'jsonwebtoken';
import CONFIG from '../../config.js';

const router = Router();

// Task handler: Authenticate user & issue signed JWT tokens
const handleLoginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: 'MISSING_CREDENTIALS',
        message: 'Email and password are required.',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        employee: true,
        supervisor: true,
        hubOperator: true,
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
      return;
    }

    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      await createAuditLog({
        userId: user.id,
        action: 'LOGIN_FAILED',
        entityType: 'USER',
        entityId: user.id,
        details: { email },
        ipAddress: req.ip,
      });

      res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
      return;
    }

    const authUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as any,
      employeeId: user.employee?.id,
      employeeCode: user.employee?.employeeCode,
      supervisorId: user.supervisor?.id,
      supervisorCode: user.supervisor?.supervisorCode,
      hubId: user.hubOperator?.id,
    };

    const tokens = generateTokens(authUser);

    await createAuditLog({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      entityType: 'USER',
      entityId: user.id,
      details: { role: user.role },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      user: authUser,
      tokens,
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'An internal server error occurred during login.',
    });
  }
};

// Task-specific route: login-user (and legacy /login)
router.post('/login-user', handleLoginUser);
router.post('/login', handleLoginUser);

// Task handler: Get current user profile
const handleGetCurrentUserProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.json({
    success: true,
    user: req.user,
  });
};

// Task-specific route: get-current-user-profile (and legacy /me)
router.get('/get-current-user-profile', requireAuth, handleGetCurrentUserProfile);
router.get('/me', requireAuth, handleGetCurrentUserProfile);

// Task handler: Refresh session token
const handleRefreshSessionToken = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({
      success: false,
      error: 'REFRESH_TOKEN_REQUIRED',
      message: 'Refresh token must be provided.',
    });
    return;
  }

  try {
    const decoded = jwt.verify(refreshToken, CONFIG.SECURITY.REFRESH_SECRET) as { id: string };
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        employee: true,
        supervisor: true,
        hubOperator: true,
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: 'User no longer active.',
      });
      return;
    }

    const authUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as any,
      employeeId: user.employee?.id,
      employeeCode: user.employee?.employeeCode,
      supervisorId: user.supervisor?.id,
      supervisorCode: user.supervisor?.supervisorCode,
      hubId: user.hubOperator?.id,
    };

    const tokens = generateTokens(authUser);
    res.json({
      success: true,
      tokens,
    });
  } catch {
    res.status(401).json({
      success: false,
      error: 'INVALID_REFRESH_TOKEN',
      message: 'Invalid or expired refresh token.',
    });
  }
};

// Task-specific route: refresh-session-token (and legacy /refresh)
router.post('/refresh-session-token', handleRefreshSessionToken);
router.post('/refresh', handleRefreshSessionToken);

// Task handler: Terminate user session & logout
const handleLogoutUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  await createAuditLog({
    userId: req.user?.id,
    action: 'LOGOUT',
    entityType: 'USER',
    entityId: req.user?.id,
    ipAddress: req.ip,
  });

  res.json({ success: true, message: 'Logged out successfully.' });
};

// Task-specific route: logout-user (and legacy /logout)
router.post('/logout-user', requireAuth, handleLogoutUser);
router.post('/logout', requireAuth, handleLogoutUser);

export default router;
