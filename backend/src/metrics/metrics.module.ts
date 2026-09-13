import { Module } from '@nestjs/common';
import { MetricResolver } from './interface/metric.resolver';
import { MetricService } from './application/metric.service';
import { PrismaService } from './infrastructure/prisma.service';

@Module({
  providers: [MetricResolver, MetricService, PrismaService],
  exports: [PrismaService],
})
export class MetricsModule {}
