/**
 * Mock Platform Adapter
 *
 * Used for local development and CI testing
 * Returns fake attestation data with clear warnings
 */

import { Injectable, Logger } from '@nestjs/common';
import { ITeePlatform } from './platform.interface';
import { AttestationQuote } from '../attestation.types';

@Injectable()
export class MockPlatform implements ITeePlatform {
  readonly name = 'mock' as const;
  private readonly logger = new Logger(MockPlatform.name);

  async isAvailable(): Promise<boolean> {
    // Mock platform is always available as a fallback
    return await Promise.resolve(true);
  }

  async generateQuote(reportData: Buffer): Promise<AttestationQuote> {
    this.logger.warn(
      '⚠️  Generating MOCK attestation - DO NOT USE IN PRODUCTION',
    );

    const mockReport = {
      warning: 'MOCK_ATTESTATION_FOR_DEVELOPMENT_ONLY',
      timestamp: new Date().toISOString(),
      message: 'This is not a real TEE environment',
      reportData: reportData.toString('hex'),
      platform: 'mock',
    };

    return await Promise.resolve({
      platform: this.name,
      quote: Buffer.from(JSON.stringify(mockReport)).toString('base64'),
      reportData: reportData.toString('hex'),
      measurement: 'MOCK_MEASUREMENT_NOT_SECURE_' + '0'.repeat(64),
      timestamp: new Date().toISOString(),
      raw: mockReport,
    });
  }
}
