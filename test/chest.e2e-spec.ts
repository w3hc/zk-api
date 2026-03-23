import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Chest Endpoints (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.KMS_URL = 'http://localhost:3001';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  }, 10000);

  it('should initialize the app', () => {
    expect(app).toBeDefined();
  });
});
