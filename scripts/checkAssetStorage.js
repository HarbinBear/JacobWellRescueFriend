// Filesystem/download substitutes exercise storage behavior; no network or user
// files are touched. Official device storage and cloud permissions need device QA.
const assert = require('assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/assets/AssetStorage.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS } }).outputText;
const digest = (algorithm, bytes) => crypto.createHash(algorithm).update(bytes).digest('hex');
const arrayBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const flush = async () => { for (let i = 0; i < 120; i++) await Promise.resolve(); };

function clock() {
    let now = 0, id = 0;
    const timers = new Map();
    return {
        setTimeout(fn, ms) { timers.set(++id, { fn, at: now + ms }); return id; },
        clearTimeout(key) { timers.delete(key); },
        advance(ms) {
            const end = now + ms;
            while (true) {
                const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
                if (!next) break;
                now = next[1].at; timers.delete(next[0]); next[1].fn();
            }
            now = end;
        },
        next() { return timers.size ? Math.min(...[...timers.values()].map(t => t.at)) - now : null; },
    };
}
async function settle(promise, timer) {
    let done = false, value, failure;
    promise.then(v => { value = v; done = true; }, e => { failure = e; done = true; });
    for (let i = 0; i < 30 && !done; i++) {
        await flush();
        if (done) break;
        const next = timer.next();
        assert.notEqual(next, null, 'an unresolved request must have a live download/deferred retry');
        timer.advance(next);
    }
    assert(done, 'request must settle within bounded retries');
    if (failure) throw failure;
    return value;
}
function fixture() {
    const catalog = {}, remote = new Map();
    for (let i = 0; i < 8; i++) {
        const bytes = Buffer.from('asset payload ' + i), fileID = 'cloud://test/assets/' + i;
        catalog['images/tile' + i + '.png'] = { fileID, sha256: digest('sha256', bytes), md5: digest('md5', bytes), bytes: bytes.length, kind: 'image' };
        remote.set(fileID, bytes);
    }
    return { catalog, remote };
}
function platform(data) {
    const files = new Map(), dirs = new Set(['/usr']);
    const requests = [], checks = [], deleted = [];
    let initCount = 0, active = 0, maxActive = 0, aborts = 0, copyFails = false;
    let behavior = 'success';
    const absent = () => ({ errCode: 1300002, errMsg: 'no such file or directory' });
    const later = fn => Promise.resolve().then(fn);
    const fileSystem = {
        mkdir(o) { later(() => { dirs.add(o.dirPath); o.success({}); }); },
        access(o) { later(() => (dirs.has(o.path) || files.has(o.path) ? o.success({}) : o.fail(absent()))); },
        readdir(o) { later(() => o.success({ files: [...files.keys()].filter(f => f.startsWith(o.dirPath + '/') && !f.slice(o.dirPath.length + 1).includes('/')).map(f => f.slice(o.dirPath.length + 1)) })); },
        getFileInfo(o) {
            checks.push(o.filePath); assert.equal(o.digestAlgorithm, 'md5');
            later(() => files.has(o.filePath) ? o.success({ size: files.get(o.filePath).length, digest: digest('md5', files.get(o.filePath)) }) : o.fail(absent()));
        },
        copyFile(o) { later(() => { if (copyFails) return o.fail({ errMsg: 'disk full' }); if (!files.has(o.srcPath)) return o.fail(absent()); files.set(o.destPath, Buffer.from(files.get(o.srcPath))); o.success({}); }); },
        rename(o) { later(() => { if (!files.has(o.oldPath)) return o.fail(absent()); files.set(o.newPath, files.get(o.oldPath)); files.delete(o.oldPath); o.success({}); }); },
        unlink(o) { deleted.push(o.filePath); later(() => files.delete(o.filePath) ? o.success({}) : o.fail(absent())); },
        readFile(o) { assert.equal(o.encoding, undefined, 'binary reads cannot ask for text encoding'); later(() => files.has(o.filePath) ? o.success({ data: arrayBuffer(files.get(o.filePath)) }) : o.fail(absent())); },
    };
    const wx = { env: { USER_DATA_PATH: '/usr' }, getFileSystemManager: () => fileSystem, cloud: {
        init(o) { assert.equal(o.env, 'test-env'); initCount++; },
        downloadFile(o) {
            assert.equal(o.config.env, 'test-env');
            active++; maxActive = Math.max(maxActive, active);
            const index = requests.length, temp = '/tmp/cloud-' + index;
            let finished = false;
            const finish = () => { if (!finished) { finished = true; active--; } };
            const request = {
                success(bytes = data.remote.get(o.fileID)) { finish(); files.set(temp, Buffer.from(bytes)); o.success({ tempFilePath: temp, statusCode: 200 }); },
                fail() { finish(); o.fail({ errMsg: 'offline' }); },
                abort() { aborts++; finish(); o.fail({ errMsg: 'abort' }); },
            };
            requests.push(request);
            if (behavior === 'success') later(() => request.success());
            if (behavior === 'failure') later(() => request.fail());
            if (behavior === 'corrupt') later(() => request.success(Buffer.from('broken file')));
            return request;
        },
    } };
    return { wx, files, checks, deleted, requests, set behavior(value) { behavior = value; }, set copyFails(value) { copyFails = value; },
        counts: () => ({ initCount, active, maxActive, aborts }) };
}
function app(data, native, mode = 'cloud', timer = clock(), fetch) {
    const config = { mode, envId: 'test-env', cacheDirectory: 'jwr-assets-v1' };
    const sandbox = { exports: {}, require(name) { assert.equal(name, './AssetCatalog'); return { ASSET_CATALOG: data.catalog, ASSET_STORAGE: config }; },
        ArrayBuffer, Uint8Array, Promise, setTimeout: timer.setTimeout, clearTimeout: timer.clearTimeout, console };
    if (native) sandbox.wx = native.wx;
    if (fetch) sandbox.fetch = fetch;
    // No window/document/Image: binary storage must work without browser objects.
    vm.runInNewContext(code, sandbox, { filename: 'AssetStorage.js' });
    return { api: sandbox.exports, config, timer };
}
const destination = (data, key = 'images/tile0.png') => '/usr/jwr-assets-v1/' + data.catalog[key].sha256 + '.png';

async function check() {
    {
        const data = fixture(), native = platform(data), first = app(data, native), key = 'images/tile0.png';
        const file = await settle(first.api.resolveAssetPath(key), first.timer);
        assert.equal(file, destination(data)); assert.deepEqual(native.files.get(file), data.remote.get(data.catalog[key].fileID));
        const checks = native.checks.length;
        assert.equal(await first.api.resolveAssetPath(key), file);
        assert.equal(native.checks.length, checks, 'same-session verified cache does not rehash');
        assert.equal(native.requests.length, 1);
        assert.deepEqual(Buffer.from(await first.api.readAssetBytes(key)), native.files.get(file));
        const next = app(data, native);
        assert.equal(await next.api.resolveAssetPath(key), file);
        assert(native.checks.length > checks, 'new session must verify persistent cache');
        assert.equal(native.requests.length, 1, 'persistent hit requires no network');
        native.files.set(file, Buffer.alloc(native.files.get(file).length, 7));
        const damaged = app(data, native);
        assert.equal(await settle(damaged.api.resolveAssetPath(key), damaged.timer), file);
        assert.equal(native.requests.length, 2, 'same-size wrong MD5 must redownload');
        await damaged.api.invalidateAsset(key); assert(!native.files.has(file));
        await settle(damaged.api.resolveAssetPath(key), damaged.timer);
        assert.equal(native.requests.length, 3, 'explicit invalidation clears session and disk hit');
        assert(native.deleted.every(p => p.startsWith('/usr/jwr-assets-v1/')), 'deletion stays in the owned namespace');
    }
    {
        const data = fixture(), native = platform(data), a = app(data, native); native.behavior = 'hold';
        const keys = Object.keys(data.catalog);
        const all = Promise.all([...keys, keys[0], keys[0]].map(key => a.api.resolveAssetPath(key)));
        await flush(); assert.equal(native.requests.length, 3); assert.equal(a.api.getAssetStorageStats().queuedDownloads, 5);
        a.timer.advance(19000); native.requests.slice(0, 3).forEach(r => r.success()); await flush();
        a.timer.advance(1001); await flush();
        assert.equal(a.api.getAssetStorageStats().timeouts, 0, 'queue residence is not download time');
        for (let i = 3; i < 8; i++) { assert(native.requests[i]); native.requests[i].success(); await flush(); }
        const result = await all;
        assert.equal(native.requests.length, 8, 'same asset concurrent requests share one download');
        assert.equal(result[0], result[8]); assert.equal(result[0], result[9]);
        assert.equal(native.counts().maxActive, 3); assert.equal(a.api.getAssetStorageStats().activeDownloads, 0);
    }
    {
        const data = fixture(), native = platform(data), a = app(data, native); native.behavior = 'failure';
        await assert.rejects(settle(a.api.resolveAssetPath('images/tile0.png'), a.timer), /Cloud download failed/);
        assert.equal(native.requests.length, 2); assert(!native.files.has(destination(data)));
        native.behavior = 'success'; await settle(a.api.resolveAssetPath('images/tile0.png'), a.timer);
        assert.equal(native.requests.length, 3, 'failed request is evicted so explicit retry can recover');
    }
    {
        const data = fixture(), native = platform(data), a = app(data, native); native.behavior = 'hold';
        await assert.rejects(settle(a.api.resolveAssetPath('images/tile0.png'), a.timer), /timed out/);
        assert.equal(native.requests.length, 2); assert.equal(native.counts().aborts, 2);
        assert.equal(a.api.getAssetStorageStats().activeDownloads, 0);
        native.requests.forEach(r => r.success()); await flush();
        assert(!native.files.has(destination(data)), 'late callbacks after timeout cannot publish cache');
    }
    {
        const data = fixture(), native = platform(data), a = app(data, native); native.behavior = 'corrupt';
        await assert.rejects(settle(a.api.resolveAssetPath('images/tile0.png'), a.timer), /MD5/);
        assert.equal(native.requests.length, 2); assert(!native.files.has(destination(data)));
        native.behavior = 'success'; native.copyFails = true;
        await assert.rejects(settle(a.api.resolveAssetPath('images/tile0.png'), a.timer));
        assert(!native.files.has(destination(data)), 'copy failure must not return a temporary or partial asset');
    }
    {
        const data = fixture(), native = platform(data), a = app(data, native); native.behavior = 'hold';
        const old = a.api.resolveAssetPath('images/tile0.png'); const oldFailure = assert.rejects(old, /superseded/);
        await flush(); a.config.mode = 'local';
        assert.equal(await a.api.resolveAssetPath('images/tile0.png'), 'images/tile0.png');
        native.requests[0].success(); await oldFailure;
        assert(!native.files.has(destination(data)), 'obsolete cloud completion cannot publish during local mode');
        a.config.mode = 'cloud'; native.behavior = 'success';
        await settle(a.api.resolveAssetPath('images/tile0.png'), a.timer);
        assert.equal(native.counts().initCount, 1, 'cloud initialization is shared across mode changes');
    }
    {
        const data = fixture(), native = platform(data), a = app(data, native); native.behavior = 'hold';
        const request = a.api.resolveAssetPath('images/tile0.png'); const failed = assert.rejects(request, /superseded/);
        await flush(); const invalidated = a.api.invalidateAsset('images/tile0.png');
        native.requests[0].success(); await failed; await invalidated;
        assert(!native.files.has(destination(data)), 'in-flight invalidation cannot be undone by download completion');
    }
    {
        const data = fixture(), native = platform(data), a = app(data, native);
        const old = '/usr/jwr-assets-v1/' + '0'.repeat(64) + '.png';
        const foreign = '/usr/save.json', unknown = '/usr/jwr-assets-v1/keep-me.txt';
        [old, foreign, unknown].forEach(p => native.files.set(p, Buffer.from('keep')));
        native.files.set(destination(data), data.remote.get(data.catalog['images/tile0.png'].fileID));
        await a.api.resolveAssetPath('images/tile0.png');
        assert(!native.files.has(old)); assert(native.files.has(foreign)); assert(native.files.has(unknown));
        assert(native.files.has(destination(data)), 'current catalog file survives old-version cleanup');
    }
    {
        const data = fixture(), native = platform(data), a = app(data, native, 'local');
        native.files.set('models/local.bin', Buffer.from([1, 2, 3]));
        assert.equal(await a.api.resolveAssetPath('models/local.bin'), 'models/local.bin');
        assert.deepEqual([...new Uint8Array(await a.api.readAssetBytes('models/local.bin'))], [1, 2, 3]);
        await a.api.invalidateAsset('models/local.bin'); assert(native.files.has('models/local.bin'));
        assert.equal(native.counts().initCount, 0); assert.equal(native.requests.length, 0);
        let fetched = '';
        const browser = app(data, null, 'local', clock(), async p => { fetched = p; return { ok: true, arrayBuffer: async () => arrayBuffer(Buffer.from([4, 5])) }; });
        assert.deepEqual([...new Uint8Array(await browser.api.readAssetBytes('models/local.bin'))], [4, 5]);
        assert.equal(fetched, 'models/local.bin'); browser.config.mode = 'cloud';
        await assert.rejects(browser.api.resolveAssetPath('images/tile0.png'), /storage is unavailable/);
        a.config.mode = 'cloud'; await assert.rejects(a.api.resolveAssetPath('images/missing.png'), /not in the release catalog/);
    }
    console.log('通过：下载/持久缓存及MD5损坏重下、3并发与去重、实际下载20秒超时和有限重试、迟到回调/失效/模式切换、命名空间清理、无DOM二进制与本地兼容。');
}
check().catch(e => { console.error(e); process.exitCode = 1; });
