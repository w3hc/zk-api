import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PricingRepository } from './pricing.repository';
import { PricingModel, PricingHistory } from './dto/pricing-model.dto';
import { UsageMetrics } from '../providers';

/**
 * Pricing oracle service for dynamic pricing lookup and calculation
 */
@Injectable()
export class PricingOracleService {
  private readonly logger = new Logger(PricingOracleService.name);
  private pricingCache = new Map<
    string,
    { model: PricingModel; expiry: number }
  >();
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  constructor(private readonly pricingRepository: PricingRepository) {}

  /**
   * Get active pricing model for a provider and endpoint
   */
  getPricing(providerId: string, endpoint?: string): PricingModel {
    const cacheKey = `${providerId}:${endpoint ?? ''}`;
    const cached = this.pricingCache.get(cacheKey);

    // Return from cache if not expired
    if (cached && cached.expiry > Date.now()) {
      return cached.model;
    }

    // Fetch from database
    const model = this.pricingRepository.getPricing(providerId, endpoint);

    if (!model) {
      throw new NotFoundException(
        `No pricing model found for provider: ${providerId}${endpoint ? ` (${endpoint})` : ''}`,
      );
    }

    // Cache the result
    this.pricingCache.set(cacheKey, {
      model,
      expiry: Date.now() + this.CACHE_TTL_MS,
    });

    return model;
  }

  /**
   * Calculate cost in USD from usage metrics
   */
  calculateCostUSD(
    usage: UsageMetrics,
    providerId: string,
    endpoint?: string,
  ): number {
    const pricing = this.getPricing(providerId, endpoint);

    switch (pricing.pricingType) {
      case 'per-token':
        return this.calculateTokenCost(usage, pricing);
      case 'per-call':
        return this.calculatePerCallCost(usage, pricing);
      case 'per-unit':
        return this.calculatePerUnitCost(usage, pricing);
      case 'tiered':
        return this.calculateTieredCost(usage, pricing);
      case 'composite':
        return this.calculateCompositeCost(usage, pricing);
      default: {
        const exhaustiveCheck: never = pricing.pricingType;
        throw new Error(`Unsupported pricing type: ${String(exhaustiveCheck)}`);
      }
    }
  }

  /**
   * Update pricing model with history tracking
   */
  updatePricing(model: PricingModel, changedBy: string, reason: string): void {
    // Validate pricing model
    this.validatePricingModel(model);

    // Get old pricing for history
    const oldModel = this.pricingRepository.getPricing(
      model.providerId,
      model.endpoint,
    );

    // Upsert new pricing
    this.pricingRepository.upsertPricing(model);

    // Add to history
    this.pricingRepository.addHistory(
      model.providerId,
      model.endpoint,
      oldModel?.rates,
      model.rates,
      changedBy,
      reason,
    );

    // Invalidate cache
    const cacheKey = `${model.providerId}:${model.endpoint ?? ''}`;
    this.pricingCache.delete(cacheKey);

    this.logger.log(
      `Updated pricing for ${model.providerId}${model.endpoint ? ` (${model.endpoint})` : ''}`,
    );
  }

  /**
   * Get pricing history for a provider
   */
  getPricingHistory(providerId: string): PricingHistory[] {
    return this.pricingRepository.getHistory(providerId);
  }

  /**
   * Calculate token-based cost (input/output tokens)
   */
  private calculateTokenCost(
    usage: UsageMetrics,
    pricing: PricingModel,
  ): number {
    let cost = 0;

    for (const rate of pricing.rates) {
      if (rate.unit === 'input_token' && usage.breakdown?.input) {
        cost += (usage.breakdown.input / 1000) * rate.rate;
      } else if (rate.unit === 'output_token' && usage.breakdown?.output) {
        cost += (usage.breakdown.output / 1000) * rate.rate;
      } else if (
        rate.unit === 'cache_read_token' &&
        usage.breakdown?.cacheRead
      ) {
        cost += (usage.breakdown.cacheRead / 1000) * rate.rate;
      } else if (
        rate.unit === 'cache_write_token' &&
        usage.breakdown?.cacheWrite
      ) {
        cost += (usage.breakdown.cacheWrite / 1000) * rate.rate;
      }
    }

    return cost;
  }

  /**
   * Calculate per-call cost
   */
  private calculatePerCallCost(
    usage: UsageMetrics,
    pricing: PricingModel,
  ): number {
    const rate = pricing.rates[0]?.rate || 0;
    return rate; // Fixed cost per API call
  }

  /**
   * Calculate per-unit cost (simple multiplication)
   */
  private calculatePerUnitCost(
    usage: UsageMetrics,
    pricing: PricingModel,
  ): number {
    const rate = pricing.rates[0]?.rate || 0;
    return usage.units * rate;
  }

  /**
   * Calculate tiered cost (different rates for different usage levels)
   */
  private calculateTieredCost(
    usage: UsageMetrics,
    pricing: PricingModel,
  ): number {
    const rate = pricing.rates[0];
    if (!rate?.tiers) {
      throw new Error('Tiered pricing requires tiers configuration');
    }

    let cost = 0;
    let remainingUnits = usage.units;

    for (const tier of rate.tiers) {
      if (remainingUnits <= 0) break;

      const tierSize = tier.to ? tier.to - tier.from : Infinity;
      const unitsInTier = Math.min(remainingUnits, tierSize);

      cost += unitsInTier * tier.rate;
      remainingUnits -= unitsInTier;
    }

    return cost;
  }

  /**
   * Calculate composite cost (multiple unit types)
   */
  private calculateCompositeCost(
    usage: UsageMetrics,
    pricing: PricingModel,
  ): number {
    let cost = 0;

    for (const rate of pricing.rates) {
      if (usage.breakdown && rate.unit && usage.breakdown[rate.unit]) {
        cost += usage.breakdown[rate.unit]! * rate.rate;
      }
    }

    return cost;
  }

  /**
   * Validate pricing model
   */
  private validatePricingModel(model: PricingModel): void {
    if (model.rates.length === 0) {
      throw new Error('Pricing model must have at least one rate');
    }

    for (const rate of model.rates) {
      if (rate.rate <= 0) {
        throw new Error('Rate must be greater than 0');
      }

      if (rate.type === 'tiered' && !rate.tiers) {
        throw new Error('Tiered pricing requires tiers configuration');
      }
    }

    if (model.effectiveFrom > (model.effectiveUntil || new Date())) {
      throw new Error('effectiveFrom must be before effectiveUntil');
    }
  }
}
