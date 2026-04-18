import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AttestationService } from './attestation.service';
import { MlKemEncryptionService } from '../encryption/mlkem-encryption.service';
import { TeePlatform } from './attestation.types';

/**
 * Attestation controller.
 * Provides cryptographic proof of the code running inside the TEE.
 * Binds the ML-KEM public key to the attestation quote via report_data.
 *
 * Clients should:
 * 1. Fetch the attestation quote from this endpoint
 * 2. Fetch the ML-KEM public key from /mlkem/pubkey (or extract from quote)
 * 3. Verify report_data = SHA-256(mlkem_public_key) || 0x00...00
 * 4. Verify the quote signature with the TEE platform's verification service
 * 5. Compare the measurement hash against the published value
 * 6. Only send sensitive data if verification succeeds
 */
@ApiTags('Attestation')
@Controller('attestation')
export class AttestationController {
  constructor(
    private readonly attestationService: AttestationService,
    private readonly mlkemService: MlKemEncryptionService,
  ) {}

  /**
   * Returns the TEE attestation quote with bound ML-KEM public key.
   * Clients must verify this cryptographically before trusting the service.
   * In non-TEE environments, returns a mock quote with platform='mock'.
   *
   * @returns Attestation quote with embedded report_data (SHA-256 of ML-KEM public key)
   */
  @Get()
  @ApiOperation({
    summary: 'Get TEE attestation quote with bound ML-KEM public key',
  })
  @ApiResponse({
    status: 200,
    description:
      'Attestation quote generated successfully with bound public key',
    schema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['phala', 'intel-tdx', 'amd-sev-snp', 'aws-nitro', 'mock'],
        },
        quote: {
          type: 'string',
          description: 'Base64-encoded attestation quote',
        },
        reportData: {
          type: 'string',
          description: 'Hex-encoded report_data (SHA-256 of ML-KEM public key)',
        },
        measurement: {
          type: 'string',
          description: 'Hex-encoded TEE measurement (MRTD/PCR0/etc)',
        },
        timestamp: { type: 'string', format: 'date-time' },
        instructions: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Failed to generate attestation quote',
  })
  async getAttestation() {
    // Get ML-KEM public key
    const publicKeyBase64 = this.mlkemService.getPublicKey();
    if (!publicKeyBase64) {
      throw new Error('ML-KEM encryption not initialized');
    }

    const publicKeyBytes = Buffer.from(publicKeyBase64, 'base64');

    // Generate attestation with bound report_data
    const attestation =
      await this.attestationService.getAttestation(publicKeyBytes);

    return {
      ...attestation,
      instructions: this.getVerificationInstructions(attestation.platform),
    };
  }

  /**
   * Returns platform-specific verification instructions
   */
  private getVerificationInstructions(platform: TeePlatform): string {
    switch (platform) {
      case 'phala':
        return (
          'Verify this quote using Phala verification service (https://verifier.phala.network/verify). ' +
          'Compare RTMR measurements against published values. ' +
          'Verify report_data = SHA-256(mlkem_public_key) || 0x00...00. ' +
          'Docs: https://docs.phala.com/phala-cloud/attestation/verify-your-application'
        );
      case 'intel-tdx':
        return (
          'Verify this TDX quote using Intel DCAP verification. ' +
          'Compare MRTD measurement against published value. ' +
          'Verify report_data = SHA-256(mlkem_public_key) || 0x00...00. ' +
          'Verification service: https://api.trustedservices.intel.com/tdx/certification/v4/qe/identity'
        );
      case 'amd-sev-snp':
        return (
          'Verify this SEV-SNP report using AMD verification tools. ' +
          'Compare MEASUREMENT against published value. ' +
          'Verify report_data = SHA-256(mlkem_public_key) || 0x00...00. ' +
          'Verification service: https://kdsintf.amd.com/vcek/v1/{product}/cert_chain'
        );
      case 'aws-nitro':
        return (
          'Verify this Nitro attestation document using AWS verification. ' +
          'Compare PCR0 against published value. ' +
          'Verify user_data = SHA-256(mlkem_public_key) || 0x00...00. ' +
          'Use aws-nitro-enclaves-cose library for verification'
        );
      case 'mock':
        return (
          'WARNING: This is a MOCK attestation for development only. ' +
          'DO NOT use in production. No TEE environment detected. ' +
          'The application is running in standard mode without hardware security guarantees.'
        );
    }
  }
}
