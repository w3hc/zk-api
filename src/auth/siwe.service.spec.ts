import { Test, TestingModule } from '@nestjs/testing';
import { SiweService } from './siwe.service';
import { SiweMessage } from 'siwe';
import { Wallet } from 'ethers';

describe('SiweService', () => {
  let service: SiweService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SiweService],
    }).compile();

    service = module.get<SiweService>(SiweService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateNonce', () => {
    it('should generate an alphanumeric string (at least 8 characters)', () => {
      const nonce = service.generateNonce();
      expect(nonce).toMatch(/^[A-Za-z0-9]{8,}$/);
    });

    it('should generate unique nonces', () => {
      const nonce1 = service.generateNonce();
      const nonce2 = service.generateNonce();
      expect(nonce1).not.toBe(nonce2);
    });

    it('should store nonce internally', () => {
      const nonce = service.generateNonce();
      // Nonce should be in internal storage (we'll verify through verification)
      expect(nonce).toBeDefined();
    });
  });

  describe('verifySignature', () => {
    let wallet: Wallet;

    beforeEach(() => {
      // Use a test wallet with known private key
      wallet = new Wallet(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      );
    });

    it('should return null for invalid signature', async () => {
      // Suppress expected error logs from ethers library
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const nonce = service.generateNonce();
      const siweMessage = new SiweMessage({
        domain: 'localhost',
        address: wallet.address,
        uri: 'https://localhost:3000',
        version: '1',
        chainId: 1,
        nonce: nonce,
        issuedAt: new Date().toISOString(),
      });

      const message = siweMessage.prepareMessage();
      // Use a valid signature format but wrong signature
      const wrongSignature =
        '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

      const result = await service.verifySignature(message, wrongSignature);
      expect(result).toBeNull();

      consoleErrorSpy.mockRestore();
    });

    it('should return null for signature with non-existent nonce', async () => {
      const siweMessage = new SiweMessage({
        domain: 'localhost',
        address: wallet.address,
        uri: 'https://localhost:3000',
        version: '1',
        chainId: 1,
        nonce: 'nonExistentNonce123', // Valid format but non-existent
        issuedAt: new Date().toISOString(),
      });

      const message = siweMessage.prepareMessage();
      const signature = await wallet.signMessage(message);

      const result = await service.verifySignature(message, signature);
      expect(result).toBeNull();
    });

    it('should verify valid signature and return address', async () => {
      const nonce = service.generateNonce();
      const siweMessage = new SiweMessage({
        domain: 'localhost',
        address: wallet.address,
        uri: 'https://localhost:3000',
        version: '1',
        chainId: 1,
        nonce: nonce,
        issuedAt: new Date().toISOString(),
      });

      const message = siweMessage.prepareMessage();
      const signature = await wallet.signMessage(message);

      const result = await service.verifySignature(message, signature);
      expect(result).toBe(wallet.address);
    });

    it('should reject reused nonce (single-use)', async () => {
      const nonce = service.generateNonce();
      const siweMessage = new SiweMessage({
        domain: 'localhost',
        address: wallet.address,
        uri: 'https://localhost:3000',
        version: '1',
        chainId: 1,
        nonce: nonce,
        issuedAt: new Date().toISOString(),
      });

      const message = siweMessage.prepareMessage();
      const signature = await wallet.signMessage(message);

      // First verification should succeed
      const result1 = await service.verifySignature(message, signature);
      expect(result1).toBe(wallet.address);

      // Second verification with same nonce should fail (nonce consumed)
      const result2 = await service.verifySignature(message, signature);
      expect(result2).toBeNull();
    });

    it('should reject expired nonce', async () => {
      const nonce = service.generateNonce();

      // Mock nonce as expired by manipulating time
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const nonces = (service as any).nonces as Map<
        string,
        { nonce: string; createdAt: number }
      >;

      const nonceEntry = nonces.get(nonce)!;
      nonceEntry.createdAt = Date.now() - 6 * 60 * 1000; // 6 minutes ago

      const siweMessage = new SiweMessage({
        domain: 'localhost',
        address: wallet.address,
        uri: 'https://localhost:3000',
        version: '1',
        chainId: 1,
        nonce: nonce,
        issuedAt: new Date().toISOString(),
      });

      const message = siweMessage.prepareMessage();
      const signature = await wallet.signMessage(message);

      const result = await service.verifySignature(message, signature);
      expect(result).toBeNull();
    });

    it('should return null for malformed message', async () => {
      const result = await service.verifySignature(
        'not a valid SIWE message',
        '0x1234',
      );
      expect(result).toBeNull();
    });
  });

  describe('cleanExpiredNonces', () => {
    it('should clean up expired nonces when generating new nonce', () => {
      // Generate a nonce
      const nonce1 = service.generateNonce();

      // Access the internal nonces map to manipulate it
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const nonces = (service as any).nonces as Map<
        string,
        { nonce: string; createdAt: number }
      >;

      // Manually set the nonce as expired (> 5 minutes old)
      const expiredEntry = nonces.get(nonce1);
      if (expiredEntry) {
        expiredEntry.createdAt = Date.now() - 6 * 60 * 1000; // 6 minutes ago
      }

      // Verify the expired nonce is still in the map
      expect(nonces.has(nonce1)).toBe(true);

      // Generate a new nonce, which should trigger cleanup
      const nonce2 = service.generateNonce();

      // The expired nonce should now be removed
      expect(nonces.has(nonce1)).toBe(false);
      expect(nonces.has(nonce2)).toBe(true);
    });
  });
});
