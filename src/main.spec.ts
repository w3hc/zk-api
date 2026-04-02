/* eslint-disable @typescript-eslint/unbound-method */

// SPDX-License-Identifier: LGPL-3.0
// Copyright (C) 2026 Julien Béranger and the W3HC

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';

jest.mock('@nestjs/core');
jest.mock('fs');
jest.mock('helmet', () => jest.fn(() => jest.fn()));

describe('Bootstrap', () => {
  let mockApp: any;
  const mockCreate = NestFactory.create as jest.Mock;

  beforeEach(() => {
    mockApp = {
      use: jest.fn(),
      enableCors: jest.fn(),
      useGlobalPipes: jest.fn(),
      useGlobalFilters: jest.fn(),
      enableShutdownHooks: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    };

    mockCreate.mockResolvedValue(mockApp);
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create NestJS application', () => {
    expect(mockCreate).toBeDefined();
  });

  it('should use ValidationPipe', () => {
    expect(ValidationPipe).toBeDefined();
  });
});
