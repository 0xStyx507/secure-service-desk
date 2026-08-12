import { useMemo, useState } from 'react';
import { SearchIcon, ShieldIcon, TicketIcon } from '../../components/Icons';
import { api } from '../../lib/api';
import type { Ticket } from '../../types';

interface McpConsoleProps {
  tickets: Ticket[];
}

type McpTool =
  | 'search_tickets'
  | 'summarize_ticket'
  | 'suggest_priority'
  | 'suggest_assignee'
  | 'search_knowledge_base';

const toolCopy: Record<McpTool, { label: string; description: string }> = {
  search_tickets: {
    label: 'Buscar tickets',
    description: 'Consulta tickets visibles aplicando el alcance del usuario.',
  },
  summarize_ticket: {
    label: 'Resumir ticket',
    description: 'Genera un resumen determinista del ticket seleccionado.',
  },
  suggest_priority: {
    label: 'Sugerir prioridad',
    description: 'Propone una prioridad sin modificar el ticket.',
  },
  suggest_assignee: {
    label: 'Sugerir responsable',
    description: 'Busca un candidato activo de soporte.',
  },
  search_knowledge_base: {
    label: 'Buscar conocimiento',
    description: 'Consulta articulos publicados disponibles para MCP.',
  },
};

function resultPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const source = value as { structuredContent?: unknown; content?: Array<{ text?: string }> };
  if (source.structuredContent && typeof source.structuredContent === 'object') {
    const structured = source.structuredContent as { result?: unknown };
    if ('result' in structured) return structured.result;
    return structured;
  }
  const text = source.content?.find((item) => item.text)?.text;
  if (!text) return value;
  try {
    const parsed = JSON.parse(text) as { result?: unknown };
    return 'result' in parsed ? parsed.result : parsed;
  } catch {
    return text;
  }
}

export function McpConsole({ tickets }: McpConsoleProps) {
  const [tool, setTool] = useState<McpTool>('search_tickets');
  const [query, setQuery] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(tickets[0]?._id ?? '');
  const [result, setResult] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const needsTicket = useMemo(
    () => tool !== 'search_tickets' && tool !== 'search_knowledge_base',
    [tool],
  );

  async function runTool() {
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    try {
      const args: Record<string, unknown> = {};
      if (tool === 'search_tickets') {
        if (query.trim()) args.search = query.trim();
        args.limit = 10;
      } else if (tool === 'search_knowledge_base') {
        args.query = query.trim();
        args.limit = 10;
      } else {
        if (!selectedTicket)
          throw new Error('Selecciona un ticket para ejecutar esta herramienta.');
        args.ticketId = selectedTicket;
      }
      setResult(resultPayload(await api.callMcpTool(tool, args)));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'No fue posible ejecutar la herramienta MCP.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel mcp-console" aria-labelledby="mcp-title">
      <div className="panel__heading">
        <div>
          <p className="eyebrow">MODEL CONTEXT PROTOCOL</p>
          <h2 id="mcp-title">MCP operations console</h2>
        </div>
        <span className="protocol-badge">
          <i /> Streamable HTTP
        </span>
      </div>
      <p className="muted">
        Esta consola usa el endpoint MCP autenticado con tu JWT. Las herramientas mutantes no se
        ejecutan desde la demo sin una confirmacion separada.
      </p>

      <div className="mcp-console__layout">
        <div className="mcp-console__controls">
          <label>
            Herramienta
            <select value={tool} onChange={(event) => setTool(event.target.value as McpTool)}>
              {Object.entries(toolCopy).map(([value, copy]) => (
                <option key={value} value={value}>
                  {copy.label}
                </option>
              ))}
            </select>
          </label>
          <p className="field-hint">{toolCopy[tool].description}</p>
          {tool === 'search_tickets' || tool === 'search_knowledge_base' ? (
            <label>
              <span>
                {tool === 'search_tickets' ? 'Texto de busqueda' : 'Consulta de conocimiento'}
              </span>
              <div className="mcp-search-input">
                <SearchIcon />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Escribe una consulta..."
                  maxLength={200}
                />
              </div>
            </label>
          ) : (
            <label>
              Ticket visible
              <select
                value={selectedTicket}
                onChange={(event) => setSelectedTicket(event.target.value)}
              >
                <option value="">Selecciona un ticket</option>
                {tickets.map((ticket) => (
                  <option key={ticket._id} value={ticket._id}>
                    {ticket.number} · {ticket.subject}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            className="button button--primary"
            disabled={busy || (needsTicket && !selectedTicket)}
            onClick={() => void runTool()}
          >
            <TicketIcon /> {busy ? 'Ejecutando...' : 'Ejecutar herramienta'}
          </button>
        </div>
        <div className="mcp-console__result" aria-live="polite">
          <div className="mcp-console__result-head">
            <ShieldIcon />
            <span>Resultado sanitizado y auditable</span>
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          {!error && result === undefined && (
            <div className="mcp-empty">Selecciona una herramienta para ver su respuesta aqui.</div>
          )}
          {result !== undefined && <pre>{JSON.stringify(result, null, 2)}</pre>}
        </div>
      </div>
    </section>
  );
}
