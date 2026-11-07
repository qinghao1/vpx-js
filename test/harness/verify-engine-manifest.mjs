// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
/**
 * Engine provenance check: demo-browser/public/wasm/ holds a committed
 * release build, so this verifies build-info.json matches the current
 * vpinball pin + patch series + bridge source + artifact bytes. CI runs this instead
 * of rebuilding the engine; a mismatch means someone changed the inputs
 * without rebuilding locally.
 *
 * Run: node test/harness/verify-engine-manifest.mjs
 * Exit: 0 match, 1 mismatch or missing files.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { engineInputs, sha256 as sha } from '../../wasm/engine-inputs.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const wasmDir = join(root, 'demo-browser', 'public', 'wasm')
const ARTIFACTS = ['vpinball-headless.js', 'vpinball-headless.wasm', 'vpinball-headless.data']
// Largest file GitHub accepts is 100 MiB; fail well before a push rejection.
const WASM_SIZE_LIMIT = 90 * 1024 * 1024
const failures = []
const fail = msg => {
	failures.push(msg)
	console.error(`✗ ${msg}`)
}
const asObject = value => (value && typeof value === 'object' ? value : {})

const git = args => {
	try {
		return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
	} catch {
		fail(`cannot run git ${args[0]} (not a checkout?)`)
		return null
	}
}

for (const artifact of ARTIFACTS) if (!existsSync(join(wasmDir, artifact))) fail(`missing artifact ${artifact}`)

const infoPath = join(wasmDir, 'build-info.json')
let info
try {
	info = JSON.parse(readFileSync(infoPath, 'utf8'))
} catch {
	info = undefined
	fail('missing or invalid build-info.json')
}

if (info !== undefined && (!info || typeof info !== 'object')) fail('missing or invalid build-info.json')
if (info && typeof info === 'object') {
	// Committed pin, not the submodule checkout: a build from a checkout
	// moved past the committed pin fails here until the gitlink bump and
	// the rebuilt engine are committed together.
	const pinned = git(['rev-parse', 'HEAD:external/vpinball'])
	if (pinned !== null && info.vpinball !== pinned)
		fail(`engine built from vpinball ${info.vpinball}, tree pins ${pinned}`)
	// Release-only policy (the debug script builds -O0 with assertions).
	if (info.buildType !== 'Release') fail(`engine built as ${info.buildType}, expected Release`)
	if (info.emsdk !== '6.0.13') fail(`engine built with emsdk ${info.emsdk}, expected 6.0.13`)
	// Same inputs the writer hashed (wasm/engine-inputs.mjs). Untracked ones
	// never enter the hash map: they are gated via info.untrackedInputs.
	let current = null
	try {
		current = engineInputs(root)
	} catch {
		fail('cannot read the engine inputs (not a checkout?)')
	}
	if (current) {
		const recorded = asObject(info.inputs)
		for (const [file, hash] of Object.entries(current.inputs))
			if (!(file in recorded)) fail(`${file} not included in the engine build`)
			else if (recorded[file] !== hash) fail(`${file} changed since the engine was built`)
		for (const file of Object.keys(recorded))
			if (!(file in current.inputs)) fail(`${file} recorded in build-info.json but missing from the tree`)
	}
	const untracked = info.untrackedInputs ?? []
	if (!Array.isArray(untracked)) fail('build-info.json untrackedInputs is not an array')
	else
		for (const file of untracked)
			fail(`engine was built with uncommitted input ${file} — rebuild from a clean tree`)
	// Byte identity of the shipped files, so a stale or hand-replaced binary
	// cannot pass on matching inputs alone.
	const hashes = asObject(info.artifacts)
	for (const artifact of ARTIFACTS) {
		const path = join(wasmDir, artifact)
		if (!existsSync(path)) continue // already reported above
		try {
			if (!(artifact in hashes)) fail(`${artifact} not hashed in build-info.json — rebuild to refresh it`)
			else if (sha(path) !== hashes[artifact]) fail(`${artifact} differs from the recorded build`)
		} catch {
			fail(`${artifact} is present but unreadable`)
		}
		if (artifact === 'vpinball-headless.wasm') {
			try {
				const { size } = statSync(path)
				if (size > WASM_SIZE_LIMIT)
					fail(
						`vpinball-headless.wasm is ${(size / 1048576).toFixed(1)} MiB — over the 90 MiB ceiling (GitHub blocks at 100 MiB)`,
					)
			} catch {
				// unreadable already reported above
			}
		}
	}
}

if (failures.length > 0) {
	console.error('engine manifest mismatch — rebuild locally (from a clean tree): npm run build:wasm:headless')
	process.exit(1)
}
console.log('✓ engine manifest matches the pinned vpinball + engine inputs')
