import { Injectable, UnauthorizedException, BadRequestException, NotFoundException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { RegisterDto } from './dto/register.dto';
import { EmailService } from './email.service';
import { Provider } from '../providers/entities/provider.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private emailService: EmailService,
    @InjectRepository(Provider) private providersRepo: Repository<Provider>,
  ) { }

  /**
   * Registrar un nuevo usuario
   */
  async register(registerDto: RegisterDto) {

    // 1. Verificar si el usuario ya existe
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new ConflictException('Ya existe una cuenta con este correo electrónico');
    }

    // 2. Crear el usuario (UsersService ya hashea la contraseña)
    // TypeORM mapea automáticamente fullName → full_name en BD
    const createUserDto = {
      email: registerDto.email,
      password: registerDto.password,
      fullName: registerDto.fullName, // ✅ Usamos camelCase (propiedad de la entidad)
      role: registerDto.role || 'user',
    };

    const newUser = await this.usersService.create(createUserDto);


    // 3. Generar token y hacer login automático
    return this.login(newUser);
  }

  // 1. Validar que el usuario existe y la contraseña coincide
  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);

    // Si el usuario existe y la contraseña encriptada coincide...
    if (user && await bcrypt.compare(pass, user.password)) {
      // Verificar si el usuario está baneado
      if (user.bannedUntil && new Date() < new Date(user.bannedUntil)) {
        const bannedUntilDate = new Date(user.bannedUntil).toLocaleDateString('es-ES', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        });
        throw new ForbiddenException(`Tu cuenta está suspendida hasta el ${bannedUntilDate}`);
      }

      const { password, ...result } = user; // Quitamos la password del resultado
      return result;
    }
    return null;
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return { message: 'Si el correo existe, se ha enviado un código.' };
    }

    // Código numérico de 6 dígitos
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // Expiración: 1 hora
    const expires = new Date();
    expires.setHours(expires.getHours() + 1);

    await this.usersService.saveResetToken(user.id, code, expires);

    // Enviar correo con el código
    try {
      await this.emailService.sendPasswordResetEmail(email, code);
    } catch (err) {
      this.logger.error(`No se pudo enviar correo a ${email}: ${err.message}`);
    }

    return { message: 'Si el correo existe, recibirás un código de verificación.' };
  }

  // Verificar que el código es válido (sin cambiar contraseña aún)
  async verifyResetCode(email: string, code: string) {
    const user = await this.usersService.findByEmailAndResetCode(email, code);
    if (!user) {
      throw new BadRequestException('El código ingresado no es válido o ya expiró. Solicita uno nuevo.');
    }
    return { message: 'Código verificado correctamente.' };
  }

  // Establecer nueva contraseña con email + código
  async resetPassword(email: string, code: string, newPassword: string) {
    const user = await this.usersService.findByEmailAndResetCode(email, code);
    if (!user) {
      throw new BadRequestException('El código ingresado no es válido o ya expiró. Solicita uno nuevo.');
    }

    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await this.usersService.updatePasswordAndClearToken(user.id, hashedPassword);

    return { message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' };
  }

  // 2. Generar el Token (Login)
  async login(user: any) {
    // Generamos un ID de sesión único para la estrategia de "Sesión Única"
    const sessionToken = uuidv4();

    // Guardamos ese ID en la base de datos (invalidando sesiones anteriores)
    await this.usersService.updateSessionToken(user.id, sessionToken);

    // Registrar último acceso (usado para detección de proveedores inactivos)
    await this.usersService.updateLastLogin(user.id);

    // Resolver providerId:
    // - Staff (provider_admin/provider_staff): user.providerId ya existe en la tabla users
    // - Dueño (provider): buscar en tabla providers por userId
    let providerId: number | null = user.providerId || null;
    let provider: Provider | null = null;

    if (!providerId && user.role === 'provider') {
      // El dueño del negocio: buscar el provider asociado a su userId
      provider = await this.providersRepo.findOne({ where: { userId: user.id } });
      if (provider) {
        providerId = provider.id;
      }
    } else if (providerId) {
      // Staff: buscar datos del negocio
      provider = await this.providersRepo.findOne({ where: { id: providerId } });
    }

    this.logger.log(`Login: userId=${user.id}, role=${user.role}, providerId=${providerId}`);

    // Creamos el Payload (lo que va dentro del JWT)
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      providerId: providerId,
      sessionToken: sessionToken,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        providerId: providerId,
      },
      // Datos del negocio (si aplica)
      provider: provider ? {
        id: provider.id,
        businessName: provider.businessName,
        logoUrl: provider.logoUrl,
        coverUrl: provider.coverUrl,
        isPremium: provider.isPremium,
      } : null,
    };
  }
}