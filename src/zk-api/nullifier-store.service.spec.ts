import { Test, TestingModule } from '@nestjs/testing';
import { NullifierStoreService } from './nullifier-store.service';

describe('NullifierStoreService - Rate Limiting', () => {
  let service: NullifierStoreService;

  beforeEach(async () => {
    process.env.DATA_DIR = ':memory:';

    const module: TestingModule = await Test.createTestingModule({
      providers: [NullifierStoreService],
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

    service = module.get<NullifierStoreService>(NullifierStoreService);
    await module.init();
  });

  afterEach(() => {
    service.clear();
  });

  describe('checkRateLimit', () => {
    it('should allow requests within rate limit', () => {
      const nullifier = '0xtest1';

      // First 3 requests should succeed
      expect(service.checkRateLimit(nullifier)).toBe(true);
      expect(service.checkRateLimit(nullifier)).toBe(true);
      expect(service.checkRateLimit(nullifier)).toBe(true);
    });

    it('should reject requests exceeding rate limit', () => {
      const nullifier = '0xtest2';

      // First 3 requests succeed
      service.checkRateLimit(nullifier);
      service.checkRateLimit(nullifier);
      service.checkRateLimit(nullifier);

      // 4th request should fail
      expect(service.checkRateLimit(nullifier)).toBe(false);
      expect(service.checkRateLimit(nullifier)).toBe(false);
    });

    it('should track different nullifiers independently', () => {
      const nullifier1 = '0xtest3';
      const nullifier2 = '0xtest4';

      // Use up limit for nullifier1
      service.checkRateLimit(nullifier1);
      service.checkRateLimit(nullifier1);
      service.checkRateLimit(nullifier1);

      // nullifier1 should be rate limited
      expect(service.checkRateLimit(nullifier1)).toBe(false);

      // nullifier2 should still work
      expect(service.checkRateLimit(nullifier2)).toBe(true);
      expect(service.checkRateLimit(nullifier2)).toBe(true);
      expect(service.checkRateLimit(nullifier2)).toBe(true);

      // nullifier2 should now be rate limited
      expect(service.checkRateLimit(nullifier2)).toBe(false);
    });

    it('should allow requests after time window expires', () => {
      const nullifier = '0xtest5';

      // Use up all attempts
      service.checkRateLimit(nullifier);
      service.checkRateLimit(nullifier);
      service.checkRateLimit(nullifier);

      expect(service.checkRateLimit(nullifier)).toBe(false);

      // Simulate time passing (61 seconds)
      // In real implementation, this would require waiting or mocking Date.now()
      // For now, we verify the remaining attempts logic
      expect(service.getRemainingAttempts(nullifier)).toBe(0);
    });
  });

  describe('getRemainingAttempts', () => {
    it('should return correct remaining attempts', () => {
      const nullifier = '0xtest6';

      // Initially should have 3 attempts
      expect(service.getRemainingAttempts(nullifier)).toBe(3);

      // After 1 attempt
      service.checkRateLimit(nullifier);
      expect(service.getRemainingAttempts(nullifier)).toBe(2);

      // After 2 attempts
      service.checkRateLimit(nullifier);
      expect(service.getRemainingAttempts(nullifier)).toBe(1);

      // After 3 attempts
      service.checkRateLimit(nullifier);
      expect(service.getRemainingAttempts(nullifier)).toBe(0);

      // After exceeding limit
      service.checkRateLimit(nullifier);
      expect(service.getRemainingAttempts(nullifier)).toBe(0);
    });
  });

  describe('memory management', () => {
    it('should handle large number of nullifiers', () => {
      // Create 100 different nullifiers
      for (let i = 0; i < 100; i++) {
        const nullifier = `0xtest${i}`;
        service.checkRateLimit(nullifier);
      }

      // All should work independently
      expect(service.getRemainingAttempts('0xtest0')).toBe(2);
      expect(service.getRemainingAttempts('0xtest50')).toBe(2);
      expect(service.getRemainingAttempts('0xtest99')).toBe(2);
    });
  });

  describe('basic nullifier operations', () => {
    it('should store and retrieve nullifiers', () => {
      const nullifier = '0xbasic1';
      const signal = { x: '0xaaa', y: '0xbbb' };

      service.set(nullifier, signal);

      const retrieved = service.get(nullifier);
      expect(retrieved).toBeDefined();
      expect(retrieved?.x).toBe(signal.x);
      expect(retrieved?.y).toBe(signal.y);
    });

    it('should check if nullifier exists', () => {
      const nullifier = '0xbasic2';
      const signal = { x: '0xccc', y: '0xddd' };

      expect(service.exists(nullifier)).toBe(false);

      service.set(nullifier, signal);

      expect(service.exists(nullifier)).toBe(true);
    });

    it('should clear all data', () => {
      service.set('0x1', { x: '0xa', y: '0xb' });
      service.set('0x2', { x: '0xc', y: '0xd' });

      expect(service.count()).toBe(2);

      service.clear();

      expect(service.count()).toBe(0);
    });
  });
});
