import { Module } from '@nestjs/common';

/**
 * Not imported from AppModule. The seal still converts displayed points
 * in displayed-page.ts, so this module stays unmounted. Callers construct
 * FieldPlacementService with a PlacementStore (envelopePlacementStore).
 * The remote server flag belongs to step 1 and is not read here.
 */
@Module({})
export class FieldPlacementModule {}
