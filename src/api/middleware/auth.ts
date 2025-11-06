import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { prisma } from '../../infrastructure/database/client';

export interface AuthRequest extends Request {
  merchant?: {
    id: string;
    slug: string;
    email: string;
  };
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, config.security.jwtSecret) as {
      merchantId: string;
      slug: string;
      email: string;
    };

    // Check if merchant still exists and is not suspended
    const merchant = await prisma.merchant.findUnique({
      where: { id: decoded.merchantId },
      select: { id: true, slug: true, email: true, suspendedAt: true },
    });

    if (!merchant) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (merchant.suspendedAt) {
      return res.status(403).json({ error: 'Account suspended' });
    }

    // Attach merchant to request
    req.merchant = {
      id: merchant.id,
      slug: merchant.slug,
      email: merchant.email,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(500).json({ error: 'Authentication failed' });
  }
}
