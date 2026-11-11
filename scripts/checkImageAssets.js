// Native-compatible image state machine; no network, files, DOM or real decode delays.
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm'), ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname, '../src/render/ImageAssets.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS } }).outputText;
const tick = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function host(browser = false) {
    const h = { images: [], requests: [], invalidations: [], timers: new Map(), logs: [], behavior: () => {},
        resolve: p => Promise.resolve(p), invalidate: () => Promise.resolve() };
    let timerId = 0;
    class TestImage {
        constructor() { this.width = this.height = 16; this.onload = this.onerror = null; h.images.push(this); }
        set src(value) { this.source = value; this.crossOriginAtLoad = this.crossOrigin; h.behavior(this, value); }
    }
    const sandbox = { window: {}, wx: { createImage: () => new TestImage() },
        console: { warn: (...args) => h.logs.push(args) },
        setTimeout: (fn, ms) => { assert(ms > 0 && ms <= 30000); const id = ++timerId; h.timers.set(id, fn); return id; },
        clearTimeout: id => h.timers.delete(id),
        Image: function () { throw Error('Native host must prefer wx.createImage'); },
    };
    if (browser) sandbox.HTMLImageElement = TestImage;
    const exports = {};
    vm.runInNewContext('(function(exports,require){' + code + '\n})', sandbox)(exports, request => {
        assert.equal(request, '../assets/AssetStorage');
        return { resolveAssetPath: p => { h.requests.push(p); return h.resolve(p); },
            invalidateAsset: p => { h.invalidations.push(p); return h.invalidate(p); } };
    });
    h.api = exports;
    h.status = keys => JSON.parse(JSON.stringify(exports.getImageLoadStatus(keys)));
    h.expire = () => { const [id, fn] = h.timers.entries().next().value; h.timers.delete(id); fn(); };
    return h;
}
(async () => {
    const native = host(), old = deferred(), next = deferred();
    native.resolve = p => p === 'old' ? old.promise : next.promise;
    native.api.registerImage('scene', 'old'); native.api.registerImage('scene', 'old');
    assert.equal(native.requests.length, 1);
    assert.deepEqual(native.status(), { ready: 0, loading: 1, failed: 0, total: 1 });
    native.api.releaseImages(['scene']); native.api.registerImage('scene', 'next');
    old.resolve('old-cache'); await tick(); assert.equal(native.images.length, 0, 'Released resolution must not start a decode');
    next.resolve('next-cache'); await tick();
    const staleOnload = native.images[0].onload;
    native.api.registerImage('scene', 'replacement'); await tick();
    assert.equal(native.images[0].onload, null); staleOnload(); await tick();
    assert.equal(native.api.isImageReady('scene'), false, 'Old onload must not mark the replacement ready');
    native.images[1].onload(); await tick();
    assert.equal(native.api.getImage('scene'), native.images[1]);
    assert.deepEqual(native.status(['scene', 'scene', 'unknown']), { ready: 1, loading: 0, failed: 0, total: 1 });
    await native.api.retryImages(); assert.equal(native.requests.length, 3, 'Ready images must not reload');
    native.api.releaseImages(['scene']); assert.equal(native.timers.size, 0); assert.equal(native.status().total, 0);

    const network = host(); network.resolve = () => Promise.reject(Error('offline'));
    network.api.registerImage('scene', 'asset'); await tick();
    assert.deepEqual(network.status(), { ready: 0, loading: 0, failed: 1, total: 1 });
    assert.equal(network.invalidations.length, 0, 'A failed resolver is not a corrupt decoded cache');
    network.api.registerImage('scene', 'asset'); assert.equal(network.requests.length, 1);
    network.resolve = p => Promise.resolve(p); network.behavior = img => img.onload();
    await network.api.retryImages(['scene']); assert(network.api.isImageReady('scene'));
    assert.equal(network.api.isImageFailed('scene'), false);

    const corrupt = host(); corrupt.behavior = img => corrupt.images.length === 1 ? img.onerror(Error('corrupt cache')) : img.onload();
    corrupt.api.registerImage('scene', 'asset'); await tick();
    assert.equal(corrupt.requests.length, 2); assert.deepEqual(corrupt.invalidations, ['asset']);
    assert(corrupt.api.isImageReady('scene')); assert.equal(corrupt.timers.size, 0);
    const broken = host(); broken.behavior = img => img.onerror(Error('bad image'));
    broken.api.registerImage('scene', 'asset'); await tick();
    assert(broken.api.isImageFailed('scene')); assert.equal(broken.requests.length, 2); assert.equal(broken.invalidations.length, 1);
    await tick(); assert.equal(broken.requests.length, 2, 'Decode failure must stop after one fresh fetch');
    broken.behavior = img => img.onload(); await broken.api.retryImages(); assert(broken.api.isImageReady('scene'));

    const timeout = host(); timeout.api.registerImage('scene', 'asset'); await tick();
    const pendingRetry = timeout.api.retryImages(); await pendingRetry; assert.equal(timeout.requests.length, 1, 'Retry must not duplicate an in-flight decode');
    timeout.expire(); await tick(); assert.equal(timeout.images.length, 2);
    timeout.expire(); await tick(); assert(timeout.api.isImageFailed('scene'));
    assert.equal(timeout.requests.length, 2); assert.equal(timeout.invalidations.length, 1); assert.equal(timeout.timers.size, 0);
    const invalid = host(); invalid.behavior = img => { img.width = 0; img.onload(); };
    invalid.api.registerImage('scene', 'asset'); await tick(); assert.equal(invalid.api.getImage('scene'), null); assert(invalid.api.isImageFailed('scene'));
    const failedDelete = host(); failedDelete.behavior = img => img.onerror(Error('bad image'));
    failedDelete.invalidate = () => Promise.reject(Error('cannot delete cache'));
    failedDelete.api.registerImage('scene', 'asset'); await tick(); assert(failedDelete.api.isImageFailed('scene')); assert.equal(failedDelete.requests.length, 1);

    const browser = host(true); browser.resolve = () => Promise.resolve('https://assets.example.test/image.png'); browser.behavior = img => img.onload();
    browser.api.registerImage('scene', 'asset'); await tick();
    assert(browser.api.isImageReady('scene')); assert.equal(browser.images[0].crossOriginAtLoad, 'anonymous');
    assert.equal(native.images[1].crossOriginAtLoad, undefined, 'Native path must not require browser CORS properties');
    console.log('Image assets passed: native host, resolver/local keys, deduplication, stale async release, manual retry, bounded decode recovery/timeouts, invalid dimensions and browser CORS.');
})().catch(error => { console.error(error); process.exitCode = 1; });
