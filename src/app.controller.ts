import { Controller, Post, HttpCode, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { SiweGuard } from './auth/siwe.guard';

/**
 * Main application controller.
 * Handles root-level endpoints.
 */
@ApiTags('App')
@Controller()
export class AppController {
  @Post('hello')
  @HttpCode(200)
  @UseGuards(SiweGuard)
  @ApiOperation({
    summary: 'Protected endpoint requiring SIWE authentication',
    description:
      'Returns a greeting with the authenticated Ethereum address. ' +
      'Requires SIWE authentication via headers.',
  })
  @ApiHeader({
    name: 'x-siwe-message',
    description: 'The SIWE message string (base64 encoded)',
    required: true,
  })
  @ApiHeader({
    name: 'x-siwe-signature',
    description: 'The signature hex string',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        address: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing SIWE authentication',
  })
  hello(@Request() req: { user: { address: string } }): {
    message: string;
    address: string;
  } {
    return {
      message: 'Hello, authenticated user!',
      address: req.user.address,
    };
  }
}
