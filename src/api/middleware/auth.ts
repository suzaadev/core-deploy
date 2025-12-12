import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../infrastructure/database/client';
import { UnauthorizedError, ForbiddenError } from '../../common/errors/AppError';
import { logger } from '../../common/logger';
import { validateSupabaseToken } from '../../infrastructure/supabase/client';
import { normalizeEmail } from '../../domain/utils/auth';
import { ApiKey } from '../../domain/value-objects/ApiKey';

/**
 * Extended Request interface with authenticated merchant
 */
export interface AuthRequest extends Request {
  authUser?: {
    id: string;
    email?: string;
    role?: string | string[];
  };
  merchant?: {
    id: string;
    slug: string;
    email: string;
    businessName: string;
  };
}

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

    // Check if this is an API key (starts with sza_live_)
    if (token.startsWith('sza_live_')) {
      // Use API key authentication
      const merchants = await prisma.merchant.findMany({
        where: {
          apiKeyHash: { not: null },
        },
        select: {
          id: true,
          slug: true,
          email: true,
          businessName: true,
          apiKeyHash: true,
          suspendedAt: true,
        },
      });

      let authenticatedMerchant = null;

      // Verify API key against each merchant's stored hash
      for (const merchant of merchants) {
        if (!merchant.apiKeyHash) continue;
        
        const apiKey = ApiKey.fromHash(merchant.apiKeyHash);
        const isValid = await apiKey.verify(token);

        if (isValid) {
          authenticatedMerchant = merchant;
          break;
        }
      }

      if (!authenticatedMerchant) {
        throw new UnauthorizedError('Invalid API key');
      }

      if (authenticatedMerchant.suspendedAt) {
        throw new ForbiddenError('Account has been suspended. Please contact support.');
      }

      req.merchant = {
        id: authenticatedMerchant.id,
        slug: authenticatedMerchant.slug,
        email: authenticatedMerchant.email,
        businessName: authenticatedMerchant.businessName,
      };

      req.authUser = {
        id: authenticatedMerchant.id,
        email: authenticatedMerchant.email,
        role: 'merchant',
      };

      return next();
    }

    // Otherwise, use JWT authentication
    const supabaseUser = await validateSupabaseToken(token);
    if (!supabaseUser) {
      throw new UnauthorizedError('Invalid authentication token');
    }

    const authUserId = supabaseUser.id;
    console.log('✅ NEW CODE: Supabase user validated! ID:', authUserId, 'Email:', supabaseUser.email);

    req.authUser = {
      id: authUserId,
      email: supabaseUser.email ?? undefined,
      role: supabaseUser.role ?? undefined,
    };

    // Fetch merchant from database and verify status
    console.log('🔍 AUTH DEBUG: Querying Prisma...');
    let merchant = await prisma.merchant.findUnique({
      where: { authUserId },
      select: {
        authUserId: true,
        id: true,
        slug: true,
        email: true,
        businessName: true,
        suspendedAt: true,
        suspendedBy: true,
        suspendedReason: true,
      },
    });

    if (!merchant && supabaseUser.email) {
      const normalizedEmail = normalizeEmail(supabaseUser.email);
      const legacyMerchant = await prisma.merchant.findUnique({
        where: { email: normalizedEmail },
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

      if (legacyMerchant) {
        merchant = await prisma.merchant.update({
          where: { id: legacyMerchant.id },
          data: { authUserId },
          select: {
            authUserId: true,
            id: true,
            slug: true,
            email: true,
            businessName: true,
            suspendedAt: true,
            suspendedBy: true,
            suspendedReason: true,
          },
        });
      }
    }

    console.log('🔍 AUTH DEBUG: Merchant result:', merchant ? 'FOUND' : 'NOT FOUND', merchant);
    if (merchant && merchant.suspendedAt) {
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

    if (merchant) {
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
    } else {
      req.merchant = undefined;
      logger.debug('Authenticated Supabase user without merchant profile', {
        authUserId,
        email: supabaseUser.email ?? undefined,
      });
    }

    next();
  } catch (error) {
    next(error);
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

    const supabaseUser = await validateSupabaseToken(token);
    if (!supabaseUser) {
      return next();
    }

    req.authUser = {
      id: supabaseUser.id,
      email: supabaseUser.email ?? undefined,
      role: supabaseUser.role ?? undefined,
    };

    const normalizedEmail = supabaseUser.email ? normalizeEmail(supabaseUser.email) : null;

    let merchant = await prisma.merchant.findUnique({
      where: { authUserId: supabaseUser.id },
      select: {
        id: true,
        slug: true,
        email: true,
        businessName: true,
        suspendedAt: true,
      },
    });

    if (!merchant && normalizedEmail) {
      const legacyMerchant = await prisma.merchant.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          slug: true,
          email: true,
          businessName: true,
          suspendedAt: true,
        },
      });

      if (legacyMerchant) {
        merchant = await prisma.merchant.update({
          where: { id: legacyMerchant.id },
          data: { authUserId: supabaseUser.id },
          select: {
            id: true,
            slug: true,
            email: true,
            businessName: true,
            suspendedAt: true,
          },
        });
      }
    }

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
