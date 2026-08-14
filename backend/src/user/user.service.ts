import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export const AUTH_USER_INCLUDE = Prisma.validator<Prisma.UserInclude>()({
  roles: {
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  },
});

type AuthUserRecord = Prisma.UserGetPayload<{
  include: typeof AUTH_USER_INCLUDE;
}>;

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findOneByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findAuthUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: AUTH_USER_INCLUDE,
    });
  }

  async findAuthUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: AUTH_USER_INCLUDE,
    });
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      include: AUTH_USER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return users.map((user) => this.toAuthUser(user));
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(data: Prisma.UserCreateInput, roleIds: string[] = []) {
    return this.prisma.user.create({
      data: {
        ...data,
        roles: roleIds.length
          ? {
              create: roleIds.map((roleId) => ({
                role: { connect: { id: roleId } },
              })),
            }
          : undefined,
      },
      include: AUTH_USER_INCLUDE,
    });
  }

  async createManagedUser(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.findOneByEmail(email);
    if (existing) {
      throw new BadRequestException('A user with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const roleIds = dto.roleIds || [];
    const firstRole = roleIds[0]
      ? await this.prisma.role.findUnique({ where: { id: roleIds[0] } })
      : null;

    const user = await this.create(
      {
        email,
        name: dto.name.trim(),
        password: hashedPassword,
        role: firstRole?.name ?? null,
      },
      roleIds,
    );

    return this.toAuthUser(user);
  }

  async updateManagedUser(id: string, dto: UpdateUserDto) {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    if (dto.email) {
      const email = dto.email.trim().toLowerCase();
      const conflict = await this.prisma.user.findFirst({
        where: { email, NOT: { id } },
      });
      if (conflict) {
        throw new BadRequestException('A user with this email already exists');
      }
    }

    const roleIds = dto.roleIds;
    let roleName: string | null | undefined = undefined;
    if (roleIds) {
      const firstRole = roleIds[0]
        ? await this.prisma.role.findUnique({ where: { id: roleIds[0] } })
        : null;
      roleName = firstRole?.name ?? null;
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.email ? { email: dto.email.trim().toLowerCase() } : {}),
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(roleName !== undefined ? { role: roleName } : {}),
        ...(roleIds
          ? {
              roles: {
                deleteMany: {},
                create: roleIds.map((roleId) => ({
                  role: { connect: { id: roleId } },
                })),
              },
            }
          : {}),
      },
      include: AUTH_USER_INCLUDE,
    });

    return this.toAuthUser(user);
  }

  async resetPassword(id: string, password: string) {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    return { id, message: 'Password reset successfully' };
  }

  async remove(id: string) {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.delete({ where: { id } });
    return { id, message: 'User deleted' };
  }

  async assignRoles(id: string, roleIds: string[]) {
    const firstRole = roleIds[0]
      ? await this.prisma.role.findUnique({ where: { id: roleIds[0] } })
      : null;

    return this.prisma.user.update({
      where: { id },
      data: {
        role: firstRole?.name ?? null,
        roles: {
          deleteMany: {},
          create: roleIds.map((roleId) => ({
            role: { connect: { id: roleId } },
          })),
        },
      },
      include: AUTH_USER_INCLUDE,
    });
  }

  toAuthUser(user: AuthUserRecord) {
    const { password, roles: assignedRoles, ...safeUser } = user;
    const permissions = new Set<string>();

    const roles = assignedRoles.map(({ role }) => {
      const rolePermissions = role.permissions.map(({ permission }) => permission.key);
      for (const permission of rolePermissions) {
        permissions.add(permission);
      }

      return {
        id: role.id,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissions: rolePermissions.sort(),
      };
    });

    return {
      ...safeUser,
      roles,
      permissions: [...permissions].sort(),
    };
  }
}
