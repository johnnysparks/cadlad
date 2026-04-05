import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { EventEnvelope, EventStore, StreamQuery, SqliteQueryRunner } from "../../packages/session-core/event-store.js";
import { SqliteEventStore } from "../../packages/session-core/event-store.js";

export interface LocalSqliteConnection {
  runner: SqliteQueryRunner;
  close?: () => void;
}

export interface LocalSqliteDriver {
  open(filePath: string): LocalSqliteConnection;
}

export interface LocalEventStoreOptions {
  projectDir: string;
  storageDirName?: string;
  databaseFileName?: string;
}

export function resolveLocalEventStorePath(options: LocalEventStoreOptions): string {
  const storageDirName = options.storageDirName ?? ".cadlad";
  const databaseFileName = options.databaseFileName ?? "events.db";
  const storageDir = resolve(options.projectDir, storageDirName);
  mkdirSync(storageDir, { recursive: true });
  return resolve(storageDir, databaseFileName);
}

export class LocalSqliteEventStore implements EventStore {
  private readonly delegate: SqliteEventStore;
  private readonly connection: LocalSqliteConnection;
  readonly filePath: string;

  constructor(driver: LocalSqliteDriver, options: LocalEventStoreOptions) {
    this.filePath = resolveLocalEventStorePath(options);
    this.connection = driver.open(this.filePath);
    this.delegate = new SqliteEventStore(this.connection.runner);
  }

  async append(events: EventEnvelope[]): Promise<void> {
    await this.delegate.append(events);
  }

  async readStream(query: StreamQuery): Promise<EventEnvelope[]> {
    return this.delegate.readStream(query);
  }

  close(): void {
    this.connection.close?.();
  }
}
