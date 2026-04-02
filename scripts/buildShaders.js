/**
 * buildShaders.js
 * 
 * 将 src/render/shaders/ 下的 .glsl 文件转换为同名 .glsl.ts 文件，
 * 导出 GLSL 源码字符串供 TypeScript 代码 import。
 * 
 * 用法：npm run shaders
 * 
 * 命名约定：
 *   vert.glsl        -> vert.glsl.ts        导出 VERT_SRC
 *   maskFrag.glsl    -> maskFrag.glsl.ts     导出 MASK_FRAG_SRC
 *   volumetricFrag.glsl -> volumetricFrag.glsl.ts 导出 VOLUMETRIC_FRAG_SRC
 * 
 * 导出名规则：
 *   文件名去掉 .glsl 后缀，转为 UPPER_SNAKE_CASE，再加 _SRC 后缀。
 *   例如 maskFrag -> MASK_FRAG_SRC
 */

const fs = require('fs');
const path = require('path');

const SHADERS_DIR = path.resolve(__dirname, '..', 'src', 'render', 'shaders');
const AUTO_GEN_HEADER = '// ⚠️ 此文件由 scripts/buildShaders.js 自动生成，请勿手动编辑\n// 源文件：';

/**
 * 将 camelCase / PascalCase 文件名转为 UPPER_SNAKE_CASE
 * 例如：maskFrag -> MASK_FRAG, volumetricFrag -> VOLUMETRIC_FRAG, vert -> VERT
 */
function toUpperSnake(name) {
    return name
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .toUpperCase();
}

function buildShaders() {
    const glslFiles = fs.readdirSync(SHADERS_DIR).filter(f => f.endsWith('.glsl'));

    if (glslFiles.length === 0) {
        console.log('未找到 .glsl 文件');
        return;
    }

    let count = 0;
    for (const file of glslFiles) {
        const glslPath = path.join(SHADERS_DIR, file);
        const tsPath = path.join(SHADERS_DIR, file + '.ts');

        // 读取 GLSL 源码
        const glslContent = fs.readFileSync(glslPath, 'utf-8');

        // 计算导出常量名：去掉 .glsl 后缀 -> UPPER_SNAKE_CASE -> 加 _SRC
        const baseName = file.replace(/\.glsl$/, '');
        const exportName = toUpperSnake(baseName) + '_SRC';

        // 生成 TypeScript 文件内容
        const tsContent =
            AUTO_GEN_HEADER + file + '\n' +
            '// 如需修改 shader，请编辑 ' + file + ' 然后运行 npm run shaders\n' +
            'export const ' + exportName + ' = `\n' +
            glslContent +
            '`;\n';

        fs.writeFileSync(tsPath, tsContent, 'utf-8');
        console.log(`  ${file} -> ${file}.ts  (export ${exportName})`);
        count++;
    }

    console.log(`\n✅ 已生成 ${count} 个 shader 模块`);
}

buildShaders();
