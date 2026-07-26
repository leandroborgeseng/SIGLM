import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET?.trim() || !process.env.JWT_REFRESH_SECRET?.trim()) {
      throw new Error('JWT_SECRET e JWT_REFRESH_SECRET são obrigatórios em produção');
    }
  }

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`LeisMunicipais API em http://0.0.0.0:${port}/api`);
}

bootstrap();
