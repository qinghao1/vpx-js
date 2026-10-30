// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { execSync } from 'node:child_process'
import { cpSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
execSync('tsc -p tsconfig.dts.json', { cwd: root, stdio: 'inherit' })
// Ship the whole emitted tree under dist/lib/ so relative imports resolve;
// dist/index.d.ts re-exports it to keep the package entry path stable.
cpSync(join(root, 'dist-dts', 'lib'), join(root, 'dist', 'lib'), { recursive: true })
writeFileSync(join(root, 'dist', 'index.d.ts'), "export * from './lib/index.js';\n")
rmSync(join(root, 'dist-dts'), { recursive: true, force: true })
