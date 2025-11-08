import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../common/errors/errorHandler';
import { validate } from '../../common/validation/validator';
import { authSchemas } from '../../common/validation/schemas';
import { authRateLimiter, pinVerificationRateLimiter } from '../../common/middleware/rateLimiter';
import { container } from '../../infrastructure/di/Container';
import { RegisterMerchantUseCase } from '../../application/use-cases/merchant/RegisterMerchantUseCase';
import { LoginMerchantUseCase } from '../../application/use-cases/merchant/LoginMerchantUseCase';
import { VerifyMerchantPinUseCase } from '../../application/use-cases/merchant/VerifyMerchantPinUseCase';

const router = Router();

/**
 * POST /auth/register
 * Register a new merchant
 */
router.post(
  '/register',
  authRateLimiter,
  validate(authSchemas.register, 'body'),
  asyncHandler(async (req: Request, res: Response) => {
    const useCase = new RegisterMerchantUseCase(
      container.merchantRepository,
      container.emailService,
    );

    const result = await useCase.execute({
      email: req.body.email,
      businessName: req.body.businessName,
    });

    res.status(201).json({
      success: true,
      data: result,
      message: 'Merchant registered successfully. Check your email for verification PIN.',
    });
  }),
);

/**
 * POST /auth/login
 * Request login PIN
 */
router.post(
  '/login',
  authRateLimiter,
  validate(authSchemas.login, 'body'),
  asyncHandler(async (req: Request, res: Response) => {
    const useCase = new LoginMerchantUseCase(
      container.merchantRepository,
      container.emailService,
    );

    const result = await useCase.execute({
      email: req.body.email,
    });

    res.json({
      success: true,
      message: result.message,
    });
  }),
);

/**
 * POST /auth/verify-pin
 * Verify PIN and get JWT token
 */
router.post(
  '/verify-pin',
  pinVerificationRateLimiter,
  validate(authSchemas.verifyPin, 'body'),
  asyncHandler(async (req: Request, res: Response) => {
    const useCase = new VerifyMerchantPinUseCase(container.merchantRepository);

    const result = await useCase.execute({
      email: req.body.email,
      pin: req.body.pin,
    });

    res.json({
      success: true,
      data: {
        token: result.token,
        merchant: result.merchant,
      },
    });
  }),
);

export default router;
