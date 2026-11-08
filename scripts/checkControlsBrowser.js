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
        }
        async function button(name) { return E(`DeepTapeGame.ui.layout().${name}`); }
        async function switchScreen(active = [], id = 8) {
            const p = await E('DeepTapeGame.ui.orientation()');
            await touch('touchStart', [...active, { ...p, id }]);
            await touch('touchEnd');
            await wait(70);
        }
        await E('DeepTapeGame.interactions.setup("rammer",false);DeepTapeGame.state.fishEnemies=[];DeepTapeGame.state.rope.ropes=[];true');
        await wait(150);
        const before = await storage(), seed = await E('DeepTapeGame.state.mazeRescue.seed');
        const portrait = await E('DeepTapeGame.ui.layout()');
        assert(!portrait.landscape); assert.equal(portrait.tape.x, portrait.settings.x);
        assert.equal(portrait.flashlight.x, portrait.settings.x); assert(portrait.top <= 8);
        assert(portrait.stamina.width <= 44); await shot('portrait-canvas');

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
        await shot('landscape-canvas');

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
        await touch('touchStart', [{ ...p, id: 6 }]); await touch('touchEnd');
        assert.notEqual(await E('DeepTapeGame.state.flashlightOn'), lightBefore);
        p = await button('tape'); const muted = await E('DeepTapeGame.state.audio.muted');
        await touch('touchStart', [{ ...p, id: 6 }]); await touch('touchEnd');
        assert.notEqual(await E('DeepTapeGame.state.audio.muted'), muted);

        await switchScreen();
        await E('DeepTapeGame.ui.bag.openBagFullPage();true'); await wait(50);
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
        console.log('通过：真实游戏原生触控、竖屏贴左竖列/横屏贴顶横排、双手预选、切屏释放移动/轮盘/BCD、画布光照同步、背包/主菜单和方向偏好恢复；未改玩法存档。');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
