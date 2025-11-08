import { Request, Response, NextFunction } from 'express';
import { AppError } from './AppError';
import { logger } from '../logger';

/**
 * Handle Prisma-specific errors
 */
function handlePrismaError(error: any): AppError {
  // Check for Prisma error by code property
  if (error.code && typeof error.code === 'string' && error.code.startsWith('P')) {
    switch (error.code) {
      case 'P2002':
        // Unique constraint violation
        const target = error.meta?.target as string[] | undefined;
        const field = target?.[0] || 'field';
        return new AppError(
          `A record with this ${field} already exists`,
          409,
          true,
          'DUPLICATE_ENTRY',
          { field, constraint: error.meta?.target }
        );

      case 'P2025':
        // Record not found
        return new AppError('Record not found', 404, true, 'NOT_FOUND');

      case 'P2003':
        // Foreign key constraint violation
        return new AppError(
          'Related record not found',
          400,
          true,
          'FOREIGN_KEY_VIOLATION'
        );

      case 'P2014':
        // Invalid ID
        return new AppError('Invalid ID provided', 400, true, 'INVALID_ID');

      default:
        return new AppError(
          'Database operation failed',
          500,
          false,
          'DATABASE_ERROR'
        );
    }
  }

  // Check for validation errors
  if (error.message && error.message.includes('Invalid')) {
    return new AppError('Invalid data provided', 400, true, 'VALIDATION_ERROR');
  }

  return new AppError('Database error', 500, false, 'DATABASE_ERROR');
}

/**
 * Handle JWT-specific errors
 */
function handleJWTError(error: any): AppError {
  if (error.name === 'JsonWebTokenError') {
    return new AppError('Invalid token', 401, true, 'INVALID_TOKEN');
  }

  if (error.name === 'TokenExpiredError') {
    return new AppError('Token has expired', 401, true, 'TOKEN_EXPIRED');
  }

  return new AppError('Authentication failed', 401, true, 'AUTH_ERROR');
}

/**
 * Central error handling middleware
 */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let error: AppError;

  // Convert known error types to AppError
  if (err instanceof AppError) {
    error = err;
  } else if (err.name?.includes('Prisma')) {
    error = handlePrismaError(err);
  } else if (err.name?.includes('JsonWebToken') || err.name === 'TokenExpiredError') {
    error = handleJWTError(err);
  } else {
    // Unknown error - treat as internal server error
    error = new AppError(
      err.message || 'An unexpected error occurred',
      500,
      false
    );
  }

  // Log error with context
  const errorLog = {
    message: error.message,
    statusCode: error.statusCode,
    code: error.code,
    details: error.details,
    stack: error.stack,
    isOperational: error.isOperational,
    requestId: (req as any).id,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };

  if (error.isOperational) {
    logger.warn('Operational error occurred', errorLog);
  } else {
    logger.error('Non-operational error occurred', errorLog);
  }

  // Don't expose internal errors in production
  const isProd = process.env.NODE_ENV === 'production';
  const response: any = {
    success: false,
    error: isProd && !error.isOperational
      ? 'Internal server error'
      : error.message,
  };

  if (error.code) {
    response.code = error.code;
  }

  if (error.details && (error.isOperational || !isProd)) {
    response.details = error.details;
  }

  if (!isProd && error.stack) {
    response.stack = error.stack;
  }

  res.status(error.statusCode).json(response);
}

/**
 * 404 handler for undefined routes
 */
export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  const error = new AppError(
    `Cannot ${req.method} ${req.path}`,
    404,
    true,
    'ROUTE_NOT_FOUND'
  );
  next(error);
}

/**
 * Async error wrapper to catch errors in async route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
