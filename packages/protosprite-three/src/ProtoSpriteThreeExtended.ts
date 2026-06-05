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
import {
  ProtoSpriteLayerThreeOverride,
  ProtoSpriteThreeLayer
} from "./ProtoSpriteThree.js";

/**
 * A SliceRegion maps a rectangular source area of the sprite onto a rectangular
 * output area of the rendered mesh, optionally stretching it (independent x/y
 * scale). Supplying a grid of regions lets a single sprite be drawn like a
 * 9-part sliced box model: corner regions keep their size, edge/center regions
 * stretch to fill.
 *
 * - srcPos / srcSize: the source rectangle, in sprite-pixel space (same units
 *   as a layer's spritePosition). Every layer is clipped to this rectangle.
 * - outPos / outSize: the destination rectangle, in the mesh's local output
 *   space. The existing center() offset is still applied on top.
 */
export type SliceRegion<T extends string = string> = {
  id: T;
  srcPos: Vector2;
  srcSize: Vector2;
  outPos: Vector2;
  outSize: Vector2;
};

export class ProtoSpriteThreeExtended<
  TLayers extends string | void = string,
  TAnimations extends string | void = string,
  TRegions extends string = "main"
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

  constructor(
    protoSpriteInstance: ProtoSpriteInstance,
    material: ShaderMaterial,
    regions?: SliceRegion<TRegions>[]
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

    // Allocate the geometry buffers for the supplied regions (or a single
    // identity region that reproduces plain ProtoSpriteThree behaviour).
    this.mainLayer = {
      geom,
      material,
      mesh,
      indexArr: new Uint16Array(0),
      indexArr2: new Float32Array(0),
      posArr: new Float32Array(0),
      uvArr: new Float32Array(0),
      opacityArr: new Float32Array(0),
      colorMultArr: new Float32Array(0),
      colorFadeArr: new Float32Array(0),
      outlineArr: new Float32Array(0),
      outlineThicknessArr: new Float32Array(0)
    };
    this.allocateBuffers(regions ?? [this.defaultRegion()]);

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

  /**
   * Identity region covering the whole sprite. Source == output, so a sprite
   * drawn through it renders exactly like ProtoSpriteThree.
   */
  private defaultRegion(): SliceRegion<TRegions> {
    const { width, height } = this.protoSpriteInstance.sprite.data.size;
    return {
      id: "main" as TRegions,
      srcPos: new Vector2(0, 0),
      srcSize: new Vector2(width, height),
      outPos: new Vector2(0, 0),
      outSize: new Vector2(width, height)
    };
  }

  /**
   * (Re)allocates the geometry buffers for the given regions. Each visible
   * layer can emit one quad per region, so the buffers are sized to
   * layerCount * regionCount quads. Safe to call whenever the region count
   * changes.
   */
  private allocateBuffers(regions: SliceRegion<TRegions>[]) {
    this.regions = regions;

    const geom = this.mainLayer.geom;
    const layerCount = this.protoSpriteInstance.sprite.countLayers();
    const quadCount = layerCount * this.regions.length;

    this.mainLayer.indexArr = new Uint16Array(quadCount * 6);
    this.mainLayer.indexArr2 = new Float32Array(quadCount * 4);
    this.mainLayer.posArr = new Float32Array(quadCount * 12);
    this.mainLayer.uvArr = new Float32Array(quadCount * 8);
    this.mainLayer.opacityArr = new Float32Array(quadCount * 4);
    this.mainLayer.colorMultArr = new Float32Array(quadCount * 16);
    this.mainLayer.colorFadeArr = new Float32Array(quadCount * 16);
    this.mainLayer.outlineArr = new Float32Array(quadCount * 16);
    this.mainLayer.outlineThicknessArr = new Float32Array(quadCount * 4);

    // Initialize buffer attributes.
    geom.setIndex(new BufferAttribute(this.mainLayer.indexArr, 1));
    geom.setDrawRange(0, 0);
    geom.setAttribute("position", new BufferAttribute(this.mainLayer.posArr, 3));
    geom.setAttribute("uv", new BufferAttribute(this.mainLayer.uvArr, 2));
    geom.setAttribute(
      "vtxIndex",
      new BufferAttribute(this.mainLayer.indexArr2, 1)
    );
    geom.setAttribute(
      "vtxOpacity",
      new BufferAttribute(this.mainLayer.opacityArr, 1)
    );
    geom.setAttribute(
      "vtxMultColor",
      new BufferAttribute(this.mainLayer.colorMultArr, 4)
    );
    geom.setAttribute(
      "vtxFadeColor",
      new BufferAttribute(this.mainLayer.colorFadeArr, 4)
    );
    geom.setAttribute(
      "vtxOutline",
      new BufferAttribute(this.mainLayer.outlineArr, 4)
    );
    geom.setAttribute(
      "vtxOutlineThickness",
      new BufferAttribute(this.mainLayer.outlineThicknessArr, 1)
    );

    // Prefill opacity at 1.
    this.mainLayer.opacityArr.fill(1);

    // Stub indices since we're just rendering quads.
    const indexArr = this.mainLayer.indexArr;
    const indexArr2 = this.mainLayer.indexArr2;
    for (let i = 0; i < quadCount; i++) {
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

    // Buffers were resized; force a full geometry rebuild.
    geom.boundingSphere = null;
    geom.boundingBox = null;
    this.positionDirty = true;
    this.extraDirty = true;
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

    // Figure out z indices.
    const zAllocSet = new Set<number>();
    const layerIndexToZ = new Map<number, number>();
    for (const layerFrame of frame.layers) {
      const layer = this.protoSpriteInstance.sprite.data.layers.at(
        layerFrame.layerIndex
      );
      if (layer === undefined) continue;
      const zIndex = layerFrame.zIndex;
      let z = layer.index * 0.05;

      // Handle z index offsets.
      if (zIndex !== 0) {
        z += zIndex * 0.05;
        // Fix for z-fighting.
        while (zAllocSet.has(z)) z += zIndex > 0 ? 0.01 : -0.01;
      }
      zAllocSet.add(z);
      layerIndexToZ.set(layerFrame.layerIndex, z);
    }

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

      const { size, sheetPosition, spritePosition } = layerFrame;
      const z = layerIndexToZ.get(layerFrame.layerIndex) ?? 0;

      // The layer's footprint in sprite-pixel space.
      const lx0 = spritePosition.x;
      const ly0 = spritePosition.y;
      const lx1 = lx0 + size.width;
      const ly1 = ly0 + size.height;

      // One quad per region, clipping the layer to each region's source rect
      // and affine-mapping the surviving piece into the region's output rect.
      for (const region of this.regions) {
        const i = drawIndex++;
        const vi = i * 12;
        const uvi = i * 8;

        const rsw = region.srcSize.x;
        const rsh = region.srcSize.y;
        const rx0 = region.srcPos.x;
        const ry0 = region.srcPos.y;
        const rx1 = rx0 + rsw;
        const ry1 = ry0 + rsh;

        // Clip the layer footprint against the region source rect.
        const cx0 = Math.max(lx0, rx0);
        const cy0 = Math.max(ly0, ry0);
        const cx1 = Math.min(lx1, rx1);
        const cy1 = Math.min(ly1, ry1);

        if (cx1 <= cx0 || cy1 <= cy0 || rsw <= 0 || rsh <= 0) {
          // No overlap (or degenerate source). Emit a zero-area quad so the
          // geometry and attribute buffers stay index-aligned with updateExtra.
          posArr.fill(0, vi, vi + 12);
          uvArr.fill(0, uvi, uvi + 8);
          continue;
        }

        // Affine map: sprite coord -> output coord within this region.
        const scaleX = region.outSize.x / rsw;
        const scaleY = region.outSize.y / rsh;
        const opx = ox + region.outPos.x;
        const opy = oy + region.outPos.y;

        const x0 = opx + (cx0 - rx0) * scaleX;
        const x1 = opx + (cx1 - rx0) * scaleX;
        const y0 = opy + (cy0 - ry0) * scaleY;
        const y1 = opy + (cy1 - ry0) * scaleY;

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

        // Sheet UVs come from the clipped source sub-rect. The sprite->sheet
        // mapping is a 1:1 translation: sheet = sheetPosition + (sprite - lx0).
        const shx0 = sheetPosition.x + (cx0 - lx0);
        const shx1 = sheetPosition.x + (cx1 - lx0);
        const shy0 = sheetPosition.y + (cy0 - ly0);
        const shy1 = sheetPosition.y + (cy1 - ly0);

        const u0 = invWidth * shx0;
        const u1 = invWidth * shx1;
        const v0 = 1 - invHeight * shy0;
        const v1 = 1 - invHeight * shy1;

        uvArr[uvi + 0] = u0;
        uvArr[uvi + 1] = v0;
        uvArr[uvi + 2] = u1;
        uvArr[uvi + 3] = v0;
        uvArr[uvi + 4] = u1;
        uvArr[uvi + 5] = v1;
        uvArr[uvi + 6] = u0;
        uvArr[uvi + 7] = v1;
      }
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

    const regionCount = this.regions.length;

    let drawIndex = 0;
    const currentFrame = this.protoSpriteInstance.animationState.currentFrame;
    const frame = this.protoSpriteInstance.sprite.data.frames.at(currentFrame);
    if (frame === undefined) return this;
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

      const overrides = this.layerOverrides.get(layer.name ?? "*") ?? {};

      // Overrides are per-layer, so every region quad of this layer shares them.
      for (let r = 0; r < regionCount; r++) {
        const i = drawIndex++;
        const i4 = i * 4;
        const i16 = i * 16;

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
    }

    geom.getAttribute("vtxOpacity").needsUpdate = true;
    geom.getAttribute("vtxMultColor").needsUpdate = true;
    geom.getAttribute("vtxFadeColor").needsUpdate = true;
    geom.getAttribute("vtxOutline").needsUpdate = true;
    geom.getAttribute("vtxOutlineThickness").needsUpdate = true;
    return this;
  }

  /**
   * Replaces the slice regions. Reallocates geometry buffers when the region
   * count changes; otherwise reuses them and just rebuilds geometry. Mutating
   * an existing region's rects in place and calling update() also works for the
   * common case (e.g. resizing a 9-slice box).
   */
  setRegions(regions: SliceRegion<TRegions>[]) {
    if (regions.length === this.regions.length) {
      this.regions = regions;
      this.positionDirty = true;
    } else {
      this.allocateBuffers(regions);
    }
    this.update();
    return this;
  }

  getRegions(): SliceRegion<TRegions>[] {
    return this.regions;
  }

  getRegion(id: TRegions): SliceRegion<TRegions> | undefined {
    return this.regions.find((region) => region.id === id);
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

  getAnimation(): SafeString<TAnimations> | null {
    return (
      (this.protoSpriteInstance.animationState.currentAnimation?.name as
        | SafeString<TAnimations>
        | undefined) ?? null
    );
  }

  gotoFrame(frameNumber: number) {
    this.data.animationState.gotoFrame(frameNumber);
    this.positionDirty = true;
    this.update();
    return this;
  }

  getFrame() {
    return this.protoSpriteInstance.animationState.currentFrame;
  }

  gotoAnimationFrame(frameNumber: number) {
    this.data.animationState.gotoAnimationFrame(frameNumber);
    this.positionDirty = true;
    this.update();
    return this;
  }

  getAnimationFrame() {
    return (
      this.protoSpriteInstance.animationState.currentFrame -
      (this.protoSpriteInstance.animationState.currentAnimation?.indexStart ??
        0)
    );
  }

  setAnimationSpeed(speed: number) {
    this.data.animationState.speed = speed;
    return this;
  }

  getAnimationSpeed() {
    return this.data.animationState.speed;
  }

  setAnimationLooping(loop: boolean) {
    this.data.animationState.loop = loop;
    return this;
  }

  getAnimationLooping() {
    return this.data.animationState.loop;
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
    const clonedRegions = this.regions.map((region) => ({
      id: region.id,
      srcPos: region.srcPos.clone(),
      srcSize: region.srcSize.clone(),
      outPos: region.outPos.clone(),
      outSize: region.outSize.clone()
    }));
    const cloned = new ProtoSpriteThreeExtended<
      TLayers,
      TAnimations,
      TRegions
    >(
      new ProtoSpriteInstance(this.protoSpriteInstance.sprite),
      this.mainLayer.material,
      clonedRegions
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

  get centerOffset(): Vector2 {
    return this.offset;
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
