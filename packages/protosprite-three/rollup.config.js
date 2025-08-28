// rollup.config.js
import { string } from "rollup-plugin-string";
import typescript from "@rollup/plugin-typescript";

export default
  {
    input: "src/index.ts",
    output: {
      dir: "dist",
      format: "es",
      sourcemap: true
    },
    plugins: [
      string({
        include: [
          "**/*.vert",
          "**/*.frag"
        ]
      }),
      typescript()
    ]
  };
