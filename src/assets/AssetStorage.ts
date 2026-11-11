import { ASSET_CATALOG, ASSET_STORAGE } from './AssetCatalog';

// Callback cloud.downloadFile returns an abortable DownloadTask, but has no
// timeout option. FileSystemManager.getFileInfo supplies native MD5 + byte size.
// API contracts: github.com/wechat-miniprogram/{api-typings,minigame-api-typings}.
const DOWNLOAD_LIMIT = 3, DOWNLOAD_TIMEOUT_MS = 20000, DOWNLOAD_ATTEMPTS = 2;
type Asset = { fileID: string; sha256: string; md5: string; bytes: number; kind: string };
type Configuration = { mode: string; envId: string; directory: string; generation: number };
type Entry = { version: number; verified: boolean; pending?: Promise<string>; generation?: number; invalidating?: Promise<void> };
type Location = { asset: Asset; file: string; directory: string; fs: any; wx: any; entry: Entry };

const entries = new Map<string, Entry>();
const directories = new Map<string, Promise<void>>();
// No eviction of a path returned during this session: consumers may still use it.
const activeFiles = new Set<string>();
const queue: Array<() => void> = [];
let running = 0, generation = 0, configurationKey = '', initializedCloud: any = null, initializedEnv = '';
let stagingId = 0;
const counters = { cacheHits: 0, downloads: 0, downloadedBytes: 0, retries: 0, failures: 0,
    timeouts: 0, invalidations: 0, cleanedFiles: 0, cleanupErrors: 0 };
let lastError = '';

function platform(): any { return typeof wx !== 'undefined' ? wx as any : null; }
function error(message: string, code = 'ASSET_ERROR'): Error {
    const result = new Error('[Assets] ' + message);
    (result as any).code = code;
    return result;
}
function configuration(): Configuration {
    const mode = ASSET_STORAGE.mode, envId = ASSET_STORAGE.envId, directory = ASSET_STORAGE.cacheDirectory;
    const key = [mode, envId, directory].join('|');
    if (key !== configurationKey) {
        configurationKey = key; generation++;
        entries.forEach(entry => { entry.verified = false; });
    }
    return { mode, envId, directory, generation };
}
function assertCurrent(config: Configuration, entry?: Entry, version?: number): void {
    if (configuration().generation !== config.generation || entry && entry.version !== version)
        throw error('Resource request was superseded', 'CANCELLED');
}

/** Explicit shared initialization; resolving a local asset never calls this. */
export function ensureAssetCloud(): boolean {
    const config = configuration(), w = platform();
    if (!config.envId || !w || !w.cloud || typeof w.cloud.init !== 'function') return false;
    if (initializedCloud === w.cloud && initializedEnv === config.envId) return true;
    try {
        w.cloud.init({ env: config.envId, traceUser: false });
        initializedCloud = w.cloud; initializedEnv = config.envId;
        return true;
    } catch (_) {
        lastError = 'CloudBase initialization failed';
        return false;
    }
}

function assetFor(path: string): Asset {
    if (typeof path !== 'string' || path.indexOf('\\') !== -1 || path.split('/').some(p => !p || p === '.' || p === '..'))
        throw error('Invalid logical asset path');
    const a = Object.prototype.hasOwnProperty.call(ASSET_CATALOG, path) ? ASSET_CATALOG[path] : null;
    if (!a) throw error('Asset is not in the release catalog: ' + path);
    if (!/^cloud:\/\//.test(a.fileID) || !/^[a-f0-9]{64}$/.test(a.sha256) || !/^[a-f0-9]{32}$/.test(a.md5)
        || !Number.isSafeInteger(a.bytes) || a.bytes <= 0 || ['image', 'audio', 'binary'].indexOf(a.kind) === -1)
        throw error('Invalid asset catalog entry: ' + path);
    return { ...a };
}
function filename(path: string, a: Asset): string {
    const extension = /\.([a-z0-9]{1,8})$/i.exec(path);
    return a.sha256 + '.' + (extension ? extension[1].toLowerCase() : 'bin');
}
function location(path: string, config: Configuration): Location {
    const asset = assetFor(path), w = platform();
    if (!w || !w.env || typeof w.env.USER_DATA_PATH !== 'string' || !w.env.USER_DATA_PATH
        || typeof w.getFileSystemManager !== 'function') throw error('Native asset storage is unavailable');
    if (!/^jwr-assets-[A-Za-z0-9_-]+$/.test(config.directory)) throw error('Invalid asset cache namespace');
    const directory = w.env.USER_DATA_PATH.replace(/\/$/, '') + '/' + config.directory;
    const file = directory + '/' + filename(path, asset);
    let entry = entries.get(file);
    if (!entry) { entry = { version: 0, verified: false }; entries.set(file, entry); }
    return { asset, file, directory, fs: w.getFileSystemManager(), wx: w, entry };
}
function callFS(fs: any, method: string, options: any): Promise<any> {
    return new Promise((resolve, reject) => {
        if (!fs || typeof fs[method] !== 'function') { reject(error('File API unavailable: ' + method)); return; }
        try { fs[method]({ ...options, success: resolve, fail: reject }); } catch (e) { reject(e); }
    });
}
function missing(e: any): boolean {
    return !!e && (e.errCode === 1300002 || /(?:ENOENT|no such file|not exist)/i.test(String(e.errMsg || e.message || '')));
}
async function unlinkOwned(loc: Location, file: string): Promise<void> {
    // Never sweep USER_DATA_PATH, audio downloads, saves or another namespace.
    if (!file.startsWith(loc.directory + '/') || file.slice(loc.directory.length + 1).indexOf('/') !== -1)
        throw error('Refusing to delete a file outside the asset cache');
    try { await callFS(loc.fs, 'unlink', { filePath: file }); }
    catch (e) { if (!missing(e)) throw e; }
}
async function verify(loc: Location, file: string): Promise<void> {
    const info = await callFS(loc.fs, 'getFileInfo', { filePath: file, digestAlgorithm: 'md5' });
    if (!info || info.size !== loc.asset.bytes || typeof info.digest !== 'string' || info.digest.toLowerCase() !== loc.asset.md5)
        throw error('Asset size or MD5 does not match its release catalog', 'INTEGRITY');
}
async function prepareDirectory(loc: Location): Promise<void> {
    let pending = directories.get(loc.directory);
    if (!pending) {
        pending = (async () => {
            try { await callFS(loc.fs, 'mkdir', { dirPath: loc.directory, recursive: true }); }
            catch (_) { await callFS(loc.fs, 'access', { path: loc.directory }); }
            // Only recognizable files from this module can be obsolete. Protect
            // every current catalog file, not merely assets downloaded so far.
            try {
                const result = await callFS(loc.fs, 'readdir', { dirPath: loc.directory });
                const current = new Set(Object.keys(ASSET_CATALOG).map(path => filename(path, ASSET_CATALOG[path])));
                for (const name of result.files || []) {
                    const file = loc.directory + '/' + name;
                    if (!/^[a-f0-9]{64}\.[a-z0-9]{1,8}(?:\.part-\d+)?$/.test(name) || current.has(name)
                        || activeFiles.has(file) || entries.get(file)?.pending) continue;
                    try { await unlinkOwned(loc, file); counters.cleanedFiles++; } catch (_) { counters.cleanupErrors++; }
                }
            } catch (_) { counters.cleanupErrors++; }
        })();
        directories.set(loc.directory, pending);
        pending.catch(() => { if (directories.get(loc.directory) === pending) directories.delete(loc.directory); });
    }
    await pending;
}
function schedule<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        queue.push(() => {
            running++;
            const finish = () => { running--; pump(); };
            Promise.resolve().then(operation).then(value => { finish(); resolve(value); }, e => { finish(); reject(e); });
        });
        pump();
    });
}
function pump(): void { while (running < DOWNLOAD_LIMIT && queue.length) queue.shift()!(); }
function download(loc: Location, config: Configuration, version: number): Promise<string> {
    return schedule(() => {
        assertCurrent(config, loc.entry, version);
        if (!ensureAssetCloud() || typeof loc.wx.cloud.downloadFile !== 'function') throw error('Cloud download is unavailable');
        counters.downloads++;
        return new Promise<string>((resolve, reject) => {
            let settled = false, task: any;
            const finish = (e?: Error, file?: string) => {
                if (settled) return;
                settled = true; clearTimeout(timer);
                if (e) reject(e); else resolve(file!);
            };
            // Starts only after a concurrency slot was acquired, not in the queue.
            const timer = setTimeout(() => {
                counters.timeouts++; finish(error('Cloud download timed out after 20 seconds', 'TIMEOUT'));
                try { if (task && typeof task.abort === 'function') task.abort(); } catch (_) { /* already settled */ }
            }, DOWNLOAD_TIMEOUT_MS);
            try {
                task = loc.wx.cloud.downloadFile({ fileID: loc.asset.fileID, config: { env: config.envId },
                    success: (result: any) => {
                        if (!result || result.statusCode !== 200 || typeof result.tempFilePath !== 'string' || !result.tempFilePath)
                            finish(error('Cloud download returned an invalid response', 'NETWORK'));
                        else finish(undefined, result.tempFilePath);
                    },
                    fail: () => finish(error('Cloud download failed', 'NETWORK')),
                });
            } catch (_) { finish(error('Cloud download failed to start', 'NETWORK')); }
        });
    });
}
async function obtain(loc: Location, config: Configuration, version: number): Promise<string> {
    assertCurrent(config, loc.entry, version);
    await prepareDirectory(loc);
    assertCurrent(config, loc.entry, version);
    try {
        await verify(loc, loc.file);
        assertCurrent(config, loc.entry, version);
        loc.entry.verified = true; counters.cacheHits++;
        return loc.file;
    } catch (e) {
        assertCurrent(config, loc.entry, version);
        if (!missing(e) && (e as any).code !== 'INTEGRITY') throw error('Cannot verify the asset cache');
        await unlinkOwned(loc, loc.file);
    }
    let temp = '';
    for (let attempt = 0; attempt < DOWNLOAD_ATTEMPTS; attempt++) {
        assertCurrent(config, loc.entry, version);
        try {
            temp = await download(loc, config, version);
            assertCurrent(config, loc.entry, version);
            await verify(loc, temp);
            assertCurrent(config, loc.entry, version);
            counters.downloadedBytes += loc.asset.bytes;
            break;
        } catch (e) {
            assertCurrent(config, loc.entry, version);
            if (attempt + 1 === DOWNLOAD_ATTEMPTS) throw e;
            counters.retries++;
            await new Promise<void>(resolve => setTimeout(resolve, 250));
        }
    }
    // The platform owns downloaded temporary files. We only delete files in our
    // namespace. Copy + verify + rename prevents publishing a partial cache file.
    const staging = loc.file + '.part-' + (++stagingId);
    try {
        assertCurrent(config, loc.entry, version);
        await callFS(loc.fs, 'copyFile', { srcPath: temp, destPath: staging });
        await verify(loc, staging);
        assertCurrent(config, loc.entry, version);
        await callFS(loc.fs, 'rename', { oldPath: staging, newPath: loc.file });
        try { assertCurrent(config, loc.entry, version); }
        catch (e) { await unlinkOwned(loc, loc.file); throw e; }
        loc.entry.verified = true;
        return loc.file;
    } finally {
        try { await unlinkOwned(loc, staging); } catch (_) { counters.cleanupErrors++; }
    }
}

/** Resolve a logical path. Cloud failures never silently fall back to package files. */
export async function resolveAssetPath(path: string): Promise<string> {
    const config = configuration();
    if (config.mode === 'local') return path;
    if (config.mode !== 'cloud') throw error('Unknown asset storage mode');
    const loc = location(path, config), entry = loc.entry;
    activeFiles.add(loc.file);
    if (entry.invalidating) { await entry.invalidating; assertCurrent(config); return resolveAssetPath(path); }
    if (entry.pending) {
        if (entry.generation === config.generation) return entry.pending;
        await entry.pending.catch(() => undefined); assertCurrent(config);
        return resolveAssetPath(path);
    }
    if (entry.verified) { counters.cacheHits++; return loc.file; }
    const version = entry.version;
    const pending = obtain(loc, config, version).catch(e => {
        entry.verified = false;
        if ((e as any).code !== 'CANCELLED') { counters.failures++; lastError = String(e.message || e); }
        throw e;
    });
    entry.pending = pending; entry.generation = config.generation;
    const clear = () => { if (entry.pending === pending) entry.pending = undefined; };
    pending.then(clear, clear);
    return pending;
}

/** Call after a decoder rejects a cached asset. Does not remove local source files. */
export async function invalidateAsset(path: string): Promise<void> {
    const config = configuration();
    if (config.mode === 'local') return;
    const loc = location(path, config), entry = loc.entry;
    if (entry.invalidating) return entry.invalidating;
    entry.version++; entry.verified = false; counters.invalidations++;
    const previous = entry.pending;
    const pending = (async () => {
        if (previous) await previous.catch(() => undefined);
        await unlinkOwned(loc, loc.file);
    })();
    entry.invalidating = pending;
    const clear = () => { if (entry.invalidating === pending) entry.invalidating = undefined; };
    pending.then(clear, clear);
    return pending;
}

/** Binary loading has no DOM dependency, including on native Mini Game startup. */
export async function readAssetBytes(path: string): Promise<ArrayBuffer> {
    const config = configuration(), resolved = await resolveAssetPath(path);
    assertCurrent(config);
    const w = platform();
    let data: any;
    if (w && typeof w.getFileSystemManager === 'function') {
        try {
            const result = await callFS(w.getFileSystemManager(), 'readFile', { filePath: resolved });
            data = result.data;
        } catch (e) {
            assertCurrent(config);
            if (config.mode === 'cloud') await invalidateAsset(path);
            throw error('Cannot read the asset file');
        }
    } else {
        if (typeof fetch !== 'function') throw error('Binary asset loading is unavailable');
        const response = await fetch(resolved);
        if (!response.ok) throw error('Local asset request failed');
        data = await response.arrayBuffer();
    }
    assertCurrent(config);
    if (!(data instanceof ArrayBuffer)) throw error('Binary asset did not return an ArrayBuffer');
    if (config.mode === 'cloud' && data.byteLength !== assetFor(path).bytes) {
        await invalidateAsset(path);
        throw error('Binary asset size changed after validation', 'INTEGRITY');
    }
    return data;
}

export function getAssetStorageStats() {
    const config = configuration(), w = platform();
    let pendingAssets = 0, verifiedAssets = 0;
    entries.forEach(entry => { if (entry.pending) pendingAssets++; if (entry.verified) verifiedAssets++; });
    return { mode: config.mode, cloudInitialized: !!w && initializedCloud === w.cloud && initializedEnv === config.envId,
        activeDownloads: running, queuedDownloads: queue.length, pendingAssets, verifiedAssets,
        ...counters, error: lastError };
}
