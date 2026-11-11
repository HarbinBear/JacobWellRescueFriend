// 执行真实入口与首帧，隔离 DOM/存储/GPU；检查启动契约，不模拟微信工具的会话或真实像素。
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const RELEASE = process.argv.includes('--release');
const ROOT = RELEASE ? require('./buildWechatRelease').build() : path.resolve(__dirname, '..');
const EXT = RELEASE ? '.js' : '.ts';
const compiled = new Map();

function boot(hasBareWindow) {
    const modules = new Map(), moduleStack = [], canvases = [], frames = [];
    const logs = [], storage = new Map(), timers = new Map(), listeners = {};
    let nextTimer = 1;
    const noop = () => {};
    const register = name => fn => {
        assert.equal(typeof fn, 'function', name + ' 应注册回调');
        (listeners[name] || (listeners[name] = [])).push(fn);
    };
    function createCanvas() {
        const canvas = { owner: moduleStack[moduleStack.length - 1], width: 0, height: 0,
            texts: [], fills: [], contexts: [] };
        const stack = [];
        const drawing = {
            canvas, globalAlpha: 1, globalCompositeOperation: 'source-over', lineWidth: 1,
            fillStyle: '#000', strokeStyle: '#000', font: '10px sans-serif',
            save() { stack.push({ globalAlpha: this.globalAlpha, globalCompositeOperation: this.globalCompositeOperation,
                fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, font: this.font, lineWidth: this.lineWidth }); },
            restore() { if (stack.length) Object.assign(this, stack.pop()); },
            fillText(text) { canvas.texts.push({ text: String(text), alpha: this.globalAlpha }); },
            strokeText: noop,
            fillRect(x, y, w, h) { canvas.fills.push({ x, y, w, h, alpha: this.globalAlpha }); },
            measureText(text) { return { width: String(text).length * 7 }; },
            createLinearGradient() { return { addColorStop: noop }; },
            createRadialGradient() { return { addColorStop: noop }; },
            getLineDash() { return []; },
        };
        for (const method of ['scale', 'translate', 'rotate', 'setTransform', 'resetTransform', 'transform',
            'clearRect', 'strokeRect', 'beginPath', 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo',
            'arc', 'arcTo', 'ellipse', 'rect', 'closePath', 'clip', 'fill', 'stroke', 'drawImage', 'setLineDash']) {
            drawing[method] = noop;
        }
        canvas.getContext = kind => {
            canvas.contexts.push(kind);
            return kind === '2d' ? drawing : null; // 故意令 WebGL 不可用，真实 fallback 必须继续显示菜单。
        };
        canvases.push(canvas);
        return canvas;
    }
    function createAudio() {
        const audio = { play: noop, pause: noop, stop: noop, seek: noop, destroy: noop,
            loop: false, volume: 1, src: '', currentTime: 0, duration: 0, paused: true };
        for (const event of ['Canplay', 'Error', 'Play', 'Pause', 'Stop', 'Ended', 'TimeUpdate', 'Waiting', 'Seeking', 'Seeked']) {
            audio['on' + event] = noop;
            audio['off' + event] = noop;
        }
        return audio;
    }
    const windowInfo = { windowWidth: 375, windowHeight: 667, pixelRatio: 2 };
    const wx = {
        createCanvas, createImage: () => ({}), createInnerAudioContext: createAudio,
        getWindowInfo: () => ({ ...windowInfo }),
        getSystemInfoSync: () => ({ ...windowInfo, model: 'native boot test', platform: 'devtools' }),
        getStorageSync: key => storage.has(key) ? storage.get(key) : '',
        setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key),
        setPreferredFramesPerSecond: noop, showToast: noop,
    };
    for (const event of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Hide', 'Show', 'WindowResize', 'DeviceOrientationChange']) {
        wx['on' + event] = register(event);
    }
    const globals = {
        wx,
        console: Object.fromEntries(['log', 'warn', 'error'].map(level => [level, (...args) => logs.push({ level, args })])),
        requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
        cancelAnimationFrame: noop,
        setTimeout(fn, ms) { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
        clearTimeout: id => timers.delete(id),
        setInterval(fn, ms) { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
        clearInterval: id => timers.delete(id),
    };
    globals.GameGlobal = globals;
    if (hasBareWindow) globals.window = {}; // 微信可能暴露 window，但不提供浏览器 DOM 事件接口。
    const context = vm.createContext(globals);
    function load(request, from = 'game') {
        let id = request.startsWith('.') ? path.posix.join(path.posix.dirname(from), request) : request;
        if (!fs.existsSync(path.join(ROOT, id + EXT))) id += '/index';
        if (modules.has(id)) return modules.get(id).exports;
        const module = { exports: {} };
        modules.set(id, module);
        if (!compiled.has(id)) {
            const source = fs.readFileSync(path.join(ROOT, id + EXT), 'utf8');
            compiled.set(id, RELEASE ? source : ts.transpileModule(source, {
                compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS },
            }).outputText);
        }
        const execute = vm.runInContext('(function(module,exports,require){' + compiled.get(id) + '\n})', context,
            { filename: id + EXT });
        moduleStack.push(id);
        try { execute(module, module.exports, next => load(next, id)); }
        finally { moduleStack.pop(); }
        return module.exports;
    }

    load('game');
    const { state } = load('src/core/state'), drawing = load('src/render/Canvas');
    const main = canvases[0];
    assert(main, '入口必须创建主画布');
    assert.equal(main.owner, 'src/render/Canvas', '第一张可见画布不能被离屏渲染器抢先创建');
    assert.equal(drawing.canvas, main, '所有主绘制应使用第一张画布');
    assert.equal(main.contexts[0], '2d');
    assert.equal(main.width, windowInfo.windowWidth * windowInfo.pixelRatio);
    assert.equal(main.height, windowInfo.windowHeight * windowInfo.pixelRatio);
    assert(canvases.some(c => c.contexts.includes('webgl')), '必须实际尝试 WebGL 并进入失败路径');
    assert.equal(load('src/render/WebGLLight').isWebGLAvailable(), false);
    assert(logs.some(entry => entry.args.some(arg => typeof arg === 'string' && arg.includes('fallback'))), '必须记录降级路径');
    assert.equal(state.screen, 'menu');
    assert(main.fills.some(r => r.w > 0 && r.h > 0 && r.alpha > 0), '首帧必须实际绘制背景');
    const menu = load('src/render/RenderMenu').getMenuButtonRects();
    for (const button of menu) {
        assert(main.texts.some(item => item.text === button.label && item.alpha > 0), '主画布应绘制菜单按钮：' + button.label);
    }
    assert.equal(frames.length, 1, '首帧结束后必须安排后续帧');
    const textCount = main.texts.length;
    frames.shift()();
    assert.equal(frames.length, 1, '第二帧完成后主循环仍应继续');
    assert(main.texts.length > textCount, '第二帧仍应绘制菜单');
    assert.equal(listeners.TouchStart.length, 1, '菜单触摸输入必须已接入');

    // 只做真实章节初始化，不推进洞腔渲染；让缺 DOM 方法的 window 分支确实被执行。
    load('src/logic/MazeLogic').resetMazeLogic();
    assert.equal(state.screen, 'mazeRescue');
    assert(state.mazeRescue.continuous, '连续章节应初始化完成');
    assert(listeners.Hide.length > 0 && listeners.Show.length > 0, '原生前后台生命周期必须保留');
    assert(storage.size > 0, '存档仅写入本用例的内存，不访问用户存档');
    return { environment: hasBareWindow ? 'window={}，无DOM事件接口' : '无window',
        codeOnlyRelease: RELEASE, firstCanvas: main.owner, menuFrames: 2, chapterEntered: true, webglFallback: true };
}

const report = [boot(false), boot(true)];
console.log('通过：两种非DOM环境的真实启动、首画布、WebGL失败菜单、后续帧及进入章节。');
console.log(JSON.stringify(report, null, 2));
