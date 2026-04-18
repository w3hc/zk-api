/**
 * AMD SEV-SNP Platform Adapter
 *
 * Uses snpguest command-line tool to generate attestation reports
 */

import { Injectable, Logger } from '@nestjs/common';
import { execSync } from 'child_process';
import * as fs from 'fs';
import { ITeePlatform } from './platform.interface';
import { AttestationQuote } from '../attestation.types';

@Injectable()
export class SevSnpPlatform implements ITeePlatform {
  readonly name = 'amd-sev-snp' as const;
  private readonly logger = new Logger(SevSnpPlatform.name);

  async isAvailable(): Promise<boolean> {
    // Check for AMD SEV-SNP device
    return await Promise.resolve(
      fs.existsSync('/dev/sev-guest') || fs.existsSync('/dev/sev'),
    );
  }

  async generateQuote(reportData: Buffer): Promise<AttestationQuote> {
    try {
      const tmpFile = `/tmp/snp-report-${Date.now()}.bin`;
      const reportDataHex = reportData.toString('hex');

      // snpguest supports --report-data as hex string
      execSync(`snpguest report ${tmpFile} --report-data ${reportDataHex}`, {
        stdio: 'pipe',
      });

      const report = await fs.promises.readFile(tmpFile);
      await fs.promises.unlink(tmpFile);

      // Extract measurement from SEV-SNP report
      // MEASUREMENT field is at offset 0x90 (144), 48 bytes
      const measurement = report.subarray(144, 192).toString('hex');

      return {
        platform: this.name,
        quote: report.toString('base64'),
        reportData: reportData.toString('hex'),
        measurement,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        this.logger.error(
          `Failed to generate AMD SEV-SNP report: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      throw new Error('AMD SEV-SNP attestation generation failed', {
        cause: error,
      });
    }
  }
}
