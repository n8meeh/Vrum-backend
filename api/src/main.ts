import * as dotenv from 'dotenv';
import * as path from 'path';

// Cargar variables de entorno locales (api/.env)
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe, ClassSerializerInterceptor, BadRequestException } from '@nestjs/common';
// 👇 1. Importa esto
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      // 🆕 ENHANCED ERROR LOGGING
      exceptionFactory: (errors) => {
        const formattedErrors = errors.map(error => ({
          field: error.property,
          constraints: error.constraints,
          children: error.children
        }));
        // Relanzar el error para que la respuesta sea correcta
        return new BadRequestException(
          formattedErrors.map(e => `${e.field}: ${Object.values(e.constraints || {}).join(', ')}`).join('; ')
        );
      },
    }),
  );

  // 🔒 SEGURIDAD: Activar serialización automática para ocultar campos @Exclude()
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // 👇 2. CONFIGURACIÓN DE SWAGGER (Pega esto aquí)
  const config = new DocumentBuilder()
    .setTitle('Vrum API')
    .setDescription('Documentación de los endpoints de Vrum App')
    .setVersion('1.0')
    .addBearerAuth() // 👈 ¡Clave! Esto habilita el botón para meter el Token JWT
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document); // 'docs' será la URL (localhost:3000/docs)
  // 👆 FIN CONFIGURACIÓN SWAGGER

  // Habilitar CORS solo para orígenes autorizados
  app.enableCors({
    origin: ['https://brumh.cl', 'https://www.brumh.cl'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(3000);
  logger.log(`App running on port 3000`);
  logger.log(`Swagger docs running on http://localhost:3000/docs`); // Un log útil
}
bootstrap();