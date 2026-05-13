import { openDB, type IDBPDatabase } from 'idb';
import type { Session } from '../types';

const DB_NAME = 'growth-survey-010';
const DB_VERSION = 1;

interface DBSchema {
  sessions: Session;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('sessions')) {
          const store = db.createObjectStore('sessions', { keyPath: 'id' });
          store.createIndex('byDate', 'date');
          store.createIndex('bySync', 'syncedRows');
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
  // newest first
  all.sort((a, b) => b.startedAt - a.startedAt);
  return all;
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('sessions', id);
}

export async function loadUnsyncedSessions(): Promise<Session[]> {
  const all = await loadAllSessions();
  return all.filter((s) => s.syncedRows < s.completedRows);
}
