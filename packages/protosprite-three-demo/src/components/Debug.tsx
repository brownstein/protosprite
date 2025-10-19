import { Data } from "protosprite-core";
import { ProtoSpriteThree } from "protosprite-three";
import { useEffect, useState } from "react";

import "./Debug.css";

export type DebugTabProps = {
  sprite?: ProtoSpriteThree;
};

type FrameLayerInfo = {
  layerData: Data.LayerData;
  frameLayerData: Data.FrameLayerData;
};

export function DebugTab(props: DebugTabProps) {
  const { sprite } = props;

  const [currentFrame, setCurrentFrame] = useState(
    sprite?.data.animationState.currentFrame
  );
  const [currentLayers, setCurrentLayers] = useState<FrameLayerInfo[]>([]);

  useEffect(() => {
    const onFrameUpdate = () => {
      if (!sprite) return;
      setCurrentFrame(sprite.data.animationState.currentFrame);
      const frameData = sprite.data.sprite.data.frames.at(
        sprite.data.animationState.currentFrame
      );
      if (frameData) {
        const layerFrames = [...frameData.layers];
        const layers = sprite.data.sprite.data.layers;
        layerFrames.sort(
          (a, b) =>
            (layers[a.layerIndex]?.index ?? 0) -
            (layers[b.layerIndex]?.index ?? 0) +
            a.zIndex -
            b.zIndex
        );
        layerFrames.reverse();
        setCurrentLayers(
          layerFrames.map((layerFrame) => ({
            frameLayerData: layerFrame,
            layerData: layers[layerFrame.layerIndex]
          }))
        );
      }
    };
    sprite?.events.on("animationFrameSwapped", onFrameUpdate);
    onFrameUpdate();
    return () => {
      sprite?.events.off("animationFrameSwapped", onFrameUpdate);
    };
  }, [sprite]);

  return (
    <div className="debug-attrs">
      <div className="attr">
        <div className="key">Current Frame</div>
        <div className="value">{currentFrame}</div>
      </div>
      <div className="attr vertical">
        <div className="key">Layers</div>
        <div className="value">
          <table>
            <thead>
              <th>Name</th>
              <th>Index</th>
              <th>Z Index</th>
            </thead>
            <tbody>
              {currentLayers.map((layerInfo, i) => (
                <tr key={i}>
                  <td className="key">{layerInfo.layerData.name}</td>
                  <td className="value">{layerInfo.layerData.index}</td>
                  <td className="value">{layerInfo.frameLayerData.zIndex}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
