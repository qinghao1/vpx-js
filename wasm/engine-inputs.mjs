// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
/**
 * The in-repo inputs of the headless engine build: the patch series applied
 * to external/vpinball and the bridge source compiled with it. Shared by the
 * manifest writer (wasm/write-build-info.mjs) and the CI gate
 * (test/harness/verify-engine-manifest.mjs), so both hash the same files.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const MODULE = 'wasm/modules/headless'
/** Input directories under MODULE, with the files of each that the build reads. */
const INPUTS = { patches: name => name.endsWith('.patch'), bridge: () => true }

export const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex')

/**
 * `{ inputs, untracked }`: sha256 of every tracked input keyed by its path
 * under wasm/modules/headless (`patches/0001-….patch`, `bridge/….cpp`), and
 * the input files on disk that git does not track (a build the gate refuses).
 */
export function engineInputs(repoRoot) {
	const tracked = execFileSync('git', ['ls-files', '--', ...Object.keys(INPUTS).map(dir => `${MODULE}/${dir}`)], {
		cwd: repoRoot,
		encoding: 'utf8',
	})
		.split('\n')
		.map(line => line.slice(MODULE.length + 1))
		.filter(path => {
			const [dir, name] = path.split('/')
			return name !== undefined && INPUTS[dir]?.(name)
		})
	const inputs = Object.fromEntries(tracked.sort().map(path => [path, sha256(join(repoRoot, MODULE, path))]))
	const untracked = Object.entries(INPUTS).flatMap(([dir, wanted]) =>
		readdirSync(join(repoRoot, MODULE, dir))
			.filter(name => wanted(name) && !(`${dir}/${name}` in inputs))
			.map(name => `${dir}/${name}`),
	)
	return { inputs, untracked: untracked.sort() }
}
