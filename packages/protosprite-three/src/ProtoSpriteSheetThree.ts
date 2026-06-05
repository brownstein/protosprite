import { ProtoSpriteInstance, ProtoSpriteSheet } from "protosprite-core";
import { ShaderMaterial, Texture, Vector2 } from "three";

import { ProtoSpriteThree } from "./ProtoSpriteThree.js";
import fragmentShader from "./shader.frag";
import vertexShader from "./shader.vert";

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
