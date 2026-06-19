import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/auth.constants';
import { PrismaService } from './prisma/prisma.service';

@Controller()
@Public()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'leis-municipais-api' };
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
