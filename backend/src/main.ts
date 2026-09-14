import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    // The Docker frontend is served by nginx on port 80, so its origin is
    // http://localhost with no port — the :5173/:3000 entries are the dev servers.
    origin: [
      'http://localhost',
      'http://127.0.0.1',
      'http://localhost:5173',
      'http://localhost:3000',
    ],
  });
  await app.listen(3000);
}
void bootstrap();
