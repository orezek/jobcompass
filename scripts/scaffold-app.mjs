#!/usr/bin/env node

import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const appName = process.argv[2];

if (!appName) {
  console.error('Usage: pnpm scaffold <name>');
  process.exit(1);
}

const validName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
if (!validName.test(appName)) {
  console.error(`Invalid app name "${appName}". Use kebab-case (letters, numbers, dashes).`);
  process.exit(1);
}

const repoRoot = process.cwd();
const templateDir = path.join(repoRoot, 'apps', 'app-template');
const targetDir = path.join(repoRoot, 'apps', appName);
const targetPackageJsonPath = path.join(targetDir, 'package.json');
const templateAgentsPath = path.join(templateDir, 'AGENTS.md');
const targetAgentsPath = path.join(targetDir, 'AGENTS.md');

const excludedNames = new Set([
  'node_modules',
  'dist',
  'tsconfig.tsbuildinfo',
  'tsconfig.tsbuild.info',
  '.turbo',
]);

try {
  await mkdir(targetDir);
} catch (error) {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
    console.error(`Target already exists: apps/${appName}`);
    process.exit(1);
  }

  throw error;
}

await cp(templateDir, targetDir, {
  recursive: true,
  filter: (sourcePath) => {
    const name = path.basename(sourcePath);
    return !excludedNames.has(name);
  },
});

// Keep app-level agent guidance inheritance consistent in all scaffolded apps.
try {
  await stat(templateAgentsPath);
  await stat(targetAgentsPath);
} catch {
  console.error(
    'Scaffold validation failed: AGENTS.md must exist in apps/app-template and be copied to the new app.',
  );
  process.exit(1);
}

const packageJsonRaw = await readFile(targetPackageJsonPath, 'utf8');
const packageJson = JSON.parse(packageJsonRaw);
packageJson.name = appName;
await writeFile(targetPackageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

console.log(`Created apps/${appName} from apps/app-template.`);
console.log('Next steps:');
console.log(`1) pnpm -C apps/${appName} lint`);
console.log(`2) pnpm -C apps/${appName} check-types`);
console.log(`3) pnpm -C apps/${appName} build`);
