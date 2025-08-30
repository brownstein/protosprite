import {
  ProtoSpriteSheetThreeLoader,
  ProtoSpriteThree
} from "protosprite-three";
import { useEffect, useMemo, useState } from "react";
import { Color, Scene } from "three";

import "./App.css";
import { Renderer } from "./components/Renderer";
import wolfSprite from "./wolf.prs";

function App() {
  const scene = useMemo(() => new Scene(), []);
  const [sprites, setSprites] = useState<ProtoSpriteThree[]>([]);

  useEffect(() => {
    const doTheThing = async () => {
      const loader = new ProtoSpriteSheetThreeLoader();
      const sheet = await loader.loadAsync(wolfSprite);
      const sprites: ProtoSpriteThree[] = [];

      let iIndex = 0;
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 4; x++) {
          const sprite = sheet.getSprite();
          sprite.center();
          sprite.mesh.scale.y = -1;
          sprite.mesh.position.x = x * 64;
          sprite.mesh.position.y = -y * 64;
          sprite.hideLayers("Engine");
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
      </header>
    </div>
  );
}

export default App;
