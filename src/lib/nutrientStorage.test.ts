import "fake-indexeddb/auto";
import { afterEach, describe, expect, test, vi } from "vitest";
import { deleteNutrientBlob, saveNutrientBlob } from "./nutrientStorage";

async function readStored(key: string): Promise<unknown> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("tree-chat-nutrients", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("files", "readonly").objectStore("files").get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  } finally {
    db.close();
  }
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await indexedDB.deleteDatabase("tree-chat-nutrients");
});

describe("nutrient IndexedDB storage", () => {
  test("saves and deletes original local attachment blobs", async () => {
    const key = await saveNutrientBlob("n-1", new File(["hello"], "notes.txt"));

    expect(key).toBe("nutrient-blob:n-1");
    await expect(readStored(key!)).resolves.toMatchObject({ key });

    await deleteNutrientBlob(key);
    await expect(readStored(key!)).resolves.toBeUndefined();
  });

  test("gracefully no-ops when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);

    await expect(saveNutrientBlob("n-1", new File(["hello"], "notes.txt"))).resolves.toBeUndefined();
    await expect(deleteNutrientBlob("missing")).resolves.toBeUndefined();
  });
});
