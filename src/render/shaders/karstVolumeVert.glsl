attribute vec3 position;
attribute vec3 normal;
uniform mat4 viewProj;
uniform mat4 lightVP;
varying vec3 P;
varying vec3 N;
varying vec4 LP;
void main() {
    P = position; N = normal;
    LP = lightVP * vec4(position + normal * 5.0, 1.0);
    gl_Position = viewProj * vec4(position, 1.0);
}
