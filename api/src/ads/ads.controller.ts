import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AdsService } from './ads.service';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CreateAdDto } from './dto/create-ad.dto';
import { UpdateAdDto } from './dto/update-ad.dto';

@Controller('ads')
export class AdsController {
  constructor(private readonly adsService: AdsService) {}

  // Público: devuelve solo ads activas dentro de su periodo
  @Get()
  findAll() {
    return this.adsService.findActive();
  }

  // ── Admin ─────────────────────────────────────────────

  @UseGuards(AdminGuard)
  @Get('admin/all')
  findAllAdmin() {
    return this.adsService.findAll();
  }

  @UseGuards(AdminGuard)
  @Post('admin')
  create(@Body() dto: CreateAdDto) {
    return this.adsService.create(dto);
  }

  @UseGuards(AdminGuard)
  @Patch('admin/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAdDto) {
    return this.adsService.update(id, dto);
  }

  @UseGuards(AdminGuard)
  @Delete('admin/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.adsService.remove(id);
  }
}
