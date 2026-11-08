const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { openReviewBrowser } = require('../design/cave-room/browser.cjs');
const output = path.resolve(__dirname, '../node_modules/.cache/controls-layout');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await openReviewBrowser(process.env.JWR_PREVIEW_URL || 'http://127.0.0.1:60972/node_modules/.cache/controls-layout/game.html', 1200, 940);
    const report = {};
    try {
        const E = source => browser.evaluate(source);
        const storage = () => E('JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k])=>!k.endsWith("jwr-screen-orientation"))))');
        async function shot(name) {
            const data = await E('document.getElementById("game").toDataURL("image/png")');
            fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
        }
        async function touch(type, points = []) {
            const viewport = await E('(()=>{const r=document.getElementById("game").getBoundingClientRect(),c=DeepTapeGame.cave.config;return{x:r.x,y:r.y,w:r.width,h:r.height,lw:c.screenWidth,lh:c.screenHeight}})()');
            await browser.command('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ id: p.id, x: viewport.x + p.x / viewport.lw * viewport.w, y: viewport.y + p.y / viewport.lh * viewport.h })) });
            if (type === 'touchMove') await wait(30); // Chromium coalesces pointer motion until the next frame.
        }
        async function button(name) { return E(`DeepTapeGame.ui.layout().${name}`); }
        async function switchScreen(active = [], id = 8) {
            const p = await E('DeepTapeGame.ui.orientation()');
            await touch('touchStart', [...active, { ...p, id }]);
            await touch('touchEnd');
            await wait(70);
        }
        async function checkBlankMovement() {
            const L = await E('DeepTapeGame.ui.layout()'), size = await E('({w:DeepTapeGame.cave.config.screenWidth,h:DeepTapeGame.cave.config.screenHeight})');
            const original = await E('DeepTapeGame.cave.config.driveMode');
            for (const mode of ['auto', 'semiAuto', 'manual']) {
                await E(`DeepTapeGame.cave.config.driveMode=${JSON.stringify(mode)};true`);
                for (const p of [{ x: size.w - 80, y: size.h * .55 }, { x: size.w - 160, y: 20 }]) {
                    const start = { ...p, id: 1 }, end = { ...start, x: p.x + 24, y: p.y + 12 };
                    await touch('touchStart', [start]);
                    const captured = await E('DeepTapeGame.touches.joystickId');
                    if (mode !== 'manual') assert.notEqual(captured, null, `${mode}: blank ${L.landscape ? 'landscape' : 'portrait'} ${p.x},${p.y} starts movement`);
                    else assert.equal(await E('Object.keys(DeepTapeGame.state.manualDrive.activeTouches).length'), 1);
                    await touch('touchMove', [end]);
                    if (mode !== 'manual') assert(await E('DeepTapeGame.input.move > 0'));
                    await touch('touchEnd');
                    assert.equal(await E('DeepTapeGame.touches.joystickId'), null);
                    assert.equal(await E('Object.keys(DeepTapeGame.state.manualDrive.activeTouches).length'), 0);
                }
            }
            await E(`DeepTapeGame.cave.config.driveMode=${JSON.stringify(original)};true`);
        }
        async function checkSelectorOwnership(name) {
            const control = { ...await button(name), id: 1 };
            await touch('touchStart', [control]);
            assert(await E(name === 'action' ? '!!DeepTapeGame.state.interaction.gesture' : 'DeepTapeGame.state.wheel.open'));
            const extra = { id: 2, x: control.x + 38, y: control.y };
            await touch('touchStart', [control, extra]);
            assert.equal(await E('DeepTapeGame.touches.joystickId'), null, 'A second touch inside a selector cannot become movement');
            const outside = { ...extra, x: control.x + 90, y: control.y - 100 };
            await touch('touchMove', [control, outside]);
            assert.equal(await E('DeepTapeGame.touches.joystickId'), null, 'Dragging out of a selector keeps touch ownership');
            await touch('touchEnd', [control]);
            const size = await E('({w:DeepTapeGame.cave.config.screenWidth,h:DeepTapeGame.cave.config.screenHeight})');
            const blank = { id: 3, x: size.w - 160, y: 20 };
            await touch('touchStart', [control, blank]);
            await touch('touchMove', [control, { ...blank, x: blank.x + 24, y: blank.y + 12 }]);
            assert.notEqual(await E('DeepTapeGame.touches.joystickId'), null, 'Blank space still moves while selector is open');
            assert(await E('DeepTapeGame.input.move > 0'), 'Blank touch drives movement alongside the open selector');
            await touch('touchCancel');
        }
        await E('DeepTapeGame.interactions.setup("rammer",false);DeepTapeGame.state.fishEnemies=[];DeepTapeGame.state.rope.ropes=[];true');
        await wait(800);
        const before = await storage(), seed = await E('DeepTapeGame.state.mazeRescue.seed');
        const portrait = await E('DeepTapeGame.ui.layout()');
        assert(!portrait.landscape); assert.equal(portrait.tape.x, portrait.settings.x);
        assert.equal(portrait.flashlight.x, portrait.settings.x); assert(portrait.top <= 8);
        assert.equal(portrait.bag.x, portrait.tape.x); assert.equal(portrait.bag.y - portrait.orientation.y, 44);
        assert(portrait.stamina.width <= 44); await shot('portrait-canvas');
        await checkBlankMovement();
        await checkSelectorOwnership('action'); await checkSelectorOwnership('rope');

        // Native multi-touch: left movement continues while the right selector opens.
        const left = { id: 1, x: 120, y: 470 }, dragged = { id: 1, x: 148, y: 488 };
        await touch('touchStart', [left]); await touch('touchMove', [dragged]);
        const leftId = await E('DeepTapeGame.touches.joystickId'); assert.notEqual(leftId, null);
        const action = { ...await button('action'), id: 2 };
        await touch('touchStart', [dragged, action]);
        await touch('touchMove', [{ ...dragged, y: 494 }, { ...action, x: action.x + 38, y: action.y - 12 }]);
        report.twoHands = await E('({left:DeepTapeGame.touches.joystickId,right:DeepTapeGame.state.interaction.gesture?.touchId,moving:DeepTapeGame.input.move,power:DeepTapeGame.state.semiAutoDrive.inputPower})');
        assert.equal(report.twoHands.left, leftId); assert.notEqual(report.twoHands.right, null);
        assert.notEqual(report.twoHands.left, report.twoHands.right); assert(report.twoHands.moving > 0);
        await switchScreen([dragged, action], 3);
        report.landscape = await E('(()=>{const g=DeepTapeGame;return{w:g.ui.canvas.logicW,h:g.ui.canvas.logicH,canvasWidth:g.ui.canvas.canvas.width,gl:g.ui.glSize(),layout:g.ui.layout(),seed:g.state.mazeRescue.seed,phase:g.state.mazeRescue.phase,move:g.input.move,joystick:g.touches.joystickId,gesture:g.state.interaction.gesture,wheel:g.state.wheel.open}})()');
        assert.equal(report.landscape.w, 667); assert.equal(report.landscape.h, 375);
        assert.equal(report.landscape.canvasWidth, 1334); assert(report.landscape.gl.w > report.landscape.gl.h);
        assert.equal(report.landscape.seed, seed); assert.equal(report.landscape.phase, 'play');
        assert.equal(report.landscape.move, 0); assert.equal(report.landscape.joystick, null);
        assert.equal(report.landscape.gesture, null); assert.equal(report.landscape.wheel, false);
        const L = report.landscape.layout;
        assert.equal(L.orientation.y, L.settings.y); assert.equal(L.settings.y, L.flashlight.y);
        assert.equal(L.orientation.y, L.top + 22, 'Landscape tools hug the top edge');
        assert(L.retreat.x + 22 < 667 - 110, 'System capsule corner remains empty');
        assert.equal(L.bag.y, L.retreat.y); assert.equal(L.bag.x - L.retreat.x, 44);
        await shot('landscape-canvas');
        await checkBlankMovement();
        await checkSelectorOwnership('action'); await checkSelectorOwnership('rope');

        // Rotation releases a held BCD button, including the short-burst tail.
        const inflate = await E('DeepTapeGame.ui.bcd.getBCDInflateBtn()');
        const held = { id: 4, x: inflate.cx, y: inflate.cy };
        await touch('touchStart', [held]); assert(await E('DeepTapeGame.ui.bcdRuntime().inflateHeld'));
        await switchScreen([held], 5);
        assert.equal(await E('DeepTapeGame.cave.config.screenWidth'), 375);
        assert.equal(await E('DeepTapeGame.ui.bcdRuntime().inflateHeld'), false);
        assert.equal(await E('DeepTapeGame.ui.bcdRuntime().inflateBurstRemain'), 0);
        report.bcdReleased = true;

        // Flashlight and cassette retain their original actions in the portrait column.
        let p = await button('flashlight'); const lightBefore = await E('DeepTapeGame.state.flashlightOn');
        await touch('touchStart', [{ ...p, id: 6 }]);
        assert.equal(await E('DeepTapeGame.touches.joystickId'), null);
        await touch('touchEnd');
        assert.notEqual(await E('DeepTapeGame.state.flashlightOn'), lightBefore);
        assert.equal(await E('DeepTapeGame.touches.joystickId'), null);
        p = await button('tape'); const muted = await E('DeepTapeGame.state.audio.muted');
        await touch('touchStart', [{ ...p, id: 6 }]); await touch('touchEnd');
        assert.notEqual(await E('DeepTapeGame.state.audio.muted'), muted);

        await switchScreen();
        const pendingAction = { ...await button('action'), id: 1 };
        await touch('touchStart', [pendingAction]);
        assert(await E('!!DeepTapeGame.state.interaction.gesture'));
        p = await button('bag');
        await touch('touchStart', [pendingAction, { ...p, id: 6 }]);
        assert.equal(await E('DeepTapeGame.state.interaction.gesture'), null, 'Opening the bag cancels the previous selector');
        await touch('touchEnd'); await wait(50);
        assert.equal(await E('DeepTapeGame.ui.bag.isBagFullPageOpen()'), true, 'The backpack icon opens the bag');
        assert.equal(await E('DeepTapeGame.touches.joystickId'), null, 'Backpack touch cannot start movement');
        const slots = await E('DeepTapeGame.ui.bagPage.getBagPageSlotHitTests()');
        assert.equal(slots.length, 4); assert(slots.every(s => s.x >= 0 && s.y >= 0 && s.x + s.w <= 667 && s.y + s.h < 375 - 98));
        const close = await E('DeepTapeGame.ui.bagPage.getBagPageCloseRect()');
        await touch('touchStart', [{ x: close.x + close.w / 2, y: close.y + close.h / 2, id: 9 }]); await touch('touchEnd');
        assert.equal(await E('DeepTapeGame.ui.bag.isBagFullPageOpen()'), false);
        await E('DeepTapeGame.menu();true');
        const menu = await E('DeepTapeGame.ui.menu()'); assert(menu.every(b => b.y >= 0 && b.y + b.h <= 375));
        assert.equal(await storage(), before, 'Display changes must not write gameplay/story/inventory saves');

        // Native preference restores on a new application boot, without changing game.json.
        await browser.command('Page.reload', { ignoreCache: true }); await wait(200);
        for (let i = 0; i < 30; i++) { if (await E('!!window.DeepTapeGame?.ui')) break; await wait(50); }
        assert.equal(await E('DeepTapeGame.cave.config.screenWidth'), 667);
        assert.equal(await E('DeepTapeGame.state.screen'), 'menu');
        assert.equal(browser.errors.length, 0);
        report.preferenceRestored = true;
        fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2));
        console.log('通过：横竖屏全屏空白移动（三种挡位）、轮盘/按钮触摸归属、背包图标入口与对齐、双手预选、切屏释放移动/轮盘/BCD、画布同步和方向偏好恢复。');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
