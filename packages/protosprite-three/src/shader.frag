uniform vec2 invSheetSize;
uniform sampler2D map;

varying vec2 vUv;
varying float vOpacity;
varying vec3 vColor;
varying vec4 vFade;
varying vec4 vOutline;
varying float vOutlineThickness;

void main() {
  float minAlpha = 0.01;
  vec4 color = texture2D(map, vUv);
  bool isOutline = false;
  if (color.w < minAlpha) {
    if (vOutline.w > 0.0) {
      for (float d = 1.0; d <= vOutlineThickness; d += 1.0) {
        vec2 down = vec2(0.0, -d * invSheetSize.y);
        vec2 right = vec2(d * invSheetSize.x, 0.0);
        vec4 colorUp = texture2D(map, vUv - down);
        vec4 colorDown = texture2D(map, vUv + down);
        vec4 colorLeft = texture2D(map, vUv - right);
        vec4 colorRight = texture2D(map, vUv + right);
        float totalOpacity = colorUp.w + colorDown.w + colorLeft.w + colorRight.w;
        if (totalOpacity > 0.0) {
          isOutline = true;
          break;
        }
      }
    }
    if (!isOutline) discard;
  }
  
  color.rgb *= vColor;
  color.w *= vOpacity;
  color.rgb *= (1.0 - vFade.w);
  color.rgb += vFade.rgb * vFade.w;

  if (isOutline) {
    color = vOutline;
  }

  if (color.w < minAlpha) discard;

  gl_FragColor = color;
}