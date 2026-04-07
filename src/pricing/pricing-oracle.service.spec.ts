import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PricingOracleService } from './pricing-oracle.service';
import { PricingRepository } from './pricing.repository';
import { PricingModel } from './dto/pricing-model.dto';
import { UsageMetrics } from '../providers';

describe('PricingOracleService', () => {
  let service: PricingOracleService;
  let repository: PricingRepository;

  const mockPricingModel: PricingModel = {
    providerId: 'claude',
    pricingType: 'per-token',
    rates: [
      { type: 'per-token', rate: 0.003, unit: 'input_token' },
      { type: 'per-token', rate: 0.015, unit: 'output_token' },
    ],
    currency: 'USD',
    effectiveFrom: new Date(),
  };

  beforeEach(async () => {
    const mockRepository = {
      getPricing: jest.fn(),
      upsertPricing: jest.fn(),
      addHistory: jest.fn(),
      getHistory: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingOracleService,
        {
          provide: PricingRepository,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<PricingOracleService>(PricingOracleService);
    repository = module.get<PricingRepository>(PricingRepository);

    // Clear cache between tests
    service['pricingCache'].clear();
  });

  describe('getPricing', () => {
    it('should return pricing from repository', () => {
      const getPricingSpy = jest
        .spyOn(repository, 'getPricing')
        .mockReturnValue(mockPricingModel);

      const pricing = service.getPricing('claude');

      expect(pricing).toBe(mockPricingModel);
      expect(getPricingSpy).toHaveBeenCalledWith('claude', undefined);
    });

    it('should throw NotFoundException when pricing not found', () => {
      jest.spyOn(repository, 'getPricing').mockReturnValue(null);

      expect(() => service.getPricing('unknown')).toThrow(NotFoundException);
      expect(() => service.getPricing('unknown')).toThrow(
        'No pricing model found for provider: unknown',
      );
    });

    it('should cache pricing results', () => {
      const getPricingSpy = jest
        .spyOn(repository, 'getPricing')
        .mockReturnValue(mockPricingModel);

      // First call
      service.getPricing('claude');
      // Second call
      service.getPricing('claude');

      // Should only call repository once (second is from cache)
      expect(getPricingSpy).toHaveBeenCalledTimes(1);
    });

    it('should include endpoint in cache key', () => {
      const getPricingSpy = jest
        .spyOn(repository, 'getPricing')
        .mockReturnValue(mockPricingModel);

      service.getPricing('claude', '/v1/messages');
      service.getPricing('claude', '/v1/completions');

      // Different endpoints should be separate cache entries
      expect(getPricingSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('calculateCostUSD', () => {
    beforeEach(() => {
      jest.spyOn(repository, 'getPricing').mockReturnValue(mockPricingModel);
    });

    it('should calculate per-token cost', () => {
      const usage: UsageMetrics = {
        units: 3000,
        unitType: 'tokens',
        costUSD: 0,
        breakdown: {
          input: 2000,
          output: 1000,
        },
      };

      const cost = service.calculateCostUSD(usage, 'claude');

      // (2000 / 1000) * 0.003 + (1000 / 1000) * 0.015 = 0.006 + 0.015 = 0.021
      expect(cost).toBeCloseTo(0.021);
    });

    it('should calculate per-call cost', () => {
      const callPricing: PricingModel = {
        ...mockPricingModel,
        pricingType: 'per-call',
        rates: [{ type: 'per-call', rate: 0.05 }],
      };
      jest.spyOn(repository, 'getPricing').mockReturnValue(callPricing);

      const usage: UsageMetrics = {
        units: 1,
        unitType: 'calls',
        costUSD: 0,
      };

      const cost = service.calculateCostUSD(usage, 'stripe');

      expect(cost).toBe(0.05);
    });

    it('should calculate per-unit cost', () => {
      const unitPricing: PricingModel = {
        ...mockPricingModel,
        pricingType: 'per-unit',
        rates: [{ type: 'per-unit', rate: 0.001 }],
      };
      jest.spyOn(repository, 'getPricing').mockReturnValue(unitPricing);

      const usage: UsageMetrics = {
        units: 1000,
        unitType: 'bytes',
        costUSD: 0,
      };

      const cost = service.calculateCostUSD(usage, 'storage');

      expect(cost).toBe(1.0);
    });

    it('should calculate tiered cost', () => {
      const tieredPricing: PricingModel = {
        ...mockPricingModel,
        pricingType: 'tiered',
        rates: [
          {
            type: 'tiered',
            rate: 0,
            tiers: [
              { from: 0, to: 1000, rate: 0.01 },
              { from: 1000, to: 5000, rate: 0.008 },
              { from: 5000, rate: 0.005 },
            ],
          },
        ],
      };
      jest.spyOn(repository, 'getPricing').mockReturnValue(tieredPricing);

      const usage: UsageMetrics = {
        units: 6000,
        unitType: 'tokens',
        costUSD: 0,
      };

      const cost = service.calculateCostUSD(usage, 'tiered-provider');

      // 1000 * 0.01 + 4000 * 0.008 + 1000 * 0.005 = 10 + 32 + 5 = 47
      expect(cost).toBe(47);
    });

    it('should calculate composite cost', () => {
      const compositePricing: PricingModel = {
        ...mockPricingModel,
        pricingType: 'composite',
        rates: [
          { type: 'composite', rate: 0.001, unit: 'compute' },
          { type: 'composite', rate: 0.0001, unit: 'storage' },
        ],
      };
      jest.spyOn(repository, 'getPricing').mockReturnValue(compositePricing);

      const usage: UsageMetrics = {
        units: 0,
        unitType: 'custom',
        costUSD: 0,
        breakdown: {
          compute: 100,
          storage: 500,
        },
      };

      const cost = service.calculateCostUSD(usage, 'composite-provider');

      // 100 * 0.001 + 500 * 0.0001 = 0.1 + 0.05 = 0.15
      expect(cost).toBeCloseTo(0.15);
    });

    it('should handle cache read/write tokens', () => {
      const pricingWithCache: PricingModel = {
        ...mockPricingModel,
        rates: [
          { type: 'per-token', rate: 0.003, unit: 'input_token' },
          { type: 'per-token', rate: 0.015, unit: 'output_token' },
          { type: 'per-token', rate: 0.0015, unit: 'cache_read_token' },
          { type: 'per-token', rate: 0.00375, unit: 'cache_write_token' },
        ],
      };
      jest.spyOn(repository, 'getPricing').mockReturnValue(pricingWithCache);

      const usage: UsageMetrics = {
        units: 5000,
        unitType: 'tokens',
        costUSD: 0,
        breakdown: {
          input: 1000,
          output: 1000,
          cacheRead: 2000,
          cacheWrite: 1000,
        },
      };

      const cost = service.calculateCostUSD(usage, 'claude');

      // (1000/1000)*0.003 + (1000/1000)*0.015 + (2000/1000)*0.0015 + (1000/1000)*0.00375
      // = 0.003 + 0.015 + 0.003 + 0.00375 = 0.02475
      expect(cost).toBeCloseTo(0.02475);
    });
  });

  describe('updatePricing', () => {
    it('should validate and update pricing', () => {
      const oldModel = mockPricingModel;
      const newModel: PricingModel = {
        ...mockPricingModel,
        rates: [
          { type: 'per-token', rate: 0.002, unit: 'input_token' },
          { type: 'per-token', rate: 0.01, unit: 'output_token' },
        ],
      };

      jest.spyOn(repository, 'getPricing').mockReturnValue(oldModel);
      const upsertSpy = jest
        .spyOn(repository, 'upsertPricing')
        .mockImplementation();
      const addHistorySpy = jest
        .spyOn(repository, 'addHistory')
        .mockImplementation();

      service.updatePricing(newModel, 'admin', 'Price reduction');

      expect(upsertSpy).toHaveBeenCalledWith(newModel);
      expect(addHistorySpy).toHaveBeenCalledWith(
        'claude',
        undefined,
        oldModel.rates,
        newModel.rates,
        'admin',
        'Price reduction',
      );
    });

    it('should invalidate cache after update', () => {
      const getPricingSpy = jest
        .spyOn(repository, 'getPricing')
        .mockReturnValue(mockPricingModel);
      jest.spyOn(repository, 'upsertPricing').mockImplementation();
      jest.spyOn(repository, 'addHistory').mockImplementation();

      // Load into cache
      service.getPricing('claude');

      // Update pricing (this will call getPricing once to get old model)
      service.updatePricing(mockPricingModel, 'admin', 'test');

      // Next call should hit repository (cache invalidated)
      service.getPricing('claude');

      // Called 3 times: initial load, during update, after cache clear
      expect(getPricingSpy).toHaveBeenCalledTimes(3);
    });

    it('should throw error for invalid pricing (no rates)', () => {
      const invalidModel: PricingModel = {
        ...mockPricingModel,
        rates: [],
      };

      expect(() =>
        service.updatePricing(invalidModel, 'admin', 'test'),
      ).toThrow('Pricing model must have at least one rate');
    });

    it('should throw error for negative rates', () => {
      const invalidModel: PricingModel = {
        ...mockPricingModel,
        rates: [{ type: 'per-token', rate: -0.01, unit: 'input_token' }],
      };

      expect(() =>
        service.updatePricing(invalidModel, 'admin', 'test'),
      ).toThrow('Rate must be greater than 0');
    });

    it('should throw error for tiered pricing without tiers', () => {
      const invalidModel: PricingModel = {
        ...mockPricingModel,
        pricingType: 'tiered',
        rates: [{ type: 'tiered', rate: 0.01 }],
      };

      expect(() =>
        service.updatePricing(invalidModel, 'admin', 'test'),
      ).toThrow('Tiered pricing requires tiers configuration');
    });

    it('should throw error for invalid date range', () => {
      const invalidModel: PricingModel = {
        ...mockPricingModel,
        effectiveFrom: new Date('2024-12-01'),
        effectiveUntil: new Date('2024-01-01'),
      };

      jest.spyOn(repository, 'getPricing').mockReturnValue(null);

      expect(() =>
        service.updatePricing(invalidModel, 'admin', 'test'),
      ).toThrow('effectiveFrom must be before effectiveUntil');
    });
  });

  describe('getPricingHistory', () => {
    it('should return pricing history from repository', () => {
      const history = [
        {
          id: 1,
          providerId: 'claude',
          endpoint: undefined,
          oldRates: undefined,
          newRates: JSON.stringify(mockPricingModel.rates),
          changedBy: 'admin',
          changedAt: new Date(),
          reason: 'Initial pricing',
        },
      ];

      const getHistorySpy = jest
        .spyOn(repository, 'getHistory')
        .mockReturnValue(history);

      const result = service.getPricingHistory('claude');

      expect(result).toBe(history);
      expect(getHistorySpy).toHaveBeenCalledWith('claude');
    });
  });
});
