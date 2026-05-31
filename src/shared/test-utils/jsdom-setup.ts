/**
 * jsdom setup for Vitest.
 * Node 25 ships a native globalThis.localStorage stub (backed by
 * --localstorage-file) that leaks into the jsdom environment and
 * overrides jsdom's own Storage implementation.  Without a valid
 * --localstorage-file path the native stub lacks .clear() / .setItem()
 * etc., breaking all tests that rely on window.localStorage.
 *
 * This file is loaded via vitest.config.ts → test.setupFiles so that
 * every jsdom-environment test file gets a proper in-memory Storage.
 */

// Marketing emails (EmailLayout) require COMPANY_POSTAL_ADDRESS (CAN-SPAM §5) and
// now throw without it. Provide a synthetic default so email-render tests pass;
// the EmailLayout test that asserts the throw deletes this var explicitly.
process.env.COMPANY_POSTAL_ADDRESS ||= 'Estrevia · 123 Test St · Testville TS 00000 · USA';

if (typeof window !== 'undefined') {
  const inMemoryStorage = (): Storage => {
    let data: Record<string, string> = {};
    return {
      get length() {
        return Object.keys(data).length;
      },
      key(index: number): string | null {
        return Object.keys(data)[index] ?? null;
      },
      getItem(key: string): string | null {
        return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
      },
      setItem(key: string, value: string): void {
        data[key] = String(value);
      },
      removeItem(key: string): void {
        delete data[key];
      },
      clear(): void {
        data = {};
      },
    };
  };

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    writable: true,
    value: inMemoryStorage(),
  });

  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    writable: true,
    value: inMemoryStorage(),
  });
}
