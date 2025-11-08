import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { prisma } from '../../infrastructure/database/client';
import { UnauthorizedError, ForbiddenError } from '../../common/errors/AppError';
import { logger } from '../../common/logger';

/**
 * Extended Request interface with authenticated admin
 * FIXED: Renamed from AdminAuthRequest to AdminRequest for consistency
 */
export interface AdminRequest extends Request {
  admin?: {
    id: string;
    email: string;
  };
}

/**
 * JWT payload interface for admin tokens
 */
interface AdminJWTPayload {
  adminId: string;
  email: string;
  iat?: number;
  exp?: number;
}

/**
 * Middleware to authenticate admin requests using JWT
 * Validates token, checks admin exists and is not suspended
 *
 * FIXES:
 * - Removed hardcoded JWT secret fallback
 * - Added suspension check (was missing)
 * - Added proper logging
 * - Consistent error handling
 */
export async function authenticateAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No authentication token provided');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token using config (no hardcoded fallback)
    const decoded = jwt.verify(
      token,
      config.security.jwtSecret
    ) as AdminJWTPayload;

    // Fetch admin from database and verify status
    const admin = await prisma.superAdmin.findUnique({
      where: { id: decoded.adminId },
      select: {
        id: true,
        email: true,
        suspendedAt: true, // FIXED: Added suspension check
      },
    });

    if (!admin) {
      logger.warn('Invalid admin token used - admin not found', {
        adminId: decoded.adminId,
        ip: req.ip,
      });
      throw new UnauthorizedError('Invalid authentication token');
    }

    // FIXED: Check if admin is suspended
    if (admin.suspendedAt) {
      logger.warn('Suspended admin attempted access', {
        adminId: admin.id,
        email: admin.email,
        suspendedAt: admin.suspendedAt,
        ip: req.ip,
      });
      throw new ForbiddenError(
        'Admin account has been suspended. Please contact system administrator.'
      );
    }

    // Attach admin info to request
    req.admin = {
      id: admin.id,
      email: admin.email,
    };

    logger.debug('Admin authenticated successfully', {
      adminId: admin.id,
      email: admin.email,
    });

    next();
  } catch (error) {
    // Pass JWT errors to error handler
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Invalid admin JWT token', { error: error.message, ip: req.ip });
      next(new UnauthorizedError('Invalid authentication token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      logger.warn('Expired admin JWT token', { expiredAt: error.expiredAt, ip: req.ip });
      next(new UnauthorizedError('Authentication token has expired'));
    } else {
      next(error);
    }
  }
}
