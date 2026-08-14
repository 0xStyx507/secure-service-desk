import { useMemo, useState } from 'react';
import { SearchIcon, ShieldIcon, TicketIcon } from '../../components/Icons';
import { mcpApi } from './api';
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
    description: 'Consulta artículos publicados disponibles para MCP.',
  },
};

function resultPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const source = value as { structuredContent?: unknown; content?: Array<{ text?: string }> };
  if (source.structuredContent && typeof source.structuredContent === 'object') {
    const structured = source.structuredContent as { result?: unknown };
    return 'result' in structured ? structured.result : structured;
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
      setResult(
        resultPayload(await mcpApi.callTool(tool, buildToolArgs(tool, query, selectedTicket))),
      );
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
      <McpHeader />
      <p className="muted">
        Esta consola usa el endpoint MCP autenticado con tu JWT. Las herramientas mutantes no se
        ejecutan desde la demo sin una confirmación separada.
      </p>
      <div className="mcp-console__layout">
        <McpControls
          tool={tool}
          query={query}
          selectedTicket={selectedTicket}
          tickets={tickets}
          needsTicket={needsTicket}
          busy={busy}
          onToolChange={setTool}
          onQueryChange={setQuery}
          onTicketChange={setSelectedTicket}
          onRun={() => void runTool()}
        />
        <McpResult result={result} error={error} />
      </div>
    </section>
  );
}

function buildToolArgs(
  tool: McpTool,
  query: string,
  selectedTicket: string,
): Record<string, unknown> {
  if (tool === 'search_tickets')
    return { ...(query.trim() ? { search: query.trim() } : {}), limit: 10 };
  if (tool === 'search_knowledge_base') return { query: query.trim(), limit: 10 };
  if (!selectedTicket) throw new Error('Selecciona un ticket para ejecutar esta herramienta.');
  return { ticketId: selectedTicket };
}

function McpHeader() {
  return (
    <div className="panel__heading">
      <div>
        <p className="eyebrow">MODEL CONTEXT PROTOCOL</p>
        <h2 id="mcp-title">MCP operations console</h2>
      </div>
      <span className="protocol-badge">
        <i /> Streamable HTTP
      </span>
    </div>
  );
}

function McpControls({
  tool,
  query,
  selectedTicket,
  tickets,
  needsTicket,
  busy,
  onToolChange,
  onQueryChange,
  onTicketChange,
  onRun,
}: {
  tool: McpTool;
  query: string;
  selectedTicket: string;
  tickets: Ticket[];
  needsTicket: boolean;
  busy: boolean;
  onToolChange: (tool: McpTool) => void;
  onQueryChange: (value: string) => void;
  onTicketChange: (value: string) => void;
  onRun: () => void;
}) {
  const isSearch = tool === 'search_tickets' || tool === 'search_knowledge_base';
  return (
    <div className="mcp-console__controls">
      <label>
        Herramienta
        <select value={tool} onChange={(event) => onToolChange(event.target.value as McpTool)}>
          {Object.entries(toolCopy).map(([value, copy]) => (
            <option key={value} value={value}>
              {copy.label}
            </option>
          ))}
        </select>
      </label>
      <p className="field-hint">{toolCopy[tool].description}</p>
      {isSearch ? (
        <SearchControl tool={tool} query={query} onChange={onQueryChange} />
      ) : (
        <TicketControl
          selectedTicket={selectedTicket}
          tickets={tickets}
          onChange={onTicketChange}
        />
      )}
      <button
        className="button button--primary"
        disabled={busy || (needsTicket && !selectedTicket)}
        onClick={onRun}
      >
        <TicketIcon /> {busy ? 'Ejecutando...' : 'Ejecutar herramienta'}
      </button>
    </div>
  );
}

function SearchControl({
  tool,
  query,
  onChange,
}: {
  tool: McpTool;
  query: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{tool === 'search_tickets' ? 'Texto de búsqueda' : 'Consulta de conocimiento'}</span>
      <div className="mcp-search-input">
        <SearchIcon />
        <input
          value={query}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Escribe una consulta..."
          maxLength={200}
        />
      </div>
    </label>
  );
}

function TicketControl({
  selectedTicket,
  tickets,
  onChange,
}: {
  selectedTicket: string;
  tickets: Ticket[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      Ticket visible
      <select value={selectedTicket} onChange={(event) => onChange(event.target.value)}>
        <option value="">Selecciona un ticket</option>
        {tickets.map((ticket) => (
          <option key={ticket._id} value={ticket._id}>
            {ticket.number} · {ticket.subject}
          </option>
        ))}
      </select>
    </label>
  );
}

function McpResult({ result, error }: { result: unknown; error?: string }) {
  return (
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
        <div className="mcp-empty">Selecciona una herramienta para ver su respuesta aquí.</div>
      )}
      {result !== undefined && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
