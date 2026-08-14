import { PartialType } from '@nestjs/swagger';
import { CreatePaymentReallocationAuditDto } from './create-payment-reallocation-audit.dto';

export class UpdatePaymentReallocationAuditDto extends PartialType(CreatePaymentReallocationAuditDto) {}
