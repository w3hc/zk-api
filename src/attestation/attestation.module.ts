/**
 * Attestation Module
 *
 * Provides cross-platform TEE attestation with report_data binding
 */

import { Module } from '@nestjs/common';
import { AttestationController } from './attestation.controller';
import { AttestationService } from './attestation.service';
import { MlKemEncryptionService } from '../encryption/mlkem-encryption.service';

@Module({
  controllers: [AttestationController],
  providers: [AttestationService, MlKemEncryptionService],
  exports: [AttestationService],
})
export class AttestationModule {}
