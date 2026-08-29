import { Module } from '@nestjs/common';
import { StoreModule } from './store/store.module';
import { ProductCategoryModule } from './product-category/product-category.module';
import { ProductModule } from './product/product.module';
import { InventoryModule } from './inventory/inventory.module';
import { OrderModule } from './order/order.module';
import { ResellerModule } from './reseller/reseller.module';
import { ConsignmentModule } from './consignment/consignment.module';
import { SalesPostingModule } from './sales-posting/sales-posting.module';
import { StorefrontModule } from './storefront/storefront.module';
import { OfferModule } from './offer/offer.module';
import { PaystackModule } from './paystack/paystack.module';
import { CheckoutModule } from './checkout/checkout.module';
import { CartLeadModule } from './cart-lead/cart-lead.module';
import { InquiryModule } from './inquiry/inquiry.module';
import { ResellerApplicationModule } from './reseller-application/reseller-application.module';
import { PrismaModule } from './prisma/prisma.module';
import { AppController } from './app.controller';

import { CustomerModule } from './customer/customer.module';
import { CustomerPortalModule } from './customer-portal/customer-portal.module';
import { DataImportModule } from './data-import/data-import.module';
import { HrModule } from './hr/hr.module';
import { PayrollModule } from './payroll/payroll.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { AuditModule } from './audit/audit.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuditExceptionFilter } from './audit/audit-exception.filter';
import { RoleModule } from './role/role.module';
import { PermissionModule } from './permission/permission.module';
import { MediaModule } from './media/media.module';
import { CustomerDocumentModule } from './customer-document/customer-document.module';
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
import { CommissionModule } from './commission/commission.module';
import { ResellerPayoutModule } from './reseller-payout/reseller-payout.module';
import { SupplierStatementReconciliationModule } from './supplier-statement-reconciliation/supplier-statement-reconciliation.module';
import { PettyCashBoxModule } from './petty-cash-box/petty-cash-box.module';
import { PettyCashVoucherModule } from './petty-cash-voucher/petty-cash-voucher.module';
import { PettyCashReconciliationModule } from './petty-cash-reconciliation/petty-cash-reconciliation.module';
import { FixedAssetModule } from './fixed-asset/fixed-asset.module';
import { AssetTransferModule } from './asset-transfer/asset-transfer.module';
import { FinancialReportsModule } from './financial-reports/financial-reports.module';
import { PageContentModule } from './page-content/page-content.module';
import { ReminderModule } from './reminders/reminder.module';
import { AccountTransferModule } from './account-transfer/account-transfer.module';
import { TaxRateModule } from './tax-rate/tax-rate.module';
import { TaxRemittanceModule } from './tax-remittance/tax-remittance.module';
import { PdfModule } from './pdf/pdf.module';

@Module({
  imports: [
    StoreModule,
    ProductCategoryModule,
    ProductModule,
    InventoryModule,
    OrderModule,
    ResellerModule,
    ConsignmentModule,
    SalesPostingModule,
    StorefrontModule,
    OfferModule,
    PaystackModule,
    CheckoutModule,
    CartLeadModule,
    InquiryModule,
    ResellerApplicationModule,
    PrismaModule,
    CustomerModule,
    CustomerPortalModule,
    DataImportModule,
    HrModule,
    PayrollModule,
    CustomerDocumentModule,
    AuthModule,
    UserModule,
    RoleModule,
    PermissionModule,
    MediaModule,
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
    CommissionModule,
    ResellerPayoutModule,
    SupplierStatementReconciliationModule,
    PettyCashBoxModule,
    PettyCashVoucherModule,
    PettyCashReconciliationModule,
    FixedAssetModule,
    AssetTransferModule,
    FinancialReportsModule,
    PageContentModule,
    ReminderModule,
    AccountTransferModule,
    TaxRateModule,
    TaxRemittanceModule,
    PdfModule,
    AuditModule,
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
    {
      // Runs after the guards, so request.user is populated.
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    {
      // Guards run before interceptors, so requests they reject never reach
      // AuditInterceptor. This catches those 401s and 403s.
      provide: APP_FILTER,
      useClass: AuditExceptionFilter,
    },
  ],
})
export class AppModule {}
