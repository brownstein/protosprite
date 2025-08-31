module.exports = {
  plugins: ["@trivago/prettier-plugin-sort-imports"],
  importOrderParserPlugins: ["typescript", "jsx"],
  semi: true,
  trailingComma: "none",
  singleQuote: false,
  printWidth: 80,
  importOrder: ["<THIRD_PARTY_MODULES>", "^src/(.*)$", "^[./]"],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true
};
