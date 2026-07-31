import { Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the authenticated user' })
  list(@Query() query: ListNotificationsDto, @Req() request: AuthenticatedRequest) {
    return this.notificationsService.list(request.user.sub, query);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark an owned notification as read' })
  markRead(
    @Param('id', ParseMongoIdPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.notificationsService.markRead(id, request.user.sub);
  }
}
