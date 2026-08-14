import { Injectable } from '@nestjs/common';
import { AuditActorType, AuditOutcome, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { actionFromMethod } from './audit.redact';

export type AuditQuery = {
  actorId?: string;
  actorType?: AuditActorType;
  resource?: string;
  resourceId?: string;
  action?: string;
  outcome?: AuditOutcome;
  from?: string;
  to?: string;
  search?: string;
  skip?: number;
  take?: number;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Identifies the actor from the authenticated request.
   *
   * Staff and customers authenticate through different strategies and attach
   * differently shaped objects, so distinguish by shape rather than assuming
   * one of them.
   */
  private describeActor(user: any): {
    actorType: AuditActorType;
    actorId?: string;
    actorEmail?: string;
    actorName?: string;
  } {
    if (!user) return { actorType: AuditActorType.ANONYMOUS };

    // Customer portal tokens resolve to a Customer, which has no roles.
    if (user.firstName !== undefined && user.roles === undefined) {
      return {
        actorType: AuditActorType.CUSTOMER,
        actorId: user.id,
        actorEmail: user.email,
        actorName: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
      };
    }

    return {
      actorType: AuditActorType.STAFF,
      actorId: user.id,
      actorEmail: user.email,
      actorName: user.name || undefined,
    };
  }

  async record(entry: {
    request?: any;
    method: string;
    path: string;
    resource: string;
    resourceId?: string;
    body?: unknown;
    statusCode?: number;
    outcome: 'SUCCESS' | 'FAILURE';
    errorMessage?: string;
    ipAddress?: string;
    userAgent?: string;
    durationMs?: number;
  }) {
    const actor = this.describeActor(entry.request?.user);

    await this.prisma.auditLog.create({
      data: {
        ...actor,
        action: actionFromMethod(entry.method),
        resource: entry.resource,
        resourceId: entry.resourceId,
        method: entry.method.toUpperCase(),
        path: entry.path.split('?')[0],
        statusCode: entry.statusCode,
        outcome: entry.outcome as AuditOutcome,
        requestBody: (entry.body ?? undefined) as Prisma.InputJsonValue | undefined,
        errorMessage: entry.errorMessage,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent?.slice(0, 400),
        durationMs: entry.durationMs,
      },
    });
  }

  async findAll(query: AuditQuery) {
    const take = Math.min(query.take ?? 50, 200);
    const skip = query.skip ?? 0;

    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.actorType ? { actorType: query.actorType } : {}),
      ...(query.resource ? { resource: query.resource } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.action ? { action: query.action.toUpperCase() } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              // An end date with no time means "including that whole day".
              ...(query.to ? { lte: new Date(`${query.to.slice(0, 10)}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { actorEmail: { contains: query.search, mode: 'insensitive' } },
              { actorName: { contains: query.search, mode: 'insensitive' } },
              { resource: { contains: query.search, mode: 'insensitive' } },
              { path: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, skip, take };
  }

  findOne(id: string) {
    return this.prisma.auditLog.findUnique({ where: { id } });
  }

  /** Distinct resources actually present, so the UI filter reflects reality. */
  async resources() {
    const rows = await this.prisma.auditLog.findMany({
      distinct: ['resource'],
      select: { resource: true },
      orderBy: { resource: 'asc' },
    });
    return rows.map((row) => row.resource);
  }

  async stats() {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 7);

    const [total, last7Days, failures, byActorType] = await Promise.all([
      this.prisma.auditLog.count(),
      this.prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
      this.prisma.auditLog.count({ where: { outcome: 'FAILURE', createdAt: { gte: since } } }),
      this.prisma.auditLog.groupBy({ by: ['actorType'], _count: { _all: true } }),
    ]);

    return {
      total,
      last7Days,
      failuresLast7Days: failures,
      byActorType: byActorType.map((row) => ({ actorType: row.actorType, count: row._count._all })),
    };
  }
}
