import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
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
    @InjectRepository(PostLike) private postLikesRepository: Repository<PostLike>,
    @InjectRepository(PollVote) private pollVotesRepository: Repository<PollVote>,
    @InjectRepository(Tag) private tagsRepository: Repository<Tag>,
    @InjectRepository(UserFollow) private userFollowsRepository: Repository<UserFollow>,
    @InjectRepository(UserBlock) private blockRepository: Repository<UserBlock>,
    @InjectRepository(Provider) private providersRepository: Repository<Provider>,
    @InjectRepository(User) private usersRepo: Repository<User>,
  ) { }

  // Editar Post
  async update(id: number, userId: number, dto: UpdatePostDto) {
    const post = await this.postsRepository.findOne({ where: { id } });

    if (!post) throw new NotFoundException('Post no encontrado');
    if (post.authorId !== userId) throw new ForbiddenException('No puedes editar un post que no es tuyo');

    Object.assign(post, dto);
    return await this.postsRepository.save(post);
  }

  // Eliminar Post (Soft Delete)
  async remove(id: number, userId: number) {
    const post = await this.postsRepository.findOne({ where: { id } });

    if (!post) throw new NotFoundException('Post no encontrado');
    if (post.authorId !== userId) throw new ForbiddenException('No puedes eliminar un post que no es tuyo');

    post.status = 'hidden';
    await this.postsRepository.save(post);

    return { message: 'Post eliminado correctamente' };
  }

  async findAllByUser(authorId: number, viewerId?: number) {
    const queryBuilder = this.postsRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('post.vehicle', 'vehicle')
      .leftJoinAndSelect('vehicle.model', 'model')
      .leftJoinAndSelect('model.brand', 'brand')
      .leftJoinAndSelect('post.tags', 'tags')
      .where('post.authorId = :authorId', { authorId })
      .andWhere('post.status = :status', { status: 'active' })
      .orderBy('post.createdAt', 'DESC');

    // Cargar likesCount y commentsCount
    queryBuilder.loadRelationCountAndMap('post.likesCount', 'post.likes');
    queryBuilder.loadRelationCountAndMap('post.commentsCount', 'post.comments');

    // Si hay un espectador logueado, agregamos isLiked
    if (viewerId) {
      queryBuilder.addSelect(
        subQuery => {
          return subQuery
            .select('COUNT(pl.user_id)', 'count')
            .from('post_likes', 'pl')
            .where('pl.post_id = post.id AND pl.user_id = :viewerId');
        },
        'post_isLikedByUser'
      );
      queryBuilder.setParameter('viewerId', viewerId);
    }

    const posts = await queryBuilder.getMany();

    // Mapear el resultado para incluir isLiked como booleano
    const mappedPosts = posts.map(post => {
      const rawResult = (post as any).post_isLikedByUser;
      return {
        ...post,
        isLiked: viewerId ? (rawResult > 0 || false) : false,
        likesCount: (post as any).likesCount || 0,
        commentsCount: (post as any).commentsCount || 0
      };
    });

    const enrichedPosts = await this.enrichWithPollCounts(mappedPosts);

    if (viewerId) {
      return this.enrichWithUserState(enrichedPosts, viewerId);
    }

    return enrichedPosts.map(post => ({
      ...post,
      userVotedOption: null
    }));
  }

  async findAllByProvider(providerId: number, viewerId?: number) {
    const queryBuilder = this.postsRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('post.vehicle', 'vehicle')
      .leftJoinAndSelect('vehicle.model', 'model')
      .leftJoinAndSelect('model.brand', 'brand')
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
      queryBuilder.addSelect(
        subQuery => {
          return subQuery
            .select('COUNT(pl.user_id)', 'count')
            .from('post_likes', 'pl')
            .where('pl.post_id = post.id AND pl.user_id = :viewerId');
        },
        'post_isLikedByUser'
      );
      queryBuilder.setParameter('viewerId', viewerId);
    }

    const posts = await queryBuilder.getMany();

    // Mapear el resultado para incluir isLiked como booleano
    const mappedPosts = posts.map(post => {
      const rawResult = (post as any).post_isLikedByUser;
      return {
        ...post,
        isLiked: viewerId ? (rawResult > 0 || false) : false,
        likesCount: (post as any).likesCount || 0,
        commentsCount: (post as any).commentsCount || 0
      };
    });

    const enrichedPosts = await this.enrichWithPollCounts(mappedPosts);

    if (viewerId) {
      return this.enrichWithUserState(enrichedPosts, viewerId);
    }

    return enrichedPosts.map(post => ({
      ...post,
      userVotedOption: null
    }));
  }

  async create(userId: number, createPostDto: CreatePostDto) {
    // 1. Verificar si es Provider y su estado Premium
    const provider = await this.providersRepository.findOne({ where: { userId } });

    // Si es un proveedor y NO es premium, aplicamos límites
    if (provider && !provider.isPremium) {

      // Calculamos el primer día del mes actual
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Contamos cuántos posts ha hecho este mes
      const postsCount = await this.postsRepository.count({
        where: {
          authorId: userId,
          createdAt: MoreThan(firstDayOfMonth) // Posts creados DESPUÉS del día 1
        }
      });

      if (postsCount >= 3) {
        throw new ForbiddenException('Has alcanzado tu límite de 3 publicaciones mensuales. ¡Pásate a Premium para publicar sin límites!');
      }
    }
    const content = createPostDto.content || '';
    const hashtags = this.extractHashtags(content);
    const postTags: Tag[] = [];

    if (hashtags.length > 0) {
      for (const tagName of hashtags) {
        let tag = await this.tagsRepository.findOne({ where: { name: tagName } });
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
      tags: postTags
    });

    return await this.postsRepository.save(newPost);
  }

  private extractHashtags(text: string): string[] {
    const regex = /#(\w+)/g;
    const matches = text.match(regex);
    if (!matches) return [];
    return matches.map(tag => tag.substring(1).toLowerCase());
  }

  /**
   * Método auxiliar para enriquecer posts con conteo de votos de encuestas
   * @param posts Array de posts o un solo post
   * @returns Posts enriquecidos con pollCounts
   */
  private async enrichWithPollCounts(posts: Post | Post[]): Promise<any> {
    const postsArray = Array.isArray(posts) ? posts : [posts];
    const pollPostIds = postsArray
      .filter(post => post.isPoll)
      .map(post => post.id);

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
    const enrichedPosts = postsArray.map(post => {
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
        pollCounts
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
  private async enrichWithUserState(posts: any | any[], userId: number): Promise<any> {
    const postsArray = Array.isArray(posts) ? posts : [posts];
    const postIds = postsArray.map(post => post.id);

    // Consulta para verificar likes del usuario
    const userLikes = await this.postLikesRepository.find({
      where: {
        postId: In(postIds),
        userId
      },
      select: ['postId']
    });
    const likedPostIds = new Set(userLikes.map(like => like.postId));

    // Consulta para verificar votos del usuario en encuestas
    const userVotes = await this.pollVotesRepository.find({
      where: {
        postId: In(postIds),
        userId
      },
      select: ['postId', 'optionIndex']
    });
    const votesMap: Record<number, number> = {};
    userVotes.forEach(vote => {
      votesMap[vote.postId] = vote.optionIndex;
    });

    // Enriquecer posts con estado del usuario
    const enrichedPosts = postsArray.map(post => ({
      ...post,
      isLiked: likedPostIds.has(post.id),
      userVotedOption: post.isPoll ? (votesMap[post.id] ?? null) : null
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
      throw new BadRequestException('Opción de voto inválida');
    }

    // Buscar si ya existe un voto de este usuario para este post
    const existingVote = await this.pollVotesRepository.findOne({
      where: { postId, userId }
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
        optionIndex
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
      pollCounts
    };
  }

  /**
   * Calcula los conteos actuales de votos para una encuesta
   */
  private async calculatePollCounts(postId: number, optionsLength: number): Promise<number[]> {
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
      where: { postId, userId }
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
      return { status: 'liked', likesCount: post.likesCount };
    }
  }

  async findAll(userId?: number) {
    const queryBuilder = this.postsRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('post.vehicle', 'vehicle')
      .leftJoinAndSelect('vehicle.model', 'model')
      .leftJoinAndSelect('model.brand', 'brand')
      .leftJoinAndSelect('post.tags', 'tags')
      .where('post.status = :status', { status: 'active' })
      .orderBy('post.createdAt', 'DESC');

    // Subconsulta para contar likes totales
    queryBuilder.loadRelationCountAndMap(
      'post.likesCount',
      'post.likes'
    );

    // Si hay un usuario logueado, agregamos isLiked
    if (userId) {
      queryBuilder.addSelect(
        subQuery => {
          return subQuery
            .select('COUNT(pl.user_id)', 'count')
            .from('post_likes', 'pl')
            .where('pl.post_id = post.id AND pl.user_id = :userId');
        },
        'post_isLikedByUser'
      );
      queryBuilder.setParameter('userId', userId);
    }

    const posts = await queryBuilder.getMany();

    // Mapear el resultado para incluir isLiked como booleano
    const mappedPosts = posts.map(post => {
      const rawResult = (post as any).post_isLikedByUser;
      return {
        ...post,
        isLiked: userId ? (rawResult > 0 || false) : false,
        likesCount: (post as any).likesCount || 0
      };
    });

    const enrichedPosts = await this.enrichWithPollCounts(mappedPosts);

    // Agregar userVotedOption si hay usuario autenticado
    if (userId) {
      return this.enrichWithUserState(enrichedPosts, userId);
    }

    return enrichedPosts.map(post => ({
      ...post,
      userVotedOption: null
    }));
  }

  async findOne(id: number, userId?: number) {
    const post = await this.postsRepository.findOne({
      where: { id },
      relations: ['author', 'vehicle', 'vehicle.model', 'vehicle.model.brand', 'tags']
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
    enrichedPost.likesCount = await this.postLikesRepository.count({ where: { postId: id } });
    enrichedPost.commentsCount = post.commentsCount || 0;


    return enrichedPost;
  }

  // 👇 EL ALGORITMO DEL FEED INTELIGENTE
  async getFeed(userId: number, dto: GetFeedDto) {
    const { lat, lng, radius, limit, offset, filter } = dto;

    // 1. LÓGICA DE PERMISOS 🔐
    const user = await this.usersRepo.findOne({ where: { id: userId } });

    if (!user) throw new NotFoundException('Usuario no encontrado');

    // Lista base: Todos ven lo público
    const allowedVisibilities = ['public'];

    // Filtrado por rol según reglas de negocio
    if (user.role === 'user') {
      // Clientes ven: public y users_only
      allowedVisibilities.push('users_only');
    }
    else if (user.role === 'provider') {
      // Proveedores ven: public + contenido específico de su categoría
      const provider = await this.providersRepository.findOne({ where: { userId } });
      if (provider) {
        // Mapeo de categorías a visibilidades específicas
        if (provider.category === 'mechanic') {
          allowedVisibilities.push('mechanics_only');
        } else if (provider.category === 'tow') {
          allowedVisibilities.push('tow_only');
        }
        // Otras categorías solo ven 'public' por defecto
      }
    }

    // 2. CONSTRUCCIÓN DE LA CONSULTA BASE 🏗️
    const query = this.postsRepository.createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('post.vehicle', 'vehicle')
      .leftJoinAndSelect('vehicle.model', 'model')
      .leftJoinAndSelect('model.brand', 'brand')
      .leftJoinAndSelect('post.tags', 'tags')
      .where('post.status = :status', { status: 'active' });

    // Agregar likesCount siempre
    query.loadRelationCountAndMap('post.likesCount', 'post.likes');

    // Agregar commentsCount siempre
    query.loadRelationCountAndMap('post.commentsCount', 'post.comments');

    // Agregar isLiked siempre si hay userId
    if (userId) {
      query.addSelect(
        subQuery => {
          return subQuery
            .select('COUNT(pl.user_id)', 'count')
            .from('post_likes', 'pl')
            .where('pl.post_id = post.id AND pl.user_id = :userId');
        },
        'post_isLikedByUser'
      );
    }

    // 3. Filtro de Visibilidad (SIEMPRE APLICA)
    query.andWhere(
      '(post.authorId = :userId OR post.visibility IN (:...allowedVisibilities))',
      { userId, allowedVisibilities }
    );

    // 3.5 Filtro de Usuarios Bloqueados (CRÍTICO) 🚫
    // Obtener IDs bloqueados bidireccionales (usuarios que he bloqueado + usuarios que me han bloqueado)
    const blockedRelations = await this.blockRepository.find({
      where: [
        { blockerId: userId }, // Usuarios que YO bloqueé
        { blockedId: userId }  // Usuarios que ME bloquearon
      ]
    });

    // Extraer IDs únicos de usuarios bloqueados
    const blockedIds = new Set<number>();
    blockedRelations.forEach(block => {
      if (block.blockerId === userId) {
        blockedIds.add(block.blockedId); // Agregamos a quien bloqueé
      } else {
        blockedIds.add(block.blockerId); // Agregamos quien me bloqueó
      }
    });

    // Aplicar filtro NOT IN si hay bloqueados
    if (blockedIds.size > 0) {
      const blockedIdsArray = Array.from(blockedIds);
      query.andWhere('post.authorId NOT IN (:...blockedIds)', { blockedIds: blockedIdsArray });
    }

    // 4. ESTRATEGIAS DE FILTRADO DINÁMICAS 🎯

    // Estrategia 1: NEARBY (Cercanía) - Requiere lat/lng
    if (filter === 'nearby' && lat && lng) {

      // Fórmula Haversine para calcular distancia en km
      // Distancia = 6371 * acos(cos(lat1) * cos(lat2) * cos(lng2 - lng1) + sin(lat1) * sin(lat2))
      const distanceFormula = `(6371 * acos(cos(radians(:lat)) * cos(radians(post.lat)) * cos(radians(post.lng) - radians(:lng)) + sin(radians(:lat)) * sin(radians(post.lat))))`;

      query.addSelect(distanceFormula, 'distance')
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
        select: ['followedId']
      });
      const followedIds = follows.map(f => f.followedId);

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
    let result = entities.map(entity => {
      const rawResult = raw.find(r => r.post_id === entity.id);
      const isLiked = userId ? ((entity as any).post_isLikedByUser > 0 || false) : false;

      const mappedPost: any = {
        ...entity,
        isLiked,
        likesCount: (entity as any).likesCount || 0,
        commentsCount: (entity as any).commentsCount || 0
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
      result = result.filter(post => {
        if (post.distance === undefined) return false;
        return post.distance <= radius;
      });
      const afterFilter = result.length;

      if (beforeFilter !== afterFilter) {
      }


      // Log de distancias para debugging
      if (result.length > 0) {
        const distances = result.map(p => p.distance?.toFixed(2) + 'km').join(', ');
      }
    }

    const enrichedResult = await this.enrichWithPollCounts(result);

    // Agregar estado de usuario si está autenticado
    return this.enrichWithUserState(enrichedResult, userId);
  }
}