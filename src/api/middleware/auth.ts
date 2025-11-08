import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { prisma } from '../../infrastructure/database/client';
import { UnauthorizedError, ForbiddenError } from '../../common/errors/AppError';
import { logger } from '../../common/logger';

/**
 * Extended Request interface with authenticated merchant
 */
export interface AuthRequest extends Request {
  merchant?: {
    id: string;
    slug: string;
    email: string;
    businessName: string;
  };
}

/**
 * JWT payload interface
 */
interface JWTPayload {
  merchantId: string;
  slug: string;
  email: string;
  iat?: number;
  exp?: number;
}

/**
 * Middleware to authenticate merchant requests using JWT
 * Validates token, checks merchant exists and is not suspended
 */
export async function authenticate(
  req: AuthRequest,
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

    // Verify JWT token
    const decoded = jwt.verify(
      token,
      config.security.jwtSecret
    ) as JWTPayload;

    // Fetch merchant from database and verify status
    const merchant = await prisma.merchant.findUnique({
      where: { id: decoded.merchantId },
      select: {
        id: true,
        slug: true,
        email: true,
        businessName: true,
        suspendedAt: true,
        suspendedBy: true,
        suspendedReason: true,
      },
    });

    if (!merchant) {
      logger.warn('Invalid token used - merchant not found', {
        merchantId: decoded.merchantId,
        ip: req.ip,
      });
      throw new UnauthorizedError('Invalid authentication token');
    }

    if (merchant.suspendedAt) {
      logger.warn('Suspended merchant attempted access', {
        merchantId: merchant.id,
        email: merchant.email,
        suspendedAt: merchant.suspendedAt,
        suspendedBy: merchant.suspendedBy,
        ip: req.ip,
      });
      throw new ForbiddenError(
        'Account has been suspended. Please contact support.'
      );
    }

    // Attach merchant info to request
    req.merchant = {
      id: merchant.id,
      slug: merchant.slug,
      email: merchant.email,
      businessName: merchant.businessName,
    };

    logger.debug('Merchant authenticated successfully', {
      merchantId: merchant.id,
      email: merchant.email,
    });

    next();
  } catch (error) {
    // Pass JWT errors to error handler
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Invalid JWT token', { error: error.message, ip: req.ip });
      next(new UnauthorizedError('Invalid authentication token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      logger.warn('Expired JWT token', { expiredAt: error.expiredAt, ip: req.ip });
      next(new UnauthorizedError('Authentication token has expired'));
    } else {
      next(error);
    }
  }
}

/**
 * Optional authentication middleware
 * Attaches merchant to request if valid token provided, but doesn't fail if missing
 */
export async function optionalAuthenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // No token provided, continue without authentication
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(
      token,
      config.security.jwtSecret
    ) as JWTPayload;

    const merchant = await prisma.merchant.findUnique({
      where: { id: decoded.merchantId },
      select: {
        id: true,
        slug: true,
        email: true,
        businessName: true,
        suspendedAt: true,
      },
    });

    if (merchant && !merchant.suspendedAt) {
      req.merchant = {
        id: merchant.id,
        slug: merchant.slug,
        email: merchant.email,
        businessName: merchant.businessName,
      };
    }

    next();
  } catch (error) {
    // Ignore authentication errors for optional auth
    next();
  }
}
