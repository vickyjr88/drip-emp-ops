import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssignRolePermissionsDto } from './dto/assign-role-permissions.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const ROLE_INCLUDE = Prisma.validator<Prisma.RoleInclude>()({
  permissions: {
    include: {
      permission: true,
    },
  },
});

type RoleRecord = Prisma.RoleGetPayload<{
  include: typeof ROLE_INCLUDE;
}>;

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRoleDto) {
    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        description: dto.description,
        permissions: dto.permissionIds?.length
          ? {
              create: dto.permissionIds.map((permissionId) => ({
                permission: { connect: { id: permissionId } },
              })),
            }
          : undefined,
      },
      include: ROLE_INCLUDE,
    });

    return this.toRoleView(role);
  }

  async findAll() {
    const roles = await this.prisma.role.findMany({
      include: ROLE_INCLUDE,
      orderBy: { name: 'asc' },
    });

    return roles.map((role) => this.toRoleView(role));
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: ROLE_INCLUDE,
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return this.toRoleView(role);
  }

  async update(id: string, dto: UpdateRoleDto) {
    await this.ensureRoleExists(id);

    const role = await this.prisma.role.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        permissions: dto.permissionIds
          ? {
              deleteMany: {},
              create: dto.permissionIds.map((permissionId) => ({
                permission: { connect: { id: permissionId } },
              })),
            }
          : undefined,
      },
      include: ROLE_INCLUDE,
    });

    return this.toRoleView(role);
  }

  async assignPermissions(id: string, dto: AssignRolePermissionsDto) {
    await this.ensureRoleExists(id);
    const permissions = await this.resolvePermissions(dto);

    const role = await this.prisma.role.update({
      where: { id },
      data: {
        permissions: {
          deleteMany: {},
          create: permissions.map((permission) => ({
            permission: { connect: { id: permission.id } },
          })),
        },
      },
      include: ROLE_INCLUDE,
    });

    return this.toRoleView(role);
  }

  async remove(id: string) {
    const role = await this.ensureRoleExists(id);

    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deleted');
    }

    return this.prisma.role.delete({ where: { id } });
  }

  private async resolvePermissions(dto: AssignRolePermissionsDto) {
    const requestedIds = dto.permissionIds ?? [];
    const requestedKeys = dto.permissionKeys ?? [];

    if (!requestedIds.length && !requestedKeys.length) {
      return [];
    }

    const filters: Prisma.PermissionWhereInput[] = [];

    if (requestedIds.length) {
      filters.push({ id: { in: requestedIds } });
    }

    if (requestedKeys.length) {
      filters.push({ key: { in: requestedKeys } });
    }

    const permissions = await this.prisma.permission.findMany({
      where: {
        OR: filters,
      },
    });

    const foundIds = new Set(permissions.map((permission) => permission.id));
    const foundKeys = new Set(permissions.map((permission) => permission.key));
    const missingIds = requestedIds.filter((id) => !foundIds.has(id));
    const missingKeys = requestedKeys.filter((key) => !foundKeys.has(key));

    if (missingIds.length || missingKeys.length) {
      throw new BadRequestException(
        `Unknown permissions: ${[...missingIds, ...missingKeys].join(', ')}`,
      );
    }

    return permissions;
  }

  private async ensureRoleExists(id: string): Promise<Role> {
    const role = await this.prisma.role.findUnique({ where: { id } });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  private toRoleView(role: RoleRecord) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      permissions: role.permissions
        .map(({ permission }) => permission)
        .sort((left, right) => left.key.localeCompare(right.key)),
    };
  }
}