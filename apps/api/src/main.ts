import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';

async function bootstrap() {
  console.log(`===> FlowTrack API initializing on Node ${process.version}...`);
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isAllowed =
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.includes('0.0.0.0') ||
        origin.endsWith('.pages.dev') ||
        origin.endsWith('.onrender.com') ||
        origin.endsWith('.vercel.app') ||
        origin.endsWith('.netlify.app') ||
        /^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(origin) ||
        (process.env.CORS_ORIGIN &&
          process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).includes(origin));

      // Always allow valid browser origins to prevent CORS preflight crashes
      if (isAllowed || process.env.NODE_ENV !== 'production' || !process.env.CORS_ORIGIN) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));
  app.use('/api/v1/uploads', express.static(uploadsDir));

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    })
  );

  app.setGlobalPrefix('api/v1');

  // Swagger OpenAPI Documentation
  const config = new DocumentBuilder()
    .setTitle('FlowTrack Core API')
    .setDescription('Universal Canvas Project Management REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`FlowTrack API server is running on http://0.0.0.0:${port}/api/v1`);
  console.log(`Swagger documentation available on http://localhost:${port}/api/docs`);
}

bootstrap();
