import {
  ProtoSpriteSheetThreeLoader,
  ProtoSpriteThree
} from "protosprite-three";
import { useEffect, useMemo, useState } from "react";
import { Color, Scene } from "three";

import "./App.css";
import { Converter } from "./components/Converter";
import { Renderer } from "./components/Renderer";
import protagSprite from "./protag4.prs";

function App() {
  const scene = useMemo(() => new Scene(), []);
  const [sprites, setSprites] = useState<ProtoSpriteThree[]>([]);

  useEffect(() => {
    const doTheThing = async () => {
      const loader = new ProtoSpriteSheetThreeLoader();
      const sheet = await loader.loadAsync(protagSprite);
      const sprites: ProtoSpriteThree[] = [];

      const iterX = 5;
      const iterY = 3;
      for (let y = 0; y < iterY; y++) {
        for (let x = 0; x < iterX; x++) {
          const sprite = sheet.getSprite();
          sprite.center();
          sprite.mesh.scale.y = -1;
          sprite.mesh.position.x = x * 64 - iterX * 32;
          sprite.mesh.position.y = -y * 64 + iterY * 32;
          sprite.hideLayers("Engine");
          sprite.gotoAnimation("idle");
          for (const layer of sprite.data.sprite.data.layers) {
            sprite.multiplyLayers(
              new Color(Math.random(), Math.random(), Math.random()),
              Math.random() * 0.9,
              [layer.name]
            );
          }
          sprites.push(sprite);
        }
      }

      setSprites(sprites);
    };
    doTheThing();
  }, []);

  useEffect(() => {
    scene.clear();
    for (const sprite of sprites) scene.add(sprite.mesh);
  }, [scene, sprites]);

  return (
    <div className="App">
      <header className="App-header">
        <Renderer
          scene={scene}
          onBeforeRender={(delta) => {
            for (const sprite of sprites) {
              sprite.advance(delta);
            }
          }}
        />
        <h3>Preview your own files (Aseprite or ProtoSprite)</h3>
        <Converter />
      </header>
    </div>
  );
}

export default App;
