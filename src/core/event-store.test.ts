import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryEventStore,
  SqliteEventStore,
  createDurableObjectSqliteRunner,
  createPreparedStatementSqliteRunner,
  createSqlJsSqliteRunner,
  type EventEnvelope,
  type SqliteQueryRunner,
} from './event-store.js';

function event(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    id: 'e1',
    projectId: 'p1',
    actor: { kind: 'human' },
    type: 'source.replaced',
    payload: { source: 'return box(1,1,1);', params: {}, revision: 1 },
    timestamp: 100,
    ...overrides,
  };
}

describe('InMemoryEventStore', () => {
  it('sorts appended events and applies stream filters', async () => {
    const store = new InMemoryEventStore();
    await store.append([
      event({ id: 'b', timestamp: 300, projectId: 'p1', type: 'scene.param_set', payload: { params: {}, changed: {}, revision: 2 } }),
      event({ id: 'a', timestamp: 200, projectId: 'p1' }),
      event({ id: 'c', timestamp: 200, projectId: 'p2' }),
      event({ id: 'd', timestamp: 400, projectId: 'p1', branchId: 'feature' }),
    ]);

    const stream = await store.readStream({
      projectId: 'p1',
      afterTimestamp: 150,
      beforeTimestamp: 350,
      types: ['source.replaced'],
      limit: 10,
    });

    expect(stream.map((e) => e.id)).toEqual(['a']);
  });

  it('normalizes invalid and out-of-range limits', async () => {
    const store = new InMemoryEventStore();
    const events = Array.from({ length: 520 }, (_, index) =>
      event({ id: `e-${index}`, timestamp: index }),
    );

    await store.append(events);

    const withZeroLimit = await store.readStream({ projectId: 'p1', limit: 0 });
    expect(withZeroLimit).toHaveLength(1);

    const withHugeLimit = await store.readStream({ projectId: 'p1', limit: 10_000 });
    expect(withHugeLimit).toHaveLength(500);

    const withDefaultLimit = await store.readStream({ projectId: 'p1', limit: Number.NaN });
    expect(withDefaultLimit).toHaveLength(100);
  });
});

describe('SqliteEventStore', () => {
  it('creates schema once and writes inserts for each event', async () => {
    const run = vi.fn<(query: string, bindings?: unknown[]) => void>();
    const all = vi.fn<(query: string, bindings?: unknown[]) => Record<string, unknown>[]>(() => []);
    const runner: SqliteQueryRunner = { run, all };

    const store = new SqliteEventStore(runner);
    await store.append([event({ id: 'e-a' }), event({ id: 'e-b' })]);
    await store.append([event({ id: 'e-c' })]);

    const createTableCalls = run.mock.calls.filter(([query]) => query.includes('CREATE TABLE IF NOT EXISTS session_events'));
    expect(createTableCalls).toHaveLength(1);

    const insertCalls = run.mock.calls.filter(([query]) => query.includes('INSERT INTO session_events'));
    expect(insertCalls).toHaveLength(3);
    expect(insertCalls[0]?.[1]).toEqual([
      'e-a',
      'p1',
      null,
      null,
      'human',
      null,
      'source.replaced',
      JSON.stringify({ source: 'return box(1,1,1);', params: {}, revision: 1 }),
      100,
    ]);
  });

  it('builds filtered queries and maps rows back into event envelopes', async () => {
    const run = vi.fn<(query: string, bindings?: unknown[]) => void>();
    const all = vi.fn<(query: string, bindings?: unknown[]) => Record<string, unknown>[]>(() => [
      {
        id: 'b',
        project_id: 'p1',
        branch_id: 'main',
        session_id: 's1',
        actor_kind: 'agent',
        actor_id: 'bot',
        type: 'evaluation.completed',
        payload_json: '{"revision":2,"success":true,"errorCount":0,"warningCount":0,"hasEvaluationBundle":true}',
        ts: 200,
      },
      {
        id: 'a',
        project_id: 'p1',
        branch_id: 'main',
        session_id: null,
        actor_kind: 'mystery',
        actor_id: null,
        type: 'source.replaced',
        payload_json: 'not-json',
        ts: 100,
      },
    ]);
    const runner: SqliteQueryRunner = { run, all };

    const store = new SqliteEventStore(runner);
    const stream = await store.readStream({
      projectId: 'p1',
      branchId: 'main',
      afterTimestamp: 50,
      beforeTimestamp: 300,
      types: ['source.replaced', 'evaluation.completed'],
      limit: 0,
    });

    const [query, bindings] = all.mock.calls[0] ?? [];
    expect(String(query)).toContain('project_id = ?');
    expect(String(query)).toContain('branch_id = ?');
    expect(String(query)).toContain('ts > ?');
    expect(String(query)).toContain('ts < ?');
    expect(String(query)).toContain('type IN (?,?)');
    expect(bindings).toEqual(['p1', 'main', 50, 300, 'source.replaced', 'evaluation.completed', 1]);

    expect(stream).toEqual([
      {
        id: 'a',
        projectId: 'p1',
        branchId: 'main',
        actor: { kind: 'human' },
        type: 'source.replaced',
        payload: {},
        timestamp: 100,
      },
      {
        id: 'b',
        projectId: 'p1',
        branchId: 'main',
        sessionId: 's1',
        actor: { kind: 'agent', id: 'bot' },
        type: 'evaluation.completed',
        payload: { revision: 2, success: true, errorCount: 0, warningCount: 0, hasEvaluationBundle: true },
        timestamp: 200,
      },
    ]);
  });

  it('ignores duplicate-column errors during schema migrations', async () => {
    const run = vi.fn((query: string) => {
      if (query.startsWith('ALTER TABLE session_events ADD COLUMN')) {
        throw new Error('duplicate column name');
      }
    });
    const all = vi.fn(() => [] as Record<string, unknown>[]);

    const store = new SqliteEventStore({ run, all });
    await expect(store.readStream({ projectId: 'p1' })).resolves.toEqual([]);
  });
});

describe('sqlite runner adapters', () => {
  it('adapts Durable Object SQL executors', () => {
    const exec = vi.fn((query: string, ...bindings: unknown[]) => ({
      toArray: () => [{ query, bindings }],
    }));

    const runner = createDurableObjectSqliteRunner({ exec });
    runner.run('INSERT 1', ['a', 'b']);
    const rows = runner.all('SELECT 1', ['c']);

    expect(exec).toHaveBeenNthCalledWith(1, 'INSERT 1', 'a', 'b');
    expect(exec).toHaveBeenNthCalledWith(2, 'SELECT 1', 'c');
    expect(rows).toEqual([{ query: 'SELECT 1', bindings: ['c'] }]);
  });

  it('adapts prepared-statement databases', () => {
    const run = vi.fn();
    const all = vi.fn(() => [{ ok: true }]);
    const prepare = vi.fn(() => ({ run, all }));

    const runner = createPreparedStatementSqliteRunner({ prepare });
    runner.run('INSERT 1', ['x']);
    const rows = runner.all('SELECT 1', ['y']);

    expect(prepare).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledWith('x');
    expect(all).toHaveBeenCalledWith('y');
    expect(rows).toEqual([{ ok: true }]);
  });

  it('adapts sql.js databases and always frees statements', () => {
    const bind = vi.fn(() => true);
    const step = vi
      .fn<() => boolean>()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const getAsObject = vi
      .fn<() => Record<string, unknown>>()
      .mockReturnValueOnce({ row: 1 })
      .mockReturnValueOnce({ row: 2 });
    const free = vi.fn();
    const prepare = vi.fn(() => ({ bind, step, getAsObject, free }));
    const dbRun = vi.fn();

    const runner = createSqlJsSqliteRunner({ prepare, run: dbRun });

    runner.run('INSERT 1', ['p']);
    const rows = runner.all('SELECT 1', ['q']);

    expect(dbRun).toHaveBeenCalledWith('INSERT 1', ['p']);
    expect(bind).toHaveBeenCalledWith(['q']);
    expect(rows).toEqual([{ row: 1 }, { row: 2 }]);
    expect(free).toHaveBeenCalledTimes(1);
  });
});
