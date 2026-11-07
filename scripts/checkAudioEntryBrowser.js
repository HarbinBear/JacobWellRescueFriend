const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { openReviewBrowser } = require('../design/cave-room/browser.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function check() {
    const output = path.resolve(__dirname, '../node_modules/.cache/audio-entry-browser');
    fs.mkdirSync(output, { recursive: true });
    const b = await openReviewBrowser('http://127.0.0.1:60972/design/deeptape/game.html', 1100, 940);
    const snapshot = () => b.evaluate(`({phase:DeepTapeGame.state.mazeRescue?.phase,screen:DeepTapeGame.state.screen,
        prep:DeepTapeGame.music.getAdaptiveMusicPreparation(),clock:DeepTapeGame.music.getAdaptiveMusicClock(),
        o2:DeepTapeGame.player.o2,x:DeepTapeGame.player.x,y:DeepTapeGame.player.y,buffers:window.__audioBuffers||0})`);
    const until = async (predicate, timeout = 90000) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const value = await snapshot();
            if (predicate(value)) return value;
            await wait(60);
        }
        throw Error('Timed out: ' + JSON.stringify(await snapshot()));
    };
    try {
        assert.equal(await b.evaluate('DeepTapeGame.music.isAdaptiveMusicReady()'), false, '菜单不生成音轨');
        await b.evaluate(`(()=>{
            window.__audioBuffers=0;window.__audioLabels=[];window.__audioFrames=[];
            const audio=wx.createWebAudioContext;wx.createWebAudioContext=()=>{
                const c=audio();window.__audioCtx=c;const create=c.createBuffer.bind(c);
                c.createBuffer=(...args)=>{__audioBuffers++;return create(...args)};return c;
            };
            const text=CanvasRenderingContext2D.prototype.fillText;
            CanvasRenderingContext2D.prototype.fillText=function(label,...args){
                if(String(label).startsWith('音轨')) __audioLabels.push(String(label));
                return text.call(this,label,...args);
            };
            let previous=performance.now();function frame(now){__audioFrames.push(now-previous);previous=now;requestAnimationFrame(frame)}requestAnimationFrame(frame);
            return true;
        })()`);
        const r = await b.evaluate('(()=>{const r=document.getElementById("game").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()');
        const dive = () => b.click(r.x + 187.5 / 375 * r.w, r.y + 306 / 667 * r.h);
        const start = Date.now();
        await dive();
        const initial = await until(s => s.phase === 'play', 2500);
        const entryMs = Date.now() - start;
        assert(entryMs < 1500, '音频不能延长短入水转场');
        assert.equal(initial.prep.status, 'loading', '第一下潜在真实音轨未完成时就已可控制');
        assert(!initial.clock || !initial.clock.playing, '入水不能播放音乐');
        await b.screenshot(path.join(output, 'loading-playable.png'));
        await b.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
        await wait(700);
        await b.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
        const moved = await snapshot();
        assert(Math.hypot(moved.x - initial.x, moved.y - initial.y) > .2, '加载中仍可游动');
        await wait(3500);
        const alive = await snapshot();
        assert(alive.o2 < initial.o2, '加载中世界和氧耗已正常推进');
        const ready = await until(s => s.prep.status === 'ready');
        assert(!ready.clock.playing, '音轨就绪也不能自动变成全程BGM');
        assert.equal(ready.buffers, 13, '只生成当前版十二轨与过门');
        const labels = await b.evaluate('[...new Set(__audioLabels)]');
        assert(labels.some(s => /音轨准备 \d+%/.test(s)));
        assert(labels.length > 5, '加载期间进度持续更新');
        await b.evaluate('DeepTapeGame.nearTarget();true');
        const encounter = await until(s => s.clock && s.clock.playing, 2500);
        assert(encounter.clock.requestedLevel > 0);
        await b.screenshot(path.join(output, 'nearby-playing.png'));
        await b.evaluate('DeepTapeGame.player.x=DeepTapeGame.state.npc.x-2500;DeepTapeGame.player.vx=DeepTapeGame.player.vy=0;true');
        await until(s => !s.clock.playing, 1500);
        await b.evaluate('DeepTapeGame.menu();true');
        await dive();
        const cached = await until(s => s.phase === 'play', 2500);
        assert.equal(cached.prep.status, 'ready');
        assert.equal(cached.buffers, 13, '再次下潜直接复用，没有重新生成');
        assert(!cached.clock.playing, '再次入水仍不播放音乐');
        const frames = await b.evaluate('__audioFrames');
        const report = { entryMs, initial, moved, alive, readyBuffers: ready.buffers,
            progressLabels: labels, encounterLevel: encounter.clock.requestedLevel, cached,
            frames: { count: frames.length, maxMs: Math.max(...frames), over100ms: frames.filter(v => v > 100).length },
            errors: b.errors, scope: 'Real desktop Chrome game; first-entry live synthesis, no mocked audio readiness; not a WeChat phone benchmark' };
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
        assert.equal(b.errors.length, 0);
        console.log(JSON.stringify({ entryMs, firstEntryStatus: initial.prep.status, movedWhileLoading: true,
            o2Before: initial.o2, o2After: alive.o2, uniqueProgressLabels: labels.length,
            encounterLevel: encounter.clock.requestedLevel, cachedBuffers: cached.buffers, errors: b.errors }, null, 2));
    } finally {
        await b.close();
    }
}
check().catch(err => { console.error(err); process.exitCode = 1; });
