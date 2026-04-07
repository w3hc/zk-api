import { Test, TestingModule } from '@nestjs/testing';
import { PricingRepository } from './pricing.repository';
import { DatabaseService } from '../database/database.service';
import { PricingModel, PricingRate } from './dto/pricing-model.dto';

describe('PricingRepository', () => {
  let repository: PricingRepository;
  let databaseService: DatabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingRepository,
        {
          provide: DatabaseService,
          useFactory: () => {
            const db = new DatabaseService();
            // Use in-memory database for testing
            process.env.DATA_DIR = ':memory:';
            db.onModuleInit();
            return db;
          },
        },
      ],
    }).compile();

    repository = module.get<PricingRepository>(PricingRepository);
    databaseService = module.get<DatabaseService>(DatabaseService);
  });

  afterEach(() => {
    databaseService.onModuleDestroy();
  });

  describe('getPricing', () => {
    it('should return null when no pricing exists', () => {
      const pricing = repository.getPricing('claude');
      expect(pricing).toBeNull();
    });

    it('should return provider-level pricing', () => {
      const model: PricingModel = {
        providerId: 'claude',
        pricingType: 'per-token',
        rates: [
          { type: 'per-token', rate: 0.003, unit: 'input_token' },
          { type: 'per-token', rate: 0.015, unit: 'output_token' },
        ],
        currency: 'USD',
        effectiveFrom: new Date('2024-01-01'),
      };

      repository.upsertPricing(model);

      const retrieved = repository.getPricing('claude');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.providerId).toBe('claude');
      expect(retrieved?.pricingType).toBe('per-token');
      expect(retrieved?.rates).toHaveLength(2);
    });

    it('should prefer endpoint-specific pricing over provider-level', () => {
      const providerPricing: PricingModel = {
        providerId: 'claude',
        pricingType: 'per-token',
        rates: [{ type: 'per-token', rate: 0.01, unit: 'input_token' }],
        currency: 'USD',
        effectiveFrom: new Date('2024-01-01'),
      };

      const endpointPricing: PricingModel = {
        providerId: 'claude',
        endpoint: '/v1/messages',
        pricingType: 'per-token',
        rates: [{ type: 'per-token', rate: 0.003, unit: 'input_token' }],
        currency: 'USD',
        effectiveFrom: new Date('2024-01-01'),
      };

      repository.upsertPricing(providerPricing);
      repository.upsertPricing(endpointPricing);

      const retrieved = repository.getPricing('claude', '/v1/messages');
      expect(retrieved?.endpoint).toBe('/v1/messages');
      expect(retrieved?.rates[0].rate).toBe(0.003);
    });

    it('should fall back to provider-level when endpoint-specific not found', () => {
      const providerPricing: PricingModel = {
        providerId: 'claude',
        pricingType: 'per-token',
        rates: [{ type: 'per-token', rate: 0.01, unit: 'input_token' }],
        currency: 'USD',
        effectiveFrom: new Date('2024-01-01'),
      };

      repository.upsertPricing(providerPricing);

      const retrieved = repository.getPricing('claude', '/v1/completions');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.endpoint).toBeUndefined();
      expect(retrieved?.rates[0].rate).toBe(0.01);
    });

    it('should return only active pricing within effective dates', () => {
      const oldPricing: PricingModel = {
        providerId: 'claude',
        pricingType: 'per-token',
        rates: [{ type: 'per-token', rate: 0.01, unit: 'input_token' }],
        currency: 'USD',
        effectiveFrom: new Date('2024-01-01'),
        effectiveUntil: new Date('2024-06-01'),
      };

      const newPricing: PricingModel = {
        providerId: 'claude',
        pricingType: 'per-token',
        rates: [{ type: 'per-token', rate: 0.003, unit: 'input_token' }],
        currency: 'USD',
        effectiveFrom: new Date('2024-06-01'),
      };

      repository.upsertPricing(oldPricing);
      repository.upsertPricing(newPricing);

      const retrieved = repository.getPricing('claude');
      expect(retrieved?.rates[0].rate).toBe(0.003);
    });
  });

  describe('upsertPricing', () => {
    it('should insert new pricing', () => {
      const model: PricingModel = {
        providerId: 'openai',
        pricingType: 'per-token',
        rates: [{ type: 'per-token', rate: 0.002, unit: 'input_token' }],
        currency: 'USD',
        effectiveFrom: new Date(),
      };

      repository.upsertPricing(model);

      const retrieved = repository.getPricing('openai');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.providerId).toBe('openai');
    });

    it('should set effective_until on old pricing when inserting new', () => {
      const oldModel: PricingModel = {
        providerId: 'claude',
        pricingType: 'per-token',
        rates: [{ type: 'per-token', rate: 0.01, unit: 'input_token' }],
        currency: 'USD',
        effectiveFrom: new Date('2024-01-01'),
      };

      const newModel: PricingModel = {
        providerId: 'claude',
        pricingType: 'per-token',
        rates: [{ type: 'per-token', rate: 0.003, unit: 'input_token' }],
        currency: 'USD',
        effectiveFrom: new Date(),
      };

      repository.upsertPricing(oldModel);
      repository.upsertPricing(newModel);

      // Should now get the new pricing
      const current = repository.getPricing('claude');
      expect(current?.rates[0].rate).toBe(0.003);
    });
  });

  describe('addHistory', () => {
    it('should add pricing history record', () => {
      const oldRates: PricingRate[] = [
        { type: 'per-token', rate: 0.01, unit: 'input_token' },
      ];
      const newRates: PricingRate[] = [
        { type: 'per-token', rate: 0.003, unit: 'input_token' },
      ];

      repository.addHistory(
        'claude',
        undefined,
        oldRates,
        newRates,
        'admin',
        'Price reduction',
      );

      const history = repository.getHistory('claude');
      expect(history).toHaveLength(1);
      expect(history[0].providerId).toBe('claude');
      expect(history[0].changedBy).toBe('admin');
      expect(history[0].reason).toBe('Price reduction');
    });

    it('should handle null old rates for initial pricing', () => {
      const newRates: PricingRate[] = [
        { type: 'per-token', rate: 0.003, unit: 'input_token' },
      ];

      repository.addHistory(
        'openai',
        '/v1/chat',
        undefined,
        newRates,
        'system',
        'Initial pricing',
      );

      const history = repository.getHistory('openai');
      expect(history).toHaveLength(1);
      expect(history[0].oldRates).toBeUndefined();
    });
  });

  describe('getHistory', () => {
    it('should return empty array when no history', () => {
      const history = repository.getHistory('unknown');
      expect(history).toEqual([]);
    });

    it('should return history in descending order', async () => {
      const rates1: PricingRate[] = [
        { type: 'per-token', rate: 0.01, unit: 'input_token' },
      ];
      const rates2: PricingRate[] = [
        { type: 'per-token', rate: 0.005, unit: 'input_token' },
      ];
      const rates3: PricingRate[] = [
        { type: 'per-token', rate: 0.003, unit: 'input_token' },
      ];

      repository.addHistory(
        'claude',
        undefined,
        undefined,
        rates1,
        'admin',
        'v1',
      );
      // Wait to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      repository.addHistory('claude', undefined, rates1, rates2, 'admin', 'v2');
      await new Promise((resolve) => setTimeout(resolve, 10));
      repository.addHistory('claude', undefined, rates2, rates3, 'admin', 'v3');

      const history = repository.getHistory('claude');
      expect(history).toHaveLength(3);
      expect(history[0].reason).toBe('v3');
      expect(history[1].reason).toBe('v2');
      expect(history[2].reason).toBe('v1');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        repository.addHistory(
          'claude',
          undefined,
          undefined,
          [{ type: 'per-token', rate: 0.003, unit: 'input_token' }],
          'admin',
          `Update ${i}`,
        );
      }

      const history = repository.getHistory('claude', 5);
      expect(history).toHaveLength(5);
    });
  });
});
