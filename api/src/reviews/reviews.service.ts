import { Injectable, BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './entities/review.entity';
import { Order } from '../orders/entities/order.entity';
import { Provider } from '../providers/entities/provider.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private reviewsRepository: Repository<Review>,
    @InjectRepository(Order) private ordersRepository: Repository<Order>,
    @InjectRepository(Provider) private providersRepository: Repository<Provider>,
    @InjectRepository(User) private usersRepo: Repository<User>,
  ) { }

  // 1. EL USUARIO CALIFICA
  async create(userId: number, dto: CreateReviewDto) {
    // PASO 1: Buscar la orden con relaciones necesarias
    const order = await this.ordersRepository.findOne({ 
      where: { id: dto.orderId },
      relations: ['client', 'provider']
    });
    
    if (!order) {
      throw new NotFoundException('La orden no fue encontrada');
    }

    // PASO 2: Verificar que la orden pertenezca al cliente autenticado
    if (order.clientId !== userId) {
      throw new ForbiddenException('Solo el cliente de esta orden puede calificarla');
    }

    // PASO 3: Verificar que la orden esté completada
    if (order.status !== 'completed') {
      throw new BadRequestException('La orden debe estar completada para poder calificarla');
    }

    // PASO 4: Verificar si ya existe una review para esta orden
    const existingReview = await this.reviewsRepository.findOne({ 
      where: { orderId: dto.orderId } 
    });
    
    if (existingReview) {
      throw new ConflictException('Ya calificaste este servicio');
    }

    // PASO 5: Calcular el rating overall (promedio)
    let sum = dto.ratingQuality;
    let count = 1;

    if (dto.ratingComm) { sum += dto.ratingComm; count++; }
    if (dto.ratingPrice) { sum += dto.ratingPrice; count++; }
    if (dto.ratingSpeed) { sum += dto.ratingSpeed; count++; }

    const calculatedOverall = parseFloat((sum / count).toFixed(1));

    // PASO 6: Crear la review con relaciones explícitas
    const review = this.reviewsRepository.create({
      // Relaciones usando objetos (más robusto)
      order: { id: order.id },
      author: { id: userId },
      provider: { id: order.providerId },
      // IDs explícitos (para compatibilidad)
      orderId: order.id,
      authorId: userId,
      providerId: order.providerId,
      // Calificaciones
      ratingQuality: dto.ratingQuality,
      ratingComm: dto.ratingComm,
      ratingPrice: dto.ratingPrice,
      ratingSpeed: dto.ratingSpeed,
      ratingOverall: calculatedOverall,
      comment: dto.comment
    });

    // PASO 7: Guardar la review
    const savedReview = await this.reviewsRepository.save(review);

    // PASO 8: Actualizar el promedio del proveedor
    await this.updateProviderRating(order.providerId);

    return savedReview;
  }

  // 2. EL TALLER RESPONDE
  async reply(id: number, userId: number, dto: ReplyReviewDto) {

    // 1. Buscar review con provider
    const review = await this.reviewsRepository.findOne({
      where: { id },
      relations: ['provider'] // 👈 Asegurar que cargamos 'provider'
    });

    if (!review) {
      throw new NotFoundException('Reseña no encontrada');
    }
    
    if (review.provider) {
    } else {
    }

    // 2. SEGURIDAD: Verificar que el usuario sea el dueño del provider o provider_admin
    let hasPermission = false;
    if (review.provider.userId === userId) {
      // Es el dueño
      hasPermission = true;
    } else {
      // Verificar si es provider_admin vinculado a este provider
      const user = await this.usersRepo.findOne({ where: { id: userId } });
      if (user && user.role === 'provider_admin' && user.providerId === review.provider.id) {
        hasPermission = true;
      }
    }
    if (!hasPermission) {
      throw new ForbiddenException('No tienes permiso para responder esta reseña');
    }


    // 3. Verificar que no haya respondido antes
    if (review.providerReply) {
      throw new ConflictException('Ya respondiste a esta reseña');
    }


    // 4. Guardar
    review.providerReply = dto.response;
    
    const saved = await this.reviewsRepository.save(review);
    
    return saved;
  }

  // 3. BUSCAR TODAS (O FILTRAR POR QUERY PARAM)
  async findAll(providerId?: number) {
    const whereOptions = providerId ? { provider: { id: providerId } } : {};

    return this.reviewsRepository.find({
      where: whereOptions,
      relations: ['author'],
      order: { createdAt: 'DESC' },
    });
  }

  // 4. BUSCAR POR PROVEEDOR (PARA EL PERFIL PÚBLICO)
  async findAllByProvider(providerId: number) {
    return this.reviewsRepository.find({
      where: { provider: { id: providerId } },
      relations: ['author'],
      order: { createdAt: 'DESC' }
    });
  }

  // --- MÉTODO PRIVADO: RE-CALCULAR PROMEDIO ---
  private async updateProviderRating(providerId: number) {
    const result = await this.reviewsRepository
      .createQueryBuilder('review')
      .select('AVG(review.ratingOverall)', 'average')
      .where('review.providerId = :providerId', { providerId })
      .getRawOne();

    const newAverage = result && result.average ? parseFloat(result.average).toFixed(1) : 0;

    await this.providersRepository.update(providerId, {
      ratingAvg: Number(newAverage)
    });
  }
}