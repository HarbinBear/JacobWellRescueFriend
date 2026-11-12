// Three actual-game clips: normal/new plus near old/new poses on the same new production motion.
// The target/speed timeline is a controlled fixture, not an autonomous AI demonstration.
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { openReviewBrowser } = require('../cave-room/browser.cjs');
const ROOT = path.resolve(__dirname, '../..'), OUT = path.join(ROOT, 'node_modules/.cache/fish-motion');
const URL = process.env.JWR_PREVIEW_URL || 'http://127.0.0.1:60972/node_modules/.cache/karst-review/live/game.html?fish-motion';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const b = await openReviewBrowser(URL, 1440, 900), ev = code => b.evaluate(code);
    const report = { scope: 'Actual game rendering and production steering/collision; controlled AI targets. Old/new comparison changes pose only, not the motion implementation. Desktop only.', clips: [] };
    try {
        await ev(`(()=>{const g=DeepTapeGame;g.review.stopFishMotionStudy();g.cave.config.karst.geometryMode='volume';
            g.world.runtime.enterContinuousWorld(g.start,26110941);g.cave.config.quality.auto=false;g.cave.config.quality.scale=1;g.cave.config.quality.rayCount=180;})()`);
        async function settle() {
            for (let i = 0; i < 400; i++) { await wait(100); if (i > 4 && await ev('DeepTapeGame.cave.volume.karstVolumeStats().pending') === 0) return; }
            throw Error('Geometry did not settle');
        }
        report.preflight = await ev(`(()=>{const g=DeepTapeGame;if(!g.review.inspectFishMotionStudy(true))return null;
            const samples=[];while(g.review.fishMotionStudyStatus().time<25)samples.push(g.review.stepFishMotionStudy(.1));return samples;})()`);
        assert(report.preflight && report.preflight.length > 200);
        assert(report.preflight.every(s => !s.fish.blocked && s.screen.x > .10 && s.screen.x < .88 && s.screen.y > .14 && s.screen.y < .84), 'Motion must remain readable in the fixed near camera before recording');
        assert(Math.max(...report.preflight.map(s => s.motion.speed)) > 1.4, 'Preflight acceleration missing');
        for (const [near, legacy] of [[false, false], [true, true], [true, false]]) {
            const label = `${near ? 'near' : 'normal'}-${legacy ? 'legacy' : 'motion'}`;
            assert(await ev(`DeepTapeGame.review.inspectFishMotionStudy(${near})`), 'Missing motion study area');
            await ev(`DeepTapeGame.review.setFishMotionStudyLegacy(${legacy})`); await settle();
            console.log('Recording ' + label + ' (25 seconds)');
            await ev(`(()=>{
                const g=DeepTapeGame,canvas=document.getElementById('game'),stream=canvas.captureStream(30);
                const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(v=>MediaRecorder.isTypeSupported(v));
                if(!mime)throw Error('No supported WebM recorder');
                const r=window.__fishCapture={done:false,trace:[],images:{},last:0,next:0,nextImage:0,mime,video:null,error:null};
                const chunks=[],recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1200000});
                recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
                recorder.onerror=e=>{r.error=String(e.error||e);r.done=true};
                recorder.onstop=()=>{const reader=new FileReader();reader.onload=()=>{r.video=reader.result;r.done=true;stream.getTracks().forEach(t=>t.stop())};reader.readAsDataURL(new Blob(chunks,{type:mime}))};
                recorder.start(500);
                const marks=[3,6,8,12,15,23];
                const frame=now=>{
                    if(r.last)g.review.stepFishMotionStudy((now-r.last)/1000);r.last=now;
                    const s=g.review.fishMotionStudyStatus();
                    const output=document.getElementById('phase');if(output)output.textContent='受控动作 · '+s.phase+' · '+s.time.toFixed(1)+' / 25秒';
                    if(s.time>=r.next){r.trace.push(s);r.next+=.1;}
                    if(r.nextImage<marks.length&&s.time>=marks[r.nextImage]){r.images[marks[r.nextImage]]=canvas.toDataURL('image/jpeg',.86);r.nextImage++;}
                    if(s.time<25)requestAnimationFrame(frame);else setTimeout(()=>recorder.stop(),180);
                };requestAnimationFrame(frame);
            })()`);
            let done = false;
            for (let i = 0; i < 160; i++) { await wait(500); done = await ev('window.__fishCapture.done'); if (done) break; }
            assert(done, 'Recording timed out');
            const capture = await ev('({mime:window.__fishCapture.mime,trace:window.__fishCapture.trace,images:window.__fishCapture.images,video:window.__fishCapture.video,error:window.__fishCapture.error})');
            assert.equal(capture.error, null); assert(capture.video && capture.video.startsWith('data:video/webm'));
            fs.writeFileSync(path.join(OUT, label + '.webm'), Buffer.from(capture.video.split(',')[1], 'base64'));
            for (const [second, data] of Object.entries(capture.images)) fs.writeFileSync(path.join(OUT, label + '-' + second + '.jpg'), Buffer.from(data.split(',')[1], 'base64'));
            fs.writeFileSync(path.join(OUT, label + '-trace.json'), JSON.stringify(capture.trace, null, 2));
            const trace = capture.trace, speeds = trace.map(s => s.motion.speed), turns = trace.map(s => s.motion.turnRate);
            assert(trace.length > 200); assert(trace.every(s => !s.fish.blocked), 'Fish crossed solid rock');
            assert(Math.max(...speeds) > 1.4, 'No acceleration was exercised');
            assert(Math.max(...turns) > .025 && Math.min(...turns) < -.025, 'Both turning directions must be exercised');
            const glide = trace.filter(s => s.time > 7 && s.time < 9);
            assert(glide.some(s => s.motion.speed > .2 && s.motion.drive < .12), 'Coast must move without active propulsion');
            const stats = await ev('DeepTapeGame.cave.volume.karstVolumeStats()');
            assert.equal(stats.fishFailure, ''); assert.equal(stats.fishCount, 1);
            report.clips.push({ label, mime: capture.mime, samples: trace.length, maximumSpeed: Math.max(...speeds), minimumTurn: Math.min(...turns), maximumTurn: Math.max(...turns), stats });
            console.log('Saved ' + label + '.webm');
        }
        report.errors = b.errors; assert.equal(b.errors.length, 0, JSON.stringify(b.errors)); report.status = 'passed';
        fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
            <title>鱼的动作 · 实际游戏对照</title><style>body{margin:24px auto;padding:0 20px;max-width:1320px;background:#081416;color:#d3e0dc;font:16px/1.6 system-ui}h1{font-size:27px}p{color:#9db8b1}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}video{width:100%;background:#020707;border:1px solid #324945;border-radius:8px}button{padding:9px 18px;background:#22433e;color:#deebe5;border:1px solid #5d8175;border-radius:6px;cursor:pointer}.normal{max-width:760px}small{color:#829e94}@media(max-width:800px){.pair{display:block}}</style>
            <h1>鱼的动作 · 实际游戏对照</h1><p>同一组受控目标与速度输入。位置、转向、碰撞均由实际游戏推进；近景对照只切换旧 / 新姿态，不能代表旧运动逻辑。桌面录像，非手机性能验收。</p>
            <button id="together">从头同播近景对照</button><div class="pair"><section><h2>原摆尾姿态</h2><video id="old" controls playsinline src="near-legacy.webm"></video></section><section><h2>新身体响应</h2><video id="new" controls playsinline src="near-motion.webm"></video></section></div>
            <p>0–2秒 悬停 · 2–5秒 起游/巡游 · 5–6.5秒 加速 · 6.5–9.5秒 滑行 · 9.5–13秒 左转 · 13–16.5秒 右转 · 16.5–20秒 巡游 · 20–22秒 加速 · 22–25秒 滑行</p>
            <section class="normal"><h2>正常游戏尺寸</h2><video controls playsinline src="normal-motion.webm"></video></section><p><a style="color:#9bd4c0" href="../karst-review/live/game.html?fish-motion&near">进入实际游戏回放与自由观察</a></p>
            <small>角色、洞穴与鱼贴图未在这组视频中重做。目标是检查推进、滑行、转向和身体变形的配合。</small>
            <script>document.getElementById('together').onclick=()=>{for(const id of ['old','new']){const v=document.getElementById(id);v.currentTime=0;v.play()}}</script></html>`);
    } catch (error) { report.status = 'failed'; report.failure = error.stack; process.exitCode = 1; }
    finally {
        fs.writeFileSync(path.join(OUT, 'capture-report.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2)); await b.close();
    }
})();
