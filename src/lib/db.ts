import { openDB, type IDBPDatabase } from 'idb';
import type { Session } from '../types';

const DB_NAME = 'growth-survey-010';
const DB_VERSION = 2;

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

/** Delete session row and cascade-delete its audio clips.
 *  Clip keys follow `${sessionId}:${row}:${colId}` so prefix match is safe. */
export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['sessions', 'audioClips'], 'readwrite');
  await tx.objectStore('sessions').delete(id);
  const clipsStore = tx.objectStore('audioClips');
  const allKeys = (await clipsStore.getAllKeys()) as string[];
  const prefix = `${id}:`;
  for (const key of allKeys) {
    if (typeof key === 'string' && key.startsWith(prefix)) {
      await clipsStore.delete(key);
    }
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
