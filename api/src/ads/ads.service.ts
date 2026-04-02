import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, IsNull, Or, MoreThanOrEqual, Repository } from 'typeorm';
import { NativeAd } from './entities/native-ad.entity';
import { CreateAdDto } from './dto/create-ad.dto';
import { UpdateAdDto } from './dto/update-ad.dto';

@Injectable()
export class AdsService {
  constructor(
    @InjectRepository(NativeAd) private adsRepository: Repository<NativeAd>,
  ) {}

  findActive(): Promise<NativeAd[]> {
    const now = new Date();
    return this.adsRepository.find({
      where: {
        isActive: true,
        startDate: Or(IsNull(), LessThanOrEqual(now)),
        endDate: Or(IsNull(), MoreThanOrEqual(now)),
      },
      order: { createdAt: 'DESC' },
    });
  }

  findAll(): Promise<NativeAd[]> {
    return this.adsRepository.find({ order: { createdAt: 'DESC' } });
  }

  async create(dto: CreateAdDto): Promise<NativeAd> {
    const ad = this.adsRepository.create({
      ...dto,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
    });
    return this.adsRepository.save(ad);
  }

  async update(id: number, dto: UpdateAdDto): Promise<NativeAd> {
    const ad = await this.adsRepository.findOne({ where: { id } });
    if (!ad) throw new NotFoundException(`Ad #${id} no encontrado`);

    const updates: Partial<NativeAd> = { ...dto };
    if (dto.startDate !== undefined) updates.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) updates.endDate = dto.endDate ? new Date(dto.endDate) : null;

    Object.assign(ad, updates);
    return this.adsRepository.save(ad);
  }

  async remove(id: number): Promise<void> {
    const ad = await this.adsRepository.findOne({ where: { id } });
    if (!ad) throw new NotFoundException(`Ad #${id} no encontrado`);
    await this.adsRepository.remove(ad);
  }
}
