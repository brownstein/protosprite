import {
  ProtoSpriteSheetThreeLoader,
  ProtoSpriteThree
} from "protosprite-three";
import { useEffect, useRef } from "react";
import {
  Box3,
  Color,
  LinearSRGBColorSpace,
  NoToneMapping,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderer
} from "three";

import "./App.css";
import protagSprite from "./protag.prs";

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const iStateRendering = useRef<boolean>(false);

  useEffect(() => {
    const doTheThing = async () => {
      if (iStateRendering.current) return;
      iStateRendering.current = true;

      const loader = new ProtoSpriteSheetThreeLoader();
      const sheet = await loader.loadAsync(protagSprite);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const renderer = new WebGLRenderer({
        canvas,
        alpha: true
      });
      renderer.toneMapping = NoToneMapping;
      renderer.outputColorSpace = LinearSRGBColorSpace;
      const scene = new Scene();

      const drawSprites: ProtoSpriteThree[] = [];
      for (let i = 0; i < 4; i++) {
        const sprite = sheet.getSprite();
        sprite.hideLayers("bg");
        sprite.center();
        sprite.gotoAnimation("Idle");
        if (Math.random() > 0.5) sprite.gotoAnimation("Casting");
        sprite.data.animationState.speed = (Math.random() - 0.5) * 10;
        sprite.mesh.scale.y = -1;
        if (Math.random() > 0.5) sprite.mesh.scale.x = -1;
        sprite.mesh.position.x = Math.random() * 200;
        sprite.mesh.position.y = Math.random() * 200;
        sprite.mesh.position.z = Math.random() * 50;
        sprite.mesh.position.round();
        scene.add(sprite.mesh);
        drawSprites.push(sprite);

        const rndColor = () => new Color(Math.floor(Math.random() * 0xffffff));

        // sprite.outlineAllLayers(1, new Color(0x000000), 1);
        for (const layer of sprite.data.sprite.data.layers) {
          if (layer.isGroup) continue;
          sprite.fadeLayers(rndColor(), Math.random(), [layer.name]);
        }

        // sprite.setOpacity(0.25);
        // sprite.hideLayers("Group 4", "Group 5", "Group 7");
        // sprite.fadeLayers(new Color(0x002266), 0.2, ["Smokes"]);
        // sprite.fadeLayers(new Color(0xffaa00), 0.5, ["White"]);

        // const flameLayers = [
        //   "Layer 162",
        //   "Layer 91",
        //   "Layer 90",
        //   "Layer 89",
        //   "Layer 88",
        //   "Layer 87",
        //   "Layer 86"
        // ];
        // const color1 = rndColor(); // new Color(0xffdd11);
        // const color2 = rndColor(); // new new Color(0xff8811);
        // const color3 = rndColor(); // new Color(0x884422)
        // flameLayers.forEach((l, li) => {
        //   const color = color1
        //     .lerp(color2, (2 * li) / flameLayers.length)
        //     .lerp(color3, li / flameLayers.length);
        //   sprite.fadeLayers(color, 1, [l]);
        //   sprite.setLayerOpacity(0.5 + (1 - li / flameLayers.length) * 0.5, [
        //     l
        //   ]);
        // });

        // sprite
        //   .multiplyLayers(rndColor(), Math.random(), ["fur"])
        //   .multiplyLayers(rndColor(), Math.random(), ["shirt"])
        //   .multiplyLayers(rndColor(), Math.random(), ["pants"])
        //   .outlineLayers(1, new Color(0), 1, ["fur"])
        //   .outlineLayers(1, new Color(1, 1, 1), 1, ["shirt"]);
      }

      const pos3 = new Vector3();
      const size3 = new Vector3();
      const box3 = new Box3();
      box3.expandByObject(scene);

      box3.getCenter(pos3);
      box3.getSize(size3);

      size3.set(400, 400, 200);

      const camera = new OrthographicCamera(
        -size3.x * 0.5,
        size3.x * 0.5,
        size3.y * 0.5,
        -size3.y * 0.5,
        0.1,
        1000
      );
      camera.up = new Vector3(0, 1, 0);
      camera.position.copy(pos3);
      camera.position.z += 100;

      renderer.render(scene, camera);

      while (true) {
        const tStart = performance.now();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const tEnd = performance.now();
        const delta = tEnd - tStart;
        for (const sprite of drawSprites) {
          sprite.advance(delta);
        }
        renderer.render(scene, camera);
      }
    };
    doTheThing();
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <canvas ref={canvasRef} width="800" height="800" />
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;
