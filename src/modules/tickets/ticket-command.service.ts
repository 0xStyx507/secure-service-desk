import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { Role } from '../auth/roles.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { UserStatus } from '../users/user-status.enum';
import { UsersService } from '../users/users.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketCounter, TicketCounterDocument } from './schemas/ticket-counter.schema';
import { Ticket, TicketDocument } from './schemas/ticket.schema';
import { TicketAccessService } from './ticket-access.service';
import { TicketNotificationPolicy } from './ticket-notification-policy.service';
import { TicketStatus } from './ticket-status.enum';
import { TicketWorkflowService } from './ticket-workflow.service';

interface TicketChanges {
  changedFields: string[];
  assigneeChanged: boolean;
  statusChanged: boolean;
  priorityChanged: boolean;
}

@Injectable()
export class TicketCommandService {
  constructor(
    @InjectModel(Ticket.name) private readonly ticketModel: Model<TicketDocument>,
    @InjectModel(TicketCounter.name) private readonly counterModel: Model<TicketCounterDocument>,
    private readonly usersService: UsersService,
    private readonly access: TicketAccessService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly cacheService: CacheService,
    private readonly workflow: TicketWorkflowService,
    private readonly notificationPolicy: TicketNotificationPolicy,
  ) {}

  async create(dto: CreateTicketDto, actor: AuthenticatedUser): Promise<TicketDocument> {
    const sequence = await this.counterModel
      .findOneAndUpdate(
        { key: 'ticket-number' },
        { $inc: { sequence: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
    if (!sequence) throw new ConflictException('Could not allocate a ticket number.');
    const ticket = await this.ticketModel.create({
      number: `SD-${sequence.sequence.toString().padStart(6, '0')}`,
      subject: dto.subject,
      description: dto.description,
      requesterId: new Types.ObjectId(actor.sub),
    });
    await Promise.allSettled([
      this.auditService.record({
        actorId: actor.sub,
        action: 'TICKET_CREATED',
        resourceType: 'ticket',
        resourceId: ticket.id,
        metadata: { number: ticket.number },
      }),
      this.notificationsService.create({
        userId: actor.sub,
        type: 'TICKET_CREATED',
        title: `${ticket.number} created`,
        message: 'Your support request was registered.',
        resourceType: 'ticket',
        resourceId: ticket.id,
      }),
      this.cacheService.invalidate('tickets'),
    ]);
    return ticket;
  }

  async update(
    id: string,
    dto: UpdateTicketDto,
    actor: AuthenticatedUser,
  ): Promise<TicketDocument> {
    const ticket = await this.findTicket(id);
    this.assertCanUpdate(ticket, dto, actor);
    const changes = await this.applyChanges(ticket, dto);
    try {
      const updated = await ticket.save();
      await this.notifyUpdatedTicket(updated, actor, changes);
      await this.cacheService.invalidate('tickets');
      return updated;
    } catch (error) {
      if (error instanceof Error && error.name === 'VersionError')
        throw new ConflictException('Ticket changed. Reload it before updating.');
      throw error;
    }
  }

  private assertCanUpdate(
    ticket: TicketDocument,
    dto: UpdateTicketDto,
    actor: AuthenticatedUser,
  ): void {
    if (!this.access.canManage(actor)) {
      throw new BadRequestException('Only support staff can update ticket workflow.');
    }
    if (ticket.version !== dto.version) {
      throw new ConflictException('Ticket changed. Reload it before updating.');
    }
  }

  private async applyChanges(ticket: TicketDocument, dto: UpdateTicketDto): Promise<TicketChanges> {
    const changedFields: string[] = [];
    const assigneeChanged = await this.applyAssigneeChange(ticket, dto, changedFields);
    const statusChanged = this.applyStatusChange(ticket, dto, changedFields);
    const priorityChanged = this.applyPriorityChange(ticket, dto, changedFields);
    this.applyResolutionChange(ticket, dto, changedFields);
    return { changedFields, assigneeChanged, statusChanged, priorityChanged };
  }

  private async applyAssigneeChange(
    ticket: TicketDocument,
    dto: UpdateTicketDto,
    changedFields: string[],
  ): Promise<boolean> {
    if (dto.assigneeId === undefined) return false;
    const previous = ticket.assigneeId?.toString();
    ticket.assigneeId = await this.resolveAssignee(dto.assigneeId);
    const changed = previous !== ticket.assigneeId?.toString();
    if (changed) changedFields.push('assigneeId');
    return changed;
  }

  private applyStatusChange(
    ticket: TicketDocument,
    dto: UpdateTicketDto,
    changedFields: string[],
  ): boolean {
    if (dto.status === undefined) return false;
    this.workflow.assertTransition(ticket.status, dto.status);
    this.assertResolutionForStatus(ticket, dto);
    const changed = ticket.status !== dto.status;
    ticket.status = dto.status;
    this.updateStatusDates(ticket, dto.status);
    if (changed) changedFields.push('status');
    return changed;
  }

  private assertResolutionForStatus(ticket: TicketDocument, dto: UpdateTicketDto): void {
    if (dto.status === TicketStatus.RESOLVED && !(dto.resolution ?? ticket.resolution)) {
      throw new BadRequestException('A resolution is required to resolve the ticket.');
    }
  }

  private updateStatusDates(ticket: TicketDocument, status: TicketStatus): void {
    if (status === TicketStatus.RESOLVED) ticket.resolvedAt = new Date();
    if (status === TicketStatus.CLOSED) ticket.closedAt = new Date();
    if (status === TicketStatus.IN_PROGRESS) {
      ticket.resolvedAt = undefined;
      ticket.closedAt = undefined;
      ticket.resolution = undefined;
    }
  }

  private applyPriorityChange(
    ticket: TicketDocument,
    dto: UpdateTicketDto,
    changedFields: string[],
  ): boolean {
    if (dto.priority === undefined) return false;
    const changed = ticket.priority !== dto.priority;
    ticket.priority = dto.priority;
    if (changed) changedFields.push('priority');
    return changed;
  }

  private applyResolutionChange(
    ticket: TicketDocument,
    dto: UpdateTicketDto,
    changedFields: string[],
  ): void {
    if (dto.resolution === undefined) return;
    if (ticket.status !== TicketStatus.RESOLVED && ticket.status !== TicketStatus.CLOSED) {
      throw new BadRequestException(
        'A resolution can only be stored on a resolved or closed ticket.',
      );
    }
    ticket.resolution = dto.resolution;
    changedFields.push('resolution');
  }

  private async notifyUpdatedTicket(
    ticket: TicketDocument,
    actor: AuthenticatedUser,
    changes: TicketChanges,
  ): Promise<void> {
    await Promise.allSettled([
      this.auditService.record({
        actorId: actor.sub,
        action: 'TICKET_UPDATED',
        resourceType: 'ticket',
        resourceId: ticket.id,
        metadata: {
          number: ticket.number,
          changedFields: changes.changedFields,
          version: ticket.version,
        },
      }),
      this.notificationsService.createMany(
        this.notificationPolicy.buildUpdateNotifications(ticket, actor, changes),
      ),
    ]);
  }

  async addWatcher(
    ticketId: string,
    watcherId: string,
    actor: AuthenticatedUser,
  ): Promise<TicketDocument> {
    const ticket = await this.findTicket(ticketId);
    this.assertCanManageWatchers(actor);
    const watcher = await this.usersService.findById(watcherId);
    if (!watcher || watcher.status !== UserStatus.ACTIVE)
      throw new BadRequestException('Watcher must be an active user.');
    if (ticket.watcherIds.some((id) => id.toString() === watcherId)) return ticket;
    ticket.watcherIds.push(new Types.ObjectId(watcherId));
    const updated = await ticket.save();
    await Promise.allSettled([
      this.auditService.record({
        actorId: actor.sub,
        action: 'TICKET_WATCHER_ADDED',
        resourceType: 'ticket',
        resourceId: updated.id,
        metadata: { watcherId },
      }),
      this.cacheService.invalidate('tickets'),
    ]);
    return updated;
  }

  async removeWatcher(
    ticketId: string,
    watcherId: string,
    actor: AuthenticatedUser,
  ): Promise<TicketDocument> {
    const ticket = await this.findTicket(ticketId);
    this.assertCanManageWatchers(actor);
    const originalLength = ticket.watcherIds.length;
    ticket.watcherIds = ticket.watcherIds.filter((id) => id.toString() !== watcherId);
    if (ticket.watcherIds.length === originalLength) return ticket;
    const updated = await ticket.save();
    await Promise.allSettled([
      this.auditService.record({
        actorId: actor.sub,
        action: 'TICKET_WATCHER_REMOVED',
        resourceType: 'ticket',
        resourceId: updated.id,
        metadata: { watcherId },
      }),
      this.cacheService.invalidate('tickets'),
    ]);
    return updated;
  }

  assertCanModifyContent(ticket: TicketDocument): void {
    this.access.assertCanModifyContent(ticket);
  }

  private async findTicket(id: string): Promise<TicketDocument> {
    const ticket = await this.ticketModel.findById(id).exec();
    if (!ticket) throw new NotFoundException('Ticket not found.');
    return ticket;
  }

  private async resolveAssignee(assigneeId: string | null): Promise<Types.ObjectId | undefined> {
    if (assigneeId === null) return undefined;
    const assignee = await this.usersService.findById(assigneeId);
    const canSupport =
      assignee?.status === UserStatus.ACTIVE &&
      assignee.roles.some((role) => role === Role.SUPPORT || role === Role.ADMIN);
    if (!assignee || !canSupport)
      throw new BadRequestException('Assignee must be an active support user.');
    return new Types.ObjectId(assigneeId);
  }

  private assertCanManageWatchers(actor: AuthenticatedUser): void {
    if (!this.access.canManage(actor))
      throw new ForbiddenException('Only support staff can manage ticket watchers.');
  }
}
