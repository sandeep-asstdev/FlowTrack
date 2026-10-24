import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Response,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto, EvidenceReviewDto } from '@flowtrack/shared';
import type { Response as ExpressResponse } from 'express';

@Controller()
@UseGuards(AuthGuard('jwt'))
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('nodes/:nodeId/documents')
  async addDocument(
    @Request() req: any,
    @Param('nodeId') nodeId: string,
    @Body() body: CreateDocumentDto
  ) {
    return this.documentsService.addDocument(nodeId, req.user.id, body);
  }

  @Get('nodes/:nodeId/documents')
  async getNodeDocuments(@Request() req: any, @Param('nodeId') nodeId: string) {
    return this.documentsService.getNodeDocuments(nodeId, req.user.id);
  }

  @Get('nodes/:nodeId/documents/:id/download')
  async downloadDocument(
    @Request() req: any,
    @Param('id') documentId: string,
    @Res() res: ExpressResponse
  ) {
    const file = await this.documentsService.getDocumentForDownload(documentId, req.user.id);

    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.name)}"`
    );

    if (file.fileSize) {
      res.setHeader('Content-Length', file.fileSize);
    }

    if (file.stream) {
      file.stream.pipe(res);
    } else if (file.dataUrl && file.dataUrl.startsWith('data:')) {
      const parts = file.dataUrl.split(';base64,');
      if (parts.length === 2) {
        const buffer = Buffer.from(parts[1], 'base64');
        res.send(buffer);
        return;
      }
      res.redirect(file.dataUrl);
    } else {
      res.send(Buffer.from('File contents unavailable'));
    }
  }

  @Post('documents/:id/verify-evidence')
  async verifyEvidence(
    @Request() req: any,
    @Param('id') documentId: string,
    @Body() reviewDto: EvidenceReviewDto
  ) {
    return this.documentsService.verifyEvidence(documentId, req.user.id, reviewDto);
  }

  @Delete('documents/:id')
  async deleteDocument(@Request() req: any, @Param('id') documentId: string) {
    return this.documentsService.deleteDocument(documentId, req.user.id);
  }
}
