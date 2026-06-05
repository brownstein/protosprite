import { ProtoSpriteInstance } from "protosprite-core";
import { FrameData } from "protosprite-core/core/data";
import { createTypedEventEmitter } from "protosprite-core/core/util";
import {
  Box2,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector4
} from "three";

import {
  ProtoSpriteThreeEventTypes,
  SafeString,
  SafeStringIterable,
  StringFallback
} from "./types.js";
import { ProtoSpriteLayerThreeOverride, ProtoSpriteThreeLayer } from "./ProtoSpriteThree.js";

export type SliceRegion<T extends string = string> = {
  id: T;
  sourcePositions: Vector2[];
  outputPositions: Vector2[];
};

function rectVertices(x: number, y: number, width: number, height: number) {
  return [
    new Vector2(x, y),
    new Vector2(x + width, y),
    new Vector2(x + width, y + height),
    new Vector2(x, y + height)
  ];
}
export class ProtoSpriteThreeExtended<
  TLayers extends string | void = string,
  TAnimations extends string | void = string,
  TRegions extends string = "main",
> {

  public readonly mesh: Mesh;
  public readonly protoSpriteInstance: ProtoSpriteInstance;
  public readonly events =
    createTypedEventEmitter<ProtoSpriteThreeEventTypes<TAnimations>>();

  private textureSize: Vector2;
  private mainLayer: ProtoSpriteThreeLayer;
  private positionDirty = true;
  private extraDirty = true;
  private offset = new Vector2();

  private hiddenLayerNames = new Set<string>();
  private layerOverrides = new Map<string, ProtoSpriteLayerThreeOverride>();
  private regions: SliceRegion<TRegions>[] = [];

  constructor(protoSpriteInstance: ProtoSpriteInstance, material: ShaderMaterial, regions?: SliceRegion<TRegions>[]) {
    this.protoSpriteInstance = protoSpriteInstance;
    const texture = material.uniforms.map.value as Texture;
    this.textureSize = new Vector2(
      texture.image.naturalWidth,
      texture.image.naturalHeight
    );
    this.regions = regions ?? [{
      id: "main" as TRegions,
      sourcePositions: rectVertices(0, 0, 1, 1),
      outputPositions: rectVertices(0, 0, 1, 1)
    }];

    const geom = new BufferGeometry();

    const mesh = new Mesh(geom, material);
    this.mesh = mesh;

    const layerCount = this.protoSpriteInstance.sprite.countLayers();
    const regionCount = layerCount * this.regions.length;
    this.mainLayer = {
      geom,
      material,
      mesh,
      indexArr: new Uint16Array(regionCount * 6),
      indexArr2: new Float32Array(regionCount * 4),
      posArr: new Float32Array(regionCount * 12),
      uvArr: new Float32Array(regionCount * 8),
      opacityArr: new Float32Array(regionCount * 4),
      colorMultArr: new Float32Array(regionCount * 16),
      colorFadeArr: new Float32Array(regionCount * 16),
      outlineArr: new Float32Array(regionCount * 16),
      outlineThicknessArr: new Float32Array(regionCount * 4)
    };

    // Initialize buffer attributes.
    this.mainLayer.geom.setIndex(
      new BufferAttribute(this.mainLayer.indexArr, 1)
    );
    this.mainLayer.geom.setDrawRange(0, 0);
    this.mainLayer.geom.setAttribute(
      "position",
      new BufferAttribute(this.mainLayer.posArr, 3)
    );
    this.mainLayer.geom.setAttribute(
      "uv",
      new BufferAttribute(this.mainLayer.uvArr, 2)
    );
    this.mainLayer.geom.setAttribute(
      "vtxIndex",
      new BufferAttribute(this.mainLayer.indexArr2, 1)
    );
    this.mainLayer.geom.setAttribute(
      "vtxOpacity",
      new BufferAttribute(this.mainLayer.opacityArr, 1)
    );
    this.mainLayer.geom.setAttribute(
      "vtxMultColor",
      new BufferAttribute(this.mainLayer.colorMultArr, 4)
    );
    this.mainLayer.geom.setAttribute(
      "vtxFadeColor",
      new BufferAttribute(this.mainLayer.colorFadeArr, 4)
    );
    this.mainLayer.geom.setAttribute(
      "vtxOutline",
      new BufferAttribute(this.mainLayer.outlineArr, 4)
    );
    this.mainLayer.geom.setAttribute(
      "vtxOutlineThickness",
      new BufferAttribute(this.mainLayer.outlineThicknessArr, 1)
    );

    // Prefill opacity at 1.
    this.mainLayer.opacityArr.fill(1);

    this.update();
  }

  update() {
    
    return this;
  }

  updateGeometry() {
    
    return this;
  }


}