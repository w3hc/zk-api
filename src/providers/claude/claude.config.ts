/**
 * Claude provider configuration
 */
export const CLAUDE_CONFIG = {
  /**
   * Default model to use when not specified
   */
  DEFAULT_MODEL: 'claude-sonnet-4-5-20250929',

  /**
   * Supported Claude models
   */
  SUPPORTED_MODELS: [
    'claude-sonnet-4-5-20250929',
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-haiku-4-5',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
  ] as const,

  /**
   * Default request parameters
   */
  DEFAULTS: {
    maxTokens: 8192,
    temperature: 1.0,
    timeout: 120000, // 2 minutes
    retries: 2,
  },

  /**
   * Rate limits (per provider account)
   */
  RATE_LIMITS: {
    requestsPerMinute: 50,
    requestsPerDay: 1000,
    concurrentRequests: 5,
  },
};

export type ClaudeModel = (typeof CLAUDE_CONFIG.SUPPORTED_MODELS)[number];
