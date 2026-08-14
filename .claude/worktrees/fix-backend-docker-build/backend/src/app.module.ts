import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AppController } from './app.controller';
import { SalesContractModule } from './sales-contract/sales-contract.module';
import { CustomerPaymentModule } from './customer-payment/customer-payment.module';
import { PaymentReallocationAuditModule } from './payment-reallocation-audit/payment-reallocation-audit.module';

import { CustomerModule } from './customer/customer.module';
import { ProjectModule } from './project/project.module';
import { ProjectBlockModule } from './project-block/project-block.module';
import { UnitModule } from './unit/unit.module';
import { UnitOwnershipModule } from './unit-ownership/unit-ownership.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { RoleModule } from './role/role.module';
import { PermissionModule } from './permission/permission.module';
import { MediaModule } from './media/media.module';
import { OwnershipChangeAuditModule } from './ownership-change-audit/ownership-change-audit.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { RentalPaymentModule } from './rental-payment/rental-payment.module';
import { CustomerDocumentModule } from './customer-document/customer-document.module';
import { ConstructionStatusModule } from './construction-status/construction-status.module';
import { ConstructionStageLogModule } from './construction-stage-log/construction-stage-log.module';
import { SitePhotoModule } from './site-photo/site-photo.module';
import { SiteInspectionModule } from './site-inspection/site-inspection.module';
import { ChartOfAccountModule } from './chart-of-account/chart-of-account.module';
import { LedgerModule } from './ledger/ledger.module';
import { BankAccountModule } from './bank-account/bank-account.module';
import { BankReconciliationModule } from './bank-reconciliation/bank-reconciliation.module';
import { EmailLogModule } from './email-log/email-log.module';
import { InvoiceModule } from './invoice/invoice.module';
import { ReceiptModule } from './receipt/receipt.module';
import { RefundModule } from './refund/refund.module';
import { SupplierModule } from './supplier/supplier.module';
import { SupplierInvoiceModule } from './supplier-invoice/supplier-invoice.module';
import { SupplierPaymentModule } from './supplier-payment/supplier-payment.module';
import { SupplierStatementReconciliationModule } from './supplier-statement-reconciliation/supplier-statement-reconciliation.module';
import { PettyCashBoxModule } from './petty-cash-box/petty-cash-box.module';
import { PettyCashVoucherModule } from './petty-cash-voucher/petty-cash-voucher.module';
import { PettyCashReconciliationModule } from './petty-cash-reconciliation/petty-cash-reconciliation.module';
import { FixedAssetModule } from './fixed-asset/fixed-asset.module';
import { AssetTransferModule } from './asset-transfer/asset-transfer.module';
import { UnitTransferModule } from './unit-transfer/unit-transfer.module';
import { AmenityModule } from './amenity/amenity.module';
import { PublicListingsModule } from './public-listings/public-listings.module';
import { FinancialReportsModule } from './financial-reports/financial-reports.module';
import { ProjectAccountAssignmentModule } from './project-account-assignment/project-account-assignment.module';
import { AccountTransferModule } from './account-transfer/account-transfer.module';
import { TaxRateModule } from './tax-rate/tax-rate.module';
import { TaxRemittanceModule } from './tax-remittance/tax-remittance.module';
import { PdfModule } from './pdf/pdf.module';

@Module({
  imports: [
    PrismaModule, 
    SalesContractModule, 
    CustomerPaymentModule, 
    PaymentReallocationAuditModule,
    CustomerModule,
    CustomerDocumentModule,
    ProjectModule,
    ProjectBlockModule,
    UnitModule,
    UnitOwnershipModule,
    OwnershipChangeAuditModule,
    TenancyModule,
    RentalPaymentModule,
    AuthModule,
    UserModule,
    RoleModule,
    PermissionModule,
    MediaModule,
    ConstructionStatusModule,
    ConstructionStageLogModule,
    SitePhotoModule,
    SiteInspectionModule,
    ChartOfAccountModule,
    LedgerModule,
    BankAccountModule,
    BankReconciliationModule,
    EmailLogModule,
    InvoiceModule,
    ReceiptModule,
    RefundModule,
    SupplierModule,
    SupplierInvoiceModule,
    SupplierPaymentModule,
    SupplierStatementReconciliationModule,
    PettyCashBoxModule,
    PettyCashVoucherModule,
    PettyCashReconciliationModule,
    FixedAssetModule,
    AssetTransferModule,
    UnitTransferModule,
    AmenityModule,
    PublicListingsModule,
    FinancialReportsModule,
    ProjectAccountAssignmentModule,
    AccountTransferModule,
    TaxRateModule,
    TaxRemittanceModule,
    PdfModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
