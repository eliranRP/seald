import { Global, Module } from '@nestjs/common';
import { parseEnv, type AppEnv } from './env.schema';

export const APP_ENV = Symbol('APP_ENV');

@Global()
@Module({
  providers: [
    {
      provide: APP_ENV,
      useFactory: (): AppEnv => parseEnv(process.env),
    },
  ],
  exports: [APP_ENV],
})
export class ConfigModule {}
