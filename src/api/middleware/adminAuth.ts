import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { prisma } from '../../infrastructure/database/client';

export interface AdminRequest extends Request {
  admin?: {
    id: string;
    email: string;
    role: string;
  };
}

export async function authenticateAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    // Verify token
    const decoded = jwt.verify(token, config.security.jwtSecret) as {
      adminId: string;
      email: string;
      role: string;
    };

    // Check if role is super_admin
    if (decoded.role !== 'super_admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Check if admin still exists and is not suspended
    const admin = await prisma.superAdmin.findUnique({
      where: { id: decoded.adminId },
      select: { id: true, email: true, suspendedAt: true },
    });

    if (!admin) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (admin.suspendedAt) {
      return res.status(403).json({ error: 'Account suspended' });
    }

    req.admin = {
      id: admin.id,
      email: admin.email,
      role: 'super_admin',
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
