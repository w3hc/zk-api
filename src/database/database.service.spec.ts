import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from './database.service';

describe('DatabaseService', () => {
  let service: DatabaseService;

  beforeEach(async () => {
    // Use in-memory database for testing
    process.env.DATA_DIR = ':memory:';

    const module: TestingModule = await Test.createTestingModule({
      providers: [DatabaseService],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
  });

  afterEach(() => {
    if (service) {
      service.onModuleDestroy();
    }
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize database on module init', () => {
      service.onModuleInit();

      expect(service.db).toBeDefined();
    });

    it('should create pricing tables on init', () => {
      service.onModuleInit();

      // Check if pricing_models table exists
      const tableInfo = service.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='pricing_models'",
        )
        .get();

      expect(tableInfo).toBeDefined();
    });

    it('should create pricing_history table on init', () => {
      service.onModuleInit();

      // Check if pricing_history table exists
      const tableInfo = service.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='pricing_history'",
        )
        .get();

      expect(tableInfo).toBeDefined();
    });

    it('should enable foreign keys', () => {
      service.onModuleInit();

      const result = service.db.prepare('PRAGMA foreign_keys').get() as {
        foreign_keys: number;
      };

      expect(result.foreign_keys).toBe(1);
    });
  });

  describe('pricing_models table schema', () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it('should have correct columns', () => {
      const columns = service.db
        .prepare('PRAGMA table_info(pricing_models)')
        .all() as Array<{ name: string; type: string }>;

      const columnNames = columns.map((col) => col.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('provider_id');
      expect(columnNames).toContain('endpoint');
      expect(columnNames).toContain('pricing_type');
      expect(columnNames).toContain('currency');
      expect(columnNames).toContain('rates');
      expect(columnNames).toContain('effective_from');
      expect(columnNames).toContain('effective_until');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    it('should have indexes on provider_id and endpoint', () => {
      const indexes = service.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='pricing_models'",
        )
        .all() as Array<{ name: string }>;

      const indexNames = indexes.map((idx) => idx.name);

      expect(indexNames).toContain('idx_pricing_provider');
    });

    it('should have index on effective dates', () => {
      const indexes = service.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='pricing_models'",
        )
        .all() as Array<{ name: string }>;

      const indexNames = indexes.map((idx) => idx.name);

      expect(indexNames).toContain('idx_pricing_effective');
    });
  });

  describe('pricing_history table schema', () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it('should have correct columns', () => {
      const columns = service.db
        .prepare('PRAGMA table_info(pricing_history)')
        .all() as Array<{ name: string; type: string }>;

      const columnNames = columns.map((col) => col.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('provider_id');
      expect(columnNames).toContain('endpoint');
      expect(columnNames).toContain('old_rates');
      expect(columnNames).toContain('new_rates');
      expect(columnNames).toContain('changed_by');
      expect(columnNames).toContain('changed_at');
      expect(columnNames).toContain('reason');
    });

    it('should have index on provider_id', () => {
      const indexes = service.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='pricing_history'",
        )
        .all() as Array<{ name: string }>;

      const indexNames = indexes.map((idx) => idx.name);

      expect(indexNames).toContain('idx_pricing_history_provider');
    });
  });

  describe('database operations', () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it('should allow inserting pricing data', () => {
      const stmt = service.db.prepare(`
        INSERT INTO pricing_models (
          provider_id, endpoint, pricing_type, currency, rates,
          effective_from, effective_until
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        'claude',
        '/v1/messages',
        'per-token',
        'USD',
        JSON.stringify([{ type: 'per-token', rate: 0.003 }]),
        new Date().toISOString(),
        null,
      );

      expect(result.changes).toBe(1);
    });

    it('should allow querying pricing data', () => {
      // Insert test data
      service.db
        .prepare(
          `
        INSERT INTO pricing_models (
          provider_id, pricing_type, currency, rates, effective_from
        ) VALUES (?, ?, ?, ?, ?)
      `,
        )
        .run(
          'claude',
          'per-token',
          'USD',
          JSON.stringify([{ type: 'per-token', rate: 0.003 }]),
          new Date().toISOString(),
        );

      // Query it back
      const result = service.db
        .prepare('SELECT * FROM pricing_models WHERE provider_id = ?')
        .get('claude') as { provider_id: string; pricing_type: string };

      expect(result).toBeDefined();
      expect(result.provider_id).toBe('claude');
      expect(result.pricing_type).toBe('per-token');
    });

    it('should allow inserting pricing history', () => {
      const stmt = service.db.prepare(`
        INSERT INTO pricing_history (
          provider_id, endpoint, old_rates, new_rates, changed_by, changed_at, reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        'claude',
        null,
        null,
        JSON.stringify([{ type: 'per-token', rate: 0.003 }]),
        'admin',
        new Date().toISOString(),
        'Initial pricing',
      );

      expect(result.changes).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('should close database on module destroy', () => {
      service.onModuleInit();

      const closeSpy = jest.spyOn(service.db, 'close');

      service.onModuleDestroy();

      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('should handle multiple onModuleInit calls gracefully', () => {
      service.onModuleInit();
      service.onModuleInit(); // Second init

      // Should not throw and tables should still exist
      const tableInfo = service.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='pricing_models'",
        )
        .get();

      expect(tableInfo).toBeDefined();
    });
  });
});
