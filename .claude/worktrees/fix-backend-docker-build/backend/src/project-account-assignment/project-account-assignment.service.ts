import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertProjectAccountAssignmentDto } from './dto/upsert-project-account-assignment.dto';

@Injectable()
export class ProjectAccountAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  findForProject(projectId: string) {
    return this.prisma.projectAccountAssignment.findMany({
      where: { projectId },
      include: { bankAccount: { include: { glAccount: true } } },
      orderBy: { purpose: 'asc' },
    });
  }

  async upsertForProject(projectId: string, dto: UpsertProjectAccountAssignmentDto) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    return this.prisma.projectAccountAssignment.upsert({
      where: { projectId_purpose: { projectId, purpose: dto.purpose } },
      update: { bankAccountId: dto.bankAccountId },
      create: { projectId, purpose: dto.purpose, bankAccountId: dto.bankAccountId },
      include: { bankAccount: { include: { glAccount: true } } },
    });
  }

  async remove(id: string) {
    const assignment = await this.prisma.projectAccountAssignment.findUnique({ where: { id } });
    if (!assignment) {
      throw new NotFoundException(`Assignment ${id} not found`);
    }
    return this.prisma.projectAccountAssignment.delete({ where: { id } });
  }
}
