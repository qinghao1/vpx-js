// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
/**
 * Writes the engine provenance manifest (`build-info.json`) for a freshly
 * built headless engine. Called by `wasm/build-headless.sh` after deploy;
 * run it directly only to refresh the manifest without rebuilding.
 *
 * The manifest mirrors the build inputs: the submodule pin, the hashes of
 * the tracked patches and bridge source (wasm/engine-inputs.mjs), the
 * shipped artifact bytes, and any input files outside git (a dirty build the
 * gate refuses).
 *
 * Run: node wasm/write-build-info.mjs <repoRoot> <outDir> <buildType> <emsdk>
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { engineInputs, sha256 } from './engine-inputs.mjs'

const ARTIFACTS = ['vpinball-headless.js', 'vpinball-headless.wasm', 'vpinball-headless.data']

const [repoRoot, outDir, buildType, emsdk] = process.argv.slice(2)
if (!repoRoot || !outDir || !buildType || !emsdk) {
	console.error('usage: node wasm/write-build-info.mjs <repoRoot> <outDir> <buildType> <emsdk>')
	process.exit(1)
}

const vpinball = execFileSync('git', ['-C', join(repoRoot, 'external/vpinball'), 'rev-parse', 'HEAD'], {
	encoding: 'utf8',
}).trim()
const { inputs, untracked: untrackedInputs } = engineInputs(repoRoot)
const artifacts = Object.fromEntries(ARTIFACTS.map(file => [file, sha256(join(outDir, file))]))

const info = { vpinball, emsdk, buildType, inputs, untrackedInputs, artifacts }
const path = join(outDir, 'build-info.json')
writeFileSync(path, `${JSON.stringify(info, null, 2)}\n`)
console.log(`[headless] manifest: ${path}`)
