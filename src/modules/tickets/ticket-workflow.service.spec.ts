import { BadRequestException } from '@nestjs/common';
import { TicketStatus } from './ticket-status.enum';
import { TicketWorkflowService } from './ticket-workflow.service';

describe('TicketWorkflowService', () => {
  const service = new TicketWorkflowService();

  it('allows an explicit support workflow transition', () => {
    expect(() =>
      service.assertTransition(TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED),
    ).not.toThrow();
  });

  it('rejects skipping directly from OPEN to CLOSED', () => {
    expect(() => service.assertTransition(TicketStatus.OPEN, TicketStatus.CLOSED)).toThrow(
      BadRequestException,
    );
  });

  it('allows a closed ticket to be deliberately reopened in progress', () => {
    expect(() =>
      service.assertTransition(TicketStatus.CLOSED, TicketStatus.IN_PROGRESS),
    ).not.toThrow();
  });
});
