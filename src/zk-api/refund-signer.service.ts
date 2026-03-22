import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { RefundTicketDto } from './dto/api-response.dto';

/**
 * Service for signing refund tickets using EdDSA
 * In production, this should use proper EdDSA implementation (e.g., @noble/curves)
 */
@Injectable()
export class RefundSignerService {
  private readonly logger = new Logger(RefundSignerService.name);
  private readonly privateKey: string;
  private readonly publicKey: { x: string; y: string };

  constructor() {
    // In production, load from secure key management system
    // For now, generate deterministic keys for development
    this.privateKey =
      process.env.SERVER_PRIVATE_KEY || this.generatePrivateKey();
    this.publicKey = this.derivePublicKey(this.privateKey);

    this.logger.log('Refund signer initialized');
    this.logger.debug(
      `Public key: (${this.publicKey.x.slice(0, 10)}..., ${this.publicKey.y.slice(0, 10)}...)`,
    );
  }

  /**
   * Sign a refund ticket
   */
  signRefund(refundData: {
    nullifier: string;
    value: string;
    timestamp: number;
  }): RefundTicketDto {
    // Create message to sign
    const message = this.hashRefundData(refundData);

    // Sign using EdDSA (simplified for development)
    const signature = this.sign(message);

    return {
      nullifier: refundData.nullifier,
      value: refundData.value,
      timestamp: refundData.timestamp,
      signature,
    };
  }

  /**
   * Get the server's public key for signature verification
   */
  getPublicKey(): { x: string; y: string } {
    return { ...this.publicKey };
  }

  /**
   * Verify a refund signature (for testing)
   */
  verifyRefund(ticket: RefundTicketDto): boolean {
    const message = this.hashRefundData({
      nullifier: ticket.nullifier,
      value: ticket.value,
      timestamp: ticket.timestamp,
    });

    return this.verify(message, ticket.signature);
  }

  // ============ Private Methods ============

  private generatePrivateKey(): string {
    // Generate deterministic private key for development
    const hash = createHash('sha256');
    hash.update('zk-api-refund-signer-dev-key');
    return '0x' + hash.digest('hex');
  }

  private derivePublicKey(privateKey: string): { x: string; y: string } {
    // Simplified public key derivation for development
    // In production, use proper EdDSA key derivation
    const hash1 = createHash('sha256');
    hash1.update(privateKey + 'x');
    const x = '0x' + hash1.digest('hex');

    const hash2 = createHash('sha256');
    hash2.update(privateKey + 'y');
    const y = '0x' + hash2.digest('hex');

    return { x, y };
  }

  private hashRefundData(data: {
    nullifier: string;
    value: string;
    timestamp: number;
  }): string {
    const hash = createHash('sha256');
    hash.update(data.nullifier);
    hash.update(data.value);
    hash.update(data.timestamp.toString());
    return '0x' + hash.digest('hex');
  }

  private sign(message: string): {
    R8x: string;
    R8y: string;
    S: string;
  } {
    // Simplified EdDSA signing for development
    // In production, use @noble/curves or circomlibjs
    const hash1 = createHash('sha256');
    hash1.update(message + this.privateKey + 'R8x');
    const R8x = '0x' + hash1.digest('hex');

    const hash2 = createHash('sha256');
    hash2.update(message + this.privateKey + 'R8y');
    const R8y = '0x' + hash2.digest('hex');

    const hash3 = createHash('sha256');
    hash3.update(message + this.privateKey + 'S');
    const S = '0x' + hash3.digest('hex');

    return { R8x, R8y, S };
  }

  private verify(
    message: string,
    signature: { R8x: string; R8y: string; S: string },
  ): boolean {
    // Simplified verification for development
    const expectedSig = this.sign(message);
    return (
      expectedSig.R8x === signature.R8x &&
      expectedSig.R8y === signature.R8y &&
      expectedSig.S === signature.S
    );
  }
}
