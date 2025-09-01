import { Data } from "protosprite-core";

export function genTypeDefinitions(sheet: Data.SpriteSheetData) {
  let autoIndex = 1;
  const reservedNames = new Set<string>();
  return sheet.sprites
    .map((sprite) => {
      const name = sprite.name === "" ? "sprite" : sprite.name;
      let typeBaseName = name.replaceAll(/[^a-zA-Z0-9]+/g, "");
      while (reservedNames.has(typeBaseName)) {
        typeBaseName = `${typeBaseName}_${autoIndex++}`;
      }
      const layersStr =
        sprite.layers.length > 0
          ? sprite.layers.map((layer) => JSON.stringify(layer.name)).join(" | ")
          : "never";
      const animationsStr =
        sprite.animations.length > 0
          ? sprite.animations
              .map((animation) => JSON.stringify(animation.name))
              .join(" | ")
          : "never";
      return [
        `export type ${typeBaseName}_layers = ${layersStr};`,
        `export type ${typeBaseName}_animations = ${animationsStr};`
      ].join("\n");
    })
    .join("\n\n");
}
