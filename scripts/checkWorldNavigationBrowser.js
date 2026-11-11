// 实际触摸入口和连续世界生命周期；隔离浏览器存档，不接触用户正在玩的页面。
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { openReviewBrowser } = require('../design/cave-room/browser.cjs');
const URL = process.env.JWR_PREVIEW_URL || 'http://127.0.0.1:60972/node_modules/.cache/continuous-gameplay/game.html';
const OUT = path.resolve(__dirname, '../node_modules/.cache/continuous-gameplay/navigation');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function checkSmallLayouts() {
    const ts = require('typescript'), result = { exports: {} };
    const canvas = {}, config = { uiSafeLeft: 6, uiSafeRight: 6, uiSafeTop: 8, uiSafeBottom: 18 }, model = { panel: null, stationId: 'rest', wet: 0, headWet: false };
    const imports = {
        '../../core/state': {}, '../../core/config': { CONFIG: config }, '../../render/Canvas': canvas,
        './Geometry': { activeWorld: () => true, world: () => model, layout: { stations: [{ id: 'rest', action: '休息' }] } },
        './Runtime': { isWorldNavigationOpen: () => model.panel === 'navigation' || model.panel === 'confirm-next-world' },
    };
    const source = fs.readFileSync(path.join(__dirname, '../src/world/continuous/WorldHUD.ts'), 'utf8');
    new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(id => imports[id] || {}, result, result.exports);
    for (const [width, height] of [[320, 568], [568, 320], [375, 667], [667, 375]]) {
        Object.assign(canvas, { logicW: width, logicH: height });
        for (const panel of [null, 'navigation', 'confirm-next-world']) for (const wet of [0, 1]) {
            Object.assign(model, { panel, wet, headWet: wet > 0 });
            const buttons = result.exports.worldButtons();
            for (const p of buttons) assert(p.x >= 0 && p.y >= 0 && p.x + p.w <= width && p.y + p.h <= height, `${width}×${height} ${p.id} 不得出屏`);
            for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
                const a = buttons[i], b = buttons[j];
                assert(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), `${a.id} 与 ${b.id} 不得重叠`);
            }
        }
    }
}
(async () => {
    checkSmallLayouts();
    fs.mkdirSync(OUT, { recursive: true });
    const b = await openReviewBrowser(URL, 1440, 880), report = {};
    try {
        const ev = s => b.evaluate(s);
        async function tapRect(rect) {
            assert(rect, '入口必须可见');
            const p = await ev(`(()=>{const r=document.getElementById('game').getBoundingClientRect(),c=DeepTapeGame.cave.config,b=${JSON.stringify(rect)};return{x:r.x+(b.x+b.w/2)/c.screenWidth*r.width,y:r.y+(b.y+b.h/2)/c.screenHeight*r.height,id:1}})()`);
            await b.command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
            await b.command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        }
        const tap = async id => tapRect(await ev(`DeepTapeGame.world.hud.worldButtons().find(b=>b.id===${JSON.stringify(id)})`));
        async function shot(name) {
            await wait(100);
            const data = await ev('document.getElementById("game").toDataURL("image/png")');
            fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
        }
        await ev('DeepTapeGame.start()'); await wait(750);
        await ev('DeepTapeGame.world.runtime.setupTowReview(2)');
        const original = await ev(`(()=>{const g=DeepTapeGame,w=g.world.geometry.world(),m=g.state.mazeRescue;
            const a={x:w.originX-90,y:w.surfaceY+90},b={x:w.originX+80,y:w.surfaceY+90},wall=m.mazeWalls[0];
            g.state.rope.ropes=[{start:a,end:b,path:[a,b],startWall:wall,endWall:wall,slackFactor:0,mode:'tight'}];
            Object.assign(g.player,{x:w.originX,y:w.surfaceY+150,vx:0,vy:0});Object.assign(w,{grounded:false,landBlend:0,wet:1,headWet:true,hidden:true});
            g.camera.snapCameraToPlayer();m.mazeExplored[18][5]=true;
            return{seed:m.seed,fish:g.state.fishEnemies.filter(f=>f.reviewTow).map(f=>({id:f.worldId,x:f.x,y:f.y})),ropes:g.state.rope.ropes.length};})()`);
        await wait(120); await shot('01-underwater-shortcuts');
        await tap('quick-shore');
        const shore = await ev(`(()=>{const g=DeepTapeGame,w=g.world.geometry.world();return{seed:g.state.mazeRescue.seed,x:g.player.x-w.originX,spawn:g.world.layout.spawn[0],wet:w.headWet,ropes:g.state.rope.ropes.length,links:g.state.rope.links.length,explored:g.state.mazeRescue.mazeExplored[18][5],fish:g.state.fishEnemies.filter(f=>f.reviewTow).map(f=>({id:f.worldId,x:f.x,y:f.y}))}})()`);
        assert.equal(shore.seed, original.seed); assert.equal(shore.x, shore.spawn); assert(!shore.wet && shore.explored);
        assert.equal(shore.ropes, original.ropes); assert.equal(shore.links, 0); assert.deepEqual(shore.fish, original.fish);
        report.quickShore = '原生回岸按钮保留地图、探索和固定网；只解除玩家牵引，鱼原地留存';

        await ev('DeepTapeGame.world.geometry.world().hidden=false');
        await tap('navigation');
        assert(await ev('DeepTapeGame.world.runtime.isWorldNavigationOpen()'));
        await b.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'e', code: 'KeyE', windowsVirtualKeyCode: 69 });
        await b.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'e', code: 'KeyE', windowsVirtualKeyCode: 69 });
        assert(await ev('DeepTapeGame.world.runtime.isWorldNavigationOpen()'), '预览快捷键不能在菜单后触发营地交互');
        const beforePause = await ev('({x:DeepTapeGame.player.x,y:DeepTapeGame.player.y,o2:DeepTapeGame.player.o2,time:DeepTapeGame.world.geometry.world().elapsed})');
        await b.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
        await wait(650);
        await b.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
        const afterPause = await ev('({x:DeepTapeGame.player.x,y:DeepTapeGame.player.y,o2:DeepTapeGame.player.o2,time:DeepTapeGame.world.geometry.world().elapsed})');
        assert.deepEqual(afterPause, beforePause, '导航菜单必须暂停游动、计时和耗气'); await shot('02-menu-landscape');
        await tap('next-map'); assert.equal(await ev('DeepTapeGame.world.geometry.world().panel'), 'confirm-next-world');
        assert.equal(await ev('DeepTapeGame.state.mazeRescue.seed'), original.seed, '第一次点击不能换图');
        await shot('03-confirm-next-map'); await tap('next-cancel');
        assert.equal(await ev('DeepTapeGame.state.mazeRescue.seed'), original.seed);
        await ev('window.__navigationSave=wx.setStorageSync;wx.setStorageSync=()=>{throw Error("navigation save failure fixture")};');
        await tap('save-menu');
        assert.equal(await ev('DeepTapeGame.state.screen'), 'mazeRescue');
        assert(await ev('DeepTapeGame.world.runtime.isWorldNavigationOpen()')); assert(!await ev('DeepTapeGame.world.geometry.world().saveOK'));
        await shot('04-save-failed');
        await ev('wx.setStorageSync=window.__navigationSave;delete window.__navigationSave');
        report.saveFailure = '保存失败保持游戏与菜单，面板内显示失败及未退出提示';
        await tap('save-menu'); assert.equal(await ev('DeepTapeGame.state.screen'), 'menu');
        const saved = await ev('DeepTapeGame.world.save.readWorldSnapshot()');
        await tapRect(await ev('DeepTapeGame.ui.menu().find(b=>b.id==="continue")'));
        const restored = await ev('DeepTapeGame.world.save.getLastRestoreSnapshot()');
        assert.equal(restored.seed, saved.seed); assert.equal(restored.player.x, saved.player.x); assert.equal(restored.player.y, saved.player.y);
        assert.deepEqual(restored.ropes, saved.ropes); report.saveMenu = '原生菜单保存退出、主界面继续后原位与固定网一致';
        await tap('navigation'); await tap('next-map'); await tap('next-confirm');
        const changed = await ev('({seed:DeepTapeGame.state.mazeRescue.seed,ropes:DeepTapeGame.state.rope.ropes.length,links:DeepTapeGame.state.rope.links.length,panel:DeepTapeGame.world.geometry.world().panel,wet:DeepTapeGame.world.geometry.world().headWet,saved:DeepTapeGame.world.save.readWorldSnapshot().seed})');
        assert.notEqual(changed.seed, original.seed); assert.equal(changed.ropes, 0); assert.equal(changed.links, 0); assert(!changed.panel && !changed.wet); assert.equal(changed.saved, changed.seed);
        report.newMap = changed;

        await ev('wx.setDeviceOrientation({value:"portrait",success(){}})'); await wait(250);
        await tap('navigation');
        const portrait = await ev('({width:DeepTapeGame.cave.config.screenWidth,height:DeepTapeGame.cave.config.screenHeight,buttons:DeepTapeGame.world.hud.worldButtons()})');
        assert(portrait.height > portrait.width);
        assert(portrait.buttons.every(p => p.x >= 0 && p.y >= 0 && p.x + p.w <= portrait.width && p.y + p.h <= portrait.height));
        await shot('04-menu-portrait'); await tap('continue'); assert(!await ev('DeepTapeGame.world.runtime.isWorldNavigationOpen()'));
        report.portrait = '竖屏菜单和继续按钮可通过实际触摸使用';
        await b.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
        await b.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        assert(await ev('DeepTapeGame.world.runtime.isWorldNavigationOpen()')); assert.equal(await ev('DeepTapeGame.input.move'), 0);
        await b.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, autoRepeat: true });
        assert(await ev('DeepTapeGame.world.runtime.isWorldNavigationOpen()'), '长按Esc的重复事件不能自动关闭菜单');
        await b.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await b.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        assert(!await ev('DeepTapeGame.world.runtime.isWorldNavigationOpen()')); assert.equal(await ev('DeepTapeGame.input.move'), 0, '关闭菜单不能恢复旧的按住游动');
        await b.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
        await b.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        report.keyboard = '按住移动时Esc打开菜单取消移动，关闭后不恢复旧输入';
        report.errors = b.errors; assert.equal(b.errors.length, 0, JSON.stringify(b.errors));
        report.status = 'passed';
    } catch (error) { report.status = 'failed'; report.error = String(error.stack || error); process.exitCode = 1; }
    finally { fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); await b.close(); }
})();
