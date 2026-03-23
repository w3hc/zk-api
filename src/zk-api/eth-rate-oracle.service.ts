import { Injectable, Logger } from '@nestjs/common';

interface KrakenTickerResponse {
  error: string[];
  result: {
    XETHZUSD: {
      c: [string, string]; // Last trade: [price, lot volume]
    };
  };
}

@Injectable()
export class EthRateOracleService {
  private readonly logger = new Logger(EthRateOracleService.name);
  private cache: { rate: number; timestamp: number } | null = null;
  private readonly CACHE_TTL = 60_000; // 1 minute
  private readonly KRAKEN_API_URL =
    'https://api.kraken.com/0/public/Ticker?pair=ETHUSD';

  /**
   * Get the current ETH/USD exchange rate from Kraken
   * Results are cached for 1 minute to reduce API calls
   */
  async getEthUsdRate(): Promise<number> {
    const now = Date.now();

    // Return cached rate if still valid
    if (this.cache && now - this.cache.timestamp < this.CACHE_TTL) {
      this.logger.debug(`Using cached ETH/USD rate: ${this.cache.rate}`);
      return this.cache.rate;
    }

    try {
      this.logger.debug('Fetching fresh ETH/USD rate from Kraken...');
      const response = await fetch(this.KRAKEN_API_URL);

      if (!response.ok) {
        throw new Error(`Kraken API returned ${response.status}`);
      }

      const data = (await response.json()) as KrakenTickerResponse;

      if (data.error && data.error.length > 0) {
        throw new Error(`Kraken API error: ${data.error.join(', ')}`);
      }

      const rate = parseFloat(data.result.XETHZUSD.c[0]);

      if (isNaN(rate) || rate <= 0) {
        throw new Error(`Invalid ETH/USD rate received: ${rate}`);
      }

      // Update cache
      this.cache = { rate, timestamp: now };
      this.logger.log(`ETH/USD rate updated: $${rate.toFixed(2)}`);

      return rate;
    } catch (error) {
      this.logger.error('Failed to fetch ETH/USD rate', error);

      // If we have stale cache data, use it as fallback
      if (this.cache) {
        this.logger.warn('Using stale cached rate as fallback');
        return this.cache.rate;
      }

      throw new Error('Unable to fetch ETH/USD rate and no cache available', {
        cause: error,
      });
    }
  }

  /**
   * Convert USD amount to ETH (in wei)
   */
  async usdToWei(usdAmount: number): Promise<bigint> {
    const ethUsdRate = await this.getEthUsdRate();
    const ethAmount = usdAmount / ethUsdRate;
    return BigInt(Math.ceil(ethAmount * 1e18));
  }

  /**
   * Convert wei to USD
   */
  async weiToUsd(weiAmount: bigint): Promise<number> {
    const ethUsdRate = await this.getEthUsdRate();
    const ethAmount = Number(weiAmount) / 1e18;
    return ethAmount * ethUsdRate;
  }
}
