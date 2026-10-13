import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  // Ignorados globalmente (testes auxiliares fora do build)
  { ignores: ["tests/**"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/exhaustive-deps": "off",
      "react/no-unescaped-entities": "off"
    },
    ignores: ["node_modules/**", ".next/**", "out/**", "next-env.d.ts"]
  }
];

export default eslintConfig;
