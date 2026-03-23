import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

/**
 * Main application controller.
 * Handles root-level endpoints.
 */
@ApiTags('App')
@Controller()
export class AppController {}
