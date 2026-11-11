// 真实入网、原生菜单续档与触摸拆网；独立浏览器档，不接触用户的游戏会话。
// 先运行 npm run karst:preview，并用本地静态服务提供项目根目录。
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { openReviewBrowser } = require('../design/cave-room/browser.cjs');
const URL = process.env.JWR_PREVIEW_URL || 'http://127.0.0.1:60972/node_modules/.cache/karst-review/live/game.html?fish-volume';
const OUT = path.resolve(__dirname, '../node_modules/.cache/fish-net-save-browser');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const report = { scope: '实际game.ts：真实扫掠入网→触摸保存菜单→继续→触摸拆网→再存续；桌面浏览器，不代表微信真机' };
    let browser;
    try {
        browser = await openReviewBrowser(URL, 1280, 900);
        const ev = source => browser.evaluate(source);
        const freeze = () => ev('DeepTapeGame.world.geometry.world().hidden=true');
        async function shot(name) {
            await wait(100);
            const data = await ev('document.getElementById("game").toDataURL("image/png")');
            fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
        }
        async function touch(type, point) {
            const screen = point && await ev(`(()=>{const r=document.getElementById('game').getBoundingClientRect(),c=DeepTapeGame.cave.config,p=${JSON.stringify(point)};
                return{x:r.x+p.x/c.screenWidth*r.width,y:r.y+p.y/c.screenHeight*r.height,id:1};})()`);
            await browser.command('Input.dispatchTouchEvent', { type, touchPoints: screen ? [screen] : [] });
        }
        async function tapRect(rect) {
            assert(rect, '原生交互入口必须存在');
            await touch('touchStart', { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
            await touch('touchEnd');
        }
        const tap = async id => tapRect(await ev(`DeepTapeGame.world.hud.worldButtons().find(b=>b.id===${JSON.stringify(id)})`));
        const status = () => ev(`(()=>{const g=DeepTapeGame,f=g.state.fishEnemies.find(f=>f.worldId===window.__fishNetSaveId);
            return{seed:g.state.mazeRescue.seed,fish:f&&{id:f.worldId,x:f.x,y:f.y,bound:f.bound,stun:f.stunFrames,dead:f.dead,animTime:f.animTime},
                contact:f?g.interactions.rope.getRopeContact(f):null,net:g.interactions.rope.captureFishNetState(),
                ropes:g.state.rope.ropes.length,displacement:g.review.inspectVolumeRopePose().displacement};})()`);
        async function runFor(seconds) {
            return ev(`new Promise((resolve,reject)=>{const g=DeepTapeGame,w=g.world.geometry.world(),start=w.elapsed,deadline=Date.now()+8000;
                w.hidden=false;function frame(){if(w.elapsed-start>=${seconds}){w.hidden=true;resolve(w.elapsed-start);return;}
                    if(Date.now()>deadline){w.hidden=true;reject(Error('真实主循环没有推进'));return;}requestAnimationFrame(frame);}requestAnimationFrame(frame);})`);
        }
        async function saveAndResume(label) {
            await tap('navigation');
            assert(await ev('DeepTapeGame.world.runtime.isWorldNavigationOpen()'), '实际导航菜单必须打开');
            await tap('save-menu');
            assert.equal(await ev('DeepTapeGame.state.screen'), 'menu', '保存后必须返回主菜单');
            const saved = await ev('DeepTapeGame.world.save.readWorldSnapshot()');
            assert(saved?.fishNet, '存档必须包含fishNet，不能只保存鱼和绳');
            await tapRect(await ev('DeepTapeGame.ui.menu().find(b=>b.id==="continue")'));
            await freeze();
            const restored = await ev('DeepTapeGame.world.save.getLastRestoreSnapshot()');
            assert(restored, '必须经过实际恢复流程');
            assert.equal(restored.seed, saved.seed);
            assert.deepEqual(restored.ropes, saved.ropes, '恢复不能修改原绳路');
            assert.deepEqual(restored.fishNet, saved.fishNet, '恢复不能重置捕获、挣脱或网受力状态');
            assert.deepEqual(restored.fish, saved.fish, '恢复必须保留同一批鱼及其位置/状态');
            report[label] = { fishNet: saved.fishNet, ropes: saved.ropes.length, fishIds: saved.fish.map(f => f.worldId) };
        }

        // fixture只布置鱼与织网；捕获通过moveContinuousFish的真实扫掠产生。
        report.fixture = await ev(`(()=>{const g=DeepTapeGame;g.cave.config.quality.auto=false;g.cave.config.quality.scale=.5;
            const result=g.review.inspectVolumeFish('snag');g.world.geometry.world().hidden=true;g.input.move=0;
            window.__fishNetSaveId=result&&result.fish.find(f=>f.contact==='snag')?.worldId;return result;})()`);
        assert(report.fixture?.caught, 'fixture必须真实入网，不能写bound/stun/snag标志');
        assert(await ev('typeof DeepTapeGame.interactions.rope.captureFishNetState==="function"'), '请用最新源码重建karst:preview');
        for (let i = 0; i < 120 && await ev('DeepTapeGame.cave.volume.karstVolumeStats().pending'); i++) await wait(100);
        // 先推进少量真实时间，使保存点具有非零挣脱进度，检测读档重置漏洞。
        report.beforeElapsed = await runFor(.25);
        report.before = await status();
        assert.equal(report.before.contact?.kind, 'snag');
        assert(!report.before.fish.bound && report.before.fish.stun === 0 && !report.before.fish.dead);
        assert(report.before.contact.escape > 0 && report.before.contact.phase > 0);
        assert(report.before.displacement > .1, '捕获必须有真实网受力形变');
        await shot('01-caught-before-save');

        await saveAndResume('caughtSave');
        report.resumed = await status();
        assert.equal(report.resumed.fish.id, report.before.fish.id);
        assert.equal(report.resumed.contact?.kind, 'snag');
        assert(!report.resumed.fish.bound && report.resumed.fish.stun === 0);
        assert(report.resumed.contact.escape >= report.before.contact.escape, '续档不能清空挣脱进度');
        await shot('02-caught-after-resume');
        report.struggleElapsed = await runFor(.35);
        report.struggling = await status();
        assert.equal(report.struggling.contact?.kind, 'snag');
        assert(report.struggling.contact.phase > report.resumed.contact.phase);
        assert(report.struggling.contact.escape > report.resumed.contact.escape);
        assert(report.struggling.fish.animTime > report.resumed.fish.animTime);
        assert(report.struggling.displacement > .1);

        // 只定位玩家到可触及的网柄，随后必须由动作盘触摸与实际命中帧拆网。
        report.cutPosition = await ev(`(()=>{const g=DeepTapeGame,f=g.state.fishEnemies.find(f=>f.worldId===window.__fishNetSaveId),a=g.interactions;
            a.work.cancelInteractionInput();const handle=a.fishGeometry.fishNetHandlePoint(f),out=Math.atan2(handle.y-f.y,handle.x-f.x);
            for(const d of [24,20,28])for(const turn of [0,.4,-.4,.8,-.8,Math.PI/2,-Math.PI/2,Math.PI]){
                const angle=out+turn,p={x:handle.x+Math.cos(angle)*d,y:handle.y+Math.sin(angle)*d};
                if(g.world.geometry.circleCollision(p.x,p.y,g.cave.config.maze.playerRadius))continue;
                Object.assign(g.player,p,{vx:0,vy:0,angle:angle+Math.PI,targetAngle:angle+Math.PI});g.input.targetAngle=g.player.angle;g.input.move=0;
                const target=a.targets.pickActionTarget(g.player.angle).target;
                if(target?.kind==='net'&&target.fish===f){g.camera.snapCameraToPlayer();return{player:p,handle,angle:g.player.angle};}
            }return null;})()`);
        assert(report.cutPosition, '必须有不被岩壁或鱼身挡住的真实网柄方向');
        const gesture = await ev(`(()=>{const a=DeepTapeGame.interactions,c=a.layout.getActionWheelCenter(),angle=DeepTapeGame.player.angle;
            return{button:a.layout.getActionControlPosition(),aim:{x:c.x+Math.cos(angle)*62,y:c.y+Math.sin(angle)*62}};})()`);
        await touch('touchStart', gesture.button); await touch('touchMove', gesture.aim);
        const aim = await ev(`(()=>{const g=DeepTapeGame,t=g.state.interaction.aim?.target;return{kind:t?.kind,
            removed:t?.removal?new Set(t.removal.removed.map(s=>s.rope)).size:0,ropes:g.state.rope.ropes.length};})()`);
        assert.equal(aim.kind, 'net'); assert.equal(aim.removed, aim.ropes, '预览必须选中整张相连网');
        report.cutAim = aim; await shot('03-touch-cut-preview');
        await touch('touchEnd');
        report.cut = await ev(`new Promise((resolve,reject)=>{const g=DeepTapeGame,w=g.world.geometry.world(),start=Date.now(),frames=[];w.hidden=false;
            function frame(){const t=g.state.interaction.task;frames.push({phase:t?.phase,applied:!!t?.applied,ropes:g.state.rope.ropes.length,impact:g.state.interaction.impact?.kind});
                if(!t){w.hidden=true;resolve({frames,feedback:g.state.interaction.feedback});return;}
                if(Date.now()-start>6000){w.hidden=true;reject(Error('真实拆网动作未结束'));return;}requestAnimationFrame(frame);}requestAnimationFrame(frame);})`);
        assert(report.cut.feedback?.success, JSON.stringify(report.cut.feedback));
        assert(report.cut.frames.some(f => f.applied && f.ropes === 0 && f.impact === 'cut'), '必须在动作命中帧真实拆网');
        report.released = await status();
        assert.equal(report.released.ropes, 0); assert.equal(report.released.contact, null);
        assert.equal(report.released.net.contacts.length, 0);
        assert(!report.released.fish.bound && !report.released.fish.dead);
        await shot('04-net-removed');

        await saveAndResume('releasedSave');
        report.releasedResume = await status();
        assert.equal(report.releasedResume.fish.id, report.before.fish.id);
        assert.equal(report.releasedResume.ropes, 0); assert.equal(report.releasedResume.contact, null);
        assert.equal(report.releasedResume.net.contacts.length, 0, '已拆的捕网状态不能复活');
        report.freeElapsed = await runFor(.4); report.free = await status();
        assert.equal(report.free.contact, null); assert.equal(report.free.ropes, 0);
        assert(!report.free.fish.bound && !report.free.fish.dead);
        assert(Math.hypot(report.free.fish.x-report.releasedResume.fish.x, report.free.fish.y-report.releasedResume.fish.y) > .1, '释放后同鱼必须继续真实游动');
        await shot('05-released-after-second-resume');
        report.errors = browser.errors; assert.equal(browser.errors.length, 0, JSON.stringify(browser.errors));
        report.status = 'passed';
    } catch (error) {
        report.status = 'failed'; report.error = String(error.stack || error); process.exitCode = 1;
    } finally {
        fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
        if (browser) await browser.close();
    }
})();
