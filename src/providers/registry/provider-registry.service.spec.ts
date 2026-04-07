import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProviderRegistryService } from './provider-registry.service';
import { ApiProvider, ProviderHealth } from '../core/provider.interface';
import { PricingOracleService } from '../../pricing/pricing-oracle.service';
import { PricingModel } from '../../pricing/dto/pricing-model.dto';

// Mock provider for testing
class MockProvider implements ApiProvider {
  readonly id = 'mock-provider';
  readonly name = 'Mock Provider';
  readonly version = '1.0.0';

  getPricingConfig(): PricingModel {
    return {
      providerId: this.id,
      pricingType: 'per-call',
      rates: [{ type: 'per-call', rate: 0.01 }],
      currency: 'USD',
      effectiveFrom: new Date(),
    };
  }

  async initialize(): Promise<void> {
    // Mock initialization
  }

  healthCheck(): Promise<ProviderHealth> {
    return Promise.resolve({
      status: 'healthy',
      latencyMs: 10,
      lastCheck: new Date(),
    });
  }

  validateRequest() {
    return Promise.resolve({ valid: true });
  }

  execute() {
    return Promise.resolve({
      status: 200,
      headers: {},
      body: {},
      usage: { units: 100, unitType: 'tokens' as const, costUSD: 0.01 },
    });
  }

  estimateCost() {
    return Promise.resolve({
      minCostUSD: 0.008,
      maxCostUSD: 0.012,
      estimatedCostUSD: 0.01,
      confidence: 0.9,
    });
  }

  calculateActualCost() {
    return Promise.resolve({
      units: 100,
      unitType: 'tokens' as const,
      costUSD: 0.01,
    });
  }

  getRateLimits() {
    return { requestsPerMinute: 60 };
  }
}

class FailingProvider extends MockProvider {
  readonly id = 'failing-provider';
  readonly name = 'Failing Provider';

  healthCheck(): Promise<ProviderHealth> {
    return Promise.reject(new Error('Health check failed'));
  }
}

describe('ProviderRegistryService', () => {
  let service: ProviderRegistryService;
  let mockPricingOracle: jest.Mocked<PricingOracleService>;

  beforeEach(async () => {
    // Create mock pricing oracle
    mockPricingOracle = {
      updatePricing: jest.fn(),
      getPricing: jest.fn(),
      calculateCostUSD: jest.fn(),
      getPricingHistory: jest.fn(),
    } as jest.Mocked<PricingOracleService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderRegistryService,
        {
          provide: PricingOracleService,
          useValue: mockPricingOracle,
        },
      ],
    }).compile();

    service = module.get<ProviderRegistryService>(ProviderRegistryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should register a provider', () => {
      const provider = new MockProvider();
      service.register(provider);

      expect(service.has('mock-provider')).toBe(true);
      expect(service.get('mock-provider')).toBe(provider);
    });

    it('should seed pricing when registering a provider', () => {
      const provider = new MockProvider();
      const updatePricingSpy = jest.spyOn(mockPricingOracle, 'updatePricing');
      service.register(provider);

      expect(updatePricingSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: 'mock-provider',
          pricingType: 'per-call',
          rates: [{ type: 'per-call', rate: 0.01 }],
        }),
        'system',
        expect.stringContaining('Auto-seeded from provider mock-provider'),
      );
    });

    it('should overwrite existing provider with warning', () => {
      const provider1 = new MockProvider();
      const provider2 = new MockProvider();

      service.register(provider1);
      service.register(provider2);

      expect(service.get('mock-provider')).toBe(provider2);
    });

    it('should log registration', () => {
      const provider = new MockProvider();
      const logSpy = jest.spyOn(service['logger'], 'log');

      service.register(provider);

      expect(logSpy).toHaveBeenCalledWith(
        'Registered provider: Mock Provider (mock-provider) v1.0.0',
      );
    });
  });

  describe('get', () => {
    it('should get a registered provider', () => {
      const provider = new MockProvider();
      service.register(provider);

      const retrieved = service.get('mock-provider');
      expect(retrieved).toBe(provider);
    });

    it('should throw NotFoundException for unknown provider', () => {
      expect(() => service.get('unknown')).toThrow(NotFoundException);
      expect(() => service.get('unknown')).toThrow(
        'Provider not found: unknown',
      );
    });
  });

  describe('has', () => {
    it('should return true for registered provider', () => {
      const provider = new MockProvider();
      service.register(provider);

      expect(service.has('mock-provider')).toBe(true);
    });

    it('should return false for unregistered provider', () => {
      expect(service.has('unknown')).toBe(false);
    });
  });

  describe('list', () => {
    it('should return empty array when no providers registered', () => {
      expect(service.list()).toEqual([]);
    });

    it('should return all registered providers', () => {
      const provider1 = new MockProvider();
      const provider2 = new FailingProvider();

      service.register(provider1);
      service.register(provider2);

      const providers = service.list();
      expect(providers).toHaveLength(2);
      expect(providers).toContain(provider1);
      expect(providers).toContain(provider2);
    });
  });

  describe('getProviderIds', () => {
    it('should return empty array when no providers registered', () => {
      expect(service.getProviderIds()).toEqual([]);
    });

    it('should return all provider IDs', () => {
      const provider1 = new MockProvider();
      const provider2 = new FailingProvider();

      service.register(provider1);
      service.register(provider2);

      const ids = service.getProviderIds();
      expect(ids).toHaveLength(2);
      expect(ids).toContain('mock-provider');
      expect(ids).toContain('failing-provider');
    });
  });

  describe('healthCheckAll', () => {
    it('should return health status for all providers', async () => {
      const provider = new MockProvider();
      service.register(provider);

      const results = await service.healthCheckAll();

      expect(results.size).toBe(1);
      const health = results.get('mock-provider');
      expect(health).toBeDefined();
      expect(health?.status).toBe('healthy');
      expect(health?.latencyMs).toBe(10);
    });

    it('should handle failing health checks', async () => {
      // Suppress expected error logs
      const errorSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation();

      const provider = new FailingProvider();
      service.register(provider);

      const results = await service.healthCheckAll();

      expect(results.size).toBe(1);
      const health = results.get('failing-provider');
      expect(health).toBeDefined();
      expect(health?.status).toBe('down');
      expect(health?.message).toBe('Health check failed');

      // Verify error was logged (but suppressed in output)
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Health check failed for provider failing-provider',
        ),
      );

      errorSpy.mockRestore();
    });

    it('should return results for multiple providers', async () => {
      // Suppress expected error logs
      const errorSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation();

      const provider1 = new MockProvider();
      const provider2 = new FailingProvider();

      service.register(provider1);
      service.register(provider2);

      const results = await service.healthCheckAll();

      expect(results.size).toBe(2);
      expect(results.get('mock-provider')?.status).toBe('healthy');
      expect(results.get('failing-provider')?.status).toBe('down');

      errorSpy.mockRestore();
    });
  });

  describe('unregister', () => {
    it('should unregister a provider', () => {
      const provider = new MockProvider();
      service.register(provider);

      expect(service.has('mock-provider')).toBe(true);

      const deleted = service.unregister('mock-provider');

      expect(deleted).toBe(true);
      expect(service.has('mock-provider')).toBe(false);
    });

    it('should return false when unregistering non-existent provider', () => {
      const deleted = service.unregister('unknown');
      expect(deleted).toBe(false);
    });

    it('should log unregistration', () => {
      const provider = new MockProvider();
      service.register(provider);

      const logSpy = jest.spyOn(service['logger'], 'log');
      service.unregister('mock-provider');

      expect(logSpy).toHaveBeenCalledWith(
        'Unregistered provider: mock-provider',
      );
    });
  });
});
