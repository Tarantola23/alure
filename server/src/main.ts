import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const rawCorsOrigins = process.env.CORS_ORIGINS;
  const corsOrigins = rawCorsOrigins
    ? rawCorsOrigins.split(',').map((origin) => origin.trim()).filter(Boolean)
    : undefined;
  app.enableCors({
    origin: corsOrigins?.length ? corsOrigins : true,
  });
  app.setGlobalPrefix('api/v1');
  if (process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Alure API')
      .setDescription('Licensing and update API')
      .setVersion('0.1.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(Number(process.env.PORT) || 3000);
}
bootstrap();
