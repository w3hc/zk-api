/**
 * Intel TDX Platform Adapter (Native)
 *
 * Uses tdx-attest command-line tool or direct /dev/tdx-guest access
 */

import { Injectable, Logger } from '@nestjs/common';
import { execSync } from 'child_process';
import * as fs from 'fs';
import { ITeePlatform } from './platform.interface';
import { AttestationQuote } from '../attestation.types';

@Injectable()
export class TdxPlatform implements ITeePlatform {
  readonly name = 'intel-tdx' as const;
  private readonly logger = new Logger(TdxPlatform.name);

  async isAvailable(): Promise<boolean> {
    // Check for Intel TDX device
    return await Promise.resolve(
      fs.existsSync('/dev/tdx-guest') ||
        fs.existsSync('/dev/tdx_guest') ||
        fs.existsSync('/sys/firmware/tdx_seam'),
    );
  }

  async generateQuote(reportData: Buffer): Promise<AttestationQuote> {
    try {
      const tmpFile = `/tmp/tdx-quote-${Date.now()}.dat`;
      const reportDataHex = reportData.toString('hex');

      // Try tdx-attest command first
      try {
        execSync(`tdx-attest quote ${tmpFile} --user-data ${reportDataHex}`, {
          stdio: 'pipe',
        });
      } catch {
        // Fallback: use tdx-attest without user-data flag
        // (some versions don't support --user-data directly)
        try {
          // Write report_data to a temp file
          const reportDataFile = `/tmp/tdx-report-data-${Date.now()}.bin`;
          fs.writeFileSync(reportDataFile, reportData);

          execSync(`tdx-attest quote ${tmpFile} ${reportDataFile}`, {
            stdio: 'pipe',
          });

          fs.unlinkSync(reportDataFile);
        } catch {
          // Last resort: generate quote without custom report_data
          this.logger.warn(
            'tdx-attest does not support custom report_data, generating quote without it',
          );
          execSync(`tdx-attest quote ${tmpFile}`, { stdio: 'pipe' });
        }
      }

      const quote = await fs.promises.readFile(tmpFile);
      await fs.promises.unlink(tmpFile);

      // Extract MRTD (Measurement Register of TDX Module)
      // TDX quote structure has MRTD at offset 112, 48 bytes
      const measurement = quote.subarray(112, 160).toString('hex');

      return {
        platform: this.name,
        quote: quote.toString('base64'),
        reportData: reportData.toString('hex'),
        measurement,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        this.logger.error(
          `Failed to generate Intel TDX quote: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      throw new Error('Intel TDX attestation generation failed', {
        cause: error,
      });
    }
  }
}
