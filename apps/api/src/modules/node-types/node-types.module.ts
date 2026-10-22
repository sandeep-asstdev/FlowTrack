import { Module } from '@nestjs/common';
import { NodeTypesService } from './node-types.service';
import { NodeTypesController } from './node-types.controller';

@Module({
  controllers: [NodeTypesController],
  providers: [NodeTypesService],
  exports: [NodeTypesService],
})
export class NodeTypesModule {}
