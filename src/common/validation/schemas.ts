import Joi from 'joi';
import validator from 'validator';

/**
 * Custom email validation using validator library
 */
const emailValidator = (value: string, helpers: any) => {
  if (!validator.isEmail(value) || value.length > 254) {
    return helpers.error('any.invalid');
  }
  return value.toLowerCase().trim();
};

/**
 * Common validation schemas
 */
export const commonSchemas = {
  email: Joi.string()
    .custom(emailValidator, 'email validation')
    .required()
    .messages({
      'any.invalid': 'Invalid email address',
      'string.empty': 'Email is required',
    }),

  pin: Joi.string()
    .length(6)
    .pattern(/^[A-Z0-9]{6}$/)
    .required()
    .messages({
      'string.length': 'PIN must be exactly 6 characters',
      'string.pattern.base': 'PIN must contain only uppercase letters and numbers',
      'string.empty': 'PIN is required',
    }),

  uuid: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Invalid ID format',
    }),

  businessName: Joi.string()
    .min(2)
    .max(100)
    .trim()
    .required()
    .messages({
      'string.min': 'Business name must be at least 2 characters',
      'string.max': 'Business name cannot exceed 100 characters',
      'string.empty': 'Business name is required',
    }),

  amount: Joi.number()
    .positive()
    .precision(2)
    .max(1000000)
    .required()
    .messages({
      'number.positive': 'Amount must be positive',
      'number.max': 'Amount cannot exceed 1,000,000',
      'number.base': 'Amount must be a valid number',
    }),

  description: Joi.string()
    .min(1)
    .max(500)
    .trim()
    .messages({
      'string.max': 'Description cannot exceed 500 characters',
    }),

  blockchain: Joi.string()
    .valid('ETHEREUM', 'POLYGON', 'BITCOIN', 'BINANCE_SMART_CHAIN', 'ARBITRUM', 'OPTIMISM')
    .required()
    .messages({
      'any.only': 'Invalid blockchain network',
    }),

  walletAddress: Joi.string()
    .min(26)
    .max(66)
    .pattern(/^[a-zA-Z0-9]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid wallet address format',
      'string.min': 'Wallet address too short',
      'string.max': 'Wallet address too long',
    }),
};

/**
 * Auth route validation schemas
 */
export const authSchemas = {
  register: Joi.object({
    email: commonSchemas.email,
    businessName: commonSchemas.businessName,
  }),

  login: Joi.object({
    email: commonSchemas.email,
  }),

  verifyPin: Joi.object({
    email: commonSchemas.email,
    pin: commonSchemas.pin,
  }),
};

/**
 * Admin route validation schemas
 */
export const adminSchemas = {
  register: Joi.object({
    email: commonSchemas.email,
  }),

  login: Joi.object({
    email: commonSchemas.email,
  }),

  verifyPin: Joi.object({
    email: commonSchemas.email,
    pin: commonSchemas.pin,
  }),

  updateMerchant: Joi.object({
    businessName: Joi.string().min(2).max(100).trim(),
    email: Joi.string().custom(emailValidator, 'email validation'),
    allowUnsolicitedPayments: Joi.boolean(),
  }).min(1),

  suspendMerchant: Joi.object({
    reason: Joi.string()
      .min(10)
      .max(500)
      .trim()
      .required()
      .messages({
        'string.min': 'Suspension reason must be at least 10 characters',
        'string.max': 'Suspension reason cannot exceed 500 characters',
        'string.empty': 'Suspension reason is required',
      }),
  }),
};

/**
 * Payment route validation schemas
 */
export const paymentSchemas = {
  createPaymentRequest: Joi.object({
    amountFiat: commonSchemas.amount,
    currency: Joi.string()
      .length(3)
      .uppercase()
      .default('USD')
      .messages({
        'string.length': 'Currency code must be 3 characters (e.g., USD)',
      }),
    description: commonSchemas.description.optional(),
    expiresInMinutes: Joi.number()
      .integer()
      .min(5)
      .max(1440)
      .default(60)
      .messages({
        'number.min': 'Expiration must be at least 5 minutes',
        'number.max': 'Expiration cannot exceed 1440 minutes (24 hours)',
      }),
  }),

  publicCreatePayment: Joi.object({
    merchantSlug: Joi.string()
      .min(6)
      .max(6)
      .pattern(/^[A-Z0-9]{6}$/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid merchant slug format',
        'string.length': 'Merchant slug must be 6 characters',
      }),
    amountFiat: commonSchemas.amount,
    currency: Joi.string().length(3).uppercase().default('USD'),
    description: commonSchemas.description.optional(),
    buyerEmail: Joi.string()
      .custom(emailValidator, 'email validation')
      .optional(),
  }),
};

/**
 * Wallet route validation schemas
 */
export const walletSchemas = {
  addWallet: Joi.object({
    blockchain: commonSchemas.blockchain,
    address: commonSchemas.walletAddress,
    label: Joi.string()
      .min(1)
      .max(50)
      .trim()
      .optional()
      .messages({
        'string.max': 'Label cannot exceed 50 characters',
      }),
  }),

  updateWallet: Joi.object({
    label: Joi.string()
      .min(1)
      .max(50)
      .trim()
      .messages({
        'string.max': 'Label cannot exceed 50 characters',
      }),
    isActive: Joi.boolean(),
  }).min(1),
};

/**
 * Query parameter schemas
 */
export const querySchemas = {
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().valid('createdAt', 'updatedAt').default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  }),

  merchantFilter: Joi.object({
    suspended: Joi.boolean(),
    search: Joi.string().max(100).trim(),
  }),
};
