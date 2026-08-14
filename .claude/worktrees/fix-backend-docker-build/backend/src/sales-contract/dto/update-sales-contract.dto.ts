import { PartialType } from '@nestjs/swagger';
import { CreateSalesContractDto } from './create-sales-contract.dto';

export class UpdateSalesContractDto extends PartialType(CreateSalesContractDto) {}
