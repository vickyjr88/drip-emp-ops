import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PublicListingsService } from './public-listings.service';

@ApiTags('public-listings')
@Public()
@Controller('public/listings')
export class PublicListingsController {
  constructor(private readonly publicListingsService: PublicListingsService) {}

  @Get()
  findAll() {
    return this.publicListingsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.publicListingsService.findOne(id);
  }
}
