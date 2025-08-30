import { useEffect, useRef } from "react";
import { Box3, LinearSRGBColorSpace, NoToneMapping, OrthographicCamera, Scene, Vector2, Vector3, WebGLRenderer } from "three";

import "./Renderer.css";

type RendererIState = {
  renderer?: WebGLRenderer;
  onBeforeRender?: (ms: number) => void;
}

export type RendererProps = {
  scene: Scene;
  onBeforeRender?: (ms: number) => void;
};

export function Renderer(props: RendererProps) {
  const { scene, onBeforeRender } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const iRendererState = useRef<RendererIState>({
    onBeforeRender
  });
  iRendererState.current.onBeforeRender = onBeforeRender;

  useEffect(() => {
    const rState = iRendererState.current;
    const canvas = canvasRef.current;

    let renderer: WebGLRenderer | undefined;

    const init = () => {
      if (!canvas || rState.renderer) return;

      renderer = new WebGLRenderer({
        canvas,
        alpha: true
      });
      rState.renderer = renderer;
      renderer.toneMapping = NoToneMapping;
      renderer.outputColorSpace = LinearSRGBColorSpace;

      const sceneBBox = new Box3();
      sceneBBox.expandByObject(scene);
      const sceneCenter = new Vector3();
      const sceneSize = new Vector3();
      sceneBBox.getCenter(sceneCenter);
      sceneBBox.getSize(sceneSize);
      sceneSize.x = Math.max(sceneSize.x, 512);
      sceneSize.y = Math.max(sceneSize.y, 512);

      const canvasSize = canvas.getBoundingClientRect();
      const cameraSize = sizeCameraToCanvas(new Vector2(sceneSize.x, sceneSize.y), canvasSize);
      let canvasSizeLast = {
        width: canvasSize.width,
        height: canvasSize.height
      };

      const camera = new OrthographicCamera(-cameraSize.x, cameraSize.x, cameraSize.y, -cameraSize.y, 0, 1000);
      const cameraCenter = new Vector2(sceneCenter.x, sceneCenter.y);
      camera.position.x = cameraCenter.x;
      camera.position.y = cameraCenter.y;
      camera.position.z = sceneSize.z + 1;
      camera.up = new Vector3(0, 1, 0);

      const cameraVelocity = new Vector2();
      const cameraSizeVelocity = new Vector2();

      let lastRenderTime = performance.now();

      const doFrame = () => {
        if (renderer !== rState.renderer) return;
        
        const now = performance.now();
        const delta = Math.min(500, now - lastRenderTime);
        lastRenderTime = now;

        cameraCenter.add(cameraVelocity.clone().multiplyScalar(delta));
        cameraSize.add(cameraSizeVelocity.clone().multiplyScalar(delta));

        const sceneBBox = new Box3();
        sceneBBox.expandByObject(scene);
        const sceneCenter = new Vector3();
        const sceneSize = new Vector3();
        sceneBBox.getCenter(sceneCenter);
        sceneBBox.getSize(sceneSize);

        const r = Math.min(0, (1000 - delta) * 0.001);
        const r2 = 0.0001 * delta;
        const cameraAcceleration = new Vector2(sceneCenter.x, sceneCenter.y).sub(cameraCenter)
          .multiplyScalar(r2);
        cameraVelocity.multiplyScalar(r).add(cameraAcceleration);
        const cameraSizeAcceleration = new Vector2(sceneSize.x, sceneSize.y).sub(cameraSize)
          .multiplyScalar(r2);
        cameraSizeVelocity.multiplyScalar(r).add(cameraSizeAcceleration);

        const canvasSize = canvas.getBoundingClientRect();
        const camSize = sizeCameraToCanvas(cameraSize, canvasSize);

        camera.position.x = cameraCenter.x;
        camera.position.y = cameraCenter.y;
        camera.position.z = sceneSize.z + 1;
        camera.left = -camSize.x / 2;
        camera.right = camSize.x / 2;
        camera.top = camSize.y / 2;
        camera.bottom = -camSize.y / 2;
        camera.updateProjectionMatrix();

        if (canvasSizeLast.width !== canvasSize.width || canvasSizeLast.height !== canvasSize.height) {
          canvasSizeLast = {
            width: canvasSize.width,
            height: canvasSize.height
          };
          renderer?.setSize(canvasSizeLast.width, canvasSizeLast.height, false);
        }

        rState.onBeforeRender?.(delta);
        renderer?.render(scene, camera);
        requestAnimationFrame(doFrame);
      };

      doFrame();
    };
    const dispose = () => {
      rState.renderer?.dispose();
      rState.renderer = undefined;
    };

    init();
    return dispose;
  }, [scene]);

  return (
    <canvas ref={canvasRef} className="renderer"/>
  );
}

type SizeAttributes = {
  width: number;
  height: number;
};

export function sizeCameraToCanvas(
  size: Vector2,
  canvasSize: SizeAttributes
) {
  if (size.x === 0 || size.y === 0) return size;
  const camSize2 = size.clone();
  const currentCamAspectRatio = camSize2.x / (camSize2.y || 1);
  const canvasAspectRatio = canvasSize.width / (canvasSize.height || 1);
  const canvasCamAspectRatioRatio = canvasAspectRatio / currentCamAspectRatio;
  camSize2.x *= 1 + 0.5 * (canvasCamAspectRatioRatio - 1);
  camSize2.y *= 1 + 0.5 * (1 / canvasCamAspectRatioRatio - 1);
  const maxRatio = Math.max(size.x / camSize2.x, size.y / camSize2.y);
  camSize2.multiplyScalar(maxRatio);
  return camSize2;
}
