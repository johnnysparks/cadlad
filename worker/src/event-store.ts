export type EventActorKind = 'human' | 'agent';

export interface EventActor {
  kind: EventActorKind;
  id?: string;
}

export interface SourceReplacedPayload {
  source: string;
  params: Record<string, number>;
  revision: number;
}

export interface SceneParamSetPayload {
  params: Record<string, number>;
  changed: Record<string, number>;
  revision: number;
}

export interface EvaluationCompletedPayload {
  revision: number;
  success: boolean;
  errorCount: number;
  warningCount: number;
  hasEvaluationBundle: boolean;
}

export interface AgentIntentDeclaredPayload {
  intent: string;
  summary?: string;
  revision: number;
  patchId?: string;
}

export interface AgentCapabilityGapPayload {
  message: string;
  context?: string;
  revision: number;
}

export interface EventPayloadMap {
  'source.replaced': SourceReplacedPayload;
  'scene.param_set': SceneParamSetPayload;
  'evaluation.completed': EvaluationCompletedPayload;
  'agent.intent_declared': AgentIntentDeclaredPayload;
  'agent.capability_gap': AgentCapabilityGapPayload;
}

export type EventType = keyof EventPayloadMap;

export interface EventEnvelope<T = unknown> {
  id: string;
  projectId: string;
  branchId?: string;
  sessionId?: string;
  actor: EventActor;
  type: EventType;
  payload: T;
  timestamp: number;
}

export interface StreamQuery {
  projectId: string;
  branchId?: string;
  limit?: number;
  types?: EventType[];
  afterTimestamp?: number;
  beforeTimestamp?: number;
}

export interface EventStore {
  append(events: EventEnvelope[]): Promise<void>;
  readStream(query: StreamQuery): Promise<EventEnvelope[]>;
}

export class InMemoryEventStore implements EventStore {
  private readonly events: EventEnvelope[] = [];

  async append(events: EventEnvelope[]): Promise<void> {
    if (events.length === 0) return;
    this.events.push(...events);
    this.events.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  }

  async readStream(query: StreamQuery): Promise<EventEnvelope[]> {
    const limit = normalizeLimit(query.limit);
    const filtered = this.events.filter((event) => {
      if (event.projectId !== query.projectId) return false;
      if (query.branchId && event.branchId !== query.branchId) return false;
      if (query.types && query.types.length > 0 && !query.types.includes(event.type)) return false;
      if (query.afterTimestamp !== undefined && event.timestamp <= query.afterTimestamp) return false;
      if (query.beforeTimestamp !== undefined && event.timestamp >= query.beforeTimestamp) return false;
      return true;
    });
    return filtered.slice(-limit);
  }
}

interface SqlCursor<T> {
  toArray(): T[];
}

interface SqlExecutor {
  exec(query: string, ...bindings: unknown[]): SqlCursor<Record<string, unknown>>;
}

export class SqliteEventStore implements EventStore {
  private schemaReady = false;

  constructor(private readonly sql: SqlExecutor) {}

  async append(events: EventEnvelope[]): Promise<void> {
    if (events.length === 0) return;
    this.ensureSchema();
    for (const event of events) {
      this.sql.exec(
        `INSERT INTO session_events (id, project_id, branch_id, session_id, actor_kind, actor_id, type, payload_json, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        event.id,
        event.projectId,
        event.branchId ?? null,
        event.sessionId ?? null,
        event.actor.kind,
        event.actor.id ?? null,
        event.type,
        JSON.stringify(event.payload),
        event.timestamp,
      );
    }
  }

  async readStream(query: StreamQuery): Promise<EventEnvelope[]> {
    this.ensureSchema();
    const limit = normalizeLimit(query.limit);
    const clauses = ['project_id = ?'];
    const bindings: unknown[] = [query.projectId];

    if (query.branchId) {
      clauses.push('branch_id = ?');
      bindings.push(query.branchId);
    }
    if (query.afterTimestamp !== undefined) {
      clauses.push('ts > ?');
      bindings.push(query.afterTimestamp);
    }
    if (query.beforeTimestamp !== undefined) {
      clauses.push('ts < ?');
      bindings.push(query.beforeTimestamp);
    }
    if (query.types && query.types.length > 0) {
      clauses.push(`type IN (${query.types.map(() => '?').join(',')})`);
      bindings.push(...query.types);
    }

    bindings.push(limit);

    const rows = this.sql.exec(
      `SELECT id, project_id, branch_id, session_id, actor_kind, actor_id, type, payload_json, ts
       FROM session_events
       WHERE ${clauses.join(' AND ')}
       ORDER BY ts DESC, id DESC
       LIMIT ?`,
      ...bindings,
    ).toArray();

    return rows
      .map((row) => ({
        id: String(row.id),
        projectId: String(row.project_id),
        ...(row.branch_id ? { branchId: String(row.branch_id) } : {}),
        ...(row.session_id ? { sessionId: String(row.session_id) } : {}),
        actor: {
          kind: normalizeActorKind(row.actor_kind),
          ...(row.actor_id ? { id: String(row.actor_id) } : {}),
        },
        type: String(row.type) as EventType,
        payload: parsePayload(row.payload_json),
        timestamp: Number(row.ts),
      }))
      .reverse();
  }

  private ensureSchema(): void {
    if (this.schemaReady) return;
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS session_events (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        branch_id TEXT,
        session_id TEXT,
        actor_kind TEXT NOT NULL,
        actor_id TEXT,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        ts INTEGER NOT NULL
      )`,
    );
    this.sql.exec('CREATE INDEX IF NOT EXISTS idx_session_events_project_ts ON session_events(project_id, ts)');
    this.tryAddColumn('branch_id TEXT');
    this.tryAddColumn('session_id TEXT');
    this.sql.exec('CREATE INDEX IF NOT EXISTS idx_session_events_project_branch_ts ON session_events(project_id, branch_id, ts)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS idx_session_events_project_type_ts ON session_events(project_id, type, ts)');
    this.schemaReady = true;
  }

  private tryAddColumn(columnDef: string): void {
    try {
      this.sql.exec(`ALTER TABLE session_events ADD COLUMN ${columnDef}`);
    } catch {
      // no-op: column already exists
    }
  }
}

function parsePayload(raw: unknown): unknown {
  if (typeof raw !== 'string') return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function normalizeActorKind(raw: unknown): EventActorKind {
  return raw === 'agent' ? 'agent' : 'human';
}

function normalizeLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return 100;
  return Math.min(Math.max(Math.floor(limit), 1), 500);
}
