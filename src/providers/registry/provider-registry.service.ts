import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ApiProvider, ProviderHealth } from '../core/provider.interface';
import { PricingOracleService } from '../../pricing/pricing-oracle.service';

/**
 * Provider registry service for managing and routing to API providers
 */
@Injectable()
export class ProviderRegistryService {
  private readonly logger = new Logger(ProviderRegistryService.name);
  private providers = new Map<string, ApiProvider>();

  constructor(private readonly pricingOracle: PricingOracleService) {}

  /**
   * Register a new provider and seed its pricing configuration
   */
  register(provider: ApiProvider): void {
    if (this.providers.has(provider.id)) {
      this.logger.warn(
        `Provider ${provider.id} already registered, overwriting`,
      );
    }

    this.providers.set(provider.id, provider);
    this.logger.log(
      `Registered provider: ${provider.name} (${provider.id}) v${provider.version}`,
    );

    // Auto-seed pricing from provider configuration
    this.seedProviderPricing(provider);
  }

  /**
   * Seed or update pricing for a provider based on its hardcoded configuration
   * This ensures pricing is always in sync with provider code
   */
  private seedProviderPricing(provider: ApiProvider): void {
    try {
      const pricingConfig = provider.getPricingConfig();

      // Always update pricing on registration to ensure code is source of truth
      void this.pricingOracle.updatePricing(
        {
          ...pricingConfig,
          effectiveFrom: new Date(),
        },
        'system',
        `Auto-seeded from provider ${provider.id} v${provider.version}`,
      );

      this.logger.log(`Seeded pricing for provider: ${provider.id}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to seed pricing for provider ${provider.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Get a provider by ID
   * @throws NotFoundException if provider not found
   */
  get(providerId: string): ApiProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new NotFoundException(`Provider not found: ${providerId}`);
    }
    return provider;
  }

  /**
   * Check if a provider exists
   */
  has(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  /**
   * List all registered providers
   */
  list(): ApiProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get all provider IDs
   */
  getProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Health check all providers
   */
  async healthCheckAll(): Promise<Map<string, ProviderHealth>> {
    const results = new Map<string, ProviderHealth>();

    await Promise.all(
      Array.from(this.providers.entries()).map(async ([id, provider]) => {
        try {
          const health = await provider.healthCheck();
          results.set(id, health);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Health check failed for provider ${id}: ${message}`,
          );
          results.set(id, {
            status: 'down',
            lastCheck: new Date(),
            message,
          });
        }
      }),
    );

    return results;
  }

  /**
   * Unregister a provider
   */
  unregister(providerId: string): boolean {
    const deleted = this.providers.delete(providerId);
    if (deleted) {
      this.logger.log(`Unregistered provider: ${providerId}`);
    }
    return deleted;
  }
}
