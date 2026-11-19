import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import CONFIG, { UserRole } from '../config.js';
import { prisma } from './db.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  employeeId?: string;
  employeeCode?: string;
  supervisorId?: string;
  supervisorCode?: string;
  hubId?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Hash password securely
 */
export async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, CONFIG.SECURITY.BCRYPT_SALT_ROUNDS);
}

/**
 * Verify password against bcrypt hash
 */
export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

/**
 * Generate Access & Refresh Tokens
 */
export function generateTokens(user: AuthenticatedUser) {
  const accessToken = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      employeeId: user.employeeId,
      employeeCode: user.employeeCode,
      supervisorId: user.supervisorId,
      supervisorCode: user.supervisorCode,
      hubId: user.hubId,
    },
    CONFIG.SECURITY.JWT_SECRET,
    { expiresIn: CONFIG.SECURITY.JWT_EXPIRES_IN as any }
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    CONFIG.SECURITY.REFRESH_SECRET,
    { expiresIn: CONFIG.SECURITY.REFRESH_EXPIRES_IN as any }
  );

  return { accessToken, refreshToken };
}

/**
 * Middleware: Verify JWT and attach user object
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'AUTHENTICATION_REQUIRED',
      message: 'Access token missing or invalid format.',
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, CONFIG.SECURITY.JWT_SECRET) as AuthenticatedUser;

    // Check if user is still active in database
    const dbUser = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        employee: true,
        supervisor: true,
        hubOperator: true,
      },
    });

    if (!dbUser || !dbUser.isActive) {
      res.status(401).json({
        success: false,
        error: 'ACCOUNT_DEACTIVATED',
        message: 'User account has been deactivated or not found.',
      });
      return;
    }

    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role as UserRole,
      employeeId: dbUser.employee?.id,
      employeeCode: dbUser.employee?.employeeCode,
      supervisorId: dbUser.supervisor?.id,
      supervisorCode: dbUser.supervisor?.supervisorCode,
      hubId: dbUser.hubOperator?.id,
    };

    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        error: 'TOKEN_EXPIRED',
        message: 'Access token has expired. Please refresh token.',
      });
      return;
    }
    res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Token verification failed.',
    });
  }
}

/**
 * Middleware: Enforce Role-Based Access Control
 */
export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required.',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'INSUFFICIENT_HIERARCHY_LEVEL',
        message: `Access denied. Role "${req.user.role}" does not have permission for this higher-tier operational data. Allowed roles: ${allowedRoles.join(', ')}.`,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware: Enforce Strict Minimum Hierarchy Rank
 */
export function requireMinHierarchy(minLevel: number) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required.',
      });
      return;
    }

    const userLevel = (CONFIG.HIERARCHY_LEVELS as any)[req.user.role] || 0;
    if (userLevel < minLevel) {
      res.status(403).json({
        success: false,
        error: 'INSUFFICIENT_HIERARCHY_LEVEL',
        message: `Hierarchy violation! Your role rank (${userLevel}) is insufficient to access Level ${minLevel} data. Lower roles in the hierarchy cannot access superior tier operations.`,
      });
      return;
    }

    next();
  };
}

/**
 * Create an immutable audit log record
 */
export async function createAuditLog(params: {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        details: params.details ? JSON.stringify(params.details) : null,
        ipAddress: params.ipAddress,
      },
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
