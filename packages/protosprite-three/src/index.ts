import { fromBinary } from "@bufbuild/protobuf";
import EventEmitter from "events";
import {
  ProtoSpriteInstance,
  ProtoSpriteLayer,
  ProtoSpriteSheet,
  Vector
} from "protosprite-core";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  ShaderMaterial,
  Texture,
  TextureLoader,
  Vector2,
  Vector4
} from "three";

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
      const sheet = ProtoSpriteSheet.fromBuffer(rawBuff);
      state.sheet = sheet;
    }
    if (state.sheet) {
      state.resource = new ProtoSpriteSheetThree(state.sheet);
      const sheetTextureUrl =
        state.sheet.pixelSource?.url ?? state.sheet.pixelSource?.fileName;
      const sheetPngBytes = state.sheet.pixelSource?.pngBytes;
      if (sheetPngBytes) {
        state.resource.sheetTexture = await this.textureLoader.loadAsync(
          URL.createObjectURL(
            new Blob([new Uint8Array(sheetPngBytes)], {
              type: "image/png"
            })
          )
        );
        state.resource.sheetTexture.minFilter = NearestFilter;
        state.resource.sheetTexture.magFilter = NearestFilter;
      } else if (sheetTextureUrl && sheetTextureUrl !== "") {
        state.resource.sheetTexture =
          await this.textureLoader.loadAsync(sheetTextureUrl);
        state.resource.sheetTexture.minFilter = NearestFilter;
        state.resource.sheetTexture.magFilter = NearestFilter;
      }
      const pendingWork = state.sheet.sprites.map(
        async (sprite, spriteIndex) => {
          if (!state.resource) return;
          const spriteTextureUrl =
            sprite.pixelSource?.url ?? sprite.pixelSource?.fileName;
          const spritePngBytes = sprite.pixelSource?.pngBytes;
          let spriteTexture;
          if (spritePngBytes) {
            spriteTexture = await this.textureLoader.loadAsync(
              URL.createObjectURL(
                new Blob([new Uint8Array(spritePngBytes)], {
                  type: "image/png"
                })
              )
            );
          } else if (spriteTextureUrl && spriteTextureUrl !== "") {
            spriteTexture =
              await this.textureLoader.loadAsync(spriteTextureUrl);
          }
          if (!spriteTexture) return;
          spriteTexture.minFilter = NearestFilter;
          spriteTexture.magFilter = NearestFilter;
          if (state.resource.individualTextures === undefined)
            state.resource.individualTextures = new Map();
          state.resource.individualTextures.set(spriteIndex, spriteTexture);
        }
      );
      await Promise.all(pendingWork);
      state.resource.loaded = true;
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
  public loaded = false;
  constructor(sheet: ProtoSpriteSheet) {
    this.sheet = sheet;
  }
  getSprite(indexOrName?: number | string) {
    if (indexOrName === undefined) return this._createSprite(0);
    if (typeof indexOrName === "number") return this._createSprite(indexOrName);
    for (
      let sheetIndex = 0;
      sheetIndex < this.sheet.sprites.length;
      sheetIndex++
    ) {
      const sprite = this.sheet.sprites[sheetIndex];
      if (sprite.name === indexOrName) return this._createSprite(sheetIndex);
    }
    throw new Error(`Sprite ${indexOrName} not found in sheet.`);
  }

  private _createSprite(spriteIndex: number) {
    const sourceSprite = this.sheet.sprites.at(spriteIndex);
    if (!sourceSprite) throw new Error("Source sprite not found.");
    const protoSpriteInstance = sourceSprite.createInstance();
    const texture =
      this.individualTextures?.get(spriteIndex) ?? this.sheetTexture;
    if (texture === undefined)
      throw new Error("Unable to resolve texture for sprite.");
    return new ProtoSpriteThree(protoSpriteInstance, texture);
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

export class ProtoSpriteThree {
  public mesh: Mesh;

  private protoSpriteInstance: ProtoSpriteInstance;
  private texture: Texture;
  private textureSize: Vector2;
  private mainLayer: ProtoSpriteThreeLayer;
  private positionDirty = true;
  private extraDirty = true;
  private offset = new Vector2();

  private hiddenLayerNames = new Set<string>();
  private layerOverrides = new Map<string, ProtoSpriteLayerThreeOverride>();

  constructor(protoSpriteInstance: ProtoSpriteInstance, texture: Texture) {
    this.protoSpriteInstance = protoSpriteInstance;
    this.texture = texture;
    this.textureSize = new Vector2(
      (this.texture.image as HTMLImageElement).naturalWidth,
      (this.texture.image as HTMLImageElement).naturalHeight
    );

    const geom = new BufferGeometry();
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      uniforms: {
        map: {
          value: texture
        },
        opacity: {
          value: 1
        },
        invSheetSize: {
          value: new Vector2(1 / this.textureSize.x, 1 / this.textureSize.y)
        }
      }
    });

    const mesh = new Mesh(geom, material);
    this.mesh = mesh;

    const layerCount = this.protoSpriteInstance.data.layers.length;
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

    this.mesh.onBeforeRender = () => {
      if (this.positionDirty) {
        this.updateGeometry();
        this.positionDirty = false;
        this.extraDirty = true;
      }
      if (this.extraDirty) {
        this.updateExtra();
        this.extraDirty = false;
      }
    };

    this.updateGeometry();
    this.updateExtra();
  }

  private updateGeometry() {
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
    this.protoSpriteInstance.forEachLayerOfCurrentFrame((layerFrame) => {
      const layer = layerFrame.layer;
      if (layer === undefined) return;

      let group: ProtoSpriteLayer | undefined = layer;
      while (group !== undefined) {
        if (this.hiddenLayerNames.has(group.name ?? "*")) return;
        group = group.parent;
      }

      const spriteBBox = layerFrame.spriteBBox;
      const srcBBox = layerFrame.sheetBBox;
      const z = layer.index ?? 0;

      const i = drawIndex++;

      const vi = i * 12;
      const uvi = i * 8;

      const x0 = ox + spriteBBox.x;
      const x1 = x0 + spriteBBox.width;
      const y0 = oy + spriteBBox.y;
      const y1 = y0 + spriteBBox.height;

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

      const u0 = invWidth * srcBBox.x;
      const u1 = invWidth * (srcBBox.x + srcBBox.width);
      const v0 = 1 - invHeight * srcBBox.y;
      const v1 = 1 - invHeight * (srcBBox.y + srcBBox.height);

      uvArr[uvi + 0] = u0;
      uvArr[uvi + 1] = v0;
      uvArr[uvi + 2] = u1;
      uvArr[uvi + 3] = v0;
      uvArr[uvi + 4] = u1;
      uvArr[uvi + 5] = v1;
      uvArr[uvi + 6] = u0;
      uvArr[uvi + 7] = v1;
    });

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
        this.protoSpriteInstance.data.layers.length * 0.5
      );
      geom.boundingSphere.radius = Math.max(xMax - xMin, yMax - yMin) * 0.5;
      geom.boundingBox.min.x = xMin;
      geom.boundingBox.max.x = xMax;
      geom.boundingBox.min.y = yMin;
      geom.boundingBox.max.y = yMax;
    }
  }

  private updateExtra() {
    const {
      geom,
      opacityArr,
      colorMultArr,
      colorFadeArr,
      outlineArr,
      outlineThicknessArr
    } = this.mainLayer;

    let drawIndex = 0;
    this.protoSpriteInstance.forEachLayerOfCurrentFrame((layerFrame) => {
      const layer = layerFrame.layer;
      if (layer === undefined) return;

      let group: ProtoSpriteLayer | undefined = layer;
      while (group !== undefined) {
        if (this.hiddenLayerNames.has(group.name ?? "*")) return;
        group = group.parent;
      }

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
    });

    geom.getAttribute("vtxOpacity").needsUpdate = true;
    geom.getAttribute("vtxMultColor").needsUpdate = true;
    geom.getAttribute("vtxFadeColor").needsUpdate = true;
    geom.getAttribute("vtxOutline").needsUpdate = true;
    geom.getAttribute("vtxOutlineThickness").needsUpdate = true;
  }

  advance(ms: number) {
    this.positionDirty ||= this.protoSpriteInstance.advanceByDuration(ms);
    return this;
  }

  gotoAnimation(animationName: string | null) {
    const swapped = this.protoSpriteInstance.switchToAnimation(animationName);
    this.positionDirty ||= swapped ?? false;
    return swapped;
  }

  hideLayers(...layerNames: string[]) {
    for (const layerName of layerNames) this.hiddenLayerNames.add(layerName);
    this.positionDirty = true;
    return this;
  }

  showLayers(...layerNames: string[]) {
    for (const layerName of layerNames) this.hiddenLayerNames.delete(layerName);
    this.positionDirty = true;
    return this;
  }

  center() {
    const currFrame = this.protoSpriteInstance.data.frame(
      this.protoSpriteInstance.currentFrame
    );
    if (currFrame === undefined) return false;
    let xMin = -1;
    let xMax = -1;
    let yMin = -1;
    let yMax = -1;
    for (const layerFrame of currFrame.indexedLayers.values()) {
      const layer = layerFrame.layer;
      if (layer === undefined) continue;
      if (this.hiddenLayerNames.has(layer.name ?? "*")) continue;
      if (xMin === -1 || xMin > layerFrame.spriteBBox.x)
        xMin = layerFrame.spriteBBox.x;
      if (yMin === -1 || yMin > layerFrame.spriteBBox.y)
        yMin = layerFrame.spriteBBox.y;
      if (
        xMax === -1 ||
        xMax < layerFrame.spriteBBox.x + layerFrame.spriteBBox.width - 1
      )
        xMax = layerFrame.spriteBBox.x + layerFrame.spriteBBox.width - 1;
      if (
        yMax === -1 ||
        yMax < layerFrame.spriteBBox.y + layerFrame.spriteBBox.height - 1
      )
        yMax = layerFrame.spriteBBox.y + layerFrame.spriteBBox.height - 1;
    }
    if (xMin !== -1) {
      this.offset
        .set(xMin + xMax, yMin + yMax)
        .multiplyScalar(-1 / 2)
        .round();
    }
    this.positionDirty = true;
    this.updateGeometry();
    return true;
  }

  setOpacity(opacity: number) {
    this.mainLayer.material.uniforms.opacity.value = opacity;
    this.mainLayer.material.uniformsNeedUpdate = true;
    return this;
  }

  setLayerOpacity(opacity: number, layers: Iterable<string>) {
    const layerWhitelist = new Set(layers);
    const expandGroup = (layer: ProtoSpriteLayer) => {
      if (layer.name === undefined) return;
      layerWhitelist.add(layer.name);
      layer.children.forEach(expandGroup);
    };
    for (const layer of this.data.data.layers) {
      if (layer.name === undefined) continue;
      if (!layerWhitelist.has(layer.name)) continue;
      expandGroup(layer);
    }
    for (const layer of this.data.data.layers) {
      if (layer.name === undefined) continue;
      if (!layerWhitelist.has(layer.name)) continue;
      let overrides = this.layerOverrides.get(layer.name);
      if (overrides === undefined) {
        overrides = {};
        this.layerOverrides.set(layer.name, overrides);
      }
      overrides.opacity = opacity;
    }
    this.extraDirty = true;
  }

  fadeAllLayers(color: Color, opacity: number = 1) {
    const fade = new Vector4(color.r, color.g, color.b, opacity);
    for (const layer of this.data.data.layers) {
      if (layer.name === undefined) continue;
      let overrides = this.layerOverrides.get(layer.name);
      if (overrides === undefined) {
        overrides = {};
        this.layerOverrides.set(layer.name, overrides);
      }
      overrides.fade = fade;
    }
    this.extraDirty = true;
    return this;
  }

  fadeLayers(color: Color, opacity: number, layers: Iterable<string>) {
    const layerWhitelist = new Set(layers);
    const expandGroup = (layer: ProtoSpriteLayer) => {
      if (layer.name === undefined) return;
      layerWhitelist.add(layer.name);
      layer.children.forEach(expandGroup);
    };
    for (const layer of this.data.data.layers) {
      if (layer.name === undefined) continue;
      if (!layerWhitelist.has(layer.name)) continue;
      expandGroup(layer);
    }
    const fade = new Vector4(color.r, color.g, color.b, opacity);
    for (const layer of this.data.data.layers) {
      if (layer.name === undefined) continue;
      if (!layerWhitelist.has(layer.name)) continue;
      let overrides = this.layerOverrides.get(layer.name);
      if (overrides === undefined) {
        overrides = {};
        this.layerOverrides.set(layer.name, overrides);
      }
      overrides.fade = fade;
    }
    this.extraDirty = true;
    return this;
  }

  multiplyAllLayers(color: Color, opacity: number = 1) {
    const fade = new Vector4(color.r, color.g, color.b, opacity);
    for (const layer of this.data.data.layers) {
      if (layer.name === undefined) continue;
      let overrides = this.layerOverrides.get(layer.name);
      if (overrides === undefined) {
        overrides = {};
        this.layerOverrides.set(layer.name, overrides);
      }
      overrides.color = fade;
    }
    this.extraDirty = true;
    return this;
  }

  multiplyLayers(color: Color, opacity: number, layers: Iterable<string>) {
    const layerWhitelist = new Set(layers);
    const fade = new Vector4(color.r, color.g, color.b, opacity);
    const expandGroup = (layer: ProtoSpriteLayer) => {
      if (layer.name === undefined) return;
      layerWhitelist.add(layer.name);
      layer.children.forEach(expandGroup);
    };
    for (const layer of this.data.data.layers) {
      if (layer.name === undefined) continue;
      if (!layerWhitelist.has(layer.name)) continue;
      expandGroup(layer);
    }
    for (const layer of this.data.data.layers) {
      if (layer.name === undefined) continue;
      if (!layerWhitelist.has(layer.name)) continue;
      let overrides = this.layerOverrides.get(layer.name);
      if (overrides === undefined) {
        overrides = {};
        this.layerOverrides.set(layer.name, overrides);
      }
      overrides.color = fade;
    }
    this.extraDirty = true;
    return this;
  }

  outlineAllLayers(thickness: number, color: Color, opacity: number = 1) {
    for (const layer of this.data.data.layers) {
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
    return this;
  }

  outlineLayers(
    thickness: number,
    color: Color,
    opacity: number,
    layers: Iterable<string>
  ) {
    const layerWhitelist = new Set(layers);
    const expandGroup = (layer: ProtoSpriteLayer) => {
      if (layer.name === undefined) return;
      layerWhitelist.add(layer.name);
      layer.children.forEach(expandGroup);
    };
    for (const layer of this.data.data.layers) {
      if (layer.name === undefined) continue;
      if (!layerWhitelist.has(layer.name)) continue;
      expandGroup(layer);
    }
    for (const layer of this.data.data.layers) {
      if (layer.name === undefined) continue;
      if (!layerWhitelist.has(layer.name)) continue;
      let overrides = this.layerOverrides.get(layer.name);
      if (overrides === undefined) {
        overrides = {};
        this.layerOverrides.set(layer.name, overrides);
      }
      overrides.outlineThickness = thickness;
      overrides.outline = new Vector4(color.r, color.g, color.b, opacity);
    }
    this.extraDirty = true;
    return this;
  }

  clearLayerAdjustments() {
    this.layerOverrides.clear();
    this.extraDirty = true;
    return this;
  }

  get size() {
    return new Vector2(
      this.protoSpriteInstance.data.center.x * 2,
      this.protoSpriteInstance.data.center.y * 2
    );
  }

  get data() {
    return this.protoSpriteInstance;
  }
}
