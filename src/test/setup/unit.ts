import { afterEach, vi } from "vitest";

const originalRandomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
let uuidCounter = 0;

export function resetDeterministicIds() {
  uuidCounter = 0;
}

export function installDeterministicIds() {
  const cryptoValue = globalThis.crypto ?? ({} as Crypto);
  vi.stubGlobal("crypto", {
    ...cryptoValue,
    randomUUID: () => `test-uuid-${++uuidCounter}`,
  });
}

installDeterministicIds();

afterEach(() => {
  resetDeterministicIds();
  vi.restoreAllMocks();
  if (originalRandomUUID && globalThis.crypto) {
    vi.stubGlobal("crypto", {
      ...globalThis.crypto,
      randomUUID: originalRandomUUID,
    });
    installDeterministicIds();
  }
});
