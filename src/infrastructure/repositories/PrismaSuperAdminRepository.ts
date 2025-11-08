import { ISuperAdminRepository } from '../../domain/repositories/ISuperAdminRepository';
import { SuperAdmin, SuperAdminProps } from '../../domain/entities/SuperAdmin';
import { Email } from '../../domain/value-objects/Email';
import { PIN } from '../../domain/value-objects/PIN';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma implementation of SuperAdmin Repository
 */
export class PrismaSuperAdminRepository implements ISuperAdminRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string): Promise<SuperAdmin | null> {
    const data = await this.prisma.superAdmin.findUnique({
      where: { id },
    });

    if (!data) {
      return null;
    }

    return this.toDomain(data);
  }

  async findByEmail(email: Email): Promise<SuperAdmin | null> {
    const data = await this.prisma.superAdmin.findUnique({
      where: { email: email.getValue() },
    });

    if (!data) {
      return null;
    }

    return this.toDomain(data);
  }

  async save(admin: SuperAdmin): Promise<void> {
    const data = this.toPersistence(admin);

    await this.prisma.superAdmin.upsert({
      where: { id: admin.getId() },
      create: data,
      update: data,
    });

    admin.clearDomainEvents();
  }

  async count(): Promise<number> {
    return this.prisma.superAdmin.count();
  }

  /**
   * Map from Prisma model to Domain entity
   */
  private toDomain(data: any): SuperAdmin {
    const props: SuperAdminProps = {
      id: data.id,
      email: Email.create(data.email),
      name: data.name,
      currentPin: data.currentPin ? PIN.fromHash(data.currentPin) : undefined,
      pinExpiresAt: data.pinExpiresAt || undefined,
      pinAttempts: data.pinAttempts,
      emailVerified: data.emailVerified,
      suspendedAt: data.suspendedAt || undefined,
      lastLoginAt: data.lastLoginAt || undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };

    return SuperAdmin.create(props);
  }

  /**
   * Map from Domain entity to Prisma model
   */
  private toPersistence(admin: SuperAdmin): any {
    return {
      id: admin.getId(),
      email: admin.getEmail().getValue(),
      name: admin.getName(),
      currentPin: admin.getCurrentPin()?.getHash() || null,
      pinExpiresAt: admin.getPinExpiresAt() || null,
      pinAttempts: admin.getPinAttempts(),
      emailVerified: admin.isEmailVerified(),
      suspendedAt: admin.getSuspendedAt() || null,
      lastLoginAt: admin.getLastLoginAt() || null,
      updatedAt: admin.getUpdatedAt(),
    };
  }
}
