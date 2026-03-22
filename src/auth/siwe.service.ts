import { Injectable } from '@nestjs/common';
import { SiweMessage, generateNonce } from 'siwe';

interface NonceEntry {
  nonce: string;
  createdAt: number;
}

@Injectable()
export class SiweService {
  // In-memory nonce storage (ephemeral, TEE-friendly)
  private readonly nonces = new Map<string, NonceEntry>();

  // Nonce expires after 5 minutes
  private readonly NONCE_TTL = 5 * 60 * 1000;

  /**
   * Generate a cryptographically secure random nonce
   * Nonces are stored in-memory only (no persistence)
   */
  generateNonce(): string {
    const nonce = generateNonce();

    this.nonces.set(nonce, {
      nonce,
      createdAt: Date.now(),
    });

    // Clean up expired nonces
    this.cleanExpiredNonces();

    return nonce;
  }

  /**
   * Verify SIWE message and signature
   * Returns the Ethereum address if valid, null otherwise
   */
  async verifySignature(
    message: string,
    signature: string,
  ): Promise<string | null> {
    try {
      const siweMessage = new SiweMessage(message);

      // Verify the signature matches the message
      const fields = await siweMessage.verify({ signature });

      // Check if nonce exists and is not expired
      const nonceEntry = this.nonces.get(siweMessage.nonce);
      if (!nonceEntry) {
        return null; // Nonce not found or already used
      }

      // Check if nonce is expired
      const age = Date.now() - nonceEntry.createdAt;
      if (age > this.NONCE_TTL) {
        this.nonces.delete(siweMessage.nonce);
        return null; // Nonce expired
      }

      // Single-use nonce: delete after successful verification
      this.nonces.delete(siweMessage.nonce);

      // Return the verified Ethereum address
      return fields.data.address;
    } catch {
      // Verification failed - don't log the error details in production
      // to avoid leaking information about why verification failed
      return null;
    }
  }

  /**
   * Clean up expired nonces to prevent memory bloat
   */
  private cleanExpiredNonces(): void {
    const now = Date.now();
    for (const [nonce, entry] of this.nonces.entries()) {
      if (now - entry.createdAt > this.NONCE_TTL) {
        this.nonces.delete(nonce);
      }
    }
  }
}
