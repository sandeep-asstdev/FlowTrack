import * as dotenv from 'dotenv';
dotenv.config();
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { PrismaService } from './src/prisma/prisma.service';

async function test() {
  try {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const prisma = app.get(PrismaService);
    const usersCount = await prisma.user.count();
    console.log(`Context started successfully! Users in DB: ${usersCount}`);
    await app.close();
  } catch (err) {
    console.error('Context error:', err);
    process.exit(1);
  }
}
test();

