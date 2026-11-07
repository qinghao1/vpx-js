// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
/**
 * Engine provenance check: demo-browser/public/wasm/ holds a committed
 * release build, so this verifies build-info.json matches the current
 * vpinball pin + bridge patch series + artifact bytes. CI runs this instead
 * of rebuilding the engine; a mismatch means someone changed the inputs
 * without rebuilding locally.
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

const sha256 = data => createHash('sha256').update(data).digest('hex')

for (const artifact of ['vpinball-headless.js', 'vpinball-headless.wasm', 'vpinball-headless.data'])
	if (!existsSync(join(wasmDir, artifact))) fail(`missing artifact ${artifact}`)

const infoPath = join(wasmDir, 'build-info.json')
let info
try {
	info = JSON.parse(readFileSync(infoPath, 'utf8'))
} catch {
	fail('missing or invalid build-info.json')
}

if (info) {
	// Committed pin, not the submodule checkout: a fresh build after
	// `git submodule update` fails here until the new gitlink is committed.
	const pinned = execFileSync('git', ['rev-parse', 'HEAD:external/vpinball'], { cwd: root, encoding: 'utf8' }).trim()
	if (info.vpinball !== pinned) fail(`engine built from vpinball ${info.vpinball}, tree pins ${pinned}`)
	// Release-only policy (the debug script builds -O0 with assertions).
	if (info.buildType !== 'Release') fail(`engine built as ${info.buildType}, expected Release`)
	if (info.emsdk !== '6.0.13') fail(`engine built with emsdk ${info.emsdk}, expected 6.0.13`)
	// Tracked names only, mirroring the manifest writer: untracked patches
	// never enter the hash map — they are gated via info.untrackedPatches
	// below instead.
	const tracked = execFileSync('git', ['ls-files', '--', 'wasm/modules/headless/patches/*.patch'], {
		cwd: root,
		encoding: 'utf8',
	})
		.split('\n')
		.map(line => line.trim())
		.filter(line => line.endsWith('.patch'))
	const onDisk = {}
	for (const file of tracked) {
		try {
			onDisk[file.split('/').pop()] = sha256(readFileSync(join(root, file)))
		} catch {
			fail(`patch ${file} is tracked but unreadable`)
		}
	}
	const recorded = info.patches && typeof info.patches === 'object' ? info.patches : {}
	for (const [file, hash] of Object.entries(onDisk))
		if (!(file in recorded)) fail(`patch ${file} not included in the engine build`)
		else if (recorded[file] !== hash) fail(`patch ${file} changed since the engine was built`)
	for (const file of Object.keys(recorded))
		if (!(file in onDisk)) fail(`patch ${file} recorded in build-info.json but missing from the tree`)
	const untracked = Array.isArray(info.untrackedPatches) ? info.untrackedPatches : []
	if (!Array.isArray(info.untrackedPatches) && info.untrackedPatches !== undefined)
		fail('build-info.json untrackedPatches is not an array')
	for (const file of untracked) fail(`engine was built with uncommitted patch ${file} — rebuild from a clean tree`)
	// Byte identity: the manifest must describe these exact files, so a stale
	// or hand-replaced binary cannot pass on matching inputs alone.
	const hashes = info.artifacts && typeof info.artifacts === 'object' ? info.artifacts : {}
	for (const artifact of ['vpinball-headless.js', 'vpinball-headless.wasm', 'vpinball-headless.data']) {
		const path = join(wasmDir, artifact)
		if (!existsSync(path)) continue // already reported above
		if (!(artifact in hashes)) fail(`${artifact} not hashed in build-info.json — rebuild to refresh it`)
		else if (sha256(readFileSync(path)) !== hashes[artifact]) fail(`${artifact} differs from the recorded build`)
	}
}

if (failures.length > 0) {
	console.error('engine manifest mismatch — rebuild locally: npm run build:wasm:headless')
	process.exit(1)
}
console.log('✓ engine manifest matches the pinned vpinball + patch series')
