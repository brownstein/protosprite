uniform vec2 invSheetSize;
\
attribute float vtxIndex;
attribute float vtxOpacity;
attribute vec4 vtxMultColor;
attribute vec4 vtxFadeColor;
attribute vec4 vtxOutline;
attribute float vtxOutlineThickness;

varying vec2 vUv;
varying float vOpacity;
varying vec3 vColor;
varying vec4 vFade;
varying vec4 vOutline;
varying float vOutlineThickness;

void main() {
  vUv = uv;

  // Apply special shader attributes.
  vColor = vec3(1.0, 1.0, 1.0) * (1.0 - vtxMultColor.w) + vtxMultColor.rgb * vtxMultColor.w;
  vFade = vtxFadeColor;
  vOpacity = vtxOpacity;

  vec3 pos = position;

  // Apply outline.
  if (vtxOutlineThickness > 0.0 && vtxOutline.w > 0.0) {
    vOutline = vtxOutline;
    vOutlineThickness = vtxOutlineThickness;
    vec2 delta;
    switch (int(vtxIndex)) {
      case 0:
        delta.x = -1.0;
        delta.y = -1.0;
        break;
      case 1:
        delta.x = 1.0;
        delta.y = -1.0;
        break;
      case 2:
        delta.x = 1.0;
        delta.y = 1.0;
        break;
      case 3:
        delta.x = -1.0;
        delta.y = 1.0;
        break;
    }
    pos.xy += delta * vtxOutlineThickness;
    vUv.x += delta.x * invSheetSize.x * vtxOutlineThickness;
    vUv.y -= delta.y * invSheetSize.y * vtxOutlineThickness;
  }

  // Apply matricies to find final triangle position.
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}