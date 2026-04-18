/**
 * AWS Nitro Enclaves Platform Adapter
 *
 * Uses NSM (Nitro Secure Module) device to generate attestation documents
 */

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { ITeePlatform } from './platform.interface';
import { AttestationQuote } from '../attestation.types';

@Injectable()
export class NitroPlatform implements ITeePlatform {
  readonly name = 'aws-nitro' as const;
  private readonly logger = new Logger(NitroPlatform.name);

  async isAvailable(): Promise<boolean> {
    // Check for AWS Nitro NSM device
    return await Promise.resolve(fs.existsSync('/dev/nsm'));
  }

  async generateQuote(reportData: Buffer): Promise<AttestationQuote> {
    try {
      // In production, use aws-nitro-enclaves-nsm-api bindings
      // For now, we'll create a mock implementation that demonstrates the structure
      //
      // Production implementation would look like:
      // const nsm = require('aws-nitro-enclaves-nsm-api');
      // const attestationDoc = await nsm.attestation({
      //   user_data: reportData,  // up to 512 bytes
      //   nonce: null,
      //   public_key: null
      // });

      // Mock attestation document (CBOR-encoded in production)
      const attestationDoc = {
        module_id: 'i-1234567890abcdef0-enc1234567890abcd',
        digest: 'SHA384',
        timestamp: Date.now(),
        pcrs: {
          0: this.generateMockPCR(),
          1: this.generateMockPCR(),
          2: this.generateMockPCR(),
        },
        certificate: 'BASE64_CERT_CHAIN',
        cabundle: [],
        user_data: reportData.toString('base64'),
        nonce: null,
        public_key: null,
      };

      // In production, this would be the CBOR-encoded attestation document
      const docBuffer = Buffer.from(JSON.stringify(attestationDoc));

      // Extract PCR0 as the measurement (enclave image measurement)
      const measurement = attestationDoc.pcrs[0];

      return await Promise.resolve({
        platform: this.name,
        quote: docBuffer.toString('base64'),
        reportData: reportData.toString('hex'),
        measurement,
        timestamp: new Date().toISOString(),
        raw: attestationDoc,
      });
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        this.logger.error(
          `Failed to generate AWS Nitro attestation: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      throw new Error('AWS Nitro attestation generation failed', {
        cause: error,
      });
    }
  }

  /**
   * Generate a mock PCR value (48 bytes hex)
   * In production, this comes from the actual NSM device
   */
  private generateMockPCR(): string {
    const buffer = Buffer.alloc(48);
    for (let i = 0; i < 48; i++) {
      buffer[i] = i % 256;
    }
    return buffer.toString('hex');
  }
}
