import { BadRequestException, Injectable } from '@nestjs/common';
import { TicketStatus } from './ticket-status.enum';

const ALLOWED_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  [TicketStatus.OPEN]: [TicketStatus.IN_PROGRESS],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.WAITING_USER, TicketStatus.RESOLVED],
  [TicketStatus.WAITING_USER]: [TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED],
  [TicketStatus.RESOLVED]: [TicketStatus.IN_PROGRESS, TicketStatus.CLOSED],
  [TicketStatus.CLOSED]: [TicketStatus.IN_PROGRESS],
};

@Injectable()
export class TicketWorkflowService {
  assertTransition(current: TicketStatus, next: TicketStatus): void {
    if (current === next) {
      return;
    }
    if (!ALLOWED_TRANSITIONS[current].includes(next)) {
      throw new BadRequestException(`Ticket cannot transition from ${current} to ${next}.`);
    }
  }
}
