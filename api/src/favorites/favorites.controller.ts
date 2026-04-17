import { Controller, Get, Post, Delete, Param, UseGuards, Request } from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('favorites')
@UseGuards(AuthGuard('jwt'))
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  async getMyFavorites(@Request() req) {
    return this.favoritesService.getMyFavorites(req.user.userId);
  }

  @Post(':providerId')
  async addFavorite(@Request() req, @Param('providerId') providerId: string) {
    return this.favoritesService.addFavorite(req.user.userId, +providerId);
  }

  @Delete(':providerId')
  async removeFavorite(@Request() req, @Param('providerId') providerId: string) {
    return this.favoritesService.removeFavorite(req.user.userId, +providerId);
  }

  @Get(':providerId/check')
  async checkFavorite(@Request() req, @Param('providerId') providerId: string) {
    const isFavorite = await this.favoritesService.isFavorite(req.user.userId, +providerId);
    return { isFavorite };
  }
}
