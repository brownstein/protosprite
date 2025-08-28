// rollup.config.js
import typescript from "@rollup/plugin-typescript";

export default {
  input: {
    core: "src/core/index.ts",
    "importers/aseprite": "src/importers/aseprite.ts",
    transform: "src/transform/index.ts"
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
