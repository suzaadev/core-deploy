import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Extended Request interface with correlation ID
 */
export interface RequestWithId extends Request {
  id: string;
}

/**
 * Middleware to add correlation ID to each request
 * This enables distributed tracing across services
 */
export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Generate or use existing correlation ID
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();

  // Attach to request object
  (req as RequestWithId).id = correlationId;

  // Add to response headers
  res.setHeader('X-Correlation-ID', correlationId);

  next();
}
