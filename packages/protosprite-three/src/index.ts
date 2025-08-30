import {
  Data,
  ProtoSpriteInstance,
  ProtoSpriteSheet
} from "protosprite-core";
import {
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

import { LayerData } from "../../protosprite-core/dist/src/core/data.js";
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
  getSprite(indexOrName?: number | string) {
    if (indexOrName === undefined) return this._createSprite(0);
    if (typeof indexOrName === "number") return this._createSprite(indexOrName);
    for (
      let sheetIndex = 0;
      sheetIndex < this.sheet.sprites.length;
      sheetIndex++
    ) {
      const sprite = this.sheet.sprites[sheetIndex];
      if (sprite.data.name === indexOrName)
        return this._createSprite(sheetIndex);
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

export class ProtoSpriteThree {
  public mesh: Mesh;

  private protoSpriteInstance: ProtoSpriteInstance;
  private textureSize: Vector2;
  private mainLayer: ProtoSpriteThreeLayer;
  private positionDirty = true;
  private extraDirty = true;
  private offset = new Vector2();

  private hiddenLayerNames = new Set<string>();
  private layerOverrides = new Map<string, ProtoSpriteLayerThreeOverride>();

  constructor(protoSpriteInstance: ProtoSpriteInstance, material: ShaderMaterial) {
    this.protoSpriteInstance = protoSpriteInstance;
    const texture = (material.uniforms.map.value as Texture);
    this.textureSize = new Vector2(texture.image.naturalWidth, texture.image.naturalHeight);

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
    const currentFrame = this.protoSpriteInstance.animationState.currentFrame;
    const frame = this.protoSpriteInstance.sprite.data.frames.at(currentFrame);
    if (frame === undefined) return;
    for (const layerFrame of frame.layers) {
      const layer = this.protoSpriteInstance.sprite.data.layers.at(
        layerFrame.layerIndex
      );
      if (layer === undefined || layer.isGroup) continue;
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

      const { size, sheetPosition, spritePosition } = layerFrame;
      const z = layer.index;

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
    const currentFrame = this.protoSpriteInstance.animationState.currentFrame;
    const frame = this.protoSpriteInstance.sprite.data.frames.at(currentFrame);
    if (frame === undefined) return;
    for (const layerFrame of frame.layers) {
      const layer = this.protoSpriteInstance.sprite.data.layers.at(
        layerFrame.layerIndex
      );
      if (layer === undefined || layer.isGroup) continue;
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
  }

  advance(ms: number) {
    this.positionDirty ||= this.protoSpriteInstance.animationState.advance(ms);
    return this;
  }

  gotoAnimation(animationName: string | null) {
    const swapped = this.protoSpriteInstance.animationState.startAnimation(animationName);
    this.positionDirty ||= swapped;
    return this;
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
    const currFrame = this.protoSpriteInstance.sprite.maps.frameMap.get(
      this.protoSpriteInstance.animationState.currentFrame
    );
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
    }
    this.positionDirty = true;
    this.updateGeometry();
    return true;
  }

  private expandLayerGroups(layerNames: Iterable<string>) {
    const dataMap = this.protoSpriteInstance.sprite.maps;
    const expandedLayerNames = new Set<string>();
    const groupIndexStack: number[] = [];
    for (const layerName of layerNames) {
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

  setOpacity(opacity: number) {
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
    return this;
  }

  setLayerOpacity(opacity: number, layers: Iterable<string>) {
    for (const layerName of this.expandLayerGroups(layers)) {
      let overrides = this.layerOverrides.get(layerName);
      if (overrides === undefined) {
        overrides = {};
        this.layerOverrides.set(layerName, overrides);
      }
      overrides.opacity = opacity;
    }
    this.extraDirty = true;
    return this;
  }

  fadeAllLayers(color: Color, opacity: number = 1) {
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
    return this;
  }

  fadeLayers(color: Color, opacity: number, layers: Iterable<string>) {
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
    return this;
  }

  multiplyAllLayers(color: Color, opacity: number = 1) {
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
    return this;
  }

  multiplyLayers(color: Color, opacity: number, layers: Iterable<string>) {
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
    return this;
  }

  outlineAllLayers(thickness: number, color: Color, opacity: number = 1) {
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
    return this;
  }

  outlineLayers(
    thickness: number,
    color: Color,
    opacity: number,
    layers: Iterable<string>
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
    return this;
  }

  clearLayerAdjustments() {
    this.layerOverrides.clear();
    this.extraDirty = true;
    return this;
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
