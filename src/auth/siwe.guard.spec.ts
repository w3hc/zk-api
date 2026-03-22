import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SiweGuard } from './siwe.guard';
import { SiweService } from './siwe.service';

describe('SiweGuard', () => {
  let guard: SiweGuard;
  let siweService: jest.Mocked<SiweService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SiweGuard,
        {
          provide: SiweService,
          useValue: {
            verifySignature: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<SiweGuard>(SiweGuard);
    siweService = module.get(SiweService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should throw UnauthorizedException when message header is missing', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-siwe-signature': '0x123',
            },
          }),
        }),
      } as ExecutionContext;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Missing SIWE authentication headers (x-siwe-message, x-siwe-signature)',
      );
    });

    it('should throw UnauthorizedException when signature header is missing', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-siwe-message': 'message',
            },
          }),
        }),
      } as ExecutionContext;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Missing SIWE authentication headers (x-siwe-message, x-siwe-signature)',
      );
    });

    it('should throw UnauthorizedException when both headers are missing', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {},
          }),
        }),
      } as ExecutionContext;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when signature verification returns null', async () => {
      siweService.verifySignature.mockResolvedValue(null);

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-siwe-message': 'message',
              'x-siwe-signature': '0x123',
            },
          }),
        }),
      } as ExecutionContext;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Invalid SIWE signature or expired nonce',
      );
    });

    it('should return true and attach user address when verification succeeds', async () => {
      const address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
      siweService.verifySignature.mockResolvedValue(address);

      const mockRequest = {
        headers: {
          'x-siwe-message': Buffer.from('message').toString('base64'),
          'x-siwe-signature': '0x123',
        },
      };

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as ExecutionContext;

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockRequest).toHaveProperty('user');
      expect(mockRequest['user']).toEqual({ address });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(siweService.verifySignature).toHaveBeenCalledWith(
        'message',
        '0x123',
      );
    });
  });
});
