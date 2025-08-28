import { useEffect, useRef } from 'react';
import { Box3, Color, LinearSRGBColorSpace, NoToneMapping, OrthographicCamera, Scene, Vector3, WebGLRenderer } from 'three';
import './App.css';

import { ProtoSpriteSheetThreeLoader, ProtoSpriteThree } from "protosprite-three";
// import aResource from "./enemies_test.prs";
import aResource from "./protag.prs";

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const iStateRendering = useRef<boolean>(false);

  useEffect(() => {
    const doTheThing = async () => {
      if (iStateRendering.current) return;
      iStateRendering.current = true;

      const loader = new ProtoSpriteSheetThreeLoader();
      const sheet = await loader.loadAsync(aResource);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const renderer = new WebGLRenderer({
        canvas,
        alpha: true,
      });
      renderer.toneMapping = NoToneMapping;
      renderer.outputColorSpace = LinearSRGBColorSpace;
      const scene = new Scene();

      const drawSprites: ProtoSpriteThree[] = [];
      for (let i = 0; i < 50; i++) {
        const sprite = sheet.getSprite(0);
        sprite.hideLayers("bg");
        sprite.center();
        sprite.gotoAnimation("Idle");
        if (Math.random() > 0.5) sprite.gotoAnimation("Casting");
        sprite.data.currentAnimationSpeed = 0.5 + Math.random();
        sprite.mesh.scale.y = -1;
        if (Math.random() > 0.5) sprite.mesh.scale.x = -1;
        sprite.mesh.position.x = Math.random() * 500;
        sprite.mesh.position.y = Math.random() * 500;
        sprite.mesh.position.z = Math.random() * 50;
        sprite.mesh.position.round();
        scene.add(sprite.mesh);
        drawSprites.push(sprite);

        sprite.outlineLayers(1, new Color(0, 0.8, 1), 1, ["head"]);
        sprite.multiplyAllLayers(new Color(0), 1).fadeLayers(new Color(0xffffff), 1, ["sword_test"]);
      }

      const pos3 = new Vector3();
      const size3 = new Vector3();
      const box3 = new Box3();
      box3.expandByObject(scene);

      box3.getCenter(pos3);
      box3.getSize(size3);

      const camera = new OrthographicCamera(-size3.x * 0.5, size3.x * 0.5, size3.y * 0.5, -size3.y * 0.5, 0.1, 1000);
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
    }
    doTheThing();
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <canvas ref={canvasRef} width="500" height="500" />
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
