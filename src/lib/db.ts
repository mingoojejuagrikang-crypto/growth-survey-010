import { openDB, type IDBPDatabase } from 'idb';
import type { Session } from '../types';

const DB_NAME = 'growth-survey-010';
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('sessions', { keyPath: 'id' });
          store.createIndex('byDate', 'date');
          store.createIndex('bySync', 'syncedRows');
        }
        if (oldVersion < 2) {
          db.createObjectStore('audioClips');
        }
        if (oldVersion < 3) {
          // v5.2 Codex 4차 MEDIUM: Logger events 영속화.
          // autoIncrement key + sessionId 인덱스로 reload 후에도 세션별 이벤트 조회 가능.
          const logs = db.createObjectStore('logEvents', { keyPath: 'id', autoIncrement: true });
          logs.createIndex('bySessionId', 'sessionId');
        }
      },
    });
  }
  return dbPromise;
}

export async function saveSession(session: Session): Promise<void> {
  const db = await getDb();
  await db.put('sessions', session);
}

export async function loadAllSessions(): Promise<Session[]> {
  const db = await getDb();
  const all = (await db.getAll('sessions')) as Session[];
  all.sort((a, b) => b.startedAt - a.startedAt);
  return all;
}

/** Delete session row and cascade-delete its audio clips + log events.
 *  Clip keys follow `${sessionId}:${row}:${colId}` so prefix match is safe. */
export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['sessions', 'audioClips', 'logEvents'], 'readwrite');
  await tx.objectStore('sessions').delete(id);

  const clipsStore = tx.objectStore('audioClips');
  const allKeys = (await clipsStore.getAllKeys()) as string[];
  const prefix = `${id}:`;
  for (const key of allKeys) {
    if (typeof key === 'string' && key.startsWith(prefix)) {
      await clipsStore.delete(key);
    }
  }

  const logsStore = tx.objectStore('logEvents');
  const idx = logsStore.index('bySessionId');
  let cursor = await idx.openCursor(id);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }

  await tx.done;
}

export async function loadUnsyncedSessions(): Promise<Session[]> {
  const all = await loadAllSessions();
  return all.filter((s) => s.syncedRows < s.completedRows);
}

export async function saveAudioClip(key: string, blob: Blob): Promise<void> {
  const db = await getDb();
  await db.put('audioClips', blob, key);
}

export async function loadAudioClip(key: string): Promise<Blob | null> {
  const db = await getDb();
  return (await db.get('audioClips', key)) as Blob | null;
}

export async function deleteAudioClip(key: string): Promise<void> {
  const db = await getDb();
  await db.delete('audioClips', key);
}

export async function loadAllAudioClipKeys(): Promise<string[]> {
  const db = await getDb();
  return (await db.getAllKeys('audioClips')) as string[];
}

// ─── Log events (v5.2 Codex 4차 MEDIUM) ────────────────────────────────────
export interface PersistedLogEntry {
  id?: number;
  ts: number;
  type: string;
  sessionId?: string;
  // Loose shape — logger.ts owns the full type; here we only need to round-trip JSON.
  [k: string]: unknown;
}

export async function appendLogEvent(entry: Omit<PersistedLogEntry, 'id'>): Promise<void> {
  try {
    const db = await getDb();
    await db.add('logEvents', entry);
  } catch { /* IDB unavailable or quota — fall back to in-memory only */ }
}

export async function loadLogEvents(sessionIds?: string[]): Promise<PersistedLogEntry[]> {
  const db = await getDb();
  if (!sessionIds) {
    return (await db.getAll('logEvents')) as PersistedLogEntry[];
  }
  if (sessionIds.length === 0) return [];
  const tx = db.transaction('logEvents', 'readonly');
  const idx = tx.objectStore('logEvents').index('bySessionId');
  const results: PersistedLogEntry[] = [];
  for (const sid of sessionIds) {
    const rows = (await idx.getAll(sid)) as PersistedLogEntry[];
    results.push(...rows);
  }
  await tx.done;
  results.sort((a, b) => a.ts - b.ts);
  return results;
}
