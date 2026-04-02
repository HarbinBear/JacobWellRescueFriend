// ⚠️ 此文件由 scripts/buildShaders.js 自动生成，请勿手动编辑
// 源文件：vert.glsl
// 如需修改 shader，请编辑 vert.glsl 然后运行 npm run shaders
export const VERT_SRC = `
// 全屏四边形顶点着色器
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
