// 仅编译音频内核，供 Node 离线导出/验证和自包含试听页复用，无需额外依赖。
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const names = ['AdaptiveScore', 'AdaptiveMusicEngine'];
const sources = Object.fromEntries(names.map(name => [name, ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '../src/audio', name + '.ts'), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS } }
).outputText]));
const cache = {};
function load(name) {
    name = name.replace('./', '');
    if (!sources[name]) throw new Error('Unknown audio module: ' + name);
    if (!cache[name]) {
        const exports = {};
        cache[name] = exports;
        new Function('exports', 'require', sources[name])(exports, load);
    }
    return cache[name];
}
function browserBundle() {
    return `(function(){const factories={${names.map(name => JSON.stringify(name) +
        ':function(exports,require){' + sources[name] + '}').join(',')}};const cache={};
        function load(name){name=name.replace('./','');if(!cache[name]){const e={};cache[name]=e;factories[name](e,load);}return cache[name];}
        window.SignalBelow={...load('AdaptiveScore'),...load('AdaptiveMusicEngine')};})();`;
}
module.exports = { load, browserBundle };
