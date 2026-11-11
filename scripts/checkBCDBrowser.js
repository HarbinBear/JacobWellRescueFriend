// 隔离 headless 浏览器，原生触摸 BCD 按钮；不连接用户微信或已有浏览器。
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { openReviewBrowser } = require('../design/cave-room/browser.cjs');
const URL = process.env.JWR_PREVIEW_URL || 'http://127.0.0.1:60972/node_modules/.cache/continuous-gameplay/game.html';
const OUT = path.resolve(__dirname, '../node_modules/.cache/continuous-gameplay/bcd');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await openReviewBrowser(URL, 1440, 880), report = { scope: '当前手机版源码、原生触摸、隔离浏览器；非微信真机' };
    try {
        const ev = source => browser.evaluate(source);
        async function until(source, message, timeout = 12000) {
            const start = Date.now();
            while (!await ev(source)) { if (Date.now() - start > timeout) throw Error(message); await wait(80); }
        }
        async function touch(type, point) {
            const points = point ? [await ev(`(()=>{const r=document.getElementById('game').getBoundingClientRect(),c=DeepTapeGame.cave.config,p=${JSON.stringify(point)};
                return{id:1,x:r.x+p.x/c.screenWidth*r.width,y:r.y+p.y/c.screenHeight*r.height}})()`)] : [];
            await browser.command('Input.dispatchTouchEvent', { type, touchPoints: points });
        }
        async function press(kind) {
            const p = await ev(`DeepTapeGame.ui.bcd.getBCD${kind === 'inflate' ? 'Inflate' : 'Deflate'}Btn()`);
            await touch('touchStart', { x: p.cx, y: p.cy });
            assert(await ev(`DeepTapeGame.ui.bcdRuntime().${kind}Held`), kind + '原生触点必须到达BCD');
            assert.equal(await ev('DeepTapeGame.world.geometry.world().panel'), null, 'BCD不能误开导航');
            assert.equal(await ev('DeepTapeGame.input.move'), 0, 'BCD不能误触移动');
            assert.equal(await ev('DeepTapeGame.touches.joystickId'), null, 'BCD不能占据摇杆');
        }
        async function release() {
            await touch('touchEnd');
            assert(await ev('!DeepTapeGame.ui.bcdRuntime().inflateHeld&&!DeepTapeGame.ui.bcdRuntime().deflateHeld'));
        }
        async function shot(name) {
            const data = await ev('document.getElementById("game").toDataURL("image/png")');
            fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
        }
        async function shore(mode = 'full', oxygen = 100) {
            await ev(`(()=>{const g=DeepTapeGame,c=g.cave.config;c.infiniteO2=false;c.bcd.initialFillMode=${JSON.stringify(mode)};
                g.world.runtime.quickReturnToShore();g.state.npc.active=false;g.state.fishEnemies=[];g.state.rope.ropes=[];
                g.player.o2=${oxygen};g.player.o2Max=100;const w=g.world.geometry.world();w.hidden=false;w.notice='';w.noticeUntil=0;})()`);
            await wait(100); assert(await ev('DeepTapeGame.ui.bcd.isBCDUIVisible()'), '岸上BCD应可见');
        }
        async function layout() {
            const value = await ev(`(()=>{const g=DeepTapeGame,c=g.cave.config;return{width:c.screenWidth,height:c.screenHeight,
                inflate:g.ui.bcd.getBCDInflateBtn(),deflate:g.ui.bcd.getBCDDeflateBtn(),navigation:g.world.hud.worldButtons().find(b=>b.id==='navigation')}})()`);
            for (const p of [value.inflate, value.deflate]) {
                assert(p.cx - p.r >= 0 && p.cy - p.r >= 0 && p.cx + p.r <= value.width && p.cy + p.r <= value.height, 'BCD触摸圆不能越出屏幕');
                const n = value.navigation; assert(n, '真实导航入口存在');
                const dx = Math.max(n.x - p.cx, 0, p.cx - n.x - n.w), dy = Math.max(n.y - p.cy, 0, p.cy - n.y - n.h);
                assert(Math.hypot(dx, dy) > p.r, 'BCD触摸区不能覆盖导航');
            }
            return value;
        }
        await ev('DeepTapeGame.cave.config.bcd.initialFillMode="full";DeepTapeGame.start()');
        await until('DeepTapeGame.world.render.assetsReady()', '岸上贴图未就绪');
        await shore(); report.landscape = await layout(); assert(report.landscape.width > report.landscape.height);
        await shot('01-shore-full-landscape');
        const start = await ev('({time:DeepTapeGame.world.geometry.world().elapsed,gas:DeepTapeGame.ui.bcdRuntime().gasNL,x:DeepTapeGame.player.x,y:DeepTapeGame.player.y,o2:DeepTapeGame.player.o2})');
        const wallStarted = Date.now(); await press('deflate');
        await until(`DeepTapeGame.world.geometry.world().elapsed>=${start.time + 6}&&DeepTapeGame.ui.bcdRuntime().gasNL<.00001`, '按住排气六秒未排空', 18000);
        await release();
        const emptied = await ev('({time:DeepTapeGame.world.geometry.world().elapsed,gas:DeepTapeGame.ui.bcdRuntime().gasNL,x:DeepTapeGame.player.x,y:DeepTapeGame.player.y,o2:DeepTapeGame.player.o2})');
        assert.equal(emptied.gas, 0); assert.equal(emptied.o2, start.o2);
        assert(Math.hypot(emptied.x - start.x, emptied.y - start.y) < .001, '排气触摸不能移动岸上角色');
        report.shoreDeflate = { initialGas: start.gas, finalGas: emptied.gas, simulationSeconds: emptied.time - start.time, wallSeconds: (Date.now() - wallStarted) / 1000 };
        await shot('02-shore-empty-landscape');

        await shore('empty', 0); await press('inflate'); await wait(550); await release();
        assert.equal(await ev('DeepTapeGame.ui.bcdRuntime().gasNL'), 0); assert.equal(await ev('DeepTapeGame.player.o2'), 0);
        report.emptyCylinder = '原生充气钮可按下，但空瓶不增加气囊气体、不产生耗气欠账';

        // 用实际横竖屏按钮切换，再触摸两颗BCD钮，检查触摸归属和松手停止。
        const orientation = await ev('DeepTapeGame.ui.orientation()');
        await touch('touchStart', orientation); await touch('touchEnd');
        await until('DeepTapeGame.cave.config.screenHeight>DeepTapeGame.cave.config.screenWidth', '实际横竖屏按钮未切换');
        await shore('neutral'); report.portrait = await layout();
        const beforeInflate = await ev('DeepTapeGame.ui.bcdRuntime().gasNL');
        await press('inflate'); await wait(550); await release(); await wait(100);
        const afterInflate = await ev('DeepTapeGame.ui.bcdRuntime().gasNL'); assert(afterInflate > beforeInflate);
        await wait(450); assert.equal(await ev('DeepTapeGame.ui.bcdRuntime().gasNL'), afterInflate, '持续按住后松手应停止充气');
        await press('deflate'); await wait(450); await release(); await wait(100);
        const afterDeflate = await ev('DeepTapeGame.ui.bcdRuntime().gasNL'); assert(afterDeflate < afterInflate);
        await wait(450); assert.equal(await ev('DeepTapeGame.ui.bcdRuntime().gasNL'), afterDeflate, '松手后应停止排气');
        assert.equal(await ev('DeepTapeGame.world.geometry.world().panel'), null);
        report.release = { beforeInflate, afterInflate, afterDeflate, stopped: true }; await shot('03-shore-controls-portrait');

        // 浏览器内同一水面起点、同一实际tick流程；完整物理细节由checkBCDFlow负责。
        report.surface = await ev(`(()=>{const g=DeepTapeGame,w=g.world.geometry.world(),rt=g.ui.bcdRuntime(),c=g.cave.config;
            w.hidden=true;c.breath.enabled=false;g.player.o2=100;g.input.move=0;const result=[];
            for(const gas of [4,0]){Object.assign(g.player,{x:w.originX,y:w.surfaceY+18,vx:0,vy:0,angle:0,targetAngle:0});g.input.targetAngle=0;
                Object.assign(w,{grounded:false,landBlend:0,headWet:true,wet:1,resting:false,panel:null});
                Object.assign(rt,{gasNL:gas,inflateHeld:false,deflateHeld:false,inflateBurstRemain:0,deflateBurstRemain:0});
                for(let i=0;i<120;i++)g.world.runtime.tickWorld();result.push({gas,depth:g.player.y-w.surfaceY});}
            c.breath.enabled=true;g.camera.snapCameraToPlayer();return result;})()`);
        assert(report.surface[1].depth > report.surface[0].depth + 30 && report.surface[1].depth > 40, '排空气囊后才能自然离开水面');
        await wait(150); await shot('04-vented-diver-underwater');
        report.errors = browser.errors; assert.equal(browser.errors.length, 0, JSON.stringify(browser.errors)); report.status = 'passed';
    } catch (error) {
        report.status = 'failed'; report.error = String(error.stack || error); report.errors = browser.errors; process.exitCode = 1;
        try { await browser.screenshot(path.join(OUT, 'failure.png')); } catch {}
    } finally {
        fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); await browser.close();
    }
})();
