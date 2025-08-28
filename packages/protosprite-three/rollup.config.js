// rollup.config.js
import typescript from "@rollup/plugin-typescript";
import { string } from "rollup-plugin-string";

export default {
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "es",
    sourcemap: true
  },
  plugins: [
    string({
      include: ["**/*.vert", "**/*.frag"]
    }),
    typescript()
  ]
};
