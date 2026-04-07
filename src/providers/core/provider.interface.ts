/**
 * Provider abstraction layer for universal API proxy support
 * Enables support for arbitrary paid APIs (Claude, OpenAI, Stripe, etc.)
 */

import { PricingModel } from '../../pricing/dto/pricing-model.dto';

/**
 * Core provider interface that all API providers must implement
 */
export interface ApiProvider {
  // Metadata
  readonly id: string; // 'claude' | 'openai' | 'stripe' | ...
  readonly name: string; // 'Claude API'
  readonly version: string; // '1.0.0'

  // Pricing configuration (hardcoded in provider implementation)
  getPricingConfig(): PricingModel;

  // Lifecycle
  initialize(config: ProviderConfig): Promise<void>;
  healthCheck(): Promise<ProviderHealth>;

  // Request handling
  validateRequest(request: ProviderRequest): Promise<ValidationResult>;
  execute(request: ProviderRequest): Promise<ProviderResponse>;

  // Cost calculation
  estimateCost(request: ProviderRequest): Promise<CostEstimate>;
  calculateActualCost(response: ProviderResponse): Promise<UsageMetrics>;

  // Rate limiting
  getRateLimits(): RateLimitConfig;
}

/**
 * Configuration for provider initialization
 */
export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  customSettings?: Record<string, any>;
}

/**
 * Generic provider request structure
 */
export interface ProviderRequest {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  metadata?: Record<string, any>; // Provider-specific
}

/**
 * Generic provider response structure
 */
export interface ProviderResponse {
  status: number;
  headers: Record<string, string>;
  body: any;
  usage: UsageMetrics;
  metadata?: Record<string, any>; // Provider-specific
}

/**
 * Request validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Cost estimate for request planning
 */
export interface CostEstimate {
  minCostUSD: number;
  maxCostUSD: number;
  estimatedCostUSD: number;
  confidence: number; // 0-1
  breakdown?: Record<string, number>;
}

/**
 * Generic usage metrics (supports tokens, calls, bytes, seconds, etc.)
 */
export interface UsageMetrics {
  units: number;
  unitType: 'tokens' | 'calls' | 'bytes' | 'seconds' | 'images' | 'custom';
  costUSD: number;
  breakdown?: {
    input?: number;
    output?: number;
    storage?: number;
    [key: string]: number | undefined;
  };
}

/**
 * Provider health status
 */
export interface ProviderHealth {
  status: 'healthy' | 'degraded' | 'down';
  latencyMs?: number;
  errorRate?: number;
  lastCheck: Date;
  message?: string;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  requestsPerMinute?: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
  concurrentRequests?: number;
}
