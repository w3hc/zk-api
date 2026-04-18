import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AttestationController } from './attestation.controller';
import { AttestationService } from './attestation.service';

describe('AttestationController', () => {
  let controller: AttestationController;
  let attestationService: AttestationService;

  const mockAttestationQuote = {
    platform: 'mock' as const,
    quote: 'mock-quote-base64',
    reportData: '0'.repeat(128), // 64 bytes hex
    measurement: 'mock-measurement',
    timestamp: '2026-03-17T00:00:00.000Z',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttestationController],
      providers: [
        {
          provide: AttestationService,
          useValue: {
            getAttestation: jest.fn().mockResolvedValue(mockAttestationQuote),
            getPlatform: jest.fn().mockReturnValue('mock'),
            isInTee: jest.fn().mockReturnValue(false),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('mock'),
          },
        },
      ],
    }).compile();

    controller = module.get<AttestationController>(AttestationController);
    attestationService = module.get<AttestationService>(AttestationService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAttestation', () => {
    it('should return attestation with instructions for mock platform', async () => {
      const result = await controller.getAttestation();

      expect(result).toHaveProperty('platform', 'mock');
      expect(result).toHaveProperty('quote', 'mock-quote-base64');
      expect(result).toHaveProperty('reportData');
      expect(result).toHaveProperty('measurement', 'mock-measurement');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('instructions');
      expect(result.instructions).toContain('WARNING');
      expect(result.instructions).toContain('MOCK');
    });

    it('should call attestation service to generate attestation', async () => {
      const getAttestationSpy = jest.spyOn(
        attestationService,
        'getAttestation',
      );

      await controller.getAttestation();

      expect(getAttestationSpy).toHaveBeenCalled();
    });

    it('should return Phala verification instructions', async () => {
      const phalaQuote = {
        ...mockAttestationQuote,
        platform: 'phala' as const,
      };
      jest
        .spyOn(attestationService, 'getAttestation')
        .mockResolvedValue(phalaQuote);

      const result = await controller.getAttestation();

      expect(result.platform).toBe('phala');
      expect(result.instructions).toContain('Phala');
      expect(result.instructions).toContain('RTMR');
      expect(result.instructions).toContain('verifier.phala.network');
    });

    it('should return AMD SEV-SNP verification instructions', async () => {
      const sevQuote = {
        ...mockAttestationQuote,
        platform: 'amd-sev-snp' as const,
      };
      jest
        .spyOn(attestationService, 'getAttestation')
        .mockResolvedValue(sevQuote);

      const result = await controller.getAttestation();

      expect(result.platform).toBe('amd-sev-snp');
      expect(result.instructions).toContain('SEV-SNP');
      expect(result.instructions).toContain('AMD');
      expect(result.instructions).toContain('kdsintf.amd.com');
    });

    it('should return Intel TDX verification instructions', async () => {
      const tdxQuote = {
        ...mockAttestationQuote,
        platform: 'intel-tdx' as const,
      };
      jest
        .spyOn(attestationService, 'getAttestation')
        .mockResolvedValue(tdxQuote);

      const result = await controller.getAttestation();

      expect(result.platform).toBe('intel-tdx');
      expect(result.instructions).toContain('TDX');
      expect(result.instructions).toContain('Intel');
      expect(result.instructions).toContain('MRTD');
      expect(result.instructions).toContain('trustedservices.intel.com');
    });

    it('should return AWS Nitro verification instructions', async () => {
      const nitroQuote = {
        ...mockAttestationQuote,
        platform: 'aws-nitro' as const,
      };
      jest
        .spyOn(attestationService, 'getAttestation')
        .mockResolvedValue(nitroQuote);

      const result = await controller.getAttestation();

      expect(result.platform).toBe('aws-nitro');
      expect(result.instructions).toContain('Nitro');
      expect(result.instructions).toContain('PCR0');
      expect(result.instructions).toContain('aws-nitro-enclaves-cose');
    });

    it('should handle errors from AttestationService', async () => {
      jest
        .spyOn(attestationService, 'getAttestation')
        .mockRejectedValue(new Error('TEE error'));

      await expect(controller.getAttestation()).rejects.toThrow('TEE error');
    });
  });
});
