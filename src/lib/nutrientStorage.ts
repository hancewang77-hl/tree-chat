const DB_NAME = "tree-chat-nutrients";
const STORE_NAME = "files";
const DB_VERSION = 1;

export async function saveNutrientBlob(id: string, file: File): Promise<string | undefined> {
  const db = await openNutrientDb();
  if (!db) return undefined;
  const key = `nutrient-blob:${id}`;
  await requestToPromise(
    db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .put({ key, file, savedAt: Date.now() }, key),
  );
  db.close();
  return key;
}

export async function deleteNutrientBlob(key: string | undefined): Promise<void> {
  if (!key) return;
  const db = await openNutrientDb();
  if (!db) return;
  await requestToPromise(
    db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(key),
  );
  db.close();
}

async function openNutrientDb(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === "undefined") return undefined;

  const request = indexedDB.open(DB_NAME, DB_VERSION);

  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME);
    }
  };

  return requestToPromise(request);
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
