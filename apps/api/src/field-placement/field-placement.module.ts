import { Module } from '@nestjs/common';
import { FieldPlacementEngine, type DocumentBytesSource } from './field-placement.engine';

export const DOCUMENT_BYTES_SOURCE = Symbol('DOCUMENT_BYTES_SOURCE');

/**
 * Not imported from `AppModule`. The engine stays unloaded, and every
 * method 404s while `mcpServer` is false. A later MCP pull request
 * imports this module and supplies the document bytes.
 */
@Module({
  providers: [
    {
      provide: FieldPlacementEngine,
      useFactory: (source: DocumentBytesSource) => new FieldPlacementEngine(source),
      inject: [DOCUMENT_BYTES_SOURCE],
    },
  ],
  exports: [FieldPlacementEngine],
})
export class FieldPlacementModule {}
