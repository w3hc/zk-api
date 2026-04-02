/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { RequestFingerprintThrottler } from './request-fingerprint-throttler.guard';
import { ThrottlerException } from '@nestjs/throttler';

describe('RequestFingerprintThrottler', () => {
  let guard: RequestFingerprintThrottler;

  beforeEach(() => {
    // Create instance without NestJS DI
    guard = new RequestFingerprintThrottler(
      { throttlers: [{ ttl: 60000, limit: 10 }] },
      null as any,
      null as any,
    );
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('getTracker', () => {
    beforeEach(() => {
      // Mock Date.now() to get consistent time windows
      jest.spyOn(Date, 'now').mockReturnValue(1000000000);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should generate a tracker from request body', async () => {
      const req = {
        body: {
          proof: 'test-proof',
          nullifier: '0x123',
        },
      };

      const tracker = await guard['getTracker'](req);

      expect(tracker).toBeDefined();
      expect(typeof tracker).toBe('string');
      expect(tracker).toHaveLength(64); // SHA-256 hex string
    });

    it('should generate same tracker for same body and time window', async () => {
      const req = {
        body: {
          proof: 'test-proof',
          nullifier: '0x123',
        },
      };

      const tracker1 = await guard['getTracker'](req);
      const tracker2 = await guard['getTracker'](req);

      expect(tracker1).toEqual(tracker2);
    });

    it('should generate different tracker for different bodies', async () => {
      const req1 = {
        body: {
          proof: 'test-proof-1',
          nullifier: '0x123',
        },
      };

      const req2 = {
        body: {
          proof: 'test-proof-2',
          nullifier: '0x456',
        },
      };

      const tracker1 = await guard['getTracker'](req1);
      const tracker2 = await guard['getTracker'](req2);

      expect(tracker1).not.toEqual(tracker2);
    });

    it('should generate different tracker for different time windows', async () => {
      const req = {
        body: {
          proof: 'test-proof',
          nullifier: '0x123',
        },
      };

      jest.spyOn(Date, 'now').mockReturnValue(1000000000);
      const tracker1 = await guard['getTracker'](req);

      // Move to next time window (60 seconds later)
      jest.spyOn(Date, 'now').mockReturnValue(1000000000 + 60001);
      const tracker2 = await guard['getTracker'](req);

      expect(tracker1).not.toEqual(tracker2);
    });

    it('should handle empty body', async () => {
      const req = { body: {} };

      const tracker = await guard['getTracker'](req);

      expect(tracker).toBeDefined();
      expect(typeof tracker).toBe('string');
      expect(tracker).toHaveLength(64);
    });

    it('should handle missing body', async () => {
      const req = {};

      const tracker = await guard['getTracker'](req);

      expect(tracker).toBeDefined();
      expect(typeof tracker).toBe('string');
      expect(tracker).toHaveLength(64);
    });

    it('should use 1-minute time windows', async () => {
      const req = { body: { test: 'data' } };

      // First time window
      jest.spyOn(Date, 'now').mockReturnValue(0);
      const tracker1 = await guard['getTracker'](req);

      // Same time window (59 seconds later)
      jest.spyOn(Date, 'now').mockReturnValue(59000);
      const tracker2 = await guard['getTracker'](req);

      // Next time window (60 seconds from start)
      jest.spyOn(Date, 'now').mockReturnValue(60000);
      const tracker3 = await guard['getTracker'](req);

      expect(tracker1).toEqual(tracker2);
      expect(tracker1).not.toEqual(tracker3);
    });
  });

  describe('throwThrottlingException', () => {
    it('should throw ThrottlerException with custom message', () => {
      expect(() => guard['throwThrottlingException']()).toThrow(
        ThrottlerException,
      );

      expect(() => guard['throwThrottlingException']()).toThrow(
        'Too many requests with similar content. Please wait before retrying.',
      );
    });
  });
});
