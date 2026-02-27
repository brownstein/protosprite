// rollup.config.js
import typescript from "@rollup/plugin-typescript";

export default {
  input: {
    core: "src/core/index.ts",
    trace: "src/trace/index.ts"
  },
  output: {
    dir: "dist",
    format: "es",
    sourcemap: true,
    preserveModules: true
  },
  plugins: [typescript()]
};
