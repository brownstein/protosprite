import {
  ProtoSpriteSheetThreeLoader,
  ProtoSpriteThree
} from "protosprite-three";
import { useEffect, useMemo, useState } from "react";
import {
  Color,
  Scene,
} from "three";

import "./App.css";
import protagSprite from "./protag2.prs";
import { Renderer } from "./components/Renderer";

function App() {
  const scene = useMemo(() => new Scene(), []);
  const [sprites, setSprites] = useState<ProtoSpriteThree[]>([]);

  useEffect(() => {
    const doTheThing = async () => {
      const loader = new ProtoSpriteSheetThreeLoader();
      const sheet = await loader.loadAsync(protagSprite);
      const sprites: ProtoSpriteThree[] = [];

      for (let x = 0; x < 20; x++) {
        for (let y = 0; y < 20; y++) {
          const sprite = sheet.getSprite();
          sprite.gotoAnimation("idle");
          sprite.data.animationState.speed = Math.random() + 0.5;
          sprite.center();
          sprite.mesh.scale.y = -1;
          sprite.mesh.position.x = x * 10;
          sprite.mesh.position.y = y * 10;
          sprite.hideLayers("Engine");
          sprite.fadeLayers(new Color(0xffaa00), 1, ["sword_test"]);
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
        <Renderer scene={scene} onBeforeRender={(delta) => {
          for (const sprite of sprites) {
            sprite.advance(delta);
          }
        }} />
      </header>
    </div>
  );
}

export default App;
