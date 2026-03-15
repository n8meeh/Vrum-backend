import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CommentsService } from '../comments/comments.service';
import { CreatePostDto } from './dto/create-post.dto';
import { GetFeedDto } from './dto/get-feed.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostsService } from './posts.service';
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService,
    private readonly commentsService: CommentsService // 👈 2. Inyectar aquí
  ) { }

  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(@Request() req, @Body() createPostDto: CreatePostDto) {
    return this.postsService.create(req.user.userId, createPostDto);
  }



  @UseGuards(AuthGuard('jwt'))
  @Patch(':id') // PATCH /posts/10
  update(@Request() req, @Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.postsService.update(+id, req.user.userId, dto);
  }


  @UseGuards(AuthGuard('jwt'))
  @Delete(':id') // DELETE /posts/10
  remove(@Request() req, @Param('id') id: string) {
    return this.postsService.remove(+id, req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('comments/:id')
  updateComment(@Request() req, @Param('id') id: string, @Body('content') content: string) {
    // 👇 CAMBIO AQUÍ: Usar this.commentsService, NO this.postsService
    return this.commentsService.updateComment(+id, req.user.userId, content);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('comments/:id')
  deleteComment(@Request() req, @Param('id') id: string) {
    // 👇 CAMBIO AQUÍ: Usar this.commentsService, NO this.postsService
    return this.commentsService.removeComment(+id, req.user.userId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findAll(@Request() req) {
    // Si el usuario está autenticado, le pasamos su userId para calcular isLiked
    // Si no está autenticado, req.user será undefined y findAll lo manejará
    const userId = req.user?.userId;
    return this.postsService.findAll(userId);
  }



  @UseGuards(OptionalJwtAuthGuard)
  @Get('user/:userId') // GET /posts/user/5
  getUserPosts(@Request() req, @Param('userId') userId: string) {
    const viewerId = req.user?.userId;
    return this.postsService.findAllByUser(+userId, viewerId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('provider/:providerId') // GET /posts/provider/5
  getProviderPosts(@Request() req, @Param('providerId') providerId: string) {
    const viewerId = req.user?.userId;
    return this.postsService.findAllByProvider(+providerId, viewerId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('feed')
  getFeed(@Request() req, @Query() query: GetFeedDto) {
    const userId = req.user?.userId ?? 0;
    return this.postsService.getFeed(userId, query);
  }

  // ... dentro de la clase

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/vote')
  vote(
    @Request() req,
    @Param('id') id: string,
    @Body('index') index: number // Recibimos { "index": 1 } en el body
  ) {
    return this.postsService.vote(+id, req.user.userId, index);
  }

  // ... imports
  @UseGuards(AuthGuard('jwt'))
  @Post(':id/like')
  toggleLike(@Request() req, @Param('id') id: string) {
    return this.postsService.toggleLike(+id, req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('my/likes')
  getMyLikedPosts(@Request() req) {
    return this.postsService.getLikedPosts(req.user.userId);
  }

  @Get('tags/trending')
  getTrendingTags(@Query('limit') limit?: string) {
    return this.postsService.getTrendingTags(limit ? +limit : 10);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {

    // Pasamos el userId si el usuario está autenticado, sino undefined
    const userId = req.user?.userId;
    return this.postsService.findOne(+id, userId);
  }
}