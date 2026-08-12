import { Controller, ForbiddenException, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { z, type ZodRawShape } from 'zod';
import { JwtTokenService } from '../auth/jwt-token.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { UsersService } from '../users/users.service';
import { UserStatus } from '../users/user-status.enum';
import { mcpRoleSet } from './mcp-tools.service';
import {
  actionTokenSchema,
  prepareCommentSchema,
  prepareStatusChangeSchema,
  searchTicketsSchema,
  McpToolsService,
} from './mcp-tools.service';

@ApiTags('mcp')
@ApiBearerAuth()
@Controller('mcp')
export class McpController {
  constructor(
    private readonly tools: McpToolsService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  @ApiConsumes('application/json')
  @ApiOperation({ summary: 'MCP Streamable HTTP endpoint for authorized service-desk tools' })
  async handle(@Req() request: Request, @Res() response: Response): Promise<void> {
    const actor = await this.authenticate(request);
    const server = this.createServer(actor);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    response.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  }

  private createServer(actor: AuthenticatedUser): McpServer {
    const server = new McpServer({ name: 'secure-service-desk', version: '0.2.0' });
    const registerTool = (server as unknown as {
      registerTool: (
        name: string,
        config: { description: string; inputSchema: ZodRawShape },
        handler: (input: Record<string, unknown>) => Promise<unknown>,
      ) => unknown;
    }).registerTool.bind(server);
    const register = (
      name: string,
      description: string,
      inputSchema: ZodRawShape,
      handler: (input: Record<string, unknown>) => Promise<unknown>,
    ) => {
      registerTool(name, { description, inputSchema }, async (input: Record<string, unknown>) => {
        try {
          const result = await handler(input);
          const output = { result: this.sanitize(result) };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Tool execution failed.';
          return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
          };
        }
      });
    };

    register('search_tickets', 'Search visible tickets with pagination and filters.', searchTicketsSchema.shape,
      (input) => this.tools.searchTickets(actor, input as Parameters<McpToolsService['searchTickets']>[1]));
    register('get_ticket_details', 'Get one visible ticket and its visible comments.', {
      ticketId: z.string().regex(/^[a-f\d]{24}$/i),
    }, (input) => this.tools.getTicketDetails(actor, String(input.ticketId)));
    register('summarize_ticket', 'Create a deterministic, non-LLM summary of a visible ticket.', {
      ticketId: z.string().regex(/^[a-f\d]{24}$/i),
    }, (input) => this.tools.summarizeTicket(actor, String(input.ticketId)));
    register('search_knowledge_base', 'Search published knowledge-base articles visible to the MCP context.', {
      query: z.string().max(200).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }, (input) => this.tools.searchKnowledgeBase(actor, String(input.query ?? ''), Number(input.limit ?? 10)));
    register('suggest_priority', 'Suggest a priority without changing the ticket.', {
      ticketId: z.string().regex(/^[a-f\d]{24}$/i),
    }, (input) => this.tools.suggestPriority(actor, String(input.ticketId)));
    register('suggest_assignee', 'Suggest an active support candidate without changing the ticket.', {
      ticketId: z.string().regex(/^[a-f\d]{24}$/i),
    }, (input) => this.tools.suggestAssignee(actor, String(input.ticketId)));
    register('prepare_ticket_comment', 'Prepare a comment; confirmation is required before mutation.', prepareCommentSchema.shape,
      (input) => this.tools.prepareComment(actor, input as Parameters<McpToolsService['prepareComment']>[1]));
    register('prepare_status_change', 'Prepare a ticket workflow change; confirmation is required before mutation.', prepareStatusChangeSchema.shape,
      (input) => this.tools.prepareStatusChange(actor, input as Parameters<McpToolsService['prepareStatusChange']>[1]));
    register('confirm_action', 'Confirm and execute one previously prepared mutating action.', actionTokenSchema.shape,
      (input) => this.tools.confirmAction(actor, String(input.actionToken)));
    register('cancel_action', 'Cancel one previously prepared mutating action.', actionTokenSchema.shape,
      (input) => this.tools.cancelAction(actor, String(input.actionToken)));
    return server;
  }

  private async authenticate(request: Request): Promise<AuthenticatedUser> {
    const [scheme, token] = request.header('authorization')?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Bearer access token is required.');
    }
    const identity = await this.jwtTokenService.verifyAccessToken(token);
    const user = await this.usersService.findById(identity.sub);
    if (!user || user.status !== UserStatus.ACTIVE || user.authzVersion !== identity.authzVersion) {
      throw new UnauthorizedException('Access token is no longer valid.');
    }
    if (!user.roles.some((role) => mcpRoleSet.has(role))) {
      throw new ForbiddenException('MCP access is restricted to ADMIN and SUPPORT roles.');
    }
    return { ...identity, email: user.email, roles: user.roles, authzVersion: user.authzVersion };
  }

  private sanitize(value: unknown): unknown {
    return JSON.parse(JSON.stringify(value));
  }
}
