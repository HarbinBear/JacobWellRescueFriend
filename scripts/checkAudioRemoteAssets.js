const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm'), ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/audio/AudioManager.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS } }).outputText;
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

function app({ browser = false, cloudReady = true, cloudEnabled = true, urlFailure = false } = {}) {
    let now = 0, ensureCalls = 0, invalidations = 0;
    let timerId = 0; const timers = new Map();
    const contexts = [], resolutions = [], urlRequests = [];
    const state = { screen: 'menu', audio: { muted: false, animPhase: 0, iconProgress: 0 } };
    const fileIDs = Object.fromEntries(['menuBGM','diveSplash','collisionRock','collisionBreath','quickReturn','uiPrimary','uiSecondary','oxygenRefill','fishBiteDie','breathLoop','campAmbience'].map(key => [key, 'cloud://legacy/' + key]));
    const CONFIG = { audio: { cloud: { enabled: cloudEnabled, envId: 'shared-env', fileIDs }, sfxVolume: .8, bgmVolume: 1, fadeStep: .01, animSpeed: .01, iconFadeStep: .08 } };
    class Audio {
        constructor(src) { this.src = src; this.plays = 0; this.stops = 0; this.listeners = {}; contexts.push(this); }
        onCanplay(fn) { this.listeners.canplay = fn; }
        onError(fn) { this.listeners.error = fn; }
        addEventListener(name, fn) { this.listeners[name] = fn; }
        play() { this.plays++; }
        stop() { this.stops++; }
        pause() {}
        seek(value) { this.seekValue = value; }
        emit(name, value) { if (this.listeners[name]) this.listeners[name](value); }
    }
    const storage = {
        ensureAssetCloud() { ensureCalls++; return cloudReady; },
        resolveAssetPath(p) { assert.equal(p, 'audio/rescue-bonk.wav'); return new Promise((resolve, reject) => resolutions.push({ resolve, reject })); },
        invalidateAsset(p) { assert.equal(p, 'audio/rescue-bonk.wav'); invalidations++; return Promise.resolve(); },
    };
    const sandbox = { exports: {}, Date: { now: () => now }, console: { warn() {} },
        setTimeout(fn, ms) { timers.set(++timerId, { fn, at: now + ms }); return timerId; },
        clearTimeout(id) { timers.delete(id); }, require(name) {
        if (name === '../core/config') return { CONFIG };
        if (name === '../core/state') return { state };
        if (name === '../assets/AssetStorage') return storage;
        throw Error(name);
    } };
    if (browser) sandbox.Audio = Audio;
    else sandbox.wx = { createInnerAudioContext: () => new Audio(), cloud: {
        init() { throw Error('AudioManager must not initialize CloudBase independently'); },
        getTempFileURL(o) { urlRequests.push(o.fileList[0]); Promise.resolve().then(() => urlFailure ? o.fail({ errMsg: 'offline' }) : o.success({ fileList: [{ status: 0, tempFileURL: 'https://legacy.invalid/' + o.fileList[0].split('/').pop() }] })); },
    } };
    vm.runInNewContext(code, sandbox, { filename: 'AudioManager.js' });
    const api = sandbox.exports; api.initAudio();
    return { api, state, contexts, bonk: contexts[1], resolutions, urlRequests, advance(ms) {
        const end = now + ms;
        while (true) {
            const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            now = next[1].at; timers.delete(next[0]); next[1].fn();
        }
        now = end;
    }, set urlFailure(value) { urlFailure = value; }, counts: () => ({ ensureCalls, invalidations }) };
}

async function check() {
    {
        const a = app();
        assert.equal(a.resolutions.length, 1, 'catalog SFX preloads independently from legacy cloud URLs');
        assert.equal(a.bonk.src, undefined, 'native code-only mode must not assign package-local bonk');
        a.api.playSFX('rescueBonk'); assert.equal(a.bonk.plays, 0);
        a.resolutions[0].resolve('/usr/jwr-assets-v1/verified.wav'); await flush();
        assert.equal(a.bonk.src, '/usr/jwr-assets-v1/verified.wav');
        a.api.playSFX('rescueBonk'); assert.equal(a.bonk.plays, 0, 'unready decoder cannot queue an obsolete impact');
        assert.equal(a.resolutions.length, 1, 'awaiting canplay must not restart source loading');
        a.bonk.emit('canplay'); assert.equal(a.bonk.plays, 0, 'canplay must not replay earlier collisions');
        a.api.playSFX('rescueBonk', { volume: .5, startTime: .1 });
        assert.equal(a.bonk.plays, 1); assert.equal(a.bonk.volume, .4); assert.equal(a.bonk.seekValue, .1);
        a.state.audio.muted = true; a.api.playSFX('rescueBonk'); assert.equal(a.bonk.plays, 1);
        assert.equal(a.urlRequests.length, 11, 'all existing cloud BGM/SFX/loop/ambience retain their paths');
        assert(a.urlRequests.every(p => !p.includes('rescueBonk')));
        assert.equal(a.counts().ensureCalls, 1);
        a.api.playBGM('menuBGM'); assert.equal(a.contexts[0].plays, 1, 'legacy menu music still plays');
    }
    {
        const a = app({ cloudReady: false });
        assert.equal(a.resolutions.length, 1, 'failed legacy cloud initialization cannot bypass the asset resolver');
        assert.equal(a.contexts[0].src, undefined, 'unavailable cloud must not assign an absent local MP3');
        a.resolutions[0].reject(Error('offline')); await flush();
        a.api.playSFX('rescueBonk'); assert.equal(a.resolutions.length, 1, 'failed preloading respects retry cooldown');
        assert.equal(a.bonk.src, undefined); assert.equal(a.bonk.plays, 0);
        a.advance(2001); a.api.playSFX('rescueBonk'); assert.equal(a.resolutions.length, 2);
        a.resolutions[1].resolve('/usr/jwr-assets-v1/recovered.wav'); await flush(); a.bonk.emit('canplay');
        assert.equal(a.bonk.plays, 0); a.api.playSFX('rescueBonk'); assert.equal(a.bonk.plays, 1);
        a.bonk.emit('error', { errCode: 10004 }); await flush();
        assert.equal(a.counts().invalidations, 1, 'decoder failures invalidate verified file cache');
        a.api.playSFX('rescueBonk'); assert.equal(a.bonk.plays, 1); assert.equal(a.resolutions.length, 2);
        a.advance(2001); a.api.playSFX('rescueBonk'); assert.equal(a.resolutions.length, 3);
        a.resolutions[2].resolve('/usr/jwr-assets-v1/reloaded.wav'); await flush(); a.bonk.emit('canplay');
        assert.equal(a.bonk.plays, 1, 'recovered decoding never replays the failed impact');
        a.api.playSFX('rescueBonk'); assert.equal(a.bonk.plays, 2);
    }
    {
        const a = app({ browser: true, cloudEnabled: false, cloudReady: false });
        assert.equal(a.counts().ensureCalls, 0);
        a.resolutions[0].resolve('audio/rescue-bonk.wav'); await flush();
        assert.equal(a.bonk.src, 'audio/rescue-bonk.wav'); a.bonk.emit('canplay');
        a.api.playSFX('rescueBonk'); assert.equal(a.bonk.plays, 1);
        a.bonk.emit('error'); await flush(); assert.equal(a.counts().invalidations, 1);
    }
    {
        const a = app(); a.resolutions[0].resolve('/usr/jwr-assets-v1/never-decodes.wav'); await flush();
        a.advance(14999); await flush(); assert.equal(a.counts().invalidations, 0);
        a.advance(1); await flush(); assert.equal(a.counts().invalidations, 1, 'hung decoder times out at 15 seconds');
        a.api.playSFX('rescueBonk'); assert.equal(a.resolutions.length, 1);
        a.advance(2001); a.api.playSFX('rescueBonk'); assert.equal(a.resolutions.length, 2, 'hung decoder no longer blocks later retry');
        a.resolutions[1].resolve('/usr/jwr-assets-v1/decodes.wav'); await flush(); a.bonk.emit('canplay');
        a.advance(20000); await flush(); assert.equal(a.counts().invalidations, 1, 'canplay clears decode timeout');
        a.api.playSFX('rescueBonk'); assert.equal(a.bonk.plays, 1);
    }
    {
        const a = app(); await flush();
        const legacy = [a.contexts[0], a.contexts[2], a.contexts[10], a.contexts[11]];
        legacy.forEach(ctx => ctx.emit('error', { errCode: 10002 })); await flush();
        assert.equal(a.urlRequests.length, 15, 'one immediate refresh for each of four audio channel types');
        for (let i = 0; i < 20; i++) {
            legacy.forEach(ctx => ctx.emit('error', { errCode: 10002 }));
            a.api.playBGM('menuBGM'); a.api.playSFX('diveSplash'); a.api.playSFXLoop('breathLoop'); a.api.playAmbience('campAmbience');
        }
        await flush(); assert.equal(a.urlRequests.length, 15, 'repeated decoder errors and playback requests cannot flood cloud');
        a.advance(30001); a.urlFailure = true;
        a.api.playBGM('menuBGM'); a.api.playSFX('diveSplash'); a.api.playSFXLoop('breathLoop'); a.api.playAmbience('campAmbience');
        await flush(); assert.equal(a.urlRequests.length, 19, 'fresh playback after cooldown may retry');
        assert(legacy.every(ctx => ctx.src.startsWith('https://legacy.invalid/')), 'cloud failure cannot overwrite source with absent local file');
        assert.equal(a.api.getAudioDebugInfo().srcReady, false);
        const unavailable = app({ urlFailure: true }); await flush();
        assert(unavailable.contexts.every(ctx => ctx.src === undefined), 'initial URL failures leave all channels silent');
        unavailable.api.updateAudio();
        const beforeRecovery = unavailable.urlRequests.length;
        for (let i = 0; i < 100; i++) unavailable.api.updateAudio();
        assert.equal(unavailable.urlRequests.length, beforeRecovery, 'menu frames cannot bypass retry cooldown');
        unavailable.urlFailure = false; unavailable.advance(30001);
        unavailable.api.updateAudio();
        for (let i = 0; i < 100; i++) unavailable.api.updateAudio();
        assert.equal(unavailable.urlRequests.length, beforeRecovery + 1, 'menu retries once after cooldown without leaving the screen');
        await flush(); assert.equal(unavailable.contexts[0].plays, 1);
        unavailable.api.updateAudio(); assert.equal(unavailable.urlRequests.length, beforeRecovery + 1);
    }
    console.log('通过：rescueBonk 共享资源预取、失败静音/冷却重试、解码错误/15秒超时失效重下、旧碰撞不补播、本地兼容及既有云音乐保留；四类云音频刷新限流/失败不伪造本地回退。');
}
check().catch(e => { console.error(e); process.exitCode = 1; });
