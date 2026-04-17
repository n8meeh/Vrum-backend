import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserFavoriteProvider } from './entities/favorite.entity';
import { Provider } from '../providers/entities/provider.entity';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(UserFavoriteProvider)
    private favoritesRepo: Repository<UserFavoriteProvider>,
    @InjectRepository(Provider)
    private providersRepo: Repository<Provider>,
  ) {}

  /**
   * Agrega un negocio a favoritos
   */
  async addFavorite(userId: number, providerId: number) {
    // 1. Verificar que el negocio exista
    const provider = await this.providersRepo.findOne({ where: { id: providerId } });
    if (!provider) {
      throw new NotFoundException('El negocio no existe');
    }

    // 2. Verificar si ya es favorito
    const existing = await this.favoritesRepo.findOne({
      where: { userId, providerId },
    });

    if (existing) {
      return { message: 'El negocio ya está en tus favoritos', alreadyFavorite: true };
    }

    // 3. Crear favorito
    const favorite = this.favoritesRepo.create({ userId, providerId });
    await this.favoritesRepo.save(favorite);

    return { message: 'Negocio añadido a favoritos', alreadyFavorite: false };
  }

  /**
   * Quita un negocio de favoritos
   */
  async removeFavorite(userId: number, providerId: number) {
    const favorite = await this.favoritesRepo.findOne({
      where: { userId, providerId },
    });

    if (!favorite) {
      throw new NotFoundException('El negocio no está en tus favoritos');
    }

    await this.favoritesRepo.remove(favorite);
    return { message: 'Negocio eliminado de favoritos' };
  }

  /**
   * Lista todos los negocios favoritos de un usuario
   */
  async getMyFavorites(userId: number) {
    return this.favoritesRepo.find({
      where: { userId },
      relations: ['provider', 'provider.specialties', 'provider.specialties.category'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Verifica si un negocio específico es favorito de un usuario
   */
  async isFavorite(userId: number, providerId: number): Promise<boolean> {
    const count = await this.favoritesRepo.count({
      where: { userId, providerId },
    });
    return count > 0;
  }
}
