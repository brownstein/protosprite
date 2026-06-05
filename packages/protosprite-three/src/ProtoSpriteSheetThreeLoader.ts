import { Data, ProtoSpriteSheet } from "protosprite-core";
import { NearestFilter, TextureLoader } from "three";

import { ProtoSpriteSheetThree } from "./ProtoSpriteSheetThree.js";

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
