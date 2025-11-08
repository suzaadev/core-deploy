import { PaymentRequest, PaymentStatus, SettlementStatus } from '../entities/PaymentRequest';

/**
 * PaymentRequest Repository Interface
 */
export interface IPaymentRequestRepository {
  /**
   * Find payment request by ID
   */
  findById(id: string): Promise<PaymentRequest | null>;

  /**
   * Find payment request by link ID
   */
  findByLinkId(linkId: string): Promise<PaymentRequest | null>;

  /**
   * Save payment request (create or update)
   */
  save(paymentRequest: PaymentRequest): Promise<void>;

  /**
   * Find all payment requests for a merchant
   */
  findByMerchantId(
    merchantId: string,
    filters?: {
      status?: PaymentStatus;
      settlementStatus?: SettlementStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<PaymentRequest[]>;

  /**
   * Find last payment request for a merchant on a specific date
   */
  findLastForMerchantOnDate(merchantId: string, orderDate: string): Promise<PaymentRequest | null>;

  /**
   * Count payment requests for a merchant
   */
  countByMerchantId(merchantId: string, filters?: { status?: PaymentStatus }): Promise<number>;

  /**
   * Find expired payment requests that need to be marked as expired
   */
  findExpiredPending(): Promise<PaymentRequest[]>;
}
