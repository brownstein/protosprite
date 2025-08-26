import { encodeSpriteAsString, dumpJson } from "../dist/index.js";

const val = encodeSpriteAsString({
  name: "MySprite",
  externalSheet: {
    fileName: "1.png"
  },
  frames: [
    {
      frameIndex: 1,
      duration: 200,
      layer: {
        layerIndex: 2,
        sheetBbox: {
          x: 1,
          y: 2,
          width: 3,
          height: 4
        },
        spriteBbox: {
          x: 1,
          y: 4,
          width: 3,
          height: 4,
          bar: "baz"
        }
      }
    }
  ],
});

console.log(dumpJson(val));


