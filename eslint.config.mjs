import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist/**", "src-tauri/target/**", "src-tauri/gen/**"] },
  { files: ["**/*.{ts,tsx}"], languageOptions: { parser: tseslint.parser } },
  {
    ...react.configs.flat.recommended,
    files: ["**/*.{jsx,tsx}"],
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      "react/prop-types": "off",
      "react/no-unknown-property": "off",
      "react/jsx-no-target-blank": "off",
    },
  },
  {
    files: ["src/**/*.{jsx,tsx}"],
    plugins: { "jsx-a11y": jsxA11y },
    rules: {
      "jsx-a11y/alt-text": "warn",
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",
    },
  },
  {
    ...reactHooks.configs.flat.recommended,
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
