import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectBlockDto } from './dto/create-project-block.dto';
import { UpdateProjectBlockDto } from './dto/update-project-block.dto';

@Injectable()
export class ProjectBlockService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateProjectBlockDto) {
    return this.prisma.projectBlock.create({ data: dto });
  }

  findAll() {
    return this.prisma.projectBlock.findMany();
  }

  findOne(id: string) {
    return this.prisma.projectBlock.findUnique({ where: { id } });
  }

  update(id: string, dto: UpdateProjectBlockDto) {
    return this.prisma.projectBlock.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.projectBlock.delete({ where: { id } });
  }
}
