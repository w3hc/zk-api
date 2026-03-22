import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { StoreRequestDto } from './store-request.dto';

describe('StoreRequestDto', () => {
  const createValidPayload = () => {
    const ciphertextBytes = Buffer.alloc(1600);
    const publicKeyBytes = Buffer.alloc(1568);

    return {
      recipients: [
        {
          publicKey: publicKeyBytes.toString('base64'),
          ciphertext: ciphertextBytes.toString('base64'),
        },
      ],
      encryptedData: Buffer.from('encrypted-data').toString('base64'),
      iv: Buffer.from('iv-12-bytes-').toString('base64'),
      authTag: Buffer.from('auth-tag-16bytes').toString('base64'),
    };
  };

  it('should validate a valid StoreRequestDto', async () => {
    const dto = plainToClass(StoreRequestDto, {
      secret: createValidPayload(),
      publicAddresses: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should validate with multiple recipients', async () => {
    const payload = createValidPayload();
    payload.recipients.push({
      publicKey: Buffer.alloc(1568).toString('base64'),
      ciphertext: Buffer.alloc(1600).toString('base64'),
    });

    const dto = plainToClass(StoreRequestDto, {
      secret: payload,
      publicAddresses: [
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      ],
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when secret is missing', async () => {
    const dto = plainToClass(StoreRequestDto, {
      publicAddresses: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const secretError = errors.find((e) => e.property === 'secret');
    expect(secretError).toBeDefined();
  });

  it('should fail when publicAddresses is missing', async () => {
    const dto = plainToClass(StoreRequestDto, {
      secret: createValidPayload(),
    });

    const validationErrors = await validate(dto);
    expect(validationErrors.length).toBeGreaterThan(0);
    const addressError = validationErrors.find(
      (e) => e.property === 'publicAddresses',
    );
    expect(addressError).toBeDefined();
  });

  it('should fail when publicAddresses is empty array', async () => {
    const dto = plainToClass(StoreRequestDto, {
      secret: createValidPayload(),
      publicAddresses: [],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const addressError = errors.find((e) => e.property === 'publicAddresses');
    expect(addressError).toBeDefined();
    expect(addressError?.constraints).toHaveProperty('arrayMinSize');
  });

  it('should fail when publicAddresses contains non-string', async () => {
    const dto = plainToClass(StoreRequestDto, {
      secret: createValidPayload(),
      publicAddresses: [123, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when recipients is empty', async () => {
    const invalidPayload = {
      recipients: [],
      encryptedData: Buffer.from('encrypted-data').toString('base64'),
      iv: Buffer.from('iv-12-bytes-').toString('base64'),
      authTag: Buffer.from('auth-tag-16bytes').toString('base64'),
    };

    const dto = plainToClass(StoreRequestDto, {
      secret: invalidPayload,
      publicAddresses: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when recipient publicKey is missing', async () => {
    const invalidPayload = {
      recipients: [
        {
          ciphertext: Buffer.alloc(1600).toString('base64'),
        },
      ],
      encryptedData: Buffer.from('encrypted-data').toString('base64'),
      iv: Buffer.from('iv-12-bytes-').toString('base64'),
      authTag: Buffer.from('auth-tag-16bytes').toString('base64'),
    };

    const dto = plainToClass(StoreRequestDto, {
      secret: invalidPayload,
      publicAddresses: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when recipient ciphertext is missing', async () => {
    const invalidPayload = {
      recipients: [
        {
          publicKey: Buffer.alloc(1568).toString('base64'),
        },
      ],
      encryptedData: Buffer.from('encrypted-data').toString('base64'),
      iv: Buffer.from('iv-12-bytes-').toString('base64'),
      authTag: Buffer.from('auth-tag-16bytes').toString('base64'),
    };

    const dto = plainToClass(StoreRequestDto, {
      secret: invalidPayload,
      publicAddresses: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when encryptedData is missing', async () => {
    const invalidPayload = {
      recipients: [
        {
          publicKey: Buffer.alloc(1568).toString('base64'),
          ciphertext: Buffer.alloc(1600).toString('base64'),
        },
      ],
      iv: Buffer.from('iv-12-bytes-').toString('base64'),
      authTag: Buffer.from('auth-tag-16bytes').toString('base64'),
    };

    const dto = plainToClass(StoreRequestDto, {
      secret: invalidPayload,
      publicAddresses: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when iv is missing', async () => {
    const invalidPayload = {
      recipients: [
        {
          publicKey: Buffer.alloc(1568).toString('base64'),
          ciphertext: Buffer.alloc(1600).toString('base64'),
        },
      ],
      encryptedData: Buffer.from('encrypted-data').toString('base64'),
      authTag: Buffer.from('auth-tag-16bytes').toString('base64'),
    };

    const dto = plainToClass(StoreRequestDto, {
      secret: invalidPayload,
      publicAddresses: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when authTag is missing', async () => {
    const invalidPayload = {
      recipients: [
        {
          publicKey: Buffer.alloc(1568).toString('base64'),
          ciphertext: Buffer.alloc(1600).toString('base64'),
        },
      ],
      encryptedData: Buffer.from('encrypted-data').toString('base64'),
      iv: Buffer.from('iv-12-bytes-').toString('base64'),
    };

    const dto = plainToClass(StoreRequestDto, {
      secret: invalidPayload,
      publicAddresses: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when recipient publicKey is empty', async () => {
    const invalidPayload = {
      recipients: [
        {
          publicKey: '',
          ciphertext: Buffer.alloc(1600).toString('base64'),
        },
      ],
      encryptedData: Buffer.from('encrypted-data').toString('base64'),
      iv: Buffer.from('iv-12-bytes-').toString('base64'),
      authTag: Buffer.from('auth-tag-16bytes').toString('base64'),
    };

    const dto = plainToClass(StoreRequestDto, {
      secret: invalidPayload,
      publicAddresses: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when recipient ciphertext is empty', async () => {
    const invalidPayload = {
      recipients: [
        {
          publicKey: Buffer.alloc(1568).toString('base64'),
          ciphertext: '',
        },
      ],
      encryptedData: Buffer.from('encrypted-data').toString('base64'),
      iv: Buffer.from('iv-12-bytes-').toString('base64'),
      authTag: Buffer.from('auth-tag-16bytes').toString('base64'),
    };

    const dto = plainToClass(StoreRequestDto, {
      secret: invalidPayload,
      publicAddresses: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
