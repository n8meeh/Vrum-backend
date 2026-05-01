import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, IsNull, Or, MoreThanOrEqual, Repository } from 'typeorm';
import { NativeAd } from './entities/native-ad.entity';
import { CreateAdDto } from './dto/create-ad.dto';
import { UpdateAdDto } from './dto/update-ad.dto';
import { FirebaseService } from '../files/firebase.service';

@Injectable()
export class AdsService {
  constructor(
    @InjectRepository(NativeAd) private adsRepository: Repository<NativeAd>,
    private readonly firebaseService: FirebaseService,
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

    // Cascade-delete: if the image is being replaced, remove the old file from Storage.
    const oldImageUrl = ad.imageUrl;

    const { startDate, endDate, ...rest } = dto;
    Object.assign(ad, rest);
    if (startDate !== undefined) ad.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) ad.endDate = endDate ? new Date(endDate) : null;
    const saved = await this.adsRepository.save(ad);

    if (rest.imageUrl !== undefined && rest.imageUrl !== oldImageUrl && oldImageUrl) {
      void this.firebaseService.deleteFileByUrl(oldImageUrl);
    }

    return saved;
  }

  async remove(id: number): Promise<void> {
    const ad = await this.adsRepository.findOne({ where: { id } });
    if (!ad) throw new NotFoundException(`Ad #${id} no encontrado`);

    // Cascade-delete: remove the banner image from Storage before deleting the record.
    if (ad.imageUrl) {
      void this.firebaseService.deleteFileByUrl(ad.imageUrl);
    }

    await this.adsRepository.remove(ad);
  }
}
