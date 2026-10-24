const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// A dedicated headless browser, never the user's existing Chrome session.
async function openReviewBrowser(url, width = 1000, height = 900) {
    const root = path.resolve(__dirname, '../..');
    const cache = path.join(root, 'node_modules/.cache/jwr-review');
    fs.mkdirSync(cache, { recursive: true });
    const profile = fs.mkdtempSync(path.join(cache, 'profile-'));
    const executable = process.env.JWR_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const chrome = spawn(executable, [
        '--headless=new', '--no-first-run', '--no-default-browser-check',
        '--remote-debugging-pipe', '--autoplay-policy=no-user-gesture-required',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
        '--user-data-dir=' + profile, 'about:blank'
    ], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
    const pending = new Map(), errors = [];
    let nextId = 0, buffer = '', stderr = '';
    chrome.stderr.on('data', data => { stderr = (stderr + data).slice(-4000); });
    chrome.stdio[4].on('data', data => {
        buffer += data.toString();
        let end;
        while ((end = buffer.indexOf('\0')) >= 0) {
            const text = buffer.slice(0, end);
            buffer = buffer.slice(end + 1);
            if (!text) continue;
            const message = JSON.parse(text), job = pending.get(message.id);
            if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
            if (!job) continue;
            pending.delete(message.id); clearTimeout(job.timer);
            if (message.error) job.reject(new Error(JSON.stringify(message.error)));
            else job.resolve(message.result);
        }
    });
    chrome.on('error', error => {
        for (const job of pending.values()) { clearTimeout(job.timer); job.reject(error); }
        pending.clear();
    });
    chrome.on('exit', () => {
        for (const job of pending.values()) { clearTimeout(job.timer); job.reject(new Error('Chrome exited: ' + stderr)); }
        pending.clear();
    });
    function send(method, params = {}, sessionId) {
        return new Promise((resolve, reject) => {
            const id = ++nextId;
            const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method + '\n' + stderr)); }, 20000);
            pending.set(id, { resolve, reject, timer });
            chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
        });
    }
    let sessionId;
    try {
        await send('Browser.getVersion');
        const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
        ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
        const command = (method, params) => send(method, params, sessionId);
        await command('Page.enable');
        await command('Runtime.enable');
        await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        async function evaluate(expression) {
            const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
            if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
            return result.result.value;
        }
        await command('Page.navigate', { url });
        for (let i = 0; i < 100; i++) {
            if (await evaluate('!!window.DeepTapeGame')) break;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (!await evaluate('!!window.DeepTapeGame')) throw new Error('Game did not initialize');
        async function mouse(type, x, y, button = 'left') {
            await command('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : button, buttons: type === 'mouseReleased' ? 0 : 1, clickCount: type === 'mouseMoved' ? 0 : 1 });
        }
        async function click(x, y) { await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); }
        async function screenshot(file) {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            const image = await command('Page.captureScreenshot', { format: 'png' });
            fs.writeFileSync(file, Buffer.from(image.data, 'base64'));
        }
        async function close() { try { await send('Browser.close'); } catch {} finally { chrome.kill(); } }
        return { evaluate, command, click, mouse, screenshot, close, errors };
    } catch (error) {
        chrome.kill();
        throw error;
    }
}
module.exports = { openReviewBrowser };
