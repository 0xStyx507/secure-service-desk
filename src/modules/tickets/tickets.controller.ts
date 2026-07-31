import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Role } from '../auth/roles.enum';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ListTicketsDto } from './dto/list-tickets.dto';
import { ListCommentsDto } from './dto/list-comments.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketsService } from './tickets.service';

@ApiTags('tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a ticket for the authenticated requester' })
  @ApiCreatedResponse({ description: 'Ticket created.' })
  create(@Body() dto: CreateTicketDto, @Req() request: AuthenticatedRequest) {
    return this.ticketsService.create(dto, request.user);
  }

  @Get()
  @ApiOperation({
    summary: 'List visible tickets with pagination, search and filters',
  })
  @ApiOkResponse({ description: 'Paginated tickets.' })
  list(@Query() query: ListTicketsDto, @Req() request: AuthenticatedRequest) {
    return this.ticketsService.list(query, request.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a visible ticket' })
  findOne(
    @Param('id', ParseMongoIdPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ticketsService.findOne(id, request.user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPPORT)
  @ApiOperation({ summary: 'Update workflow, priority or assignment' })
  update(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: UpdateTicketDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ticketsService.update(id, dto, request.user);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add a public or authorized internal comment' })
  addComment(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: CreateCommentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ticketsService.addComment(id, dto, request.user);
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'List visible comments for a ticket' })
  listComments(
    @Param('id', ParseMongoIdPipe) id: string,
    @Query() query: ListCommentsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ticketsService.listComments(id, request.user, query);
  }
}
