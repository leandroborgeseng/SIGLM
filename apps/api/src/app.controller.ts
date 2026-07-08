import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/auth.constants';
import { PrismaService } from './prisma/prisma.service';

@Controller()
@Public()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const users = await this.prisma.user.count();
      return {
        status: 'ok',
        service: 'leis-municipais-api',
        db: 'ok',
        users,
      };
    } catch {
      return {
        status: 'degraded',
        service: 'leis-municipais-api',
        db: 'error',
        users: 0,
      };
    }
  }

  @Get('stats')
  async stats() {
    const [acts, units, users] = await Promise.all([
      this.prisma.normativeAct.count(),
      this.prisma.normativeUnit.count(),
      this.prisma.user.count(),
    ]);
    return { acts, units, users };
  }
}
