import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiAcceptedResponse, ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Role } from '../auth/roles.enum';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateTicketReportDto } from './dto/create-ticket-report.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPPORT)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('tickets')
  @HttpCode(202)
  @ApiAcceptedResponse({ description: 'Report queued for asynchronous generation.' })
  @ApiOperation({ summary: 'Queue a ticket PDF report' })
  create(@Body() dto: CreateTicketReportDto, @Req() request: AuthenticatedRequest) {
    return this.reportsService.create(dto, request.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read the status of an owned report job' })
  findOne(@Param('id', ParseMongoIdPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.reportsService.findOne(id, request.user);
  }

  @Get(':id/content')
  @ApiOperation({ summary: 'Download a completed ticket report' })
  async download(
    @Param('id', ParseMongoIdPipe) id: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const download = await this.reportsService.download(id, request.user);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="ticket-report-${download.report.id}.pdf"`,
    );
    return new StreamableFile(download.stream);
  }
}
