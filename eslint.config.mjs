import js from "@eslint/js";

export default [
  {
    ignores: ["test/**", "lib/include/*core.js"]
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        node: true,
        console: true,
        process: true,
        Buffer: true,
        window: true,
        document: true
      }
    },
    rules: {
      "no-param-reassign": ["error", { "props": true }],
      "array-callback-return": "error",
      "prefer-const": ["error", { "destructuring": "all" }],
      "no-undef": "off", // Since this is a mixed Node/Browser codebase in some files without strict imports
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
    }
  },
  {
    files: ["lib/typeInference.js", "lib/parsers/**/*.js", "lib/astupdate.js", "lib/utilityFunctions.js", "lib/updateComment.js"],
    rules: {
      "no-param-reassign": "off"
    }
  }
];
