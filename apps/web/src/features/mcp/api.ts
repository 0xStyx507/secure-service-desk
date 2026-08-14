import type { McpToolResult } from '../../types';
import { sessionManager } from '../../lib/http/client';
import type { SessionManager } from '../../lib/http/SessionManager';

export class McpApi {
  constructor(private readonly sessions: SessionManager) {}

  async callTool(
    name: string,
    argumentsValue: Record<string, unknown> = {},
  ): Promise<McpToolResult> {
    const response = await this.sessions.authenticatedRequest<unknown>('/mcp', {
      method: 'POST',
      headers: { accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tools/call',
        params: { name, arguments: argumentsValue },
      }),
    });
    if (!response || typeof response !== 'object')
      throw new Error('La respuesta MCP no tiene un formato valido.');
    const result = response as { error?: { message?: string }; result?: McpToolResult };
    if (result.error) throw new Error(result.error.message ?? 'La herramienta MCP fallo.');
    if (!result.result) throw new Error('La respuesta MCP no contiene resultado.');
    if (result.result.isError) {
      const text = result.result.content?.find((item) => item.type === 'text')?.text;
      throw new Error(text ?? 'La herramienta MCP fallo.');
    }
    return result.result;
  }
}

export const mcpApi = new McpApi(sessionManager);
