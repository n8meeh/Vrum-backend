import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateCommentDto } from './dto/create-comment.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, In } from 'typeorm';
import { Comment } from './entities/comment.entity';
import { User } from '../users/entities/user.entity';
import { Post } from '../posts/entities/post.entity';
import { Provider } from '../providers/entities/provider.entity';
@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private commentsRepository: Repository<Comment>,
    @InjectRepository(Post) private postsRepo: Repository<Post>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(Provider) private providersRepository: Repository<Provider>,
  ) { }

  async create(userId: number, createCommentDto: CreateCommentDto) {

    // 1. Validar Límites de Provider Freemium
    const provider = await this.providersRepository.findOne({ where: { userId } });

    if (provider && !provider.isPremium) {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const commentsCount = await this.commentsRepository.count({
        where: {
          authorId: userId,
          createdAt: MoreThan(firstDayOfMonth)
        }
      });

      if (commentsCount >= 5) {
        throw new ForbiddenException('Límite de 5 comentarios mensuales alcanzado. Actualiza a Premium para interactuar más.');
      }
    }

    // 1.5 Validación de Identidad Profesional
    if (createCommentDto.isProfessional) {
      const user = await this.usersRepo.findOne({ where: { id: userId } });
      if (!user || user.role !== 'provider') {
        throw new ForbiddenException('Solo los proveedores pueden comentar como profesional.');
      }
      if (!provider) {
        throw new ForbiddenException('No se encontró perfil de proveedor asociado.');
      }
    }

    // 2. Validar que el post exista
    const post = await this.postsRepo.findOne({ where: { id: createCommentDto.postId } });
    if (!post) {
      throw new NotFoundException(`Post con ID ${createCommentDto.postId} no encontrado`);
    }

    // 2.1. Bloquear comentarios en hilos resueltos
    if (post.isSolved) {
      throw new ForbiddenException('Este hilo ha sido resuelto y está cerrado para nuevas interacciones.');
    }

    // 3. Mapear correctamente: authorId del DTO o del JWT
    const authorId = createCommentDto.authorId || userId;

    // 4. Crear comentario con mapeo correcto de relaciones
    const comment = this.commentsRepository.create({
      content: createCommentDto.content,
      postId: createCommentDto.postId,
      authorId: authorId,
      isSolution: false,
      isProfessional: createCommentDto.isProfessional || false,
    });

    const saved = await this.commentsRepository.save(comment);

    // Counter Cache: incrementar commentsCount en el post
    await this.postsRepo.increment({ id: comment.postId }, 'commentsCount', 1);

    // Recargar con relación author para devolver datos completos
    const fullComment = await this.commentsRepository.findOne({
      where: { id: saved.id },
      relations: ['author'],
    });

    // Transformar autor si es comentario profesional (Identidad Dual)
    if (fullComment && fullComment.isProfessional) {
      const prov = await this.providersRepository.findOne({
        where: { userId: fullComment.authorId },
      });
      if (prov) {
        (fullComment as any).author = {
          ...fullComment.author,
          fullName: prov.businessName,
          avatarUrl: prov.logoUrl,
          provider: { id: prov.id },
        };
      }
    }

    return fullComment || saved;
  }

  // Editar Comentario
  async updateComment(commentId: number, userId: number, content: string) {
    const comment = await this.commentsRepository.findOne({ where: { id: commentId } });

    if (!comment) throw new NotFoundException('Comentario no encontrado');
    if (comment.authorId !== userId) throw new ForbiddenException('No es tu comentario');

    comment.content = content;
    return await this.commentsRepository.save(comment);
  }

  // Eliminar Comentario
  async removeComment(commentId: number, userId: number) {
    const comment = await this.commentsRepository.findOne({ where: { id: commentId } });

    if (!comment) throw new NotFoundException('Comentario no encontrado');
    if (comment.authorId !== userId) throw new ForbiddenException('No es tu comentario');

    const postId = comment.postId;

    // Aquí suele ser mejor borrado físico, o cambiar texto a "[Eliminado]"
    await this.commentsRepository.remove(comment);

    // Counter Cache: decrementar commentsCount en el post
    await this.postsRepo.decrement({ id: postId }, 'commentsCount', 1);

    return { message: 'Comentario eliminado' };
  }

  async markAsSolution(userId: number, commentId: number) {
    // 1. Buscamos el comentario con la relación al post
    const comment = await this.commentsRepository.findOne({
      where: { id: commentId },
      relations: ['post']
    });

    if (!comment) throw new NotFoundException('Comentario no encontrado');

    // 2. SEGURIDAD: Solo el autor del post puede marcar/desmarcar la solución

    if (Number(comment.post.authorId) !== Number(userId)) {
      throw new ForbiddenException('No tienes permiso para marcar esta solución');
    }

    // 3. TOGGLE LOGIC
    
    // Verificar si el autor del post es el mismo que el autor del comentario (anti-farmeo)
    const isSelfAnswer = Number(comment.post.authorId) === Number(comment.authorId);
    
    // CASO A: Si ya es solución, DESMARCAR
    if (comment.isSolution) {
      comment.isSolution = false;
      await this.commentsRepository.save(comment);
      
      // Poner el post como no resuelto
      await this.postsRepo.update(comment.post.id, { isSolved: false });
      
      // Restar puntos SOLO si NO es auto-respuesta (anti-farmeo)
      if (!isSelfAnswer) {
        await this.usersRepo.decrement({ id: comment.authorId }, 'solutionsCount', 1);
      }
      
      return { success: true, message: 'Solución desmarcada' };
    }
    
    // CASO B: Si NO es solución, MARCAR (y desmarcar cualquier otra)
    
    // B.1. Buscar si hay otro comentario marcado como solución en este post
    const previousSolution = await this.commentsRepository.findOne({
      where: { 
        postId: comment.postId, 
        isSolution: true 
      }
    });
    
    // B.2. Si existe otra solución, desmarcrarla y restar puntos
    if (previousSolution) {
      previousSolution.isSolution = false;
      await this.commentsRepository.save(previousSolution);
      
      // Restar puntos SOLO si la solución previa NO era auto-respuesta
      const wasPreviousSelfAnswer = Number(comment.post.authorId) === Number(previousSolution.authorId);
      if (!wasPreviousSelfAnswer) {
        await this.usersRepo.decrement({ id: previousSolution.authorId }, 'solutionsCount', 1);
      }
    }
    
    // B.3. Marcar el comentario actual como solución
    comment.isSolution = true;
    await this.commentsRepository.save(comment);
    
    // B.4. Marcar el post como resuelto
    await this.postsRepo.update(comment.post.id, { isSolved: true });
    
    // B.5. Dar puntos de gamificación SOLO si NO es auto-respuesta (anti-farmeo)
    if (!isSelfAnswer) {
      await this.usersRepo.increment({ id: comment.authorId }, 'solutionsCount', 1);
    }

    const message = isSelfAnswer 
      ? 'Solución marcada (sin puntos por auto-respuesta)' 
      : 'Solución marcada y puntos otorgados al experto';
    
    return { success: true, message };
  }

  async findAll(postId: number) {
    const comments = await this.commentsRepository.find({
      where: { postId },
      relations: ['author'],
      select: {
        id: true,
        content: true,
        isProfessional: true,
        createdAt: true,
        author: {
          id: true,
          fullName: true,
          avatarUrl: true,
          role: true
        }
      },
      order: { createdAt: 'ASC' }
    });

    // Transformar autor para comentarios profesionales (Identidad Dual)
    const proComments = comments.filter(c => c.isProfessional);
    if (proComments.length > 0) {
      const authorIds = [...new Set(proComments.map(c => c.authorId))];
      const providers = await this.providersRepository.find({
        where: { userId: In(authorIds) },
      });
      const providerMap = new Map(providers.map(p => [p.userId, p]));

      for (const comment of comments) {
        if (comment.isProfessional) {
          const prov = providerMap.get(comment.authorId);
          if (prov) {
            (comment as any).author = {
              ...comment.author,
              fullName: prov.businessName,
              avatarUrl: prov.logoUrl,
              provider: { id: prov.id },
            };
          }
        }
      }
    }

    return comments;
  }

  async findAllByPost(postId: number) {
    const comments = await this.commentsRepository.find({
      where: { postId },
      relations: ['author'],
      order: {
        isSolution: 'DESC',
        createdAt: 'ASC'
      }
    });

    // Transformar autor para comentarios profesionales (Identidad Dual)
    const proComments = comments.filter(c => c.isProfessional);
    if (proComments.length > 0) {
      const authorIds = [...new Set(proComments.map(c => c.authorId))];
      const providers = await this.providersRepository.find({
        where: { userId: In(authorIds) },
      });
      const providerMap = new Map(providers.map(p => [p.userId, p]));

      for (const comment of comments) {
        if (comment.isProfessional) {
          const prov = providerMap.get(comment.authorId);
          if (prov) {
            (comment as any).author = {
              ...comment.author,
              fullName: prov.businessName,
              avatarUrl: prov.logoUrl,
              provider: { id: prov.id },
            };
          }
        }
      }
    }

    return comments;
  }
}