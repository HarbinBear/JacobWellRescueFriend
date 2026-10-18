// Original short rubbery bonk + descending whistle; deterministic local PCM.
const fs = require('fs'), path = require('path');
const rate = 22050, duration = .55, n = Math.round(rate * duration);
const wav = Buffer.alloc(44 + n * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) {
    const t = i / rate;
    const phase = 2 * Math.PI * (160 * t + 290 * (1 - Math.exp(-t * 40)) / 40);
    const hit = (Math.sin(phase) + .32 * Math.sin(phase * 2.73)) * Math.exp(-t * 25) * .65;
    const u = Math.max(0, t - .075);
    const whistle = t > .075 ? Math.sin(2 * Math.PI * (680 * u - 480 * u * u)) * Math.sin(Math.min(1, u / .38) * Math.PI) * .16 * Math.exp(-u * 5) : 0;
    const value = (hit + whistle) * Math.min(1, t / .002, (duration - t) / .04);
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2);
}
fs.writeFileSync(path.join(__dirname, '../audio/rescue-bonk.wav'), wav);
console.log('Generated audio/rescue-bonk.wav (' + wav.length + ' bytes)');
