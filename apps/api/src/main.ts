import 'reflect-metadata';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { APP_ENV } from './config/config.module';
import type { AppEnv } from './config/env.schema';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

function loadDotenv(): void {
  // Populate process.env from apps/api/.env for local dev.
  // In production the host (e.g. Vercel, Docker) injects env vars directly.
  try {
    process.loadEnvFile(resolve(__dirname, '../.env'));
  } catch {
    // No .env file present — fall through and let zod validate whatever is in process.env.
  }
}

async function bootstrap() {
  loadDotenv();
  const app = await NestFactory.create(AppModule);
  const env = app.get<AppEnv>(APP_ENV);

  app.enableCors({ origin: env.CORS_ORIGIN, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(env.PORT);
}

void bootstrap();
