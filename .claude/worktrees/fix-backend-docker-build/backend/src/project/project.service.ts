import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { parseInclude } from '../common/utils/prisma-include.util';

@Injectable()
export class ProjectService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateProjectDto) {
    return this.prisma.project.create({ data: dto });
  }

  findAll(pagination: PaginationDto) {
    const { skip, take, include } = pagination;
    const includeObj = parseInclude(include);
    return this.prisma.project.findMany({ skip, take, include: includeObj });
  }

  findOne(id: string, include?: string) {
    const includeObj = parseInclude(include);
    return this.prisma.project.findUnique({ where: { id }, include: includeObj });
  }

  update(id: string, dto: UpdateProjectDto) {
    return this.prisma.project.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.project.delete({ where: { id } });
  }
}
