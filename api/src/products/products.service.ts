import {
    Injectable,
    Logger,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProviderProduct } from './entities/provider-product.entity';
import { ProductCategory } from './entities/product-category.entity';
import { Provider } from '../providers/entities/provider.entity';

@Injectable()
export class ProductsService {
    private readonly logger = new Logger(ProductsService.name);
    private readonly MAX_PRODUCTS_FREE = 10;

    constructor(
        @InjectRepository(ProviderProduct)
        private productsRepo: Repository<ProviderProduct>,
        @InjectRepository(ProductCategory)
        private categoriesRepo: Repository<ProductCategory>,
        @InjectRepository(Provider)
        private providersRepo: Repository<Provider>,
    ) {}

    // ─── Categorías ────────────────────────────────────

    async getCategories(): Promise<ProductCategory[]> {
        return this.categoriesRepo.find({
            where: { isActive: true },
            order: { displayOrder: 'ASC', name: 'ASC' },
        });
    }

    // ─── CRUD de productos ─────────────────────────────

    async getProductsByProvider(providerId: number): Promise<ProviderProduct[]> {
        const provider = await this.providersRepo.findOne({ where: { id: providerId } });
        const products = await this.productsRepo.find({
            where: { providerId, isActive: true, isVisible: true },
            relations: ['category', 'vehicleType'],
            order: { createdAt: 'DESC' },
        });

        // Soft-limit: no-premium solo muestra los primeros 10
        if (provider && !provider.isPremium && products.length > this.MAX_PRODUCTS_FREE) {
            return products.slice(0, this.MAX_PRODUCTS_FREE);
        }
        return products;
    }

    async getMyProducts(providerId: number): Promise<ProviderProduct[]> {
        return this.productsRepo.find({
            where: { providerId },
            relations: ['category', 'vehicleType'],
            order: { createdAt: 'DESC' },
        });
    }

    async createProduct(
        providerId: number,
        data: Partial<ProviderProduct>,
    ): Promise<ProviderProduct> {
        // Límite de productos para no-premium
        const provider = await this.providersRepo.findOne({ where: { id: providerId } });
        if (provider && !provider.isPremium) {
            const count = await this.productsRepo.count({ where: { providerId } });
            if (count >= this.MAX_PRODUCTS_FREE) {
                throw new BadRequestException(
                    `Has alcanzado tu límite de ${this.MAX_PRODUCTS_FREE} productos. ¡Pásate a Premium para agregar productos sin límites!`,
                );
            }
        }

        const product = this.productsRepo.create({
            ...data,
            providerId,
        });
        const saved = await this.productsRepo.save(product);
        this.logger.log(`Producto creado: ${saved.name} (provider: ${providerId})`);
        return this.productsRepo.findOne({
            where: { id: saved.id },
            relations: ['category', 'vehicleType'],
        });
    }

    async updateProduct(
        productId: number,
        providerId: number,
        data: Partial<ProviderProduct>,
    ): Promise<ProviderProduct> {
        const product = await this.productsRepo.findOne({
            where: { id: productId },
        });

        if (!product) {
            throw new NotFoundException('Producto no encontrado.');
        }

        if (product.providerId !== providerId) {
            throw new ForbiddenException('No puedes editar este producto.');
        }

        Object.assign(product, data);
        await this.productsRepo.save(product);

        return this.productsRepo.findOne({
            where: { id: productId },
            relations: ['category', 'vehicleType'],
        });
    }

    async deleteProduct(productId: number, providerId: number): Promise<void> {
        const product = await this.productsRepo.findOne({
            where: { id: productId },
        });

        if (!product) {
            throw new NotFoundException('Producto no encontrado.');
        }

        if (product.providerId !== providerId) {
            throw new ForbiddenException('No puedes eliminar este producto.');
        }

        await this.productsRepo.remove(product);
        this.logger.log(`Producto eliminado: ${product.name} (id: ${productId})`);
    }

    // ─── Búsqueda pública ──────────────────────────────

    async searchProducts(params: {
        query?: string;
        categoryId?: number;
        vehicleTypeId?: number;
        condition?: string;
        lat?: number;
        lng?: number;
        radiusKm?: number;
    }): Promise<any[]> {
        const qb = this.productsRepo
            .createQueryBuilder('p')
            .leftJoinAndSelect('p.category', 'cat')
            .leftJoinAndSelect('p.vehicleType', 'vt')
            .innerJoin('p.provider', 'prov')
            .addSelect(['prov.id', 'prov.businessName', 'prov.logoUrl', 'prov.lat', 'prov.lng', 'prov.address', 'prov.isPremium'])
            .where('p.is_active = :active', { active: true })
            .andWhere('p.is_visible = :pVisible', { pVisible: true })
            .andWhere('prov.is_visible = :visible', { visible: true });

        if (params.query) {
            qb.andWhere('(p.name LIKE :q OR p.brand LIKE :q OR p.part_number LIKE :q)', {
                q: `%${params.query}%`,
            });
        }

        if (params.categoryId) {
            qb.andWhere('p.category_id = :catId', { catId: params.categoryId });
        }

        if (params.vehicleTypeId) {
            qb.andWhere('p.vehicle_type_id = :vtId', { vtId: params.vehicleTypeId });
        }

        if (params.condition) {
            qb.andWhere('p.condition = :cond', { cond: params.condition });
        }

        // Ordenar: Premium primero, luego por fecha
        qb.orderBy('prov.is_premium', 'DESC')
            .addOrderBy('p.created_at', 'DESC')
            .limit(50);

        return qb.getMany();
    }
}
