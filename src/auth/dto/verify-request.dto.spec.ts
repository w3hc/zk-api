import { validate } from 'class-validator';
import { VerifyRequestDto } from './verify-request.dto';

describe('VerifyRequestDto', () => {
  it('should validate a valid VerifyRequestDto', async () => {
    const dto = new VerifyRequestDto();
    dto.message =
      'localhost wants you to sign in with your Ethereum account:\n0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n\n\nURI: https://localhost:3000\nVersion: 1\nChain ID: 1\nNonce: d4c595490e15489574ca06494154cbedd156db6629224481221c04f83ac32d9e\nIssued At: 2026-03-17T16:49:38.495Z';
    dto.signature =
      '0x45b04def8150c21468dc656bfa1c25cb029fef8cee4895b371412a6a0e48e9174722873b6f4a070f1f3a6731ac5dd91d02b236465c14859e8793bbfb2b3ad94e1b';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when message is empty', async () => {
    const dto = new VerifyRequestDto();
    dto.message = '';
    dto.signature = '0x123';

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('message');
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should fail when message is missing', async () => {
    const dto = new VerifyRequestDto();
    dto.signature = '0x123';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const messageError = errors.find((e) => e.property === 'message');
    expect(messageError).toBeDefined();
    expect(messageError?.constraints).toHaveProperty('isNotEmpty');
  });

  it('should fail when message is not a string', async () => {
    const dto = new VerifyRequestDto();
    (dto.message as any) = 123;
    dto.signature = '0x123';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const messageError = errors.find((e) => e.property === 'message');
    expect(messageError).toBeDefined();
    expect(messageError?.constraints).toHaveProperty('isString');
  });

  it('should fail when signature is empty', async () => {
    const dto = new VerifyRequestDto();
    dto.message = 'test message';
    dto.signature = '';

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('signature');
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should fail when signature is missing', async () => {
    const dto = new VerifyRequestDto();
    dto.message = 'test message';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const signatureError = errors.find((e) => e.property === 'signature');
    expect(signatureError).toBeDefined();
    expect(signatureError?.constraints).toHaveProperty('isNotEmpty');
  });

  it('should fail when signature is not a string', async () => {
    const dto = new VerifyRequestDto();
    dto.message = 'test message';
    (dto.signature as any) = 456;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const signatureError = errors.find((e) => e.property === 'signature');
    expect(signatureError).toBeDefined();
    expect(signatureError?.constraints).toHaveProperty('isString');
  });

  it('should fail when both fields are missing', async () => {
    const dto = new VerifyRequestDto();

    const errors = await validate(dto);
    expect(errors).toHaveLength(2);
    const properties = errors.map((e) => e.property);
    expect(properties).toContain('message');
    expect(properties).toContain('signature');
  });
});
