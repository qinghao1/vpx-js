// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
/**
 * Engine provenance check: demo-browser/public/wasm/ holds a committed
 * release build, so this verifies build-info.json matches the current
 * vpinball pin + bridge patch series (and the four artifacts exist). CI runs
 * this instead of rebuilding the engine; a mismatch means someone changed the
 * inputs without rebuilding locally.
 *
 * Run: node test/harness/verify-engine-manifest.mjs
 * Exit: 0 match, 1 mismatch or missing files.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const wasmDir = join(root, 'demo-browser', 'public', 'wasm')
const failures = []
const fail = msg => {
	failures.push(msg)
	console.error(`✗ ${msg}`)
}

for (const artifact of [
	'vpinball-headless.js',
	'vpinball-headless.wasm',
	'vpinball-headless.wasm.map',
	'vpinball-headless.data',
])
	if (!existsSync(join(wasmDir, artifact))) fail(`missing artifact ${artifact}`)

const infoPath = join(wasmDir, 'build-info.json')
let info
try {
	info = JSON.parse(readFileSync(infoPath, 'utf8'))
} catch {
	fail('missing or invalid build-info.json')
}

if (info) {
	const pinned = execFileSync('git', ['rev-parse', 'HEAD:external/vpinball'], { cwd: root, encoding: 'utf8' }).trim()
	if (info.vpinball !== pinned) fail(`engine built from vpinball ${info.vpinball}, tree pins ${pinned}`)
	// Tracked patches only, mirroring the manifest writer: in-progress untracked
	// patches are invisible to this gate (CI sees the committed tree).
	const tracked = execFileSync('git', ['ls-files', '--', 'wasm/modules/headless/patches/*.patch'], {
		cwd: root,
		encoding: 'utf8',
	})
		.split('\n')
		.map(line => line.trim())
		.filter(line => line.endsWith('.patch'))
	const onDisk = Object.fromEntries(
		tracked.map(file => [
			file.split('/').pop(),
			createHash('sha256')
				.update(readFileSync(join(root, file)))
				.digest('hex'),
		]),
	)
	const recorded = info.patches ?? {}
	for (const [file, hash] of Object.entries(onDisk))
		if (!(file in recorded)) fail(`patch ${file} not included in the engine build`)
		else if (recorded[file] !== hash) fail(`patch ${file} changed since the engine was built`)
	for (const file of Object.keys(recorded))
		if (!(file in onDisk)) fail(`patch ${file} recorded in build-info.json but missing from the tree`)
}

if (failures.length > 0) {
	console.error('engine manifest mismatch — rebuild locally: npm run build:wasm:headless')
	process.exit(1)
}
console.log('✓ engine manifest matches the pinned vpinball + patch series')
