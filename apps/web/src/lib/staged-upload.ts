const DATABASE = 'clipsubtitles-start';
const STORE = 'pending';
const KEY = 'source';

export interface StagedUpload {
  file: File;
  stagedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not prepare the upload.'));
  });
}

function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Could not prepare the upload.'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('Could not prepare the upload.'));
        };
      }),
  );
}

export async function stageUpload(file: File): Promise<void> {
  await transaction('readwrite', (store) => store.put({ file, stagedAt: Date.now() }, KEY));
}

export async function takeStagedUpload(): Promise<StagedUpload | null> {
  const staged = await transaction<StagedUpload | undefined>('readonly', (store) => store.get(KEY));
  return staged ?? null;
}

export async function clearStagedUpload(): Promise<void> {
  await transaction('readwrite', (store) => store.delete(KEY));
}
