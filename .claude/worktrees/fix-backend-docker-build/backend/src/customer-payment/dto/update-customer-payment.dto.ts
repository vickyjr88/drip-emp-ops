import { PartialType } from '@nestjs/swagger';
import { CreateCustomerPaymentDto } from './create-customer-payment.dto';

export class UpdateCustomerPaymentDto extends PartialType(CreateCustomerPaymentDto) {}
