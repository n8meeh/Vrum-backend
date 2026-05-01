import { Controller, Post, Body, Get, Param, UseGuards, Request, Query, Patch } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { SolveCommentDto } from './dto/solve-comment.dto';
import { AuthGuard } from '@nestjs/passport';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) { }

  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(@Request() req, @Body() createCommentDto: CreateCommentDto) {
    return this.commentsService.create(req.user.userId, createCommentDto);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findAll(@Query('postId') postId: string, @Request() req) {
    return this.commentsService.findAll(+postId, req.user?.userId);
  }

  @Patch(':id/solve')
  async solve(
    @Param('id') commentId: string,
    @Body() solveDto: SolveCommentDto
  ) {
    return this.commentsService.markAsSolution(solveDto.userId, +commentId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('post/:postId')
  findAllByPost(@Param('postId') postId: string, @Request() req) {
    return this.commentsService.findAllByPost(+postId, req.user?.userId);
  }

  @Get('solutions/user/:userId')
  findSolutionsByUser(@Param('userId') userId: string) {
    return this.commentsService.findSolutionsByUser(+userId);
  }
}