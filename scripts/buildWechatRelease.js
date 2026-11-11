// 生成可供微信工具导入的独立发布候选；不会上传，也不修改本地开发配置。
const fs = require('fs'), path = require('path'), ts = require('typescript');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'node_modules/.cache/wechat-release');
function build() {
    execFileSync(process.execPath, [path.join(__dirname, 'buildShaders.js')], { cwd: ROOT, stdio: 'pipe' });
    execFileSync(process.execPath, [path.join(__dirname, 'buildAssetCatalog.js'), '--check'], { cwd: ROOT, stdio: 'pipe' });
    const files = [];
    function walk(dir) {
        for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
            const rel = dir + '/' + e.name;
            if (e.isDirectory()) walk(rel);
            else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) files.push(rel);
        }
    }
    walk('src'); files.unshift('game.ts');
    // 只清理此脚本拥有的忽略目录，不触碰用户工程或开发者工具配置。
    fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
    for (const file of files) {
        let source = fs.readFileSync(path.join(ROOT, file), 'utf8');
        if (file === 'src/assets/AssetCatalog.ts') {
            const replaced = source.replace(/mode:\s*['"]local['"]/, "mode: 'cloud'");
            if (replaced === source && !/mode:\s*['"]cloud['"]/.test(source)) throw Error('AssetCatalog mode declaration changed');
            source = replaced;
        }
        const result = ts.transpileModule(source, { fileName: file, reportDiagnostics: true,
            compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS, esModuleInterop: true, removeComments: true } });
        if (result.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) throw Error('编译失败: ' + file);
        const dest = path.join(OUT, file.replace(/\.ts$/, '.js'));
        fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, result.outputText);
    }
    fs.copyFileSync(path.join(ROOT, 'game.json'), path.join(OUT, 'game.json'));
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));
    config.description = '代码发布候选；云资源上传并在微信验证之前不可正式发布';
    config.projectname += '-CloudRelease';
    config.packOptions = { ignore: [{ type: 'file', value: 'project.private.config.json' }], include: [] };
    config.setting.useCompilerPlugins = [];
    config.setting.autoCompile = false;
    fs.writeFileSync(path.join(OUT, 'project.config.json'), JSON.stringify(config, null, 2) + '\n');
    return OUT;
}
if (require.main === module) console.log('已生成代码发布候选（尚未上传或验证云文件）: ' + build());
module.exports = { build, OUT };
