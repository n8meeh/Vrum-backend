import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { NotificationTriggerService } from '../notifications/notification-trigger.service';
import { Provider } from '../providers/entities/provider.entity';
import { UserBlock } from '../users/entities/user-block.entity';
import { UserFollow } from '../users/entities/user-follow.entity';
import { User } from '../users/entities/user.entity'; // Asegúrate que la ruta sea correcta
import { CreatePostDto } from './dto/create-post.dto';
import { GetFeedDto } from './dto/get-feed.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PollVote } from './entities/poll-vote.entity';
import { PostLike } from './entities/post-like.entity';
import { Post } from './entities/post.entity';
import { Tag } from './entities/tag.entity';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post) private postsRepository: Repository<Post>,
    @InjectRepository(PostLike)
    private postLikesRepository: Repository<PostLike>,
    @InjectRepository(PollVote)
    private pollVotesRepository: Repository<PollVote>,
    @InjectRepository(Tag) private tagsRepository: Repository<Tag>,
    @InjectRepository(UserFollow)
    private userFollowsRepository: Repository<UserFollow>,
    @InjectRepository(UserBlock) private blockRepository: Repository<UserBlock>,
    @InjectRepository(Provider)
    private providersRepository: Repository<Provider>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    private notificationTrigger: NotificationTriggerService,
  ) {}

  /**
   * Resuelve la identidad de negocio para un conjunto de authorIds.
   * Busca providers tanto para dueños (providers.userId) como para staff (users.providerId).
   * @returns Map<authorId, Provider>
   */
  private async resolveProviderIdentities(
    authorIds: number[],
  ): Promise<Map<number, Provider>> {
    if (authorIds.length === 0) return new Map();

    // 1. Buscar como dueños: providers.userId IN authorIds (incluye negocios cerrados)
    const ownerProviders = await this.providersRepository.find({
      where: { userId: In(authorIds) },
      withDeleted: true,
    });
    const providerMap = new Map<number, Provider>(
      ownerProviders.map((p) => [p.userId, p]),
    );

    // 2. Buscar IDs que no tienen provider como dueño (potenciales staff)
    const remainingIds = authorIds.filter((id) => !providerMap.has(id));
    if (remainingIds.length > 0) {
      // Buscar usuarios staff que tengan providerId
      const staffUsers = await this.usersRepo.find({
        where: { id: In(remainingIds) },
        select: ['id', 'providerId'],
      });

      const staffProviderIds = staffUsers
        .filter((u) => u.providerId !== null)
        .map((u) => u.providerId as number);

      if (staffProviderIds.length > 0) {
        const staffProviders = await this.providersRepository.find({
          where: { id: In(staffProviderIds) },
          withDeleted: true,
        });
        const staffProvMap = new Map(staffProviders.map((p) => [p.id, p]));

        for (const staffUser of staffUsers) {
          if (staffUser.providerId && staffProvMap.has(staffUser.providerId)) {
            providerMap.set(
              staffUser.id,
              staffProvMap.get(staffUser.providerId)!,
            );
          }
        }
      }
    }

    return providerMap;
  }

  /**
   * Aplica la transformación de Identidad Dual a un array de posts.
   * Reemplaza author.fullName y author.avatarUrl con los datos del negocio en posts profesionales.
   */
  private async applyDualIdentity(posts: any[]): Promise<void> {
    const professionalPosts = posts.filter((p) => p.isProfessional);
    if (professionalPosts.length === 0) return;

    // Usar post.providerId (guardado al crear) en vez de resolver por authorId actual.
    // Esto evita que el post migre al nuevo negocio si el autor cambia de provider.
    const providerIds = [...new Set(
      professionalPosts.map((p) => p.providerId).filter(Boolean) as number[]
    )];

    const providers = providerIds.length > 0
      ? await this.providersRepository.find({
          where: { id: In(providerIds) },
          withDeleted: true,
        })
      : [];

    const providerMap = new Map(providers.map((p) => [p.id, p]));

    for (const post of posts) {
      if (post.isProfessional) {
        const prov = providerMap.get(post.providerId);
        if (prov) {
          post.author = {
            ...post.author,
            fullName: prov.businessName,
            avatarUrl: prov.logoUrl,
            provider: { id: prov.id, isVisible: prov.isVisible },
          };
        }
      }
    }
  }

  // Editar Post
  /**
   * Verifica si userId pertenece al mismo negocio que authorId.
   * Cubre: dueño vs staff del mismo provider, o dos staff del mismo provider.
   */
  private async isSameProvider(userId: number, authorId: number): Promise<boolean> {
    if (userId === authorId) return true;

    const resolveProviderId = async (uid: number): Promise<number | null> => {
      const asOwner = await this.providersRepository.findOne({ where: { userId: uid } });
      if (asOwner) return asOwner.id;
      const user = await this.usersRepo.findOne({ where: { id: uid }, select: ['id', 'providerId'] });
      return user?.providerId ?? null;
    };

    const [pid1, pid2] = await Promise.all([resolveProviderId(userId), resolveProviderId(authorId)]);
    return pid1 !== null && pid2 !== null && pid1 === pid2;
  }

  async update(id: number, userId: number, dto: UpdatePostDto) {
    const post = await this.postsRepository.findOne({ where: { id } });

    if (!post) throw new NotFoundException('La publicación no fue encontrada');

    const canEdit = post.authorId === userId ||
      (post.isProfessional && await this.isSameProvider(userId, post.authorId));

    if (!canEdit)
      throw new ForbiddenException('Solo puedes editar tus propias publicaciones');

    Object.assign(post, dto);
    return await this.postsRepository.save(post);
  }

  // Eliminar Post (Soft Delete)
  async remove(id: number, userId: number) {
    const post = await this.postsRepository.findOne({ where: { id } });

    if (!post) throw new NotFoundException('La publicación no fue encontrada');

    const canDelete = post.authorId === userId ||
      (post.isProfessional && await this.isSameProvider(userId, post.authorId));

    if (!canDelete)
      throw new ForbiddenException('Solo puedes eliminar tus propias publicaciones');

    post.status = 'hidden';
    await this.postsRepository.save(post);

    return { message: 'Post eliminado correctamente' };
  }

  async findAllByUser(authorId: number, viewerId?: number) {
    const queryBuilder = this.postsRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('post.vehicle', 'vehicle')
      .leftJoinAndSelect('vehicle.vehicleType', 'vehicleType')
      .leftJoinAndSelect('post.tags', 'tags')
      .where('post.authorId = :authorId', { authorId })
      .andWhere('post.status = :status', { status: 'active' })
      .orderBy('post.createdAt', 'DESC');

    // Cargar likesCount y commentsCount
    queryBuilder.loadRelationCountAndMap('post.likesCount', 'post.likes');
    queryBuilder.loadRelationCountAndMap('post.commentsCount', 'post.comments');

    // Si hay un espectador logueado, agregamos isLiked
    if (viewerId) {
      queryBuilder.addSelect((subQuery) => {
        return subQuery
          .select('COUNT(pl.user_id)', 'count')
          .from('post_likes', 'pl')
          .where('pl.post_id = post.id AND pl.user_id = :viewerId');
      }, 'post_isLikedByUser');
      queryBuilder.setParameter('viewerId', viewerId);
    }

    const posts = await queryBuilder.getMany();

    // Mapear el resultado para incluir isLiked como booleano
    const mappedPosts = posts.map((post) => {
      const rawResult = (post as any).post_isLikedByUser;
      return {
        ...post,
        isLiked: viewerId ? rawResult > 0 || false : false,
        likesCount: (post as any).likesCount || 0,
        commentsCount: (post as any).commentsCount || 0,
      };
    });

    const enrichedPosts = await this.enrichWithPollCounts(mappedPosts);

    // Transformar autor para posts profesionales (Identidad Dual)
    await this.applyDualIdentity(enrichedPosts);

    if (viewerId) {
      return this.enrichWithUserState(enrichedPosts, viewerId);
    }

    return enrichedPosts.map((post) => ({
      ...post,
      userVotedOption: null,
    }));
  }

  async findAllByProvider(providerId: number, viewerId?: number) {
    const queryBuilder = this.postsRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('post.vehicle', 'vehicle')
      .leftJoinAndSelect('vehicle.vehicleType', 'vehicleType')
      .leftJoinAndSelect('post.tags', 'tags')
      .leftJoinAndSelect('post.provider', 'provider')
      .where('post.providerId = :providerId', { providerId })
      .andWhere('post.status = :status', { status: 'active' })
      .orderBy('post.createdAt', 'DESC');

    // Cargar likesCount y commentsCount
    queryBuilder.loadRelationCountAndMap('post.likesCount', 'post.likes');
    queryBuilder.loadRelationCountAndMap('post.commentsCount', 'post.comments');

    // Si hay un espectador logueado, agregamos isLiked
    if (viewerId) {
      queryBuilder.addSelect((subQuery) => {
        return subQuery
          .select('COUNT(pl.user_id)', 'count')
          .from('post_likes', 'pl')
          .where('pl.post_id = post.id AND pl.user_id = :viewerId');
      }, 'post_isLikedByUser');
      queryBuilder.setParameter('viewerId', viewerId);
    }

    const posts = await queryBuilder.getMany();

    // Mapear el resultado para incluir isLiked como booleano
    const mappedPosts = posts.map((post) => {
      const rawResult = (post as any).post_isLikedByUser;
      return {
        ...post,
        isLiked: viewerId ? rawResult > 0 || false : false,
        likesCount: (post as any).likesCount || 0,
        commentsCount: (post as any).commentsCount || 0,
      };
    });

    const enrichedPosts = await this.enrichWithPollCounts(mappedPosts);

    // Transformar autor para posts profesionales (Identidad Dual)
    await this.applyDualIdentity(enrichedPosts);

    if (viewerId) {
      return this.enrichWithUserState(enrichedPosts, viewerId);
    }

    return enrichedPosts.map((post) => ({
      ...post,
      userVotedOption: null,
    }));
  }

  async create(userId: number, createPostDto: CreatePostDto) {
    // 1. Verificar si es Provider (como dueño o staff) y su estado Premium
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    let provider: Provider | null = null;

    // Resolver provider: dueño directo o staff vinculado
    if (user?.role === 'provider') {
      provider = await this.providersRepository.findOne({ where: { userId } });
    } else if (
      ['provider_admin', 'provider_staff'].includes(user?.role || '')
    ) {
      if (user?.providerId) {
        provider = await this.providersRepository.findOne({
          where: { id: user.providerId },
        });
      }
    } else {
      // Usuario normal: buscar si casualmente tiene un provider (no debería, pero por seguridad)
      provider = await this.providersRepository.findOne({ where: { userId } });
    }

    // Validación de Identidad Profesional
    if (createPostDto.isProfessional) {
      const allowedRoles = ['provider', 'provider_admin', 'provider_staff'];
      if (!user || !allowedRoles.includes(user.role)) {
        throw new ForbiddenException(
          'Solo los miembros de un negocio pueden publicar como profesional.',
        );
      }
      if (!provider) {
        throw new ForbiddenException(
          'Tu cuenta no está vinculada a ningún negocio',
        );
      }

      // Límite de 3 publicaciones profesionales/mes para proveedores no-premium
      if (!provider.isPremium) {
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const proPostsCount = await this.postsRepository.count({
          where: {
            authorId: userId,
            isProfessional: true,
            createdAt: MoreThan(firstDayOfMonth),
          },
        });
        if (proPostsCount >= 3) {
          throw new ForbiddenException(
            'Has alcanzado tu límite de 3 publicaciones mensuales como negocio. ¡Pásate a Premium para publicar sin límites!',
          );
        }
      }
    }

    const content = createPostDto.content || '';
    const hashtags = this.extractHashtags(content);
    const postTags: Tag[] = [];

    if (hashtags.length > 0) {
      for (const tagName of hashtags) {
        let tag = await this.tagsRepository.findOne({
          where: { name: tagName },
        });
        if (!tag) {
          tag = this.tagsRepository.create({ name: tagName, usageCount: 1 });
          await this.tagsRepository.save(tag);
        } else {
          tag.usageCount += 1;
          await this.tagsRepository.save(tag);
        }
        postTags.push(tag);
      }
    }

    const newPost = this.postsRepository.create({
      ...createPostDto,
      authorId: createPostDto.authorId || userId,
      providerId:
        createPostDto.isProfessional && provider ? provider.id : undefined,
      tags: postTags,
    });

    return await this.postsRepository.save(newPost);
  }

  private extractHashtags(text: string): string[] {
    const regex = /#(\w+)/g;
    const matches = text.match(regex);
    if (!matches) return [];
    return matches.map((tag) => tag.substring(1).toLowerCase());
  }

  /**
   * Método auxiliar para enriquecer posts con conteo de votos de encuestas
   * @param posts Array de posts o un solo post
   * @returns Posts enriquecidos con pollCounts
   */
  private async enrichWithPollCounts(posts: Post | Post[]): Promise<any> {
    const postsArray = Array.isArray(posts) ? posts : [posts];
    const pollPostIds = postsArray
      .filter((post) => post.isPoll)
      .map((post) => post.id);

    if (pollPostIds.length === 0) {
      // No hay encuestas, retornar los posts tal cual
      return Array.isArray(posts) ? postsArray : postsArray[0];
    }

    // Obtener todos los votos de las encuestas en una sola consulta
    const votes = await this.pollVotesRepository
      .createQueryBuilder('vote')
      .select('vote.postId', 'postId')
      .addSelect('vote.optionIndex', 'optionIndex')
      .addSelect('COUNT(*)', 'count')
      .where('vote.postId IN (:...pollPostIds)', { pollPostIds })
      .groupBy('vote.postId')
      .addGroupBy('vote.optionIndex')
      .getRawMany();

    // Crear un mapa de conteos: { postId: { optionIndex: count } }
    const votesMap: Record<number, Record<number, number>> = {};
    votes.forEach((vote: any) => {
      if (!votesMap[vote.postId]) {
        votesMap[vote.postId] = {};
      }
      votesMap[vote.postId][vote.optionIndex] = parseInt(vote.count, 10);
    });

    // Enriquecer los posts con pollCounts
    const enrichedPosts = postsArray.map((post) => {
      if (!post.isPoll || !post.pollOptions) {
        return { ...post };
      }

      const options = Array.isArray(post.pollOptions)
        ? post.pollOptions
        : JSON.parse(post.pollOptions);

      const pollCounts = options.map((_: any, index: number) => {
        return votesMap[post.id]?.[index] || 0;
      });

      return {
        ...post,
        pollCounts,
      };
    });

    return Array.isArray(posts) ? enrichedPosts : enrichedPosts[0];
  }

  /**
   * Método auxiliar para enriquecer posts con el estado específico del usuario
   * @param posts Array de posts o un solo post
   * @param userId ID del usuario autenticado
   * @returns Posts enriquecidos con isLiked y userVotedOption
   */
  private async enrichWithUserState(
    posts: any | any[],
    userId: number,
  ): Promise<any> {
    const postsArray = Array.isArray(posts) ? posts : [posts];
    const postIds = postsArray.map((post) => post.id);

    // Consulta para verificar likes del usuario
    const userLikes = await this.postLikesRepository.find({
      where: {
        postId: In(postIds),
        userId,
      },
      select: ['postId'],
    });
    const likedPostIds = new Set(userLikes.map((like) => like.postId));

    // Consulta para verificar votos del usuario en encuestas
    const userVotes = await this.pollVotesRepository.find({
      where: {
        postId: In(postIds),
        userId,
      },
      select: ['postId', 'optionIndex'],
    });
    const votesMap: Record<number, number> = {};
    userVotes.forEach((vote) => {
      votesMap[vote.postId] = vote.optionIndex;
    });

    // Enriquecer posts con estado del usuario
    const enrichedPosts = postsArray.map((post) => ({
      ...post,
      isLiked: likedPostIds.has(post.id),
      userVotedOption: post.isPoll ? (votesMap[post.id] ?? null) : null,
    }));

    return Array.isArray(posts) ? enrichedPosts : enrichedPosts[0];
  }

  async vote(postId: number, userId: number, optionIndex: number) {
    const post = await this.postsRepository.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException('Publicación no encontrada');

    if (!post.isPoll) {
      throw new BadRequestException('Esta publicación no es una encuesta');
    }

    const options = post.pollOptions as string[];
    if (!options || optionIndex < 0 || optionIndex >= options.length) {
      throw new BadRequestException('La opción seleccionada no es válida');
    }

    // Buscar si ya existe un voto de este usuario para este post
    const existingVote = await this.pollVotesRepository.findOne({
      where: { postId, userId },
    });

    let status: 'voted' | 'unvoted' | 'changed';
    let userVotedOption: number | null;

    if (existingVote) {
      // Caso A: Misma opción -> ELIMINAR (Toggle - retira el voto)
      if (existingVote.optionIndex === optionIndex) {
        await this.pollVotesRepository.delete({ postId, userId });
        status = 'unvoted';
        userVotedOption = null;
      }
      // Caso B: Cambio de opción -> ACTUALIZAR
      else {
        existingVote.optionIndex = optionIndex;
        await this.pollVotesRepository.save(existingVote);
        status = 'changed';
        userVotedOption = optionIndex;
      }
    } else {
      // Caso C: Nuevo voto -> CREAR
      const newVote = this.pollVotesRepository.create({
        postId,
        userId,
        optionIndex,
      });
      await this.pollVotesRepository.save(newVote);
      status = 'voted';
      userVotedOption = optionIndex;
    }

    // Calcular los nuevos conteos de votos para sincronizar el frontend
    const pollCounts = await this.calculatePollCounts(postId, options.length);

    return {
      status,
      userVotedOption,
      pollCounts,
    };
  }

  /**
   * Calcula los conteos actuales de votos para una encuesta
   */
  private async calculatePollCounts(
    postId: number,
    optionsLength: number,
  ): Promise<number[]> {
    const votes = await this.pollVotesRepository
      .createQueryBuilder('vote')
      .select('vote.optionIndex', 'optionIndex')
      .addSelect('COUNT(*)', 'count')
      .where('vote.postId = :postId', { postId })
      .groupBy('vote.optionIndex')
      .getRawMany();

    const votesMap: Record<number, number> = {};
    votes.forEach((vote: any) => {
      votesMap[vote.optionIndex] = parseInt(vote.count, 10);
    });

    // Crear array con los conteos para cada opción
    const pollCounts = Array.from({ length: optionsLength }, (_, index) => {
      return votesMap[index] || 0;
    });

    return pollCounts;
  }

  async toggleLike(postId: number, userId: number) {
    const post = await this.postsRepository.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException('Publicación no encontrada');

    const existingLike = await this.postLikesRepository.findOne({
      where: { postId, userId },
    });

    if (existingLike) {
      await this.postLikesRepository.remove(existingLike);
      post.likesCount = Math.max(0, post.likesCount - 1);
      await this.postsRepository.save(post);
      return { status: 'unliked', likesCount: post.likesCount };
    } else {
      const newLike = this.postLikesRepository.create({ postId, userId });
      await this.postLikesRepository.save(newLike);
      post.likesCount += 1;
      await this.postsRepository.save(post);

      // Disparar notificación de like
      this.notificationTrigger
        .onLike(userId, postId, post.authorId, post.groupId)
        .catch(() => {});

      return { status: 'liked', likesCount: post.likesCount };
    }
  }

  async getLikedPosts(userId: number) {
    // Obtener IDs de posts con like del usuario, ordenados por fecha de like
    const likes = await this.postLikesRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    if (likes.length === 0) return [];

    const postIds = likes.map((l) => l.postId);

    const queryBuilder = this.postsRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('post.vehicle', 'vehicle')
      .leftJoinAndSelect('vehicle.vehicleType', 'vehicleType')
      .leftJoinAndSelect('post.tags', 'tags')
      .where('post.id IN (:...postIds)', { postIds })
      .andWhere('post.status = :status', { status: 'active' });

    queryBuilder.loadRelationCountAndMap('post.likesCount', 'post.likes');
    queryBuilder.loadRelationCountAndMap('post.commentsCount', 'post.comments');

    const posts = await queryBuilder.getMany();

    // Mantener el orden por fecha de like (más reciente primero)
    const orderedPosts = postIds
      .map((id) => posts.find((p) => p.id === id))
      .filter((p): p is Post => !!p);

    const mappedPosts = orderedPosts.map((post) => ({
      ...post,
      isLiked: true, // El usuario les dio like a todos estos
      likesCount: (post as any).likesCount || 0,
      commentsCount: (post as any).commentsCount || 0,
    }));

    const enrichedPosts = await this.enrichWithPollCounts(mappedPosts);
    await this.applyDualIdentity(enrichedPosts);

    return enrichedPosts.map((post) => ({
      ...post,
      userVotedOption: null,
    }));
  }

  async findAll(userId?: number) {
    const queryBuilder = this.postsRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('post.vehicle', 'vehicle')
      .leftJoinAndSelect('vehicle.vehicleType', 'vehicleType')
      .leftJoinAndSelect('post.tags', 'tags')
      .where('post.status = :status', { status: 'active' })
      .andWhere('post.groupId IS NULL')
      .orderBy('post.createdAt', 'DESC');

    // Subconsulta para contar likes totales
    queryBuilder.loadRelationCountAndMap('post.likesCount', 'post.likes');

    // Si hay un usuario logueado, agregamos isLiked
    if (userId) {
      queryBuilder.addSelect((subQuery) => {
        return subQuery
          .select('COUNT(pl.user_id)', 'count')
          .from('post_likes', 'pl')
          .where('pl.post_id = post.id AND pl.user_id = :userId');
      }, 'post_isLikedByUser');
      queryBuilder.setParameter('userId', userId);
    }

    const posts = await queryBuilder.getMany();

    // Mapear el resultado para incluir isLiked como booleano
    const mappedPosts = posts.map((post) => {
      const rawResult = (post as any).post_isLikedByUser;
      return {
        ...post,
        isLiked: userId ? rawResult > 0 || false : false,
        likesCount: (post as any).likesCount || 0,
      };
    });

    // Transformar autor para posts profesionales (Identidad Dual)
    await this.applyDualIdentity(mappedPosts);

    const enrichedPosts = await this.enrichWithPollCounts(mappedPosts);

    // Agregar userVotedOption si hay usuario autenticado
    if (userId) {
      return this.enrichWithUserState(enrichedPosts, userId);
    }

    return enrichedPosts.map((post) => ({
      ...post,
      userVotedOption: null,
    }));
  }

  async findOne(id: number, userId?: number) {
    const post = await this.postsRepository.findOne({
      where: { id },
      relations: ['author', 'vehicle', 'vehicle.vehicleType', 'tags'],
    });
    if (!post) return null;

    // Enriquecer con conteos de votos de encuestas
    let enrichedPost: any = await this.enrichWithPollCounts(post);

    // Si hay usuario autenticado, agregar estado personalizado
    if (userId) {
      enrichedPost = await this.enrichWithUserState(enrichedPost, userId);
    } else {
      // Si no hay usuario, valores por defecto
      enrichedPost.isLiked = false;
      enrichedPost.userVotedOption = null;
    }

    // Agregar conteos
    enrichedPost.likesCount = await this.postLikesRepository.count({
      where: { postId: id },
    });
    enrichedPost.commentsCount = post.commentsCount || 0;

    // Transformar autor para post profesional (Identidad Dual)
    if (enrichedPost.isProfessional && enrichedPost.providerId) {
      const providers = await this.providersRepository.find({
        where: { id: enrichedPost.providerId },
        withDeleted: true,
      });
      const prov = providers[0];
      if (prov) {
        enrichedPost.author = {
          ...enrichedPost.author,
          fullName: prov.businessName,
          avatarUrl: prov.logoUrl,
          provider: { id: prov.id, isVisible: prov.isVisible },
        };
      }
    }

    return enrichedPost;
  }

  // 👇 EL ALGORITMO DEL FEED INTELIGENTE
  async getFeed(userId: number, dto: GetFeedDto) {
    const { lat, lng, radius, limit, offset, filter, search, tag } = dto;

    // 1. LÓGICA DE PERMISOS 🔐
    const allowedVisibilities = ['public'];

    if (userId) {
      const user = await this.usersRepo.findOne({ where: { id: userId } });

      if (user) {
        // Filtrado por rol según reglas de negocio
        if (user.role === 'user') {
          // Clientes ven: public y users_only
          allowedVisibilities.push('users_only');
        } else if (
          ['provider', 'provider_admin', 'provider_staff'].includes(user.role)
        ) {
          // Proveedores y staff ven: public + contenido de mecánicos
          allowedVisibilities.push('mechanics_only');
        }
      }
    }

    // 2. CONSTRUCCIÓN DE LA CONSULTA BASE 🏗️
    const query = this.postsRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('post.vehicle', 'vehicle')
      .leftJoinAndSelect('vehicle.vehicleType', 'vehicleType')
      .leftJoinAndSelect('post.tags', 'tags')
      .where('post.status = :status', { status: 'active' })
      .andWhere('post.groupId IS NULL');

    // Agregar likesCount siempre
    query.loadRelationCountAndMap('post.likesCount', 'post.likes');

    // Agregar commentsCount siempre
    query.loadRelationCountAndMap('post.commentsCount', 'post.comments');

    // Agregar isLiked siempre si hay userId
    if (userId) {
      query.addSelect((subQuery) => {
        return subQuery
          .select('COUNT(pl.user_id)', 'count')
          .from('post_likes', 'pl')
          .where('pl.post_id = post.id AND pl.user_id = :userId');
      }, 'post_isLikedByUser');
    }

    // 3. Filtro de Visibilidad (SIEMPRE APLICA)
    query.andWhere(
      '(post.authorId = :userId OR post.visibility IN (:...allowedVisibilities))',
      { userId, allowedVisibilities },
    );

    // 3.5 Filtro de Usuarios Bloqueados (CRÍTICO) 🚫
    // Obtener IDs bloqueados bidireccionales (usuarios que he bloqueado + usuarios que me han bloqueado)
    const blockedRelations = await this.blockRepository.find({
      where: [
        { blockerId: userId }, // Usuarios que YO bloqueé
        { blockedId: userId }, // Usuarios que ME bloquearon
      ],
    });

    // Extraer IDs únicos de usuarios bloqueados
    const blockedIds = new Set<number>();
    blockedRelations.forEach((block) => {
      if (block.blockerId === userId) {
        blockedIds.add(block.blockedId); // Agregamos a quien bloqueé
      } else {
        blockedIds.add(block.blockerId); // Agregamos quien me bloqueó
      }
    });

    // Aplicar filtro NOT IN si hay bloqueados
    if (blockedIds.size > 0) {
      const blockedIdsArray = Array.from(blockedIds);
      query.andWhere('post.authorId NOT IN (:...blockedIds)', {
        blockedIds: blockedIdsArray,
      });
    }

    // 3.6 Filtro de Búsqueda por texto (contenido + nombre de autor + nombre de negocio)
    if (search && search.trim()) {
      query.leftJoin('author.provider', 'searchProvider');
      query.leftJoin('author.staffProvider', 'searchStaffProvider');
      query.andWhere(
        '(post.content LIKE :search OR author.fullName LIKE :search OR searchProvider.businessName LIKE :search OR searchStaffProvider.businessName LIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    // 3.7 Filtro por Tag
    if (tag && tag.trim()) {
      query.innerJoin('post.tags', 'searchTag', 'searchTag.name = :tagName', {
        tagName: tag.trim().toLowerCase(),
      });
    }

    // 4. ESTRATEGIAS DE FILTRADO DINÁMICAS 🎯

    // Estrategia 1: NEARBY (Cercanía) - Requiere lat/lng
    if (filter === 'nearby' && lat && lng) {
      // Fórmula Haversine para calcular distancia en km
      // Distancia = 6371 * acos(cos(lat1) * cos(lat2) * cos(lng2 - lng1) + sin(lat1) * sin(lat2))
      const distanceFormula = `(6371 * acos(cos(radians(:lat)) * cos(radians(post.lat)) * cos(radians(post.lng) - radians(:lng)) + sin(radians(:lat)) * sin(radians(post.lat))))`;

      query
        .addSelect(distanceFormula, 'distance')
        // CRÍTICO: Solo mostrar posts con coordenadas válidas
        .andWhere('post.lat IS NOT NULL')
        .andWhere('post.lng IS NOT NULL')
        .setParameter('lat', lat)
        .setParameter('lng', lng);

      // Aplicar filtro de radio si se especifica
      // CRÍTICO: Usar WHERE en lugar de HAVING (HAVING requiere GROUP BY)
      if (radius) {
        query.andWhere(`${distanceFormula} <= :radius`, { radius });
      }

      // Ordenar por distancia (más cercanos primero)
      query.orderBy('distance', 'ASC');
    }
    // Estrategia 2: FOLLOWING (Siguiendo) - Requiere userId
    else if (filter === 'following') {
      const follows = await this.userFollowsRepository.find({
        where: { followerId: userId },
        select: ['followedId'],
      });
      const followedIds = follows.map((f) => f.followedId);

      if (followedIds.length === 0) {
        // Si no sigue a nadie, devolver array vacío
        return [];
      }

      query.andWhere('post.authorId IN (:...followedIds)', { followedIds });
      query.orderBy('post.createdAt', 'DESC'); // Más recientes de seguidos
    }
    // Estrategia 3: POPULAR (Más destacados)
    else if (filter === 'popular') {
      query
        .orderBy('post.likesCount', 'DESC')
        .addOrderBy('post.commentsCount', 'DESC')
        .addOrderBy('post.createdAt', 'DESC'); // Desempate por fecha
    }
    // Estrategia 4: RECENT (Más recientes) - DEFAULT
    else {
      // Si no hay filtro específico o filter === 'recent'
      query.orderBy('post.createdAt', 'DESC');
    }

    // 5. PAGINACIÓN
    query.skip(offset).take(limit);

    // 6. EJECUTAR Y MAPEAR
    const { entities, raw } = await query.getRawAndEntities();

    // Mapear isLiked y distance (si existe en raw)
    let result = entities.map((entity) => {
      const rawResult = raw.find((r) => r.post_id === entity.id);
      const isLiked = userId
        ? (entity as any).post_isLikedByUser > 0 || false
        : false;

      const mappedPost: any = {
        ...entity,
        isLiked,
        likesCount: (entity as any).likesCount || 0,
        commentsCount: (entity as any).commentsCount || 0,
      };

      // Inyectar distancia si está disponible
      if (rawResult && rawResult.distance !== undefined) {
        mappedPost.distance = parseFloat(rawResult.distance);
      }

      return mappedPost;
    });

    // 🔒 SAFEGUARD: Filtro adicional en memoria para garantizar el radio
    // (En caso de que la BD no aplique correctamente el filtro)
    if (filter === 'nearby' && radius && lat && lng) {
      const beforeFilter = result.length;
      result = result.filter((post) => {
        if (post.distance === undefined) return false;
        return post.distance <= radius;
      });
      const afterFilter = result.length;

      if (beforeFilter !== afterFilter) {
      }

      // Log de distancias para debugging
      if (result.length > 0) {
        const distances = result
          .map((p) => p.distance?.toFixed(2) + 'km')
          .join(', ');
      }
    }

    // Transformar autor para posts profesionales (Identidad Dual)
    await this.applyDualIdentity(result);

    const enrichedResult = await this.enrichWithPollCounts(result);

    // Agregar estado de usuario si está autenticado
    return this.enrichWithUserState(enrichedResult, userId);
  }

  async getTrendingTags(limit: number = 10): Promise<Tag[]> {
    return this.tagsRepository.find({
      order: { usageCount: 'DESC' },
      take: limit,
    });
  }
}
