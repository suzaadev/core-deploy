import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../../infrastructure/database/client';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export interface AdminAuthRequest extends Request {
  admin?: {
    id: string;
    email: string;
  };
}

export async function authenticateAdmin(
  req: AdminAuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, JWT_SECRET) as {
      adminId: string;
      email: string;
    };

    // Verify admin exists
    const admin = await prisma.superAdmin.findUnique({
      where: { id: decoded.adminId },
      select: {
        id: true,
        email: true,
      },
    });

    if (!admin) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
}
