const assert = require('assert/strict'), fs = require('fs'), path = require('path'), ts = require('typescript');
const root = path.resolve(__dirname, '../src'), cache = new Map();
function compile(file, requireModule) {
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file + '.ts'), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS },
    }).outputText;
    new Function('exports', 'require', code)(exports, requireModule);
    return exports;
}
let depletedSounds = 0;
function load(file) {
    if (file === 'audio/AudioManager') return { playSFX: () => { depletedSounds++; } };
    if (cache.has(file)) return cache.get(file);
    if (!fs.existsSync(path.join(root, file + '.ts'))) file += '/index';
    const result = compile(file, name => load(path.posix.normalize(path.posix.join(path.posix.dirname(file), name))));
    cache.set(file, result);
    return result;
}
const { CONFIG } = load('core/config');
const core = load('core/state'), { state, player, input, touches } = core;
const drive = load('logic/DriveMode'), semi = load('logic/SemiAutoDrive');
let now = 10000;
const originalNow = Date.now;
Date.now = () => now;
const noop = () => false, idle = new Proxy({}, { get: () => noop });
const handlers = {}, keys = {};
global.wx = {
    onTouchStart: fn => handlers.start = fn, onTouchMove: fn => handlers.move = fn,
    onTouchEnd: fn => handlers.end = fn, onTouchCancel: fn => handlers.cancel = fn,
};
global.window = { addEventListener: (event, fn) => keys[event] = fn };
const inputModule = compile('core/input', name => {
    if (name === './state') return core;
    if (name === './config') return { CONFIG };
    if (name === '../logic/DriveMode') return drive;
    if (name === '../logic/SemiAutoDrive') return semi;
    return idle;
});
inputModule.initInput(noop);
state.screen = 'mazeRescue'; state.mazeRescue = { phase: 'play', npcRescued: true };
state.npc.active = false;
const touch = (x, y = 400, id = 7) => ({ identifier: id, clientX: x, clientY: y });
const send = (kind, changed, active = changed) => handlers[kind]({ touches: active, changedTouches: changed });
function reset() { drive.setDriveMode('semiAuto'); player.vx = player.vy = player.angle = 0; input.targetAngle = 0; }
function tick(frames, fps = 60) {
    for (let i = 0; i < frames; i++) { semi.processSemiAutoDrive(); now += 1000 / fps; }
}
try {
    assert.equal(CONFIG.driveMode, 'semiAuto'); assert.equal(CONFIG.semiAutoDrive.showJoystick, false);
    reset(); send('start', [touch(140)]); send('move', [touch(160)]); tick(20);
    const lightPower = state.semiAutoDrive.inputPower, lightCost = 1 - state.semiAutoDrive.remaining;
    assert(player.vx > 0 && lightPower > 0 && lightPower < 1);
    const beforeTurn = state.semiAutoDrive.remaining;
    send('move', [touch(140, 440)]); tick(20);
    assert.equal(input.targetAngle, Math.PI / 2); assert(player.vy > 0);
    assert(state.semiAutoDrive.remaining < beforeTurn, 'Full-power steering consumes reserve despite constant recovery');
    assert.equal(lightCost, 0, 'Light propulsion stays at full stamina');
    const remaining = state.semiAutoDrive.remaining;
    send('end', [touch(140, 440)], []);
    assert.equal(state.semiAutoDrive.thrusting, false);
    assert.equal(state.semiAutoDrive.remaining, remaining, 'Release never instantly restores stamina');
    const vx = player.vx, vy = player.vy; tick(1);
    assert(Math.abs(player.vx - vx * CONFIG.waterDrag) < 1e-12);
    assert(Math.abs(player.vy - vy * CONFIG.waterDrag) < 1e-12);
    assert(state.semiAutoDrive.remaining > remaining && state.semiAutoDrive.remaining < 1, 'Stamina starts recovering on the very next update');
    tick(150); assert.equal(state.semiAutoDrive.remaining, 1);
    reset(); semi.updateSemiAutoJoystick(40, 0); tick(20);
    assert(1 - state.semiAutoDrive.remaining > lightCost * 1.8, 'Large input uses substantially more stamina');
    const spent = state.semiAutoDrive.remaining;
    for (let i = 0; i < 20; i++) { semi.releaseSemiAutoDrive(); semi.updateSemiAutoJoystick(40, 0); tick(1); }
    assert(state.semiAutoDrive.remaining < spent, 'Rapid tap-release cannot bypass consumption');

    // Both modes use the same physics for the same commanded force.
    const joystick = load('logic/JoystickDrive');
    for (const baseSpeed of [CONFIG.moveSpeed, CONFIG.maze.moveSpeed]) {
        function trace(isSemi) {
            reset(); const samples = [];
            for (let frame = 0; frame < 100; frame++) {
                const moving = frame % 40 < 24, angle = Math.floor(frame / 20) * .6, fast = frame % 50 < 25;
                if (isSemi) semi.updateSemiAutoJoystick(moving ? Math.cos(angle) * 40 : 0, moving ? Math.sin(angle) * 40 : 0, fast);
                else { input.move = moving ? 1 : 0; input.speedUp = moving && fast; if (moving) input.targetAngle = angle; }
                if (isSemi) semi.processSemiAutoDrive(baseSpeed); else joystick.processJoystickDrive(baseSpeed);
                samples.push([player.vx, player.vy, player.angle]); now += 1000 / 60;
            }
            return samples;
        }
        const auto = trace(false), limited = trace(true);
        auto.forEach((sample, frame) => sample.forEach((v, axis) => assert(Math.abs(v - limited[frame][axis]) < 1e-10)));
    }
    for (const fps of [60, 120]) {
        reset(); const sounds = depletedSounds;
        semi.updateSemiAutoJoystick(40, 0); tick(Math.ceil(CONFIG.semiAutoDrive.sprintDuration * fps) + 2, fps);
        assert(state.semiAutoDrive.exhausted); assert.equal(state.semiAutoDrive.remaining, 0);
        assert.equal(depletedSounds, sounds + 1);
        const speed = Math.hypot(player.vx, player.vy);
        semi.updateSemiAutoJoystick(0, -40); tick(1, fps);
        assert.equal(input.targetAngle, -Math.PI / 2); assert(Math.hypot(player.vx, player.vy) < speed);
        tick(fps, fps); assert.equal(depletedSounds, sounds + 1); assert(state.semiAutoDrive.effort > 0); assert(state.semiAutoDrive.thrusting);
        assert(Math.abs(state.semiAutoDrive.outputPower - semi.getSemiAutoEnergyRates().sustainablePower) < 1e-8);
        assert(player.vy < 0, 'Empty stamina still produces directed propulsion');
        semi.releaseSemiAutoDrive(); tick(1, fps);
        assert(!state.semiAutoDrive.exhausted && state.semiAutoDrive.remaining > 0, 'No exhaustion recovery lock after releasing');
        semi.updateSemiAutoJoystick(40, 0); tick(1, fps); assert(state.semiAutoDrive.thrusting);
    }

    // The painter is exercised independently of GPU/world rendering.
    const textCalls = [], arcs = [], rectangles = [], pathCalls = [];
    const c = new Proxy({}, { get: (_, name) => {
        if (name === 'fillText') return (...args) => textCalls.push(args);
        if (name === 'arc') return (...args) => arcs.push(args);
        if (name === 'fillRect') return (...args) => rectangles.push(args);
        if (['moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo'].includes(name)) return (...args) => pathCalls.push([name, ...args]);
        if (name === 'createLinearGradient' || name === 'createRadialGradient') return () => ({ addColorStop() {} });
        if (name === 'measureText') return text => ({ width: text.length * 6 });
        return () => {};
    }, set: () => true });
    const bcdRuntime = { inflating: false, deflating: false, volumeL: 1.2, netAccel: 0 };
    const bcd = compile('render/RenderBCD', name => {
        if (name === '../core/config') return { CONFIG };
        if (name === '../core/state') return core;
        if (name === './Canvas') return { ctx: c };
        if (name === '../logic/BCDSystem') return { getBCDRuntime: () => bcdRuntime, getBCDGaugeInfo: () => { throw new Error('BCD symbol must not read buoyancy/neutral gauge'); } };
        return idle;
    });
    const wheel = compile('render/RenderWheel', name => {
        if (name === '../core/config') return { CONFIG };
        if (name === '../core/state') return core;
        if (name === './Canvas') return { ctx: c };
        return idle;
    });
    const feedback = compile('render/RenderSemiAutoDrive', name => {
        if (name === '../core/config') return { CONFIG };
        if (name === '../core/state') return core;
        if (name === './RenderBCD') return bcd;
        return idle;
    });
    reset(); touches.joystickId = 7; touches.start = { x: 140, y: 400 }; touches.curr = { x: 180, y: 400 };
    for (const dimensions of [[320, 568], [375, 667], [393, 852], [768, 1024]]) {
        CONFIG.screenWidth = dimensions[0]; CONFIG.screenHeight = dimensions[1];
        for (const position of ['top', 'bottom', 'bcd']) {
            CONFIG.semiAutoDrive.staminaPosition = position;
            const L = feedback.getStaminaLayout(...dimensions);
            assert(L.x >= 0 && L.x + L.width <= dimensions[0] && L.y >= 62 && L.y + L.height < dimensions[1]);
            if (position === 'top') assert(L.y - 15 >= CONFIG.uiSafeTop);
            if (position === 'bottom') {
                const marker = wheel.getWheelBtnPos(...dimensions);
                assert(marker.y + CONFIG.marker.wheelOuterRadius + 12 < L.y - 15, 'Expanded marker wheel stays above stamina labels');
                assert(marker.y + CONFIG.marker.btnRadius + 22 < L.y - 15, 'Marker button and caption cannot overlap stamina');
            }
            feedback.drawSemiAutoControls(c, ...dimensions);
        }
    }
    assert.equal(arcs.length, 0, 'Default hidden joystick has no ring and no floating stamina popup');
    CONFIG.semiAutoDrive.showJoystick = true; feedback.drawSemiAutoControls(c, 375, 667); assert(arcs.length > 0);
    CONFIG.semiAutoDrive.showJoystick = false; CONFIG.semiAutoDrive.staminaPosition = 'bottom';
    CONFIG.screenWidth = 375; CONFIG.screenHeight = 667;
    const emptyShape = bcd.getBCDInflationShape(0, 4, 52);
    let previousHeight = emptyShape.halfHeight;
    for (let volume = .05; volume <= 4; volume += .05) {
        const shape = bcd.getBCDInflationShape(volume, 4, 52);
        assert(shape.halfHeight > previousHeight, 'Inflation continuously rounds the contour without a neutral snap');
        assert.equal(shape.halfWidth, emptyShape.halfWidth);
        previousHeight = shape.halfHeight;
    }
    assert.deepEqual(bcd.getBCDInflationShape(6, 4, 52), bcd.getBCDInflationShape(4, 4, 52));
    rectangles.length = 0; textCalls.length = 0;
    const sameVolumePaths = [];
    for (const netAccel of [-.04, 0, .04]) {
        bcdRuntime.netAccel = netAccel;
        pathCalls.length = 0; bcd.drawBCDController(now / 1000);
        sameVolumePaths.push(pathCalls.slice());
    }
    assert.deepEqual(sameVolumePaths[0], sameVolumePaths[1], 'Same gas volume must look identical whether rising, balanced or sinking');
    assert.deepEqual(sameVolumePaths[1], sameVolumePaths[2]);
    bcdRuntime.volumeL = .1; pathCalls.length = 0; bcd.drawBCDController(now / 1000);
    assert.notDeepEqual(pathCalls, sameVolumePaths[0], 'Deflating visibly collapses the contour');
    assert(pathCalls.flat().filter(value => typeof value === 'number').every(Number.isFinite));
    assert.equal(rectangles.length, 0, 'BCD has no progress/fill bars');
    assert(textCalls.every(call => call[0] === 'BCD'), 'No buoyancy verdict, liters, percentage or neutral labels');
    const tape = compile('render/TapeDeckVisual', () => idle);
    pathCalls.length = 0; tape.cutPanel(c, 10, 20, 36, 36, 6); const outline = pathCalls.slice();
    pathCalls.length = 0; const beforeProgressArcs = arcs.length;
    tape.drawCutPanelProgress(c, 10, 20, 36, 36, 1, 6);
    assert.deepEqual(pathCalls.slice(0, -1), outline, 'Full hold progress exactly follows the cut-corner button outline');
    assert.deepEqual(pathCalls[pathCalls.length - 1].slice(1), outline[0].slice(1));
    assert.equal(arcs.length, beforeProgressArcs, 'Square progress never draws a circular arc');

    // Real HUD lifecycle: compact return button cancels on release/move and cassette owns mute.
    const registry = load('extraction/core/ExtractionRegistry');
    const hud = compile('render/HUDTopLeft', name => {
        if (name === '../core/config') return { CONFIG };
        if (name === '../core/state') return core;
        if (name === './Canvas') return { ctx: c, logicW: 375, logicH: 667 };
        if (name === './TapeDeckVisual') return { ...tape, drawTapeDeck() {}, drawTapeSleeve() {} };
        if (name === './RescueTape') return { getRescueTapeVisual: () => ({ playing: false }) };
        if (name === './RenderAudioToggle') return { toggleMuted: () => state.audio.muted = !state.audio.muted };
        if (name === '../extraction/core/ExtractionRegistry') return registry;
        if (name === '../extraction/logic/Loadout') return { getActiveAirTanks: () => ['airTankS'] };
        if (name === '../logic/DecompressionSystem') return new Proxy({ getDecoRuntime: () => ({ nitrogenLoad: 0 }) }, { get: (o, k) => o[k] || noop });
        return idle;
    });
    state.mazeRescue.npcRescued = false; textCalls.length = 0;
    hud.initMazeHUDTopLeft(); hud.drawHUDTopLeft(now / 1000);
    const captions = textCalls.map(call => call[0]);
    assert(captions.includes('RETURN') && captions.includes('DEPTH'));
    assert(!captions.includes('SOUND') && !captions.includes('DRIVE'));
    const returnCaption = textCalls.find(call => call[0] === 'RETURN');
    const returnX = returnCaption[1], returnY = returnCaption[2] - 29;
    assert(hud.handleHUDTouchStart(70, returnX, returnY)); assert(state.mazeRescue.retreatHolding);
    now += 500; hud.handleHUDTouchEnd(70, returnX, returnY); assert(!state.mazeRescue.retreatHolding);
    hud.handleHUDTouchStart(71, returnX, returnY); hud.handleHUDTouchMove(71, returnX + 70, returnY);
    assert(!state.mazeRescue.retreatHolding, 'Moving away cancels compact return');
    const muted = state.audio.muted;
    // Tape follows the depth item when deco is hidden: use the known gap plus its different size.
    const depthCaption = textCalls.find(call => call[0] === 'DEPTH');
    const tapeY = depthCaption[2] - 29 + 20 + 14 + 24;
    hud.handleHUDTouchStart(72, 38, tapeY); hud.handleHUDTouchEnd(72, 38, tapeY);
    assert.notEqual(state.audio.muted, muted, 'Cassette short-tap toggles audio');
    assert.equal(registry.getEquipmentEffects('suitBasic').maxDepthMeters, 90);
    assert.equal(registry.getEquipmentEffects('airTankS').startO2, 120);
    assert.equal(CONFIG.infiniteO2, false, 'Relaxed limits do not rely on a debug cheat');
    let depth = 5;
    const buoyancy = compile('logic/BCDSystem', name => {
        if (name === '../core/config') return { CONFIG };
        if (name === '../core/state') return core;
        if (name === './DecompressionSystem') return { getCurrentDepthMeters: () => depth, addNitrogenLoad() {} };
        return idle;
    });
    buoyancy.resetBCDSystem();
    const surfaceVolume = buoyancy.getBCDRuntime().volumeL, gas = buoyancy.getBCDRuntime().gasNL;
    depth = 25; buoyancy.updateBCDSystem(1 / 60);
    assert.equal(buoyancy.getBCDRuntime().gasNL, gas);
    assert(buoyancy.getBCDRuntime().volumeL < surfaceVolume, 'Depth compresses the same quantity of gas');
    assert(bcd.getBCDInflationShape(buoyancy.getBCDRuntime().volumeL, 4, 52).halfHeight < bcd.getBCDInflationShape(surfaceVolume, 4, 52).halfHeight, 'Depth compression visibly flattens the symbol');
    depth = 5; buoyancy.updateBCDSystem(1 / 60);
    assert(Math.abs(buoyancy.getBCDRuntime().volumeL - surfaceVolume) < 1e-9, 'Ascending expands the bladder again');

    // Exercise the actual diver painter: drifting legs settle, powered legs keep moving.
    const diver = compile('render/RenderDiver', name => {
        if (name === '../core/config') return { CONFIG };
        if (name === './TapeResonance') return load('render/TapeResonance');
        return idle;
    });
    function legGeometry(effort, id) {
        const commands = [];
        const context = new Proxy({}, { get: (_, name) => {
            if (name === 'createLinearGradient' || name === 'createRadialGradient') return () => ({ addColorStop() {} });
            if (['moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo'].includes(name)) return (...args) => commands.push([name, ...args]);
            return () => {};
        }, set: () => true });
        diver.drawDiver(context, 0, 0, 0, null, { id, vx: 4, vy: 0, autoSwim: true, swimEffort: effort, animTime: 1, hasTank: false });
        return commands.slice(0, 50);
    }
    const glide = legGeometry(0, 'test-glide');
    for (let i = 0; i < 12; i++) assert.deepEqual(legGeometry(0, 'test-glide'), glide, 'Inertia alone does not secretly animate kicks');
    const kicking = legGeometry(1, 'test-kicking');
    assert.notDeepEqual(legGeometry(1, 'test-kicking'), kicking, 'Active thrust visibly kicks');


    reset(); send('start', [touch(140)]); send('move', [touch(180)]); tick(20);
    const saved = state.semiAutoDrive.remaining;
    send('cancel', [touch(200, 400, 8)], [touch(180)]); assert(state.semiAutoDrive.thrusting);
    send('cancel', [touch(180)], []);
    assert.equal(state.semiAutoDrive.thrusting, false); assert.equal(state.semiAutoDrive.remaining, saved, 'Cancel cannot refill stamina');
    reset(); keys.keydown({ key: 'w', code: 'KeyW', repeat: false }); tick(1);
    assert.equal(state.semiAutoDrive.inputPower, .3);
    keys.keydown({ key: 'shift', code: 'ShiftLeft', repeat: false }); assert.equal(state.semiAutoDrive.inputPower, 1);
    const keyStamina = state.semiAutoDrive.remaining;
    for (let i = 0; i < 20; i++) { tick(5); keys.keydown({ key: 'w', code: 'KeyW', repeat: true }); }
    assert(state.semiAutoDrive.remaining < keyStamina);
    keys.blur(); assert.equal(state.semiAutoDrive.thrusting, false);
    console.log('Passed: continuous steering/release, analog exertion, constant recovery, sustainable empty-tank propulsion without exhaustion lock, rapid inputs, 60/120Hz, three safe HUD positions, hidden joystick, volume-only BCD silhouette without neutral cues, matching square hold progress, glide pose and keyboard cancellation.');
} finally { Date.now = originalNow; delete global.wx; delete global.window; }
