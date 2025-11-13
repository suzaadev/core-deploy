import { Request, Response, NextFunction } from 'express';
import { validateAdminSupabaseToken } from '../../infrastructure/supabase/adminClient';
import { prisma } from '../../infrastructure/database/client';
import { logger } from '../../common/logger';

export interface AdminRequest extends Request {
  authUser?: {
    id: string;
    email?: string;
  };
  admin?: {
    id: string;
    email: string;
    name: string;
  };
}

/**
 * Middleware to authenticate admin requests using ADMIN Supabase JWT
 */
export async function authenticateAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No authentication token provided' });
      return;
    }

    const token = authHeader.substring(7);

    // Validate token via ADMIN Supabase (separate project)
    const supabaseUser = await validateAdminSupabaseToken(token);
    
    if (!supabaseUser) {
      logger.warn('Invalid admin Supabase token');
      res.status(401).json({ error: 'Invalid authentication token' });
      return;
    }

    const authUserId = supabaseUser.id;

    req.authUser = {
      id: authUserId,
      email: supabaseUser.email ?? undefined,
    };

    // Fetch admin from database
    const admin = await prisma.superAdmin.findUnique({
      where: { authUserId },
      select: {
        id: true,
        email: true,
        name: true,
        suspendedAt: true,
      },
    });

    if (admin && admin.suspendedAt) {
      logger.warn('Suspended admin attempted access', {
        adminId: admin.id,
        email: admin.email,
      });
      res.status(403).json({ error: 'Account has been suspended' });
      return;
    }

    if (admin) {
      req.admin = {
        id: admin.id,
        email: admin.email,
        name: admin.name,
      };
    } else {
      req.admin = undefined;
      logger.debug('Authenticated admin Supabase user without admin profile', {
        authUserId,
        email: supabaseUser.email,
      });
    }

    next();
  } catch (error) {
    logger.error('Admin authentication failed', { error });
    res.status(401).json({ error: 'Authentication failed' });
  }
}
