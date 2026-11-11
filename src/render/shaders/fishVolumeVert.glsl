attribute vec3 position;
attribute vec3 normal;
attribute vec3 color;
uniform mat4 viewProj;
uniform mat4 lightVP;
varying vec3 P;
varying vec3 N;
varying vec3 C;
varying vec4 LP;
void main() {
    P = position; N = normal; C = color;
    LP = lightVP * vec4(position + normal * 0.65, 1.0);
    gl_Position = viewProj * vec4(position, 1.0);
}
