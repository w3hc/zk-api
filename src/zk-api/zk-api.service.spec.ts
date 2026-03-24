import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZkApiService } from './zk-api.service';
import { NullifierStoreService } from './nullifier-store.service';
import { ProofVerifierService } from './proof-verifier.service';
import { ProofGenService } from './proof-gen.service';
import { SnarkjsProofService } from './snarkjs-proof.service';
import { EthRateOracleService } from './eth-rate-oracle.service';
import { RefundSignerService } from './refund-signer.service';
import { BlockchainService } from './blockchain.service';
import { ZkApiRequestDto } from './dto/api-request.dto';

describe('ZkApiService', () => {
  let service: ZkApiService;
  let nullifierStore: NullifierStoreService;
  let proofVerifier: ProofVerifierService;
  let ethRateOracle: EthRateOracleService;

  beforeEach(async () => {
    // Set test database path
    process.env.DATA_DIR = ':memory:';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZkApiService,
        NullifierStoreService,
        ProofVerifierService,
        ProofGenService,
        SnarkjsProofService,
        EthRateOracleService,
        RefundSignerService,
        {
          provide: BlockchainService,
          useValue: {
            getMerkleRoot: jest.fn().mockResolvedValue('0x1234'),
            isAvailable: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'ANTHROPIC_API_KEY') return undefined; // Use mock for tests
              return undefined;
            }),
          },
        },
      ],
    })
      .setLogger({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn(),
        fatal: jest.fn(),
      })
      .compile();

    service = module.get<ZkApiService>(ZkApiService);
    nullifierStore = module.get<NullifierStoreService>(NullifierStoreService);
    proofVerifier = module.get<ProofVerifierService>(ProofVerifierService);
    ethRateOracle = module.get<EthRateOracleService>(EthRateOracleService);

    // Initialize database
    await module.init();
  });

  afterEach(() => {
    nullifierStore.clear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleRequest', () => {
    const validRequest: ZkApiRequestDto = {
      payload: 'What does 苟全性命於亂世，不求聞達於諸侯。mean?',
      nullifier: '0x1234567890abcdef',
      signal: {
        x: '0xaabbccdd',
        y: '0x11223344',
      },
      proof: '0xdeadbeef',
      maxCost: '1000000000000000', // 0.001 ETH
    };

    it('should process valid request successfully', async () => {
      // Mock proof verification
      jest.spyOn(proofVerifier, 'verify').mockReturnValue(true);

      // Mock ETH rate
      jest.spyOn(ethRateOracle, 'usdToWei').mockResolvedValue(BigInt(100000));

      const result = await service.handleRequest(validRequest);

      expect(result).toBeDefined();
      expect(result.response).toBeDefined();
      expect(result.actualCost).toBeDefined();
      expect(result.refundTicket).toBeDefined();
      expect(result.usage).toBeDefined();
    });

    it('should reject invalid proof', async () => {
      jest.spyOn(proofVerifier, 'verify').mockReturnValue(false);

      await expect(service.handleRequest(validRequest)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject reused nullifier', async () => {
      jest.spyOn(proofVerifier, 'verify').mockReturnValue(true);
      jest.spyOn(ethRateOracle, 'usdToWei').mockResolvedValue(BigInt(100000));

      // First request succeeds
      await service.handleRequest(validRequest);

      // Second request with same nullifier fails
      await expect(service.handleRequest(validRequest)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should detect double-spend (same nullifier, different signal)', async () => {
      jest.spyOn(proofVerifier, 'verify').mockReturnValue(true);
      jest.spyOn(ethRateOracle, 'usdToWei').mockResolvedValue(BigInt(100000));

      // First request
      await service.handleRequest(validRequest);

      // Second request with same nullifier but different signal
      const doubleSpendRequest: ZkApiRequestDto = {
        ...validRequest,
        signal: {
          x: '0xeeff0011',
          y: '0x55667788',
        },
      };

      await expect(service.handleRequest(doubleSpendRequest)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getServerPublicKey', () => {
    it('should return server public key', () => {
      const pubKey = service.getServerPublicKey();

      expect(pubKey).toBeDefined();
      expect(pubKey.x).toBeDefined();
      expect(pubKey.y).toBeDefined();
      expect(typeof pubKey.x).toBe('string');
      expect(typeof pubKey.y).toBe('string');
    });
  });
});
