import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateCustomerDocumentDto } from './create-customer-document.dto';

export class UpdateCustomerDocumentDto extends PartialType(
  OmitType(CreateCustomerDocumentDto, ['customerId'] as const),
) {}
