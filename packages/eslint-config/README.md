# `@repo/eslint-config`

A shared, strictly typed **ESLint** configuration for the monorepo.

This package provides a "Source of Truth" for code quality, ensuring consistency across apps and libraries. It utilizes the modern **ESLint Flat Config** architecture (ESLint 9+), designed to work seamlessly with:

- **TypeScript**
- **Next.js** & **React**
- **Prettier** (formatting conflicts handled automatically)
- **Turbo** (caching safety)

---

## 🏗 Architecture

This configuration is built using a "layering" strategy.

1. **`base.js`**: The foundation. Contains rules that apply to _every_ file in the repo (Node, Scripts, UI).
2. **`react-internal.js`**: Extends `base`. Adds rules for React components and Hooks.
3. **`next.js`**: Extends `base`. Adds rules for Next.js pages, App Router, and Core Web Vitals.

Consumers import only what they need.

---

## ⚙️ Configuration Details

### 1. Base Configuration (`base.js`)

_Target: Utility libraries, Node.js scripts, or as a foundation for other configs._

This is the parent configuration. It includes:

- **JavaScript/TypeScript Recommended**: Standard best practices (no undefined vars, valid types).
- **Prettier Integration**: Disables all ESLint formatting rules so Prettier can handle style without conflicts.
- **Turbo Plugin**:
- `turbo/no-undeclared-env-vars`: **Crucial for Monorepos.** It warns if you use `process.env.KEY` without listing it in `turbo.json`. If you don't list it, changing that ENV var won't bust the build cache, leading to broken builds.

- **Quality of Life**:
- `only-warn`: Turns all Errors into Warnings. This prevents the linter from "crashing" your build or local dev server while you are actively typing code.
- `no-unused-vars`: customized to ignore variables starting with `_` (e.g., `_req`, `_args`), which is a common convention for ignored arguments.

### 2. React Internal (`react-internal.js`)

_Target: Internal UI libraries (e.g., design systems, shared components)._

Extends `base` and adds:

- **React Recommended**: Standard React practices.
- **React Hooks**:
- `react-hooks/rules-of-hooks`: Enforces the rules of hooks (e.g., "Don't call hooks inside loops").
- `react-hooks/exhaustive-deps`: **Critical.** Checks dependency arrays in `useEffect` and `useMemo`. Missing dependencies here are the #1 cause of stale data bugs in React.

- **Globals**: Adds browser-specific globals (like `window`, `document`) so ESLint knows they exist.

### 3. Next.js (`next.js`)

_Target: Next.js applications._

Extends `base` and adds:

- **Core Web Vitals**: Rules from Google to ensure performance (e.g., warns against using standard `<img>` tags instead of `next/image`).
- **Next.js Specifics**: Checks for correct usage of the App Router, Script components, and server/client boundaries.
- **React & Hooks**: Inherits all standard React validation.

---

## 🚀 How to Use

Depending on the type of package or app you are working on, create an `eslint.config.js` in the root of that package and import the correct configuration.

### A. For Next.js Apps (`apps/web`, `apps/docs`, etc.)

Use the `next-js` export.

```javascript
// apps/my-app/eslint.config.js
import { nextJsConfig } from '@repo/eslint-config/next-js';

/** @type {import("eslint").Linter.Config} */
export default nextJsConfig;
```

### B. For React Libraries (`packages/ui`, etc.)

Use the `react-internal` export.

```javascript
// packages/ui/eslint.config.js
import { config as reactConfig } from '@repo/eslint-config/react-internal';

/** @type {import("eslint").Linter.Config} */
export default reactConfig;
```

### C. For Pure JS/TS Libraries (`packages/utils`, `packages/logger`)

Use the `base` export.

```javascript
// packages/utils/eslint.config.js
import { config as baseConfig } from '@repo/eslint-config/base';

/** @type {import("eslint").Linter.Config} */
export default baseConfig;
```

---

## 🛠 Customizing Rules Locally

If a specific app needs to override a rule (e.g., you really need to use `console.log` in one specific app), you can add it to the array in that app's `eslint.config.js`:

```javascript
import { nextJsConfig } from '@repo/eslint-config/next-js';

export default [
  ...nextJsConfig,
  {
    rules: {
      'no-console': 'off', // Disable console warning for this app only
    },
  },
];
```

## 📝 Troubleshooting

**"ESLint isn't working in VS Code"**

1. Ensure you are using the latest generic VS Code ESLint extension.
2. Since we use the new Flat Config (`eslint.config.js`), ensure your VS Code settings don't strictly look for `.eslintrc`.
3. You may need to restart the ESLint server: `Cmd/Ctrl + Shift + P` -> `ESLint: Restart ESLint Server`.
