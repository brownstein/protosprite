// rollup.config.js
import typescript from "@rollup/plugin-typescript";

export default {
  input: {
    core: "src/core/index.ts",
    "importers/aseprite": "src/importers/aseprite.ts",
    "importers/aseprite-file": "src/importers/aseprite-file.ts",
    transform: "src/transform/index.ts",
    // The jimp-free entry. Kept separate so a browser bundle can reach the
    // packer without pulling an image library in behind it.
    "transform/raw": "src/transform/raw.ts"
  },
  output: {
    dir: "dist",
    format: "es",
    paths: {
      "protobufjs/minimal": "protobufjs/minimal.js"
    },
    sourcemap: true,
    preserveModules: true
  },
  plugins: [typescript()]
};
