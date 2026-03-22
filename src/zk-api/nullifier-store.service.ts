import { Injectable, Logger } from '@nestjs/common';

interface StoredSignal {
  x: string;
  y: string;
  timestamp: number;
  payload: string;
}

/**
 * In-memory store for tracking used nullifiers and their associated RLN signals
 * In production, this should be backed by Redis or a database
 */
@Injectable()
export class NullifierStoreService {
  private readonly logger = new Logger(NullifierStoreService.name);
  private readonly store = new Map<string, StoredSignal>();

  /**
   * Get signal associated with a nullifier
   */
  get(nullifier: string): StoredSignal | null {
    return this.store.get(nullifier) || null;
  }

  /**
   * Store a new nullifier and its signal
   */
  set(
    nullifier: string,
    signal: { x: string; y: string },
    payload: string,
  ): void {
    const storedSignal: StoredSignal = {
      x: signal.x,
      y: signal.y,
      timestamp: Date.now(),
      payload,
    };

    this.store.set(nullifier, storedSignal);
    this.logger.debug(`Stored nullifier: ${nullifier.slice(0, 10)}...`);
  }

  /**
   * Check if nullifier exists
   */
  exists(nullifier: string): boolean {
    return this.store.has(nullifier);
  }

  /**
   * Get all stored nullifiers (for debugging)
   */
  getAll(): Map<string, StoredSignal> {
    return new Map(this.store);
  }

  /**
   * Clear all nullifiers (for testing)
   */
  clear(): void {
    this.store.clear();
    this.logger.log('Cleared all nullifiers');
  }

  /**
   * Get count of stored nullifiers
   */
  count(): number {
    return this.store.size;
  }
}
