import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountPurpose } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_ACCOUNT_CODES } from './default-accounts';

@Injectable()
export class AccountResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves which BankAccount cash should post through for a given purpose.
   * Priority: explicit account (if the caller already knows it) > the
   * project's assignment for this purpose > the legacy single Cash and
   * Bank account, so older data and un-configured projects keep working.
   */
  async resolveBankAccount(purpose: AccountPurpose, projectId?: string | null, explicitAccountId?: string | null) {
    if (explicitAccountId) {
      return this.getBankAccount(explicitAccountId);
    }

    if (projectId) {
      const projectAssignment = await this.prisma.projectAccountAssignment.findUnique({
        where: { projectId_purpose: { projectId, purpose } },
        include: { bankAccount: { include: { glAccount: true } } },
      });
      if (projectAssignment) {
        return projectAssignment.bankAccount;
      }
    }

    const fallback = await this.prisma.bankAccount.findFirst({
      where: { glAccount: { code: DEFAULT_ACCOUNT_CODES.CASH_AND_BANK } },
      include: { glAccount: true },
    });
    if (fallback) {
      return fallback;
    }

    throw new NotFoundException(
      'No bank account could be resolved. Assign a bank account for this purpose or configure the default Cash and Bank account.',
    );
  }

  async getBankAccount(id: string) {
    const account = await this.prisma.bankAccount.findUnique({ where: { id }, include: { glAccount: true } });
    if (!account) {
      throw new NotFoundException(`Bank account ${id} not found`);
    }
    return account;
  }
}
