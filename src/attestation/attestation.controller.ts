import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TeePlatformService } from './tee-platform.service';

/**
 * Attestation controller.
 * Provides cryptographic proof of the code running inside the TEE.
 * Also works in non-TEE environments for development (with clear warnings).
 *
 * Clients should:
 * 1. Fetch the attestation report from this endpoint
 * 2. Check the platform field (if 'none', not running in TEE)
 * 3. Verify the report signature with the TEE platform's verification service
 * 4. Compare the measurement hash against the published Docker image SHA
 * 5. Only send sensitive data if verification succeeds
 */
@ApiTags('Attestation')
@Controller('attestation')
export class AttestationController {
  constructor(private readonly teePlatform: TeePlatformService) {}

  /**
   * Returns the TEE attestation report and enclave measurement.
   * Clients must verify this cryptographically before trusting the service.
   * In non-TEE environments, returns a mock report with platform='none'.
   *
   * @returns Attestation report, measurement, and verification instructions
   */
  @Get()
  @ApiOperation({ summary: 'Get TEE attestation report' })
  @ApiResponse({
    status: 200,
    description: 'Attestation report generated successfully',
  })
  @ApiResponse({
    status: 500,
    description: 'Failed to generate attestation report',
  })
  async getAttestation() {
    const attestation = await this.teePlatform.generateAttestationReport();

    return {
      ...attestation,
      instructions: this.getVerificationInstructions(attestation.platform),
    };
  }

  /**
   * Returns platform-specific verification instructions
   */
  private getVerificationInstructions(
    platform: 'amd-sev-snp' | 'intel-tdx' | 'aws-nitro' | 'none',
  ): string {
    switch (platform) {
      case 'amd-sev-snp':
        return (
          'Verify this SEV-SNP attestation report using AMD SEV-SNP verification tools. ' +
          'Compare the measurement against the published Docker image SHA256. ' +
          'Verification service: https://kdsintf.amd.com/vcek/v1/{product}/cert_chain'
        );
      case 'intel-tdx':
        return (
          'Verify this TDX quote using Intel TDX attestation verification service. ' +
          'Compare MRTD measurement against the published Docker image SHA256. ' +
          'Verification service: https://api.trustedservices.intel.com/tdx/certification/v4/qe/identity'
        );
      case 'aws-nitro':
        return (
          'Verify this Nitro attestation document using AWS attestation verification. ' +
          'Compare PCR0 against the published Docker image SHA256. ' +
          'Verification: Use aws-nitro-enclaves-cose library or AWS attestation service'
        );
      case 'none':
        return (
          'WARNING: This is a MOCK attestation for development only. ' +
          'DO NOT use in production. No TEE environment detected. ' +
          'The application is running in standard mode without hardware security guarantees.'
        );
    }
  }
}
