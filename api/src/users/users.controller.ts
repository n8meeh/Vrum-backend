import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Query,
    Request,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { GroupsService } from '../groups/groups.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateTokenDto } from './dto/update-token.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly groupsService: GroupsService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('following') // GET /users/following (A quién sigo)
  getMyFollowing(@Request() req) {
    return this.usersService.getFollowing(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('followers') // GET /users/followers (Quién me sigue)
  getMyFollowers(@Request() req) {
    return this.usersService.getFollowers(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('blocked') // GET /users/blocked (Usuarios que he bloqueado)
  getMyBlockedUsers(@Request() req) {
    return this.usersService.getBlockedUsers(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('push-token')
  updatePushToken(@Request() req, @Body() dto: UpdateTokenDto) {
    return this.usersService.update(req.user.userId, {
      fcmToken: dto.token,
    } as any);
  }

  /** PATCH /users/visibility — proveedor activa/desactiva su visibilidad en el mapa */
  @UseGuards(AuthGuard('jwt'))
  @Patch('visibility')
  setVisibility(@Request() req, @Body() body: { isVisible: boolean }) {
    return this.usersService.setVisibility(req.user.userId, body.isVisible);
  }

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  // Endpoint público pero con autenticación opcional
  // ✅ OptionalJwtAuthGuard procesa el token JWT si está presente
  // Si envías JWT token → req.user estará poblado con datos del usuario
  // Si NO envías token → req.user será undefined (pero el endpoint funciona igual)
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/public') // GET /users/5/public
  getPublicProfile(@Param('id', ParseIntPipe) id: number, @Request() req) {
    // Extraer userId si está autenticado (opcional)
    // req.user estará definido SOLO si el guard procesó exitosamente el JWT
    const currentUserId = req.user?.userId;

    return this.usersService.findPublicProfile(id, currentUserId);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  getProfile(@Request() req) {
    return this.usersService.findOne(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('block/:id') // POST /users/block/5 (Toggle: bloquea o desbloquea)
  toggleBlock(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.usersService.toggleBlock(req.user.userId, id);
  }

  // 👇 RENOMBRAMOS ESTE A 'deleteAccount'
  @UseGuards(AuthGuard('jwt'))
  @Delete()
  deleteAccount(@Request() req) {
    return this.usersService.remove(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('search')
  searchUsers(@Query('q') q: string, @Query('limit') limit?: string) {
    if (!q || !q.trim()) return [];
    return this.usersService.searchUsers(q.trim(), limit ? +limit : 10);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('profile')
  updateProfile(@Request() req, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(req.user.userId, updateUserDto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  // 👇 ESTE SE QUEDA COMO 'remove' (Borrar por ID, para admin)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.remove(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/follow') // POST /users/5/follow
  toggleFollow(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.usersService.toggleFollow(req.user.userId, id);
  }

  @Get(':id/followers') // GET /users/5/followers (Ver seguidores de cualquier usuario)
  getUserFollowers(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.getFollowers(id);
  }

  @Get(':id/following') // GET /users/5/following (Ver a quién sigue cualquier usuario)
  getUserFollowing(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.getFollowing(id);
  }

  @Get(':id/groups') // GET /users/5/groups (Grupos de un usuario)
  getUserGroups(@Param('id', ParseIntPipe) id: number) {
    return this.groupsService.getUserGroups(id);
  }
}
