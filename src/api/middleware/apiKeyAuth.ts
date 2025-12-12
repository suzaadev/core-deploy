import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../infrastructure/database/client';
import { UnauthorizedError, ForbiddenError } from '../../common/errors/AppError';
import { logger } from '../../common/logger';
import { ApiKey } from '../../domain/value-objects/ApiKey';
import { AuthRequest } from './auth';

/**
 * API Key Authentication Middleware
 * Validates API keys from Authorization: Bearer header
 * Works alongside JWT authentication
 */
export async function authenticateApiKey(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No API key provided');
    }

    const apiKeyPlaintext = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Validate API key format
    if (!apiKeyPlaintext.startsWith('sza_live_')) {
      throw new UnauthorizedError('Invalid API key format');
    }

    // Find all merchants with API keys and verify
    // Note: We can't do direct hash lookup with bcrypt, so we check all merchants with keys
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
      const isValid = await apiKey.verify(apiKeyPlaintext);

      if (isValid) {
        authenticatedMerchant = merchant;
        break;
      }
    }

    if (!authenticatedMerchant) {
      logger.warn('Invalid API key attempt', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      throw new UnauthorizedError('Invalid API key');
    }

    // Check if merchant is suspended
    if (authenticatedMerchant.suspendedAt) {
      logger.warn('Suspended merchant attempted API access', {
        merchantId: authenticatedMerchant.id,
        email: authenticatedMerchant.email,
        suspendedAt: authenticatedMerchant.suspendedAt,
        ip: req.ip,
      });
      throw new ForbiddenError(
        'Account has been suspended. Please contact support.'
      );
    }

    // Attach merchant info to request (same format as JWT auth)
    req.merchant = {
      id: authenticatedMerchant.id,
      slug: authenticatedMerchant.slug,
      email: authenticatedMerchant.email,
      businessName: authenticatedMerchant.businessName,
    };

    // Set authUser to indicate API key authentication
    req.authUser = {
      id: authenticatedMerchant.id,
      email: authenticatedMerchant.email,
      role: 'merchant',
    };

    logger.debug('Merchant authenticated via API key', {
      merchantId: authenticatedMerchant.id,
      email: authenticatedMerchant.email,
      ip: req.ip,
    });

    next();
  } catch (error) {
    next(error);
  }
}



