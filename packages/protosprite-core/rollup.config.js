// rollup.config.js
import typescript from "@rollup/plugin-typescript";

export default {
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "es",
    paths: {
      "protobufjs/minimal": "protobufjs/minimal.js"
    },
    sourcemap: true,
  },
  plugins: [typescript()],
};
