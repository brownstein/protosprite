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
import protagSprite from "./protag.prs";
import { Renderer } from "./components/Renderer";

function App() {
  const scene = useMemo(() => new Scene(), []);
  const [sprites, setSprites] = useState<ProtoSpriteThree[]>([]);

  useEffect(() => {
    const doTheThing = async () => {
      const loader = new ProtoSpriteSheetThreeLoader();
      const sheet = await loader.loadAsync(protagSprite);
      const sprite = sheet.getSprite();
      sprite.gotoAnimation("idle");
      sprite.center();
      sprite.mesh.scale.y = -1;
      sprite.fadeAllLayers(new Color(0xffcc00), 0.5);
      sprite.outlineAllLayers(1, new Color(0xff0000));
      setSprites([sprite]);
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
