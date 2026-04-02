/* eslint-disable @typescript-eslint/unbound-method */

import { Test, TestingModule } from '@nestjs/testing';
import { ProofVerifierService } from './proof-verifier.service';
import { BlockchainService } from './blockchain.service';
import { ProofGenService } from './proof-gen.service';
import { SnarkjsProofService } from './snarkjs-proof.service';

describe('ProofVerifierService', () => {
  let service: ProofVerifierService;
  let blockchainService: jest.Mocked<BlockchainService>;
  let proofGenService: jest.Mocked<ProofGenService>;
  let snarkjsProofService: jest.Mocked<SnarkjsProofService>;
  let loggerErrorSpy: jest.SpyInstance;

  const mockProof = JSON.stringify({
    protocol: 'groth16',
    pi_a: ['0x123', '0x456'],
    pi_b: [
      ['0x111', '0x222'],
      ['0x333', '0x444'],
    ],
    pi_c: ['0x789', '0xabc'],
  });

  const mockPublicInputs = {
    merkleRoot:
      '0x1234567890123456789012345678901234567890123456789012345678901234',
    maxCost: '1000000',
    initialDeposit: '5000000',
    signalX: '0x0064',
    nullifier: '0x9999',
    signalY: '0x8888',
    idCommitment: '0x7777',
  };

  beforeEach(async () => {
    const mockBlockchainService = {
      isAvailable: jest.fn().mockReturnValue(false),
      getMerkleRoot: jest.fn(),
      isNullifierSlashed: jest.fn(),
    };

    const mockProofGenService = {
      verifyMockProof: jest.fn(),
    };

    const mockSnarkjsProofService = {
      isAvailable: jest.fn().mockReturnValue(false),
      verifyProof: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProofVerifierService,
        { provide: BlockchainService, useValue: mockBlockchainService },
        { provide: ProofGenService, useValue: mockProofGenService },
        { provide: SnarkjsProofService, useValue: mockSnarkjsProofService },
      ],
    }).compile();

    service = module.get<ProofVerifierService>(ProofVerifierService);
    blockchainService = module.get(BlockchainService);
    proofGenService = module.get(ProofGenService);
    snarkjsProofService = module.get(SnarkjsProofService);

    // Suppress expected error logs
    loggerErrorSpy = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation();
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verify', () => {
    it('should return false for empty proof', () => {
      const result = service.verify('');
      expect(result).toBe(false);
    });

    it('should return false for short invalid proof', () => {
      const result = service.verify('short');
      expect(result).toBe(false);
    });

    it('should return false for proof with invalid protocol', () => {
      const invalidProof = JSON.stringify({
        protocol: 'invalid',
        pi_a: ['0x123', '0x456'],
        pi_b: [
          ['0x111', '0x222'],
          ['0x333', '0x444'],
        ],
        pi_c: ['0x789', '0xabc'],
      });

      const result = service.verify(invalidProof);
      expect(result).toBe(false);
    });

    it('should return false for proof with missing protocol', () => {
      const invalidProof = JSON.stringify({
        pi_a: ['0x123', '0x456'],
        pi_b: [
          ['0x111', '0x222'],
          ['0x333', '0x444'],
        ],
        pi_c: ['0x789', '0xabc'],
      });

      const result = service.verify(invalidProof);
      expect(result).toBe(false);
    });

    it('should return false for proof with invalid structure', () => {
      const invalidProof = JSON.stringify({
        protocol: 'groth16',
        pi_a: ['0x123'], // Invalid length
        pi_b: [['0x111', '0x222']],
        pi_c: ['0x789', '0xabc'],
      });

      const result = service.verify(invalidProof);
      expect(result).toBe(false);
    });

    it('should return true for valid proof structure', () => {
      const result = service.verify(mockProof);
      expect(result).toBe(true);
    });

    it('should return false for malformed JSON', () => {
      const result = service.verify('not valid json');
      expect(result).toBe(false);
    });
  });

  describe('verifyWithInputs', () => {
    it('should return false if proof structure is invalid', async () => {
      const result = await service.verifyWithInputs(
        'invalid',
        mockPublicInputs,
      );
      expect(result).toBe(false);
    });

    it('should verify using mock proof when snarkjs not available', async () => {
      snarkjsProofService.isAvailable.mockReturnValue(false);
      proofGenService.verifyMockProof.mockReturnValue(true);

      const result = await service.verifyWithInputs(
        mockProof,
        mockPublicInputs,
      );

      expect(result).toBe(true);
      expect(proofGenService.verifyMockProof).toHaveBeenCalledWith(
        mockProof,
        mockPublicInputs,
      );
    });

    it('should verify using snarkjs when available', async () => {
      snarkjsProofService.isAvailable.mockReturnValue(true);
      snarkjsProofService.verifyProof.mockResolvedValue(true);

      const result = await service.verifyWithInputs(
        mockProof,
        mockPublicInputs,
      );

      expect(result).toBe(true);
      expect(snarkjsProofService.verifyProof).toHaveBeenCalled();
    });

    it('should return false when snarkjs verification fails', async () => {
      snarkjsProofService.isAvailable.mockReturnValue(true);
      snarkjsProofService.verifyProof.mockResolvedValue(false);

      const result = await service.verifyWithInputs(
        mockProof,
        mockPublicInputs,
      );

      expect(result).toBe(false);
    });

    it('should verify against blockchain when available', async () => {
      blockchainService.isAvailable.mockReturnValue(true);
      blockchainService.getMerkleRoot.mockResolvedValue(
        mockPublicInputs.merkleRoot,
      );
      blockchainService.isNullifierSlashed.mockResolvedValue(false);
      proofGenService.verifyMockProof.mockReturnValue(true);

      const result = await service.verifyWithInputs(
        mockProof,
        mockPublicInputs,
      );

      expect(result).toBe(true);
      expect(blockchainService.getMerkleRoot).toHaveBeenCalled();
      expect(blockchainService.isNullifierSlashed).toHaveBeenCalledWith(
        mockPublicInputs.nullifier,
      );
    });

    it('should return false if nullifier is slashed', async () => {
      blockchainService.isAvailable.mockReturnValue(true);
      blockchainService.getMerkleRoot.mockResolvedValue(
        mockPublicInputs.merkleRoot,
      );
      blockchainService.isNullifierSlashed.mockResolvedValue(true);

      const result = await service.verifyWithInputs(
        mockProof,
        mockPublicInputs,
      );

      expect(result).toBe(false);
    });

    it('should return false if merkle root does not match', async () => {
      blockchainService.isAvailable.mockReturnValue(true);
      blockchainService.getMerkleRoot.mockResolvedValue(
        '0xdifferent0000000000000000000000000000000000000000000000000000000',
      );
      blockchainService.isNullifierSlashed.mockResolvedValue(false);

      const result = await service.verifyWithInputs(
        mockProof,
        mockPublicInputs,
      );

      expect(result).toBe(false);
    });

    it('should continue verification if blockchain check fails', async () => {
      blockchainService.isAvailable.mockReturnValue(true);
      blockchainService.getMerkleRoot.mockRejectedValue(
        new Error('Network error'),
      );
      proofGenService.verifyMockProof.mockReturnValue(true);

      const result = await service.verifyWithInputs(
        mockProof,
        mockPublicInputs,
      );

      expect(result).toBe(true);
    });

    it('should handle errors during verification gracefully', async () => {
      proofGenService.verifyMockProof.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await service.verifyWithInputs(
        mockProof,
        mockPublicInputs,
      );

      expect(result).toBe(false);
    });
  });
});
