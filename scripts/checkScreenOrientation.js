const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm'), ts = require('typescript');
const root = path.resolve(__dirname, '../src');
function boot(options = {}) {
    const cache = new Map(), storage = new Map(options.saved ? [['jwr-screen-orientation', options.saved]] : []);
    let windowInfo = { windowWidth: 393, windowHeight: 852, pixelRatio: 3, statusBarHeight: 59,
        safeArea: { left: 0, right: 393, top: 59, bottom: 818 }, ...options.metrics };
    const listeners = {}, timers = new Map(), messages = [], requests = [];
    let nextTimer = 0, cancels = 0, lighting = 0;
    const canvas = { width: 0, height: 0, getContext: () => ({ scale() {}, setTransform() {} }) };
    const api = { getWindowInfo: () => windowInfo, createCanvas: () => canvas,
        getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
        onWindowResize: fn => listeners.resize = fn, onDeviceOrientationChange: fn => listeners.orientation = fn,
        onShow: fn => listeners.show = fn, showToast: value => messages.push(value.title),
        setDeviceOrientation(request) { requests.push(request); if (options.reject) request.fail({}); },
    };
    if (options.unsupported) delete api.setDeviceOrientation;
    const context = vm.createContext({ wx: api, console, setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id) });
    function load(file) {
        if (cache.has(file)) return cache.get(file);
        if (!fs.existsSync(path.join(root, file + '.ts'))) file += '/index';
        const exports = {}; cache.set(file, exports);
        const code = ts.transpileModule(fs.readFileSync(path.join(root, file + '.ts'), 'utf8'), {
            compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS },
        }).outputText;
        const run = vm.runInContext(`(function(exports,require){${code}\n})`, context);
        run(exports, name => load(path.posix.normalize(path.posix.join(path.posix.dirname(file), name))));
        return exports;
    }
    const { CONFIG } = load('core/config'), drawing = load('render/Canvas'), orientation = load('core/ScreenOrientation');
    orientation.initScreenOrientation(() => cancels++, () => lighting++);
    return { CONFIG, drawing, orientation, requests, storage, messages, timers, load,
        counts: () => ({ cancels, lighting }),
        resize(width, height, updateQuery = true) {
            if (updateQuery) windowInfo = { ...windowInfo, windowWidth: width, windowHeight: height };
            listeners.resize({ windowWidth: width, windowHeight: height });
        },
        rotate(value) { listeners.orientation({ value }); },
    };
}

let app = boot();
app.orientation.toggleScreenOrientation();
assert.equal(app.requests[0].value, 'landscape');
assert(app.orientation.isOrientationSwitchPending());
app.orientation.toggleScreenOrientation(); assert.equal(app.requests.length, 1, 'Ignore repeated taps while native switching is pending');
app.requests[0].success();
assert.equal(app.storage.get('jwr-screen-orientation'), undefined, 'Do not persist a rotation before the window actually changes');
app.resize(852, 393);
assert.equal(app.CONFIG.screenWidth, 852); assert.equal(app.CONFIG.screenHeight, 393);
assert.equal(app.drawing.logicW, 852); assert.equal(app.drawing.logicH, 393);
assert.equal(app.drawing.canvas.width, 2556); assert.equal(app.drawing.canvas.height, 1179);
assert.equal(app.CONFIG.uiSafeLeft, 65); assert.equal(app.CONFIG.uiSafeRight, 40);
assert.equal(app.storage.get('jwr-screen-orientation'), 'landscape');
assert(!app.orientation.isOrientationSwitchPending()); assert(app.counts().cancels >= 2); assert.equal(app.counts().lighting, 1);
app.resize(852, 393); assert.equal(app.counts().lighting, 1, 'Duplicate resize events do not clear the canvas again');
app.rotate('landscapeReverse'); assert.equal(app.CONFIG.uiSafeLeft, 40); assert.equal(app.CONFIG.uiSafeRight, 65);
app.orientation.toggleScreenOrientation(); assert.equal(app.requests[1].value, 'portrait');
app.resize(393, 852); assert.equal(app.drawing.canvas.width, 1179); assert.equal(app.storage.get('jwr-screen-orientation'), 'portrait');

app = boot(); app.resize(844, 390, false);
assert.equal(app.drawing.logicW, 844, 'A resize event overrides temporarily stale getWindowInfo dimensions');
app.rotate('landscape'); assert.equal(app.drawing.logicW, 844, 'A later orientation event cannot restore stale query dimensions');
app = boot({ metrics: { windowWidth: 844, windowHeight: 390, statusBarHeight: 59,
    safeArea: { top: 0, bottom: 390, left: 44, right: 810 } } });
assert.equal(app.CONFIG.uiSafeTop, 8, 'An explicitly empty top safe inset must not inherit a portrait status-bar gap');
app = boot({ saved: 'landscape' }); assert.equal(app.requests[0].value, 'landscape', 'Restore the separate display preference at startup');
app = boot({ unsupported: true }); app.orientation.toggleScreenOrientation(); assert.equal(app.requests.length, 0); assert.equal(app.messages.length, 1); assert(!app.orientation.isOrientationSwitchPending());
app = boot({ reject: true }); app.orientation.toggleScreenOrientation(); assert(!app.orientation.isOrientationSwitchPending()); assert.equal(app.storage.size, 0); assert.equal(app.messages.length, 1);
app = boot(); app.orientation.toggleScreenOrientation();
const timeout = [...app.timers.values()].find(t => t.delay === 2500); timeout.fn();
assert(!app.orientation.isOrientationSwitchPending()); assert.equal(app.messages.length, 1); assert.equal(app.storage.size, 0);

// Both orientations share the same layout source for drawing and touch bounds.
app = boot(); const layout = app.load('core/UILayout'), interaction = app.load('logic/InteractionLayout');
for (const [width, height] of [[320, 568], [393, 852], [568, 320], [667, 375], [852, 393], [1024, 768]]) {
    app.resize(width, height);
    const L = layout.getUILayout(), p = interaction.getRopeControlPosition(), a = interaction.getActionControlPosition();
    if (width > height) {
        assert.equal(L.orientation.y, L.settings.y); assert.equal(L.tape.y, L.flashlight.y);
        assert(L.orientation.y <= L.top + 22, 'Landscape tools sit on the top edge');
    } else {
        assert.equal(L.orientation.x, L.settings.x); assert.equal(L.tape.x, L.flashlight.x);
        assert.equal(L.tape.x, L.left + 22, 'Portrait keeps its edge-aligned vertical column');
        assert.equal(L.bag.x, L.tape.x); assert.equal(L.bag.y - L.orientation.y, 44);
    }
    assert(L.stamina.width <= 72 && L.stamina.height === 3);
    assert(L.stamina.y <= L.top + 64);
    assert(Math.hypot(p.x - a.x, p.y - a.y) > L.rope.radius + a.radius + 10);
    for (const b of [L.orientation, L.settings, L.tape, L.flashlight, L.retreat, L.bag]) {
        assert(b.x >= 22 && b.x + 22 < width && b.y - 22 >= 0 && b.y + 22 < height);
        if (width > height) assert(b.x + 22 < width - 110, 'No tool occupies the system capsule area');
    }
    if (width > height) {
        const wrapped = L.bag.y > L.orientation.y;
        assert.equal(L.bag.y, L.orientation.y + (wrapped ? 44 : 0));
        assert.equal(L.bag.x, wrapped ? L.orientation.x : L.retreat.x + 44);
    }
    const center = interaction.getActionWheelCenter(); assert(center.y >= 68 && center.y + 68 <= height);
}
console.log('通过：原生切屏请求/事件同步、缓存刷新、DPR/画布/光照同步、反向横屏安全区、偏好恢复、重复点击/拒绝/超时，以及双方向工具与轮盘边界。');
