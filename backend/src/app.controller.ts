import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './auth/decorators/public.decorator';
import { PrismaService } from './prisma/prisma.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getRoot(): string {
    return 'Dirrir Realtors API is running';
  }

  /**
   * Deployment readiness probe, polled by .github/workflows/deploy.yml after
   * the stack restarts.
   *
   * Public because the deploy runner has no credentials, and it must stay that
   * way for the gate to work -- the global JwtAuthGuard would otherwise answer
   * 401 and the workflow could never distinguish a healthy release from a
   * broken one.
   *
   * Checks the database rather than just returning 200: the container can be
   * listening while Postgres is unreachable or a migration left the schema
   * half-applied, and that release must not be marked complete.
   */
  @Public()
  @Get('health')
  async getHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'unreachable',
        message: error instanceof Error ? error.message : 'Database check failed.',
      });
    }

    return {
      status: 'ok',
      database: 'up',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
