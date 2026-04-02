import { Test, TestingModule } from '@nestjs/testing';
import { EthRateOracleService } from './eth-rate-oracle.service';

describe('EthRateOracleService', () => {
  let service: EthRateOracleService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EthRateOracleService],
    }).compile();

    service = module.get<EthRateOracleService>(EthRateOracleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getEthUsdRate', () => {
    it('should fetch ETH/USD rate', async () => {
      const rate = await service.getEthUsdRate();

      expect(rate).toBeGreaterThan(0);
      expect(typeof rate).toBe('number');
    }, 10000);

    it('should cache rate for 1 minute', async () => {
      const rate1 = await service.getEthUsdRate();
      const rate2 = await service.getEthUsdRate();

      expect(rate1).toBe(rate2);
    }, 10000);
  });

  describe('usdToWei', () => {
    it('should convert USD to wei', async () => {
      const usdAmount = 10; // $10
      const wei = await service.usdToWei(usdAmount);

      expect(wei).toBeGreaterThan(BigInt(0));
      expect(typeof wei).toBe('bigint');
    }, 10000);
  });

  describe('weiToUsd', () => {
    it('should convert wei to USD', async () => {
      const wei = BigInt('1000000000000000000'); // 1 ETH
      const usd = await service.weiToUsd(wei);

      expect(usd).toBeGreaterThan(0);
      expect(typeof usd).toBe('number');
    }, 10000);
  });
});
