import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { AuthGuard } from '@nestjs/passport';
import { GetNearbyDto } from './dto/get-nearby.dto';
import { CreateProviderServiceDto } from './dto/create-service.dto';
import { UpdateProviderServiceDto } from './dto/update-provider-service.dto';
import { UpdateVehicleTypesDto } from './dto/update-vehicle-types.dto';
import { UpdateSpecialtiesDto } from './dto/update-specialties.dto';
import { TrackClickDto } from './dto/track-click.dto';
import { MetricsService } from './metrics.service';
@Controller('providers')
export class ProvidersController {
  constructor(
    private readonly providersService: ProvidersService,
    private readonly metricsService: MetricsService,
  ) { }

  // --- RUTAS ESPECÍFICAS (Siempre van PRIMERO) ---

  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(@Request() req, @Body() createProviderDto: CreateProviderDto) {
    return this.providersService.create(req.user.userId, createProviderDto);
  }



  @UseGuards(AuthGuard('jwt'))
  @Post('vehicle-types') // POST /providers/vehicle-types
  updateVehicleTypes(@Request() req, @Body() dto: UpdateVehicleTypesDto) {
    return this.providersService.updateVehicleTypes(req.user.userId, dto.typeIds);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch() // PATCH /providers (Edita MI taller)
  update(@Request() req, @Body() dto: UpdateProviderDto) {
    return this.providersService.update(req.user.userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete() // DELETE /providers (Cierra MI taller)
  delete(@Request() req) {
    return this.providersService.deleteProvider(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('my-provider')
  findMyProvider(@Request() req) {
    return this.providersService.findOneByUserId(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('my-closed-business')
  findMyClosedBusiness(@Request() req) {
    return this.providersService.findClosedByUserId(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('my-metrics')
  getMyMetrics(
    @Request() req,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.providersService.getMyMetrics(
      req.user.userId,
      month ? +month : undefined,
      year ? +year : undefined,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('my-metrics/history')
  getMyMetricsHistory(@Request() req) {
    return this.providersService.getMyMetricsHistory(req.user.userId);
  }

  @Post(':id/track')
  async trackClick(@Param('id') id: string, @Body() dto: TrackClickDto) {
    const field = `clicks_${dto.type}` as any;
    await this.metricsService.track(+id, field);
    return { ok: true };
  }

  @Get('nearby')
  findNearby(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius?: string, // Radius es opcional
  ) {
    // Conversión explícita y segura a números
    const latitude = Number(lat);
    const longitude = Number(lng);
    const radiusKm = radius ? Number(radius) : 10; // Default 10km si no se especifica

    return this.providersService.findNearby(latitude, longitude, radiusKm);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('visibility') // PATCH /providers/visibility
  toggleVisibility(@Request() req) {
    return this.providersService.toggleVisibility(req.user.userId);
  }

  // --- SUB-RECURSOS: ESPECIALIDADES ---

  // 🆕 Actualizar todas las especialidades en un solo endpoint
  @UseGuards(AuthGuard('jwt'))
  @Post('specialties')
  updateSpecialties(@Request() req, @Body() dto: UpdateSpecialtiesDto) {
    return this.providersService.updateSpecialties(req.user.userId, dto);
  }

  // --- SUB-RECURSOS: SERVICIOS (MENÚ) ---

  @UseGuards(AuthGuard('jwt'))
  @Post('services')
  addService(@Request() req, @Body() dto: CreateProviderServiceDto) {
    return this.providersService.addService(req.user.userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('services')
  getMyServices(@Request() req) {
    return this.providersService.getMyServices(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('services/:id')
  updateService(@Request() req, @Param('id') id: string, @Body() dto: UpdateProviderServiceDto) {
    return this.providersService.updateService(req.user.userId, +id, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('services/:id')
  deleteService(@Request() req, @Param('id') id: string) {
    return this.providersService.deleteService(req.user.userId, +id);
  }

  // --- RUTAS GENÉRICAS (Siempre van AL FINAL) ---

  @Get()
  findAll() {
    return this.providersService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const provider = await this.providersService.findOne(+id);
    // Track profile view asynchronously — no bloqueamos la respuesta
    if (provider) {
      this.metricsService.track(provider.id, 'profile_views').catch(() => null);
    }
    return provider;
  }

  // (Eliminé el método 'remove' genérico para evitar accidentes)
}