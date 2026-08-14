import { PartialType } from '@nestjs/swagger';
import { CreateRentalPaymentDto } from './create-rental-payment.dto';

export class UpdateRentalPaymentDto extends PartialType(CreateRentalPaymentDto) {}
