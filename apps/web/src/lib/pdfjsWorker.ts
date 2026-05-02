// Worker entry for pdfjs-dist v5. Vite bundles this as a Web Worker via
// the `?worker` query in `pdf.ts`, so module imports resolve and run in
// the worker realm. We install the TC39 Map/WeakMap upsert polyfills here
// — pdfjs hits them inside the worker too, and the polyfill on the main
// thread doesn't cross the realm boundary. Without this, page.render()
// throws "...getOrInsertComputed is not a function" mid-render.

interface UpsertCommon<K, V> {
  has(key: K): boolean;
  get(key: K): V | undefined;
  set(key: K, value: V): unknown;
}

function installUpsert<K, V>(proto: UpsertCommon<K, V>): void {
  const p = proto as UpsertCommon<K, V> & {
    getOrInsertComputed?: (key: K, callbackfn: (key: K) => V) => V;
    getOrInsert?: (key: K, value: V) => V;
  };
  if (typeof p.getOrInsertComputed !== 'function') {
    Object.defineProperty(proto, 'getOrInsertComputed', {
      configurable: true,
      writable: true,
      value: function (this: UpsertCommon<K, V>, key: K, callbackfn: (k: K) => V): V {
        if (this.has(key)) return this.get(key) as V;
        const value = callbackfn(key);
        this.set(key, value);
        return value;
      },
    });
  }
  if (typeof p.getOrInsert !== 'function') {
    Object.defineProperty(proto, 'getOrInsert', {
      configurable: true,
      writable: true,
      value: function (this: UpsertCommon<K, V>, key: K, value: V): V {
        if (this.has(key)) return this.get(key) as V;
        this.set(key, value);
        return value;
      },
    });
  }
}

installUpsert(Map.prototype as unknown as UpsertCommon<unknown, unknown>);
installUpsert(WeakMap.prototype as unknown as UpsertCommon<object, unknown>);

// Now load the real pdfjs worker code; it will see the patched prototypes.
// eslint-disable-next-line import/no-unresolved, import/extensions
import 'pdfjs-dist/build/pdf.worker.mjs';
