import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

interface StoredSignal {
  x: string;
  y: string;
  timestamp: number;
}

interface RefundRedemption {
  idCommitment: string;
  value: string;
  timestamp: number;
  recipient: string;
  txHash: string;
  redeemedAt: number;
}

interface NullifierRow {
  nullifier: string;
  x: string;
  y: string;
  timestamp: number;
}

interface RefundRow {
  nullifier: string;
  id_commitment: string;
  value: string;
  timestamp: number;
  recipient: string;
  tx_hash: string;
  redeemed_at: number;
}

interface CountRow {
  count: number;
}

/**
 * SQLite-backed store for tracking used nullifiers and their associated RLN signals
 * Also tracks redeemed refunds for auditing
 */
@Injectable()
export class NullifierStoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NullifierStoreService.name);
  private db: Database.Database;
  private dbPath: string;
  // In-memory rate limiting per nullifier
  private readonly nullifierAttempts = new Map<string, number[]>();
  private readonly RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
  private readonly RATE_LIMIT_MAX_ATTEMPTS = 3; // Max 3 attempts per minute per nullifier

  constructor() {
    // Use environment variable or default to data directory
    const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
    // Support in-memory database for testing
    this.dbPath =
      dataDir === ':memory:' ? ':memory:' : join(dataDir, 'nullifiers.db');
  }

  onModuleInit() {
    // Create data directory if it doesn't exist (unless using in-memory DB)
    if (this.dbPath !== ':memory:') {
      const dir = join(this.dbPath, '..');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(this.dbPath);
    this.logger.log(`SQLite database initialized at ${this.dbPath}`);

    // Create tables if they don't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nullifiers (
        nullifier TEXT PRIMARY KEY,
        x TEXT NOT NULL,
        y TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_nullifiers_timestamp ON nullifiers(timestamp);
    `);

    // Create redeemed_refunds table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS redeemed_refunds (
        nullifier TEXT PRIMARY KEY,
        id_commitment TEXT NOT NULL,
        value TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        recipient TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        redeemed_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_redeemed_timestamp ON redeemed_refunds(redeemed_at);
    `);

    // Migration: Remove payload column if it exists (for privacy)
    this.migrateRemovePayloadColumn();
  }

  onModuleDestroy() {
    if (this.db) {
      this.db.close();
      this.logger.log('SQLite database connection closed');
    }
  }

  /**
   * Migration: Remove payload column for privacy
   * SQLite doesn't support DROP COLUMN, so we recreate the table
   */
  private migrateRemovePayloadColumn(): void {
    try {
      // Check if payload column exists
      const columns = this.db
        .prepare("PRAGMA table_info('nullifiers')")
        .all() as Array<{ name: string }>;

      const hasPayload = columns.some((col) => col.name === 'payload');

      if (hasPayload) {
        this.logger.log(
          'Migrating database: removing payload column for privacy',
        );

        // SQLite doesn't support DROP COLUMN, so we need to recreate the table
        this.db.exec(`
          BEGIN TRANSACTION;

          -- Create new table without payload
          CREATE TABLE nullifiers_new (
            nullifier TEXT PRIMARY KEY,
            x TEXT NOT NULL,
            y TEXT NOT NULL,
            timestamp INTEGER NOT NULL
          );

          -- Copy data (excluding payload)
          INSERT INTO nullifiers_new (nullifier, x, y, timestamp)
          SELECT nullifier, x, y, timestamp FROM nullifiers;

          -- Drop old table
          DROP TABLE nullifiers;

          -- Rename new table
          ALTER TABLE nullifiers_new RENAME TO nullifiers;

          -- Recreate index
          CREATE INDEX idx_nullifiers_timestamp ON nullifiers(timestamp);

          COMMIT;
        `);

        this.logger.log('Migration complete: payload column removed');
      }
    } catch (error) {
      this.logger.error('Migration failed:', error);
      // Continue anyway - table might already be in new format
    }
  }

  /**
   * Get signal associated with a nullifier
   */
  get(nullifier: string): StoredSignal | null {
    const stmt = this.db.prepare(
      'SELECT x, y, timestamp FROM nullifiers WHERE nullifier = ?',
    );
    const row = stmt.get(nullifier) as StoredSignal | undefined;

    if (!row) return null;

    return {
      x: row.x,
      y: row.y,
      timestamp: row.timestamp,
    };
  }

  /**
   * Store a new nullifier and its signal
   */
  set(nullifier: string, signal: { x: string; y: string }): void {
    const timestamp = Date.now();
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO nullifiers (nullifier, x, y, timestamp) VALUES (?, ?, ?, ?)',
    );
    stmt.run(nullifier, signal.x, signal.y, timestamp);
    this.logger.debug(`Stored nullifier: ${nullifier.slice(0, 10)}...`);
  }

  /**
   * Check if nullifier exists
   */
  exists(nullifier: string): boolean {
    const stmt = this.db.prepare(
      'SELECT 1 FROM nullifiers WHERE nullifier = ?',
    );
    return stmt.get(nullifier) !== undefined;
  }

  /**
   * Get all stored nullifiers (for debugging)
   */
  getAll(): Map<string, StoredSignal> {
    const stmt = this.db.prepare(
      'SELECT nullifier, x, y, timestamp FROM nullifiers',
    );
    const rows = stmt.all() as NullifierRow[];

    const map = new Map<string, StoredSignal>();
    for (const row of rows) {
      map.set(row.nullifier, {
        x: row.x,
        y: row.y,
        timestamp: row.timestamp,
      });
    }
    return map;
  }

  /**
   * Clear all nullifiers (for testing)
   */
  clear(): void {
    this.db.exec('DELETE FROM nullifiers');
    this.db.exec('DELETE FROM redeemed_refunds');
    this.logger.log('Cleared all nullifiers and redeemed refunds');
  }

  /**
   * Get count of stored nullifiers
   */
  count(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM nullifiers');
    const row = stmt.get() as CountRow | undefined;
    return row?.count ?? 0;
  }

  /**
   * Mark a refund as redeemed
   */
  markRefundRedeemed(
    nullifier: string,
    redemption: {
      idCommitment: string;
      value: string;
      timestamp: number;
      recipient: string;
      txHash: string;
    },
  ): void {
    const redeemedAt = Date.now();
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO redeemed_refunds (nullifier, id_commitment, value, timestamp, recipient, tx_hash, redeemed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    stmt.run(
      nullifier,
      redemption.idCommitment,
      redemption.value,
      redemption.timestamp,
      redemption.recipient,
      redemption.txHash,
      redeemedAt,
    );
    this.logger.log(
      `Marked refund as redeemed: nullifier=${nullifier.slice(0, 10)}..., value=${redemption.value} wei`,
    );
  }

  /**
   * Check if a refund has been redeemed (from local cache)
   */
  isRefundRedeemed(nullifier: string): boolean {
    const stmt = this.db.prepare(
      'SELECT 1 FROM redeemed_refunds WHERE nullifier = ?',
    );
    return stmt.get(nullifier) !== undefined;
  }

  /**
   * Get refund redemption details
   */
  getRefundRedemption(nullifier: string): RefundRedemption | null {
    const stmt = this.db.prepare(
      'SELECT id_commitment, value, timestamp, recipient, tx_hash, redeemed_at FROM redeemed_refunds WHERE nullifier = ?',
    );
    const row = stmt.get(nullifier) as Omit<RefundRow, 'nullifier'> | undefined;

    if (!row) return null;

    return {
      idCommitment: row.id_commitment,
      value: row.value,
      timestamp: row.timestamp,
      recipient: row.recipient,
      txHash: row.tx_hash,
      redeemedAt: row.redeemed_at,
    };
  }

  /**
   * Get all redeemed refunds (for auditing)
   */
  getAllRedeemedRefunds(): Map<string, RefundRedemption> {
    const stmt = this.db.prepare(
      'SELECT nullifier, id_commitment, value, timestamp, recipient, tx_hash, redeemed_at FROM redeemed_refunds',
    );
    const rows = stmt.all() as RefundRow[];

    const map = new Map<string, RefundRedemption>();
    for (const row of rows) {
      map.set(row.nullifier, {
        idCommitment: row.id_commitment,
        value: row.value,
        timestamp: row.timestamp,
        recipient: row.recipient,
        txHash: row.tx_hash,
        redeemedAt: row.redeemed_at,
      });
    }
    return map;
  }

  /**
   * Get count of redeemed refunds
   */
  redeemedCount(): number {
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM redeemed_refunds',
    );
    const row = stmt.get() as CountRow | undefined;
    return row?.count ?? 0;
  }

  /**
   * Check if nullifier has exceeded rate limit
   * Returns true if within limit, false if exceeded
   */
  checkRateLimit(nullifier: string): boolean {
    const now = Date.now();

    // Get recent attempts for this nullifier
    const attempts = this.nullifierAttempts.get(nullifier) || [];
    const recentAttempts = attempts.filter(
      (timestamp) => now - timestamp < this.RATE_LIMIT_WINDOW_MS,
    );

    // Check if exceeded limit
    if (recentAttempts.length >= this.RATE_LIMIT_MAX_ATTEMPTS) {
      this.logger.warn(
        `Rate limit exceeded for nullifier ${nullifier.slice(0, 10)}... (${recentAttempts.length} attempts in last minute)`,
      );
      return false;
    }

    // Record this attempt
    recentAttempts.push(now);
    this.nullifierAttempts.set(nullifier, recentAttempts);

    // Clean up old entries periodically (when map gets large)
    if (this.nullifierAttempts.size > 10000) {
      this.cleanupRateLimitMap();
    }

    return true;
  }

  /**
   * Clean up expired entries from rate limit map
   */
  private cleanupRateLimitMap(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [nullifier, attempts] of this.nullifierAttempts.entries()) {
      const recentAttempts = attempts.filter(
        (timestamp) => now - timestamp < this.RATE_LIMIT_WINDOW_MS,
      );

      if (recentAttempts.length === 0) {
        this.nullifierAttempts.delete(nullifier);
        cleaned++;
      } else if (recentAttempts.length < attempts.length) {
        this.nullifierAttempts.set(nullifier, recentAttempts);
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired rate limit entries`);
    }
  }

  /**
   * Get remaining attempts for nullifier (for debugging/testing)
   */
  getRemainingAttempts(nullifier: string): number {
    const now = Date.now();
    const attempts = this.nullifierAttempts.get(nullifier) || [];
    const recentAttempts = attempts.filter(
      (timestamp) => now - timestamp < this.RATE_LIMIT_WINDOW_MS,
    );
    return Math.max(0, this.RATE_LIMIT_MAX_ATTEMPTS - recentAttempts.length);
  }
}
