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
  category?: 'missing-primitive' | 'api-limitation' | 'validation-gap' | 'other';
  blockedTask?: string;
  attemptedApproach?: string;
  workaroundSummary?: string;
  revision: number;
}

export interface AgentWorkaroundRecordedPayload {
  summary: string;
  limitation: string;
  workaround: string;
  impact?: 'low' | 'medium' | 'high';
  patchId?: string;
  revision: number;
}

export interface EventPayloadMap {
  'source.replaced': SourceReplacedPayload;
  'scene.param_set': SceneParamSetPayload;
  'evaluation.completed': EvaluationCompletedPayload;
  'agent.intent_declared': AgentIntentDeclaredPayload;
  'agent.capability_gap': AgentCapabilityGapPayload;
  'agent.workaround_recorded': AgentWorkaroundRecordedPayload;
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

export interface SqliteQueryRunner {
  run(query: string, bindings?: unknown[]): void;
  all(query: string, bindings?: unknown[]): Record<string, unknown>[];
}

export class SqliteEventStore implements EventStore {
  private schemaReady = false;

  constructor(private readonly db: SqliteQueryRunner) {}

  async append(events: EventEnvelope[]): Promise<void> {
    if (events.length === 0) return;
    this.ensureSchema();
    for (const event of events) {
      this.db.run(
        `INSERT INTO session_events (id, project_id, branch_id, session_id, actor_kind, actor_id, type, payload_json, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.id,
          event.projectId,
          event.branchId ?? null,
          event.sessionId ?? null,
          event.actor.kind,
          event.actor.id ?? null,
          event.type,
          JSON.stringify(event.payload),
          event.timestamp,
        ],
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

    const rows = this.db.all(
      `SELECT id, project_id, branch_id, session_id, actor_kind, actor_id, type, payload_json, ts
       FROM session_events
       WHERE ${clauses.join(' AND ')}
       ORDER BY ts DESC, id DESC
       LIMIT ?`,
      bindings,
    );

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
    this.db.run(
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
    this.db.run('CREATE INDEX IF NOT EXISTS idx_session_events_project_ts ON session_events(project_id, ts)');
    this.tryAddColumn('branch_id TEXT');
    this.tryAddColumn('session_id TEXT');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_session_events_project_branch_ts ON session_events(project_id, branch_id, ts)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_session_events_project_type_ts ON session_events(project_id, type, ts)');
    this.schemaReady = true;
  }

  private tryAddColumn(columnDef: string): void {
    try {
      this.db.run(`ALTER TABLE session_events ADD COLUMN ${columnDef}`);
    } catch {
      // no-op: column already exists
    }
  }
}

interface SqlCursor<T> {
  toArray(): T[];
}

interface DurableObjectSqlExecutor {
  exec(query: string, ...bindings: unknown[]): SqlCursor<Record<string, unknown>>;
}

export function createDurableObjectSqliteRunner(sql: DurableObjectSqlExecutor): SqliteQueryRunner {
  return {
    run(query, bindings = []) {
      sql.exec(query, ...bindings);
    },
    all(query, bindings = []) {
      return sql.exec(query, ...bindings).toArray();
    },
  };
}

interface PreparedStatementSqliteStatement {
  run(...bindings: unknown[]): unknown;
  all(...bindings: unknown[]): Record<string, unknown>[];
}

interface PreparedStatementSqliteDatabase {
  prepare(query: string): PreparedStatementSqliteStatement;
}

export function createPreparedStatementSqliteRunner(db: PreparedStatementSqliteDatabase): SqliteQueryRunner {
  return {
    run(query, bindings = []) {
      db.prepare(query).run(...bindings);
    },
    all(query, bindings = []) {
      return db.prepare(query).all(...bindings);
    },
  };
}

interface SqlJsStatement {
  bind(values?: unknown[] | Record<string, unknown>): boolean;
  step(): boolean;
  getAsObject(): Record<string, unknown>;
  free(): void;
}

interface SqlJsDatabase {
  prepare(query: string): SqlJsStatement;
  run(query: string, params?: unknown[] | Record<string, unknown>): void;
}

export function createSqlJsSqliteRunner(db: SqlJsDatabase): SqliteQueryRunner {
  return {
    run(query, bindings = []) {
      db.run(query, bindings);
    },
    all(query, bindings = []) {
      const statement = db.prepare(query);
      try {
        statement.bind(bindings);
        const rows: Record<string, unknown>[] = [];
        while (statement.step()) {
          rows.push(statement.getAsObject());
        }
        return rows;
      } finally {
        statement.free();
      }
    },
  };
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
