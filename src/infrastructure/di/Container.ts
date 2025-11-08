import { PrismaClient } from '@prisma/client';
import { IMerchantRepository } from '../../domain/repositories/IMerchantRepository';
import { ISuperAdminRepository } from '../../domain/repositories/ISuperAdminRepository';
import { IPaymentRequestRepository } from '../../domain/repositories/IPaymentRequestRepository';
import { IEmailService } from '../services/IEmailService';
import { IWebhookService } from '../services/IWebhookService';
import { PrismaMerchantRepository } from '../repositories/PrismaMerchantRepository';
import { PrismaSuperAdminRepository } from '../repositories/PrismaSuperAdminRepository';
import { PrismaPaymentRequestRepository } from '../repositories/PrismaPaymentRequestRepository';
import { SendGridEmailService } from '../services/SendGridEmailService';
import { BullWebhookService } from '../services/BullWebhookService';
import { prisma } from '../database/client';

/**
 * Dependency Injection Container
 * Manages all application dependencies
 */
export class Container {
  private static instance: Container;

  // Repositories
  public readonly merchantRepository: IMerchantRepository;
  public readonly superAdminRepository: ISuperAdminRepository;
  public readonly paymentRequestRepository: IPaymentRequestRepository;

  // Services
  public readonly emailService: IEmailService;
  public readonly webhookService: IWebhookService;

  // Infrastructure
  public readonly prisma: PrismaClient;

  private constructor() {
    this.prisma = prisma;

    // Initialize repositories
    this.merchantRepository = new PrismaMerchantRepository(this.prisma);
    this.superAdminRepository = new PrismaSuperAdminRepository(this.prisma);
    this.paymentRequestRepository = new PrismaPaymentRequestRepository(this.prisma);

    // Initialize services
    this.emailService = new SendGridEmailService();
    this.webhookService = new BullWebhookService(this.emailService);
  }

  static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  async shutdown(): Promise<void> {
    if ('shutdown' in this.webhookService) { await (this.webhookService as any).shutdown(); }
    await this.prisma.$disconnect();
  }
}

// Export singleton instance
export const container = Container.getInstance();
