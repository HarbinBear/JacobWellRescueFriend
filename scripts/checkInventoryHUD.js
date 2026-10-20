// Regression: first pickup used to create a gradient at the deleted retreat-button coordinates.
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), ts = require('typescript');
const root = path.resolve(__dirname, '../src'), cache = new Map();
let gradientCount = 0;
const texts = [];
const ctx = new Proxy({}, { get: (_, key) => {
    if (key === 'createLinearGradient') return (...args) => {
        assert(args.every(Number.isFinite), 'Canvas gradient coordinates must be finite: ' + args);
        gradientCount++;
        return { addColorStop() {} };
    };
    if (key === 'fillText') return (...args) => texts.push(args);
    return () => {};
}, set: () => true });
function load(file) {
    if (file === 'render/Canvas') return { ctx };
    if (file === 'extraction/logic/Shop') return { fallbackEquippedSlot() {} };
    if (cache.has(file)) return cache.get(file);
    if (!fs.existsSync(path.join(root, file + '.ts'))) file += '/index';
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file + '.ts'), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS },
    }).outputText;
    new Function('exports', 'require', code)(exports, name => load(path.posix.normalize(path.posix.join(path.posix.dirname(file), name))));
    return exports;
}
const { CONFIG } = load('core/config'), { state } = load('core/state');
const { ensureExtractionState } = load('extraction/core/ExtractionState');
const pickup = load('extraction/logic/ItemPickup'), hud = load('extraction/render/InventoryHUD');
// The old retreat layout keys intentionally stay absent.
assert.equal(CONFIG.maze.retreatBtnXRatio, undefined);
assert.equal(CONFIG.maze.retreatBtnYRatio, undefined);
state.screen = 'mazeRescue';
state.mazeRescue = { phase: 'play', relics: Array.from({ length: 5 }, (_, i) => ({ id: i + 1, kind: 'fishhook', x: 100, y: 200 })) };
const ex = ensureExtractionState();
ex.bag.maxSlots = 4; ex.bag.items = [null, null, null, null];
ex.diveSession.pickedRelicIds = [];
hud.drawInventoryHUD();
assert.equal(gradientCount, 0, 'An empty bag does not create the fill gradient');
for (let id = 1; id <= 4; id++) {
    assert.equal(pickup.performPickup(id).ok, true, 'Use the real relic pickup path');
    assert.doesNotThrow(() => hud.drawInventoryHUD(), 'Drawing after pickup ' + id + ' must not crash');
    const rect = hud.getInventoryHUDCapsuleRect();
    assert(rect && Object.values(rect).every(Number.isFinite));
    assert(texts.some(call => call[0] === id + '/4'));
}
assert.equal(pickup.performPickup(5).reason, 'bagFull');
assert(gradientCount >= 4);
for (const [w, h, bottom] of [[320, 568, 18], [375, 667, 18], [393, 852, 44], [768, 1024, 24]]) {
    CONFIG.screenWidth = w; CONFIG.screenHeight = h; CONFIG.uiSafeBottom = bottom;
    for (const mode of ['auto', 'manual', 'semiAuto']) {
        CONFIG.driveMode = mode;
        hud.drawInventoryHUD();
        const r = hud.getInventoryHUDCapsuleRect();
        assert(Object.values(r).every(Number.isFinite));
        assert(r.x >= 0 && r.y >= CONFIG.uiSafeTop && r.x + r.w <= w && r.y + r.h <= h - bottom);
    }
}
hud.openBagFullPage(); assert(hud.isBagFullPageOpen());
hud.closeBagFullPage(); assert(!hud.isBagFullPageOpen());
state.mazeRescue.phase = 'shore'; hud.drawInventoryHUD();
assert.equal(hud.getInventoryHUDCapsuleRect(), null);
console.log('Passed: empty bag, real first/repeated pickups, full bag, finite gradient and hit-test bounds, small/notched screens, three drive modes and bag open/close.');
