import { Data, ProtoSpriteInstance, ProtoSpriteSheet } from "protosprite-core";
import {
  Box2,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  NearestFilter,
  ShaderMaterial,
  Texture,
  TextureLoader,
  Vector2,
  Vector4
} from "three";

import { FrameData } from "../../protosprite-core/dist/src/core/data.js";
import { createTypedEventEmitter } from "../../protosprite-core/dist/src/core/util.js";
import fragmentShader from "./shader.frag";
import vertexShader from "./shader.vert";

export type ProtoSpriteThreeLoaderOpts = {
  textureLoader?: TextureLoader;
};

type ProtoSpriteSheetThreeLoaderSpriteState = {
  url?: string;
  sheet?: ProtoSpriteSheet;
  loadPromise?: Promise<ProtoSpriteSheetThree>;
  resource?: ProtoSpriteSheetThree;
};

export class ProtoSpriteSheetThreeLoader {
  private textureLoader: TextureLoader;
  private urlToState = new Map<
    string,
    ProtoSpriteSheetThreeLoaderSpriteState
  >();
  private spriteToState = new WeakMap<
    ProtoSpriteSheet,
    ProtoSpriteSheetThreeLoaderSpriteState
  >();
  constructor(opts?: ProtoSpriteThreeLoaderOpts) {
    this.textureLoader = opts?.textureLoader ?? new TextureLoader();
  }
  async loadAsync(
    sheet: string | ProtoSpriteSheet
  ): Promise<ProtoSpriteSheetThree> {
    let state: ProtoSpriteSheetThreeLoaderSpriteState | undefined;
    if (typeof sheet === "string") {
      state = this.urlToState.get(sheet);
      if (state === undefined) {
        state = {
          url: sheet
        };
        this.urlToState.set(sheet, state);
      }
    } else {
      state = this.spriteToState.get(sheet);
      if (state === undefined) {
        state = {
          sheet
        };
        this.spriteToState.set(sheet, state);
      }
    }

    if (state.resource?.loaded) return state.resource;
    if (state.loadPromise === undefined) {
      state.loadPromise = this._populateState(state);
    }
    return state.loadPromise;
  }
  private async _populateState(
    state: ProtoSpriteSheetThreeLoaderSpriteState
  ): Promise<ProtoSpriteSheetThree> {
    if (state.url) {
      const rawRes = await fetch(state.url, { method: "GET" });
      if (!rawRes.ok) {
        throw new Error("Unable to fetch referenced sprite binary.");
      }
      const rawBuff = await rawRes.arrayBuffer();
      const sheet = ProtoSpriteSheet.fromArray(new Uint8Array(rawBuff));
      state.sheet = sheet;
    }
    if (state.sheet) {
      state.resource = new ProtoSpriteSheetThree(state.sheet);
      let sheetTextureUrl: string | undefined;
      if (Data.isExternalSpriteSheetData(state.sheet.data.pixelSource)) {
        sheetTextureUrl =
          state.sheet.data.pixelSource.url ??
          state.sheet.data.pixelSource.fileName;
      } else if (Data.isEmbeddedSpriteSheetData(state.sheet.data.pixelSource)) {
        const pngData = state.sheet.data.pixelSource.pngData;
        if (pngData) {
          sheetTextureUrl = URL.createObjectURL(
            new Blob([new Uint8Array(pngData)], { type: "image/png " })
          );
        }
      }
      if (sheetTextureUrl !== undefined) {
        state.resource.sheetTexture =
          await this.textureLoader.loadAsync(sheetTextureUrl);
        state.resource.sheetTexture.minFilter = NearestFilter;
        state.resource.sheetTexture.magFilter = NearestFilter;
      }
      const pendingWork = state.sheet.sprites.map(
        async (sprite, spriteIndex) => {
          if (!state.resource) return;
          let spriteTextureUrl: string | undefined;
          if (Data.isExternalSpriteSheetData(sprite.data.pixelSource)) {
            spriteTextureUrl =
              sprite.data.pixelSource.url ?? sprite.data.pixelSource.fileName;
          } else if (Data.isEmbeddedSpriteSheetData(sprite.data.pixelSource)) {
            const pngData = sprite.data.pixelSource.pngData;
            if (pngData) {
              spriteTextureUrl = URL.createObjectURL(
                new Blob([new Uint8Array(pngData)], { type: "image/png " })
              );
            }
          }
          if (spriteTextureUrl !== undefined) {
            const spriteTexture =
              await this.textureLoader.loadAsync(spriteTextureUrl);
            spriteTexture.minFilter = NearestFilter;
            spriteTexture.magFilter = NearestFilter;
            state.resource.individualTextures?.set(spriteIndex, spriteTexture);
          }
        }
      );
      await Promise.all(pendingWork);
      state.resource.loaded = true;
      state.resource._genMaterials();
      return state.resource;
    }

    throw new Error("No sprite or URL available.");
  }
}

export type ProtoSpriteSheetThreeOpts = {
  sheet: ProtoSpriteSheet;
  sheetTexture?: Texture;
  individualTextures?: Texture[];
};

export class ProtoSpriteSheetThree {
  public sheet: ProtoSpriteSheet;
  public sheetTexture?: Texture;
  public individualTextures?: Map<number, Texture>;
  public sheetMaterial?: ShaderMaterial;
  public individualMaterials?: Map<number, ShaderMaterial>;
  public loaded = false;
  public materialsGenerated = false;
  constructor(sheet: ProtoSpriteSheet) {
    this.sheet = sheet;
  }
  dispose() {
    this.sheetTexture?.dispose();
    this.sheetTexture = undefined;
    for (const texture of this.individualTextures?.values() ?? [])
      texture.dispose();
    this.individualTextures = undefined;
    this.sheetMaterial?.dispose();
    this.sheetMaterial = undefined;
    for (const material of this.individualMaterials?.values() ?? [])
      material.dispose();
    this.individualMaterials = undefined;
    this.materialsGenerated = false;
  }
  getSprite<
    TLayers extends string | never = string,
    TAnimations extends string | never = string
  >(indexOrName?: number | string): ProtoSpriteThree<TLayers, TAnimations> {
    if (indexOrName === undefined)
      return this._createSprite(0) as ProtoSpriteThree<TLayers, TAnimations>;
    if (typeof indexOrName === "number")
      return this._createSprite(indexOrName) as ProtoSpriteThree<
        TLayers,
        TAnimations
      >;
    for (
      let sheetIndex = 0;
      sheetIndex < this.sheet.sprites.length;
      sheetIndex++
    ) {
      const sprite = this.sheet.sprites[sheetIndex];
      if (sprite.data.name === indexOrName)
        return this._createSprite(sheetIndex) as ProtoSpriteThree<
          TLayers,
          TAnimations
        >;
    }
    throw new Error(`Sprite ${indexOrName} not found in sheet.`);
  }
  _genMaterials() {
    if (this.materialsGenerated) return;
    this.materialsGenerated = true;
    if (this.sheetTexture) {
      this.sheetMaterial = this._makeMaterial(this.sheetTexture);
    }
    if (this.individualTextures !== undefined) {
      this.individualMaterials = new Map(
        [...(this.individualTextures ?? [])].map(([key, texture]) => [
          key,
          this._makeMaterial(texture)
        ])
      );
    }
  }
  private _makeMaterial(texture: Texture) {
    return new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      uniforms: {
        map: {
          value: texture
        },
        invSheetSize: {
          value: new Vector2(
            1 / texture.image.naturalWidth,
            1 / texture.image.naturalHeight
          )
        }
      }
    });
  }
  private _createSprite(spriteIndex: number) {
    const sourceSprite = this.sheet.sprites.at(spriteIndex);
    if (!sourceSprite) throw new Error("Source sprite not found.");
    const protoSpriteInstance = new ProtoSpriteInstance(sourceSprite);
    const material =
      this.individualMaterials?.get(spriteIndex) ?? this.sheetMaterial;
    if (material === undefined)
      throw new Error("Unable to resolve material for sprite.");
    return new ProtoSpriteThree(protoSpriteInstance, material);
  }
}

export type ProtoSpriteThreeLayer = {
  geom: BufferGeometry;
  material: ShaderMaterial;
  mesh: Mesh;

  indexArr: Uint16Array;
  indexArr2: Float32Array;
  posArr: Float32Array;
  uvArr: Float32Array;
  opacityArr: Float32Array;
  colorMultArr: Float32Array;
  colorFadeArr: Float32Array;
  outlineArr: Float32Array;
  outlineThicknessArr: Float32Array;
};

type ProtoSpriteLayerThreeOverride = {
  opacity?: number;
  color?: Vector4;
  fade?: Vector4;
  outline?: Vector4;
  outlineThickness?: number;
};

type StringFallback<T extends string | void> = T extends void ? string : T;

export type ProtoSpriteThreeEventTypes<
  TAnimations extends string | void = string
> = {
  animationFrameSwapped: {
    animation: StringFallback<TAnimations> | null;
    from: number;
    to: number;
  };
  animationTagStarted: {
    animation: StringFallback<TAnimations>;
  };
  animationLooped: {
    animation: StringFallback<TAnimations> | null;
  };
};

type SafeString<T extends string | void> = T extends void ? never : T;
type SafeStringIterable<T extends string | void> = Iterable<T & string>;

export class ProtoSpriteThree<
  TLayers extends string | void = string,
  TAnimations extends string | void = string
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

  constructor(
    protoSpriteInstance: ProtoSpriteInstance,
    material: ShaderMaterial
  ) {
    this.protoSpriteInstance = protoSpriteInstance;
    const texture = material.uniforms.map.value as Texture;
    this.textureSize = new Vector2(
      texture.image.naturalWidth,
      texture.image.naturalHeight
    );

    const geom = new BufferGeometry();

    const mesh = new Mesh(geom, material);
    this.mesh = mesh;

    const layerCount = this.protoSpriteInstance.sprite.countLayers();
    this.mainLayer = {
      geom,
      material,
      mesh,
      indexArr: new Uint16Array(layerCount * 6),
      indexArr2: new Float32Array(layerCount * 4),
      posArr: new Float32Array(layerCount * 12),
      uvArr: new Float32Array(layerCount * 8),
      opacityArr: new Float32Array(layerCount * 4),
      colorMultArr: new Float32Array(layerCount * 16),
      colorFadeArr: new Float32Array(layerCount * 16),
      outlineArr: new Float32Array(layerCount * 16),
      outlineThicknessArr: new Float32Array(layerCount * 4)
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

    // Stub indices since we're just rendering quads.
    const indexArr = this.mainLayer.indexArr;
    const indexArr2 = this.mainLayer.indexArr2;
    for (let i = 0; i < layerCount; i++) {
      const ii = i * 6;
      const vi = i * 4;
      indexArr[ii + 0] = vi + 0;
      indexArr[ii + 1] = vi + 1;
      indexArr[ii + 2] = vi + 3;
      indexArr[ii + 3] = vi + 1;
      indexArr[ii + 4] = vi + 2;
      indexArr[ii + 5] = vi + 3;
      indexArr2[vi + 0] = 0;
      indexArr2[vi + 1] = 1;
      indexArr2[vi + 2] = 2;
      indexArr2[vi + 3] = 3;
    }

    // Wire events.
    this.protoSpriteInstance.animationState.events.on(
      "FrameSwapped",
      this.onFrameSwapped.bind(this)
    );
    this.protoSpriteInstance.animationState.events.on(
      "LoopComplete",
      this.onAnimationLooped.bind(this)
    );

    // Perform initial geometry update.
    this.update();
  }

  dispose() {
    this.mainLayer.geom.dispose();
  }

  private onFrameSwapped({ from, to }: { from: number; to: number }) {
    if (this.protoSpriteInstance.animationState.speed > 0) {
      if (from < to) {
        for (let fi = from + 1; fi <= to; fi++) {
          const foundAnimationStart =
            this.protoSpriteInstance.sprite.maps.reverseAnimationMap.get(fi);
          if (foundAnimationStart) {
            this.events.emit("animationTagStarted", {
              animation: foundAnimationStart.name as StringFallback<TAnimations>
            });
          }
        }
      } else {
        for (
          let fi = from + 1;
          fi <=
          (this.protoSpriteInstance.animationState.currentAnimation?.indexEnd ??
            0);
          fi++
        ) {
          const foundAnimationStart =
            this.protoSpriteInstance.sprite.maps.reverseAnimationMap.get(fi);
          if (foundAnimationStart) {
            this.events.emit("animationTagStarted", {
              animation: foundAnimationStart.name as StringFallback<TAnimations>
            });
          }
        }
        for (
          let fi =
            this.protoSpriteInstance.animationState.currentAnimation
              ?.indexStart ?? 0;
          fi <= to;
          fi++
        ) {
          const foundAnimationStart =
            this.protoSpriteInstance.sprite.maps.reverseAnimationMap.get(fi);
          if (foundAnimationStart) {
            this.events.emit("animationTagStarted", {
              animation: foundAnimationStart.name as StringFallback<TAnimations>
            });
          }
        }
      }
    }
    this.events.emit("animationFrameSwapped", {
      animation: (this.protoSpriteInstance.animationState.currentAnimation
        ?.name ?? null) as StringFallback<TAnimations> | null,
      from,
      to
    });
  }

  private onAnimationLooped() {
    this.events.emit("animationLooped", {
      animation: (this.protoSpriteInstance.animationState.currentAnimation
        ?.name ?? "") as StringFallback<TAnimations>
    });
  }

  update() {
    if (this.positionDirty) {
      this.updateGeometry();
      this.positionDirty = false;
      this.extraDirty = true;
    }
    if (this.extraDirty) {
      this.updateExtra();
      this.extraDirty = false;
    }
    return this;
  }

  updateGeometry() {
    const { geom, posArr, uvArr } = this.mainLayer;

    const invWidth = 1 / this.textureSize.x;
    const invHeight = 1 / this.textureSize.y;
    const ox = this.offset.x;
    const oy = this.offset.y;

    let xMin = 0;
    let xMax = 0;
    let yMin = 0;
    let yMax = 0;

    let drawIndex = 0;
    const currentFrame = this.protoSpriteInstance.animationState.currentFrame;
    const frame = this.protoSpriteInstance.sprite.data.frames.at(currentFrame);
    if (frame === undefined) return this;
    const zAllocSet = new Set<number>();
    for (const layerFrame of frame.layers) {
      const layer = this.protoSpriteInstance.sprite.data.layers.at(
        layerFrame.layerIndex
      );
      if (
        layer === undefined ||
        layer.isGroup ||
        this.hiddenLayerNames.has(layer.name)
      )
        continue;
      let groupLayerIndex = layer.parentIndex;
      let groupHidden = false;
      while (groupLayerIndex !== undefined) {
        const groupLayer =
          this.protoSpriteInstance.sprite.data.layers.at(groupLayerIndex);
        if (groupLayer === undefined) break;
        if (this.hiddenLayerNames.has(groupLayer.name)) {
          groupHidden = true;
          break;
        }
        groupLayerIndex = groupLayer.parentIndex;
      }
      if (groupHidden) continue;

      const { size, sheetPosition, spritePosition, zIndex } = layerFrame;

      let z = layer.index * 0.05;

      // Handle z index offsets.
      if (zIndex !== 0) {
        z += zIndex * 0.05;

        // Fix for z-fighting.
        while (zAllocSet.has(z)) z += zIndex > 0 ? 0.01 : -0.01;
      }
      zAllocSet.add(z);

      const i = drawIndex++;
      const vi = i * 12;
      const uvi = i * 8;

      const x0 = ox + spritePosition.x;
      const x1 = x0 + size.width;
      const y0 = oy + spritePosition.y;
      const y1 = y0 + size.height;

      if (x0 < xMin) xMin = x0;
      if (x1 > xMax) xMax = x1;
      if (y0 < yMin) yMin = y0;
      if (y1 > yMax) yMax = y1;

      posArr[vi + 0] = x0;
      posArr[vi + 1] = y0;
      posArr[vi + 2] = z;
      posArr[vi + 3] = x1;
      posArr[vi + 4] = y0;
      posArr[vi + 5] = z;
      posArr[vi + 6] = x1;
      posArr[vi + 7] = y1;
      posArr[vi + 8] = z;
      posArr[vi + 9] = x0;
      posArr[vi + 10] = y1;
      posArr[vi + 11] = z;

      const u0 = invWidth * sheetPosition.x;
      const u1 = invWidth * (sheetPosition.x + size.width);
      const v0 = 1 - invHeight * sheetPosition.y;
      const v1 = 1 - invHeight * (sheetPosition.y + size.height);

      uvArr[uvi + 0] = u0;
      uvArr[uvi + 1] = v0;
      uvArr[uvi + 2] = u1;
      uvArr[uvi + 3] = v0;
      uvArr[uvi + 4] = u1;
      uvArr[uvi + 5] = v1;
      uvArr[uvi + 6] = u0;
      uvArr[uvi + 7] = v1;
    }

    geom.getAttribute("position").needsUpdate = true;
    geom.getAttribute("uv").needsUpdate = true;
    geom.setDrawRange(0, drawIndex * 6);

    if (geom.boundingSphere === null || geom.boundingBox === null) {
      posArr.fill(0, drawIndex * 12);
      geom.computeBoundingSphere();
      geom.computeBoundingBox();
    } else {
      geom.boundingSphere.center.set(
        (xMin + xMax) * 0.5,
        (yMin + yMax) * 0.5,
        drawIndex * 0.5
      );
      geom.boundingSphere.radius = Math.max(xMax - xMin, yMax - yMin) * 0.5;
      geom.boundingBox.min.x = xMin;
      geom.boundingBox.max.x = xMax;
      geom.boundingBox.min.y = yMin;
      geom.boundingBox.max.y = yMax;
    }
    return this;
  }

  updateExtra() {
    const {
      geom,
      opacityArr,
      colorMultArr,
      colorFadeArr,
      outlineArr,
      outlineThicknessArr
    } = this.mainLayer;

    let drawIndex = 0;
    const currentFrame = this.protoSpriteInstance.animationState.currentFrame;
    const frame = this.protoSpriteInstance.sprite.data.frames.at(currentFrame);
    if (frame === undefined) return;
    for (const layerFrame of frame.layers) {
      const layer = this.protoSpriteInstance.sprite.data.layers.at(
        layerFrame.layerIndex
      );
      if (
        layer === undefined ||
        layer.isGroup ||
        this.hiddenLayerNames.has(layer.name)
      )
        continue;
      let groupLayerIndex = layer.parentIndex;
      let groupHidden = false;
      while (groupLayerIndex !== undefined) {
        const groupLayer =
          this.protoSpriteInstance.sprite.data.layers.at(groupLayerIndex);
        if (groupLayer === undefined) break;
        if (this.hiddenLayerNames.has(groupLayer.name)) {
          groupHidden = true;
          break;
        }
        groupLayerIndex = groupLayer.parentIndex;
      }
      if (groupHidden) continue;

      const i = drawIndex++;
      const i4 = i * 4;
      const i16 = i * 16;

      const overrides = this.layerOverrides.get(layer.name ?? "*") ?? {};

      if (overrides.opacity !== undefined) {
        opacityArr[i4 + 0] = overrides.opacity;
        opacityArr[i4 + 1] = overrides.opacity;
        opacityArr[i4 + 2] = overrides.opacity;
        opacityArr[i4 + 3] = overrides.opacity;
      } else {
        opacityArr.fill(1, i4, i4 + 4);
      }

      if (overrides.color !== undefined) {
        overrides.color.toArray(colorMultArr, i16 + 0);
        overrides.color.toArray(colorMultArr, i16 + 4);
        overrides.color.toArray(colorMultArr, i16 + 8);
        overrides.color.toArray(colorMultArr, i16 + 12);
      } else {
        colorMultArr.fill(0, i16, i16 + 16);
      }

      if (overrides.fade !== undefined) {
        overrides.fade.toArray(colorFadeArr, i16 + 0);
        overrides.fade.toArray(colorFadeArr, i16 + 4);
        overrides.fade.toArray(colorFadeArr, i16 + 8);
        overrides.fade.toArray(colorFadeArr, i16 + 12);
      } else {
        colorFadeArr.fill(0, i16, i16 + 16);
      }

      if (overrides.outline !== undefined) {
        overrides.outline.toArray(outlineArr, i16 + 0);
        overrides.outline.toArray(outlineArr, i16 + 4);
        overrides.outline.toArray(outlineArr, i16 + 8);
        overrides.outline.toArray(outlineArr, i16 + 12);
      } else {
        outlineArr.fill(0, i16, i16 + 16);
      }

      if (overrides.outlineThickness !== undefined) {
        outlineThicknessArr[i4 + 0] = overrides.outlineThickness;
        outlineThicknessArr[i4 + 1] = overrides.outlineThickness;
        outlineThicknessArr[i4 + 2] = overrides.outlineThickness;
        outlineThicknessArr[i4 + 3] = overrides.outlineThickness;
      } else {
        outlineThicknessArr.fill(0, i4, i4 + 4);
      }
    }

    geom.getAttribute("vtxOpacity").needsUpdate = true;
    geom.getAttribute("vtxMultColor").needsUpdate = true;
    geom.getAttribute("vtxFadeColor").needsUpdate = true;
    geom.getAttribute("vtxOutline").needsUpdate = true;
    geom.getAttribute("vtxOutlineThickness").needsUpdate = true;
    return this;
  }

  advance(ms: number) {
    const dirty = this.protoSpriteInstance.animationState.advance(ms);
    this.positionDirty ||= dirty;
    this.update();
    return this;
  }

  gotoAnimation(animationName: SafeString<TAnimations> | null) {
    const swapped =
      this.protoSpriteInstance.animationState.startAnimation(animationName);
    this.positionDirty ||= swapped;
    this.update();
    return this;
  }

  gotoFrame(frameNumber: number) {
    this.data.animationState.gotoFrame(frameNumber);
    this.positionDirty = true;
    this.update();
    return this;
  }

  gotoAnimationFrame(frameNumber: number) {
    this.data.animationState.gotoAnimationFrame(frameNumber);
    this.positionDirty = true;
    this.update();
    return this;
  }

  setAnimationSpeed(speed: number) {
    this.data.animationState.speed = speed;
    return this;
  }

  hideLayers(...layerNames: SafeString<TLayers>[]) {
    for (const layerName of layerNames) this.hiddenLayerNames.add(layerName);
    this.positionDirty = true;
    this.update();
    return this;
  }

  showLayers(...layerNames: SafeString<TLayers>[]) {
    for (const layerName of layerNames) this.hiddenLayerNames.delete(layerName);
    this.positionDirty = true;
    this.update();
    return this;
  }

  center() {
    let frame = this.protoSpriteInstance.animationState.currentFrame;
    let currFrame: FrameData | undefined;
    let it = 0;
    while (currFrame === undefined && it++ < 512) {
      currFrame = this.protoSpriteInstance.sprite.maps.frameMap.get(frame);
      if (currFrame === undefined)
        frame =
          (frame + 1) & this.protoSpriteInstance.sprite.data.frames.length;
    }
    if (currFrame === undefined) return false;
    let xMin = -1;
    let xMax = -1;
    let yMin = -1;
    let yMax = -1;
    for (const layerFrame of currFrame.layers) {
      const layer = this.protoSpriteInstance.sprite.maps.layerMap.get(
        layerFrame.layerIndex
      );
      if (layer === undefined) continue;
      if (this.hiddenLayerNames.has(layer.name ?? "*")) continue;
      if (xMin === -1 || xMin > layerFrame.spritePosition.x)
        xMin = layerFrame.spritePosition.x;
      if (yMin === -1 || yMin > layerFrame.spritePosition.y)
        yMin = layerFrame.spritePosition.y;
      if (
        xMax === -1 ||
        xMax < layerFrame.spritePosition.x + layerFrame.size.width - 1
      )
        xMax = layerFrame.spritePosition.x + layerFrame.size.width - 1;
      if (
        yMax === -1 ||
        yMax < layerFrame.spritePosition.y + layerFrame.size.height - 1
      )
        yMax = layerFrame.spritePosition.y + layerFrame.size.height - 1;
    }
    if (xMin !== -1) {
      this.offset
        .set(xMin + xMax, yMin + yMax)
        .multiplyScalar(-1 / 2)
        .round();
    } else {
      this.offset
        .set(
          this.protoSpriteInstance.sprite.data.size.width * -0.5,
          this.protoSpriteInstance.sprite.data.size.height * -0.5
        )
        .round();
    }
    this.positionDirty = true;
    this.update();
    return true;
  }

  private expandLayerGroups(layerNames: string | Iterable<string>) {
    const layerNamesIterable =
      typeof layerNames === "string" ? [layerNames] : layerNames;
    const dataMap = this.protoSpriteInstance.sprite.maps;
    const expandedLayerNames = new Set<string>();
    const groupIndexStack: number[] = [];
    for (const layerName of layerNamesIterable) {
      const layer = dataMap.layerNameMap.get(layerName);
      if (layer === undefined) continue;
      if (layer.isGroup) {
        groupIndexStack.push(layer.index);
      } else {
        expandedLayerNames.add(layerName);
      }
    }
    while (groupIndexStack.length > 0) {
      const nextIndex = groupIndexStack.pop();
      if (nextIndex === undefined) break;
      const layer = dataMap.layerMap.get(nextIndex);
      if (layer === undefined) continue;
      expandedLayerNames.add(layer.name);
      for (const subLayer of dataMap.layerGroupsDown.get(nextIndex) ?? []) {
        groupIndexStack.push(subLayer.index);
      }
    }
    return expandedLayerNames;
  }

  setOpacity(opacity: number, doUpdate = true) {
    for (const layer of this.data.sprite.data.layers) {
      if (layer.name === undefined) continue;
      let overrides = this.layerOverrides.get(layer.name);
      if (overrides === undefined) {
        overrides = {};
        this.layerOverrides.set(layer.name, overrides);
      }
      overrides.opacity = opacity;
    }
    this.extraDirty = true;
    if (doUpdate) this.update();
    return this;
  }

  setLayerOpacity(
    opacity: number,
    layers: SafeString<TLayers> | SafeStringIterable<TLayers>,
    doUpdate = true
  ) {
    for (const layerName of this.expandLayerGroups(layers)) {
      let overrides = this.layerOverrides.get(layerName);
      if (overrides === undefined) {
        overrides = {};
        this.layerOverrides.set(layerName, overrides);
      }
      overrides.opacity = opacity;
    }
    this.extraDirty = true;
    if (doUpdate) this.update();
    return this;
  }

  fadeAllLayers(color: Color, opacity: number = 1, doUpdate = true) {
    const fade = new Vector4(color.r, color.g, color.b, opacity);
    for (const layer of this.data.sprite.data.layers) {
      if (layer.name === undefined) continue;
      let overrides = this.layerOverrides.get(layer.name);
      if (overrides === undefined) {
        overrides = {};
        this.layerOverrides.set(layer.name, overrides);
      }
      overrides.fade = fade;
    }
    this.extraDirty = true;
    if (doUpdate) this.update();
    return this;
  }

  fadeLayers(
    color: Color,
    opacity: number,
    layers: SafeString<TLayers> | SafeStringIterable<TLayers>,
    doUpdate = true
  ) {
    const fade = new Vector4(color.r, color.g, color.b, opacity);
    for (const layerName of this.expandLayerGroups(layers)) {
      let overrides = this.layerOverrides.get(layerName);
      if (overrides === undefined) {
        overrides = {};
        this.layerOverrides.set(layerName, overrides);
      }
      overrides.fade = fade;
    }
    this.extraDirty = true;
    if (doUpdate) this.update();
    return this;
  }

  multiplyAllLayers(color: Color, opacity: number = 1, doUpdate = true) {
    const fade = new Vector4(color.r, color.g, color.b, opacity);
    for (const layer of this.data.sprite.data.layers) {
      let overrides = this.layerOverrides.get(layer.name);
      if (overrides === undefined) {
        overrides = {};
        this.layerOverrides.set(layer.name, overrides);
      }
      overrides.color = fade;
    }
    this.extraDirty = true;
    if (doUpdate) this.update();
    return this;
  }

  multiplyLayers(
    color: Color,
    opacity: number,
    layers: SafeString<TLayers> | SafeStringIterable<TLayers>,
    doUpdate = true
  ) {
    const fade = new Vector4(color.r, color.g, color.b, opacity);
    for (const layerName of this.expandLayerGroups(layers)) {
      let overrides = this.layerOverrides.get(layerName);
      if (overrides === undefined) {
        overrides = {};
        this.layerOverrides.set(layerName, overrides);
      }
      overrides.color = fade;
    }
    this.extraDirty = true;
    if (doUpdate) this.update();
    return this;
  }

  outlineAllLayers(
    thickness: number,
    color: Color,
    opacity: number = 1,
    doUpdate = true
  ) {
    for (const layer of this.data.sprite.data.layers) {
      if (layer.name === undefined) continue;
      let overrides = this.layerOverrides.get(layer.name);
      if (overrides === undefined) {
        overrides = {};
        this.layerOverrides.set(layer.name, overrides);
      }
      overrides.outlineThickness = thickness;
      overrides.outline = new Vector4(color.r, color.g, color.b, opacity);
    }
    this.extraDirty = true;
    if (doUpdate) this.update();
    return this;
  }

  outlineLayers(
    thickness: number,
    color: Color,
    opacity: number,
    layers: SafeString<TLayers> | SafeStringIterable<TLayers>,
    doUpdate = true
  ) {
    const outline = new Vector4(color.r, color.g, color.b, opacity);
    for (const layerName of this.expandLayerGroups(layers)) {
      let overrides = this.layerOverrides.get(layerName);
      if (overrides === undefined) {
        overrides = {};
        this.layerOverrides.set(layerName, overrides);
      }
      overrides.outline = outline;
      overrides.outlineThickness = thickness;
    }
    this.extraDirty = true;
    if (doUpdate) this.update();
    return this;
  }

  clearLayerAdjustments() {
    this.layerOverrides.clear();
    this.extraDirty = true;
    this.update();
    return this;
  }

  getLayerOverrides() {
    return this.layerOverrides as Map<
      TLayers,
      ProtoSpriteLayerThreeOverride | undefined
    >;
  }

  getLayerBounds(layers: SafeString<TLayers> | SafeStringIterable<TLayers>) {
    const offset = this.offset;
    const bbox = new Box2();
    const expandedLayerSet = new Set(this.expandLayerGroups(layers));
    const currentFrame = this.protoSpriteInstance.animationState.currentFrame;
    const frame = this.protoSpriteInstance.sprite.data.frames.at(currentFrame);
    if (frame === undefined) return bbox;
    for (const frameLayer of frame.layers) {
      const layer = this.protoSpriteInstance.sprite.maps.layerMap.get(
        frameLayer.layerIndex
      );
      if (
        layer === undefined ||
        !expandedLayerSet.has(layer.name) ||
        layer.isGroup
      )
        continue;
      const v2 = new Vector2(
        offset.x + frameLayer.spritePosition.x,
        offset.y + frameLayer.spritePosition.y
      );
      bbox.expandByPoint(v2);
      v2.x += frameLayer.size.width - 1;
      v2.y += frameLayer.size.height - 1;
      bbox.expandByPoint(v2);
    }
    return bbox;
  }

  clone() {
    const cloned = new ProtoSpriteThree<TLayers, TAnimations>(
      this.protoSpriteInstance,
      this.mainLayer.material
    );
    cloned.offset = this.offset.clone();
    for (const hiddenLayerName of this.hiddenLayerNames) {
      cloned.hiddenLayerNames.add(hiddenLayerName);
    }
    for (const [layerName, overrides] of this.layerOverrides) {
      cloned.layerOverrides.set(layerName, {
        ...overrides
      });
    }
    cloned.extraDirty = true;
    if (this.data.animationState.currentAnimation) {
      cloned.gotoAnimation(
        this.data.animationState.currentAnimation
          .name as SafeString<TAnimations>
      );
    }
    cloned.gotoFrame(this.data.animationState.currentFrame);
    return cloned;
  }

  get size() {
    return new Vector2(
      this.protoSpriteInstance.sprite.data.size.width,
      this.protoSpriteInstance.sprite.data.size.height
    );
  }

  get data() {
    return this.protoSpriteInstance;
  }
}
