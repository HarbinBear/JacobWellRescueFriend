// 加载真实配置/画布模块，模拟真机调试钩子抛错；不依赖手机或浏览器全局。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');

function boot(api, globals = {}) {
    const warnings = [], scaleCalls = [];
    const canvas = { width: 0, height: 0, getContext: () => ({ scale: (...args) => scaleCalls.push(args) }) };
    const context = vm.createContext({ ...globals, wx: { ...api, createCanvas: () => canvas },
        console: { warn: (...args) => warnings.push(args) } });
    const cache = new Map();
    function load(file) {
        if (cache.has(file)) return cache.get(file).exports;
        const module = { exports: {} };
        cache.set(file, module);
        if (file === 'src/core/config.ts') {
            module.exports = { CONFIG: load('src/core/config/base.ts').baseConfig };
            return module.exports;
        }
        const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
            compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS },
        }).outputText;
        const execute = vm.runInContext(`(function(module,exports,require){${source}\n})`, context, { filename: file });
        execute(module, module.exports, request => load(path.posix.normalize(path.posix.join(path.posix.dirname(file), request)) + '.ts'));
        return module.exports;
    }
    const base = load('src/core/config/base.ts').baseConfig;
    const drawing = load('src/render/Canvas.ts');
    return { base, drawing, canvas, scaleCalls, warnings,
        metrics: load('src/core/WindowMetrics.ts').getWindowMetrics() };
}

let modernCalls = 0, legacyCalls = 0;
const sdkError = () => { throw new TypeError("Cannot read properties of undefined (reading 'getSystemNanoTime')"); };
let result = boot({
    getWindowInfo() { modernCalls++; return { windowWidth: 393, windowHeight: 852, pixelRatio: 3 }; },
    getSystemInfoSync() { legacyCalls++; return sdkError(); },
});
assert.equal(modernCalls, 1, '配置和画布应共用缓存，只查询一次');
assert.equal(legacyCalls, 0, '新接口可用时不得调用会崩溃的旧接口');
assert.equal(result.base.screenWidth, 393);
assert.equal(result.base.screenHeight, 852);
assert.equal(result.canvas.width, 1179);
assert.equal(result.canvas.height, 2556);
assert.deepEqual(result.scaleCalls, [[3, 3]]);
assert.equal(result.warnings.length, 0);

result = boot({ getWindowInfo: sdkError, getSystemInfoSync: () => ({ windowWidth: 360, windowHeight: 780, pixelRatio: 2 }) });
assert.equal(result.base.screenWidth, 360);
assert.equal(result.canvas.height, 1560);
assert.equal(result.warnings.length, 1);

result = boot({ getSystemInfoSync: () => ({ windowWidth: 414, windowHeight: 896, pixelRatio: 3 }) });
assert.equal(result.drawing.logicW, 414);
assert.equal(result.canvas.width, 1242);

result = boot({ getWindowInfo: sdkError, getSystemInfoSync: sdkError },
    { innerWidth: 390, innerHeight: 844, devicePixelRatio: 3 });
assert.equal(result.base.screenWidth, 390);
assert.equal(result.base.screenHeight, 844);
assert.equal(result.canvas.width, 1170);
assert.equal(result.canvas.height, 2532);

result = boot({ getWindowInfo: () => ({}), getSystemInfoSync: sdkError },
    { GameGlobal: { innerWidth: 430, innerHeight: 932, devicePixelRatio: 3 } });
assert.equal(result.drawing.logicH, 932);
assert.equal(result.canvas.width, 1290);

result = boot({ getWindowInfo: () => ({ windowWidth: 393, windowHeight: 852, pixelRatio: NaN }),
    getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 3 }) });
assert.equal(result.drawing.logicW, 393, '补齐缺失字段时保留新接口的有效窗口数据');
assert.equal(result.drawing.dpr, 3);

result = boot({ getWindowInfo: () => ({ windowWidth: 0, windowHeight: Infinity, pixelRatio: -1 }),
    getSystemInfoSync: () => undefined });
assert.equal(result.drawing.logicW, 375);
assert.equal(result.drawing.logicH, 667);
assert.equal(result.drawing.dpr, 2);
assert.equal(result.warnings.length, 1);

result = boot({ getWindowInfo: () => ({ screenWidth: 320, screenHeight: 568, pixelRatio: 2 }) });
assert.equal(result.drawing.logicW, 320);
assert.equal(result.canvas.height, 1136);
console.log('通过：新接口绕开故障旧接口、配置/画布共享查询、旧基础库兼容、SDK 抛错、空/非法字段与窗口兜底。');
