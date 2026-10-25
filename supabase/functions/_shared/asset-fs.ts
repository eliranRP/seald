// Read-only, in-memory file system for the API's bundled assets (AWS exit
// plan, WS-0).
//
// The API reads its email templates, audit.pdf fonts and i18n catalogs with
// node:fs, mostly the synchronous calls, and lists directories to find
// them. The edge runtime allows synchronous file APIs only while the entry
// module is first evaluating, and Nest boots after that. So the bundle's
// `__dirname` points at ASSET_ROOT, a path that exists nowhere on disk, and
// this shim answers node:fs calls under it from the embedded assets.mjs.
// Every other path goes to the real implementation untouched.
import { Buffer } from 'node:buffer';
import fs from 'node:fs';

export const ASSET_ROOT = '/seald-assets';

type Encoding = BufferEncoding | { encoding?: BufferEncoding | null } | null | undefined;

function encodingOf(options: Encoding): BufferEncoding | null {
  if (typeof options === 'string') return options;
  return options?.encoding ?? null;
}

function notFound(syscall: string, path: string): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error(
    `ENOENT: no such file or directory, ${syscall} '${path}'`,
  );
  err.code = 'ENOENT';
  err.errno = -2;
  err.syscall = syscall;
  err.path = path;
  return err;
}

export function installAssetFs(assets: Readonly<Record<string, string>>): void {
  const files = new Map<string, string>();
  const dirs = new Map<string, Set<string>>([[ASSET_ROOT, new Set()]]);
  for (const [rel, base64] of Object.entries(assets)) {
    const full = `${ASSET_ROOT}/${rel}`;
    files.set(full, base64);
    const parts = full.split('/');
    for (let i = parts.length - 1; i > ASSET_ROOT.split('/').length - 1; i--) {
      const dir = parts.slice(0, i).join('/');
      const entries = dirs.get(dir) ?? new Set<string>();
      entries.add(parts[i] as string);
      dirs.set(dir, entries);
    }
  }
  const decoded = new Map<string, Buffer>();
  const bytes = (path: string): Buffer => {
    let buf = decoded.get(path);
    if (!buf) {
      buf = Buffer.from(files.get(path) as string, 'base64');
      decoded.set(path, buf);
    }
    return buf;
  };
  const owns = (path: unknown): path is string =>
    typeof path === 'string' && (path === ASSET_ROOT || path.startsWith(`${ASSET_ROOT}/`));
  const normalize = (path: string): string => path.replace(/\/+$/, '') || '/';
  const read = (path: string, options: Encoding): Buffer | string => {
    const p = normalize(path);
    if (!files.has(p)) throw notFound('open', path);
    const enc = encodingOf(options);
    return enc ? bytes(p).toString(enc) : Buffer.from(bytes(p));
  };
  const stat = (path: string): fs.Stats => {
    const p = normalize(path);
    const isFile = files.has(p);
    const isDir = dirs.has(p);
    if (!isFile && !isDir) throw notFound('stat', path);
    return {
      isFile: () => isFile,
      isDirectory: () => isDir,
      isSymbolicLink: () => false,
      size: isFile ? bytes(p).length : 0,
      mtime: new Date(0),
      mtimeMs: 0,
    } as unknown as fs.Stats;
  };

  const real = {
    existsSync: fs.existsSync,
    readFileSync: fs.readFileSync,
    statSync: fs.statSync,
    readdirSync: fs.readdirSync,
    readFile: fs.readFile,
    promisesReadFile: fs.promises.readFile,
  };

  const target = fs as unknown as Record<string, unknown>;
  target.existsSync = (path: fs.PathLike) =>
    owns(path) ? files.has(normalize(path)) || dirs.has(normalize(path)) : real.existsSync(path);
  target.readFileSync = (path: fs.PathOrFileDescriptor, options?: Encoding) =>
    owns(path) ? read(path, options) : real.readFileSync(path, options as never);
  target.statSync = (path: fs.PathLike, options?: fs.StatSyncOptions) =>
    owns(path) ? stat(path) : real.statSync(path, options);
  target.readdirSync = (path: fs.PathLike, options?: unknown) => {
    if (!owns(path)) return real.readdirSync(path, options as never);
    const entries = dirs.get(normalize(path));
    if (!entries) throw notFound('scandir', path);
    return [...entries].sort();
  };
  target.readFile = (path: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
    if (!owns(path)) return (real.readFile as (...a: unknown[]) => void)(path, ...rest);
    const cb = rest.pop() as (err: unknown, data?: unknown) => void;
    try {
      const data = read(path, rest[0] as Encoding);
      queueMicrotask(() => cb(null, data));
    } catch (err) {
      queueMicrotask(() => cb(err));
    }
  };
  (fs.promises as unknown as Record<string, unknown>).readFile = (
    path: fs.PathLike,
    options?: Encoding,
  ) =>
    owns(path)
      ? Promise.resolve().then(() => read(path, options))
      : real.promisesReadFile(path, options as never);
}
