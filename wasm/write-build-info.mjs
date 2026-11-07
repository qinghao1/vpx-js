// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
/**
 * Writes the engine provenance manifest (`build-info.json`) for a freshly
 * built headless engine. Called by `wasm/build-headless.sh` after deploy;
 * run it directly only to refresh the manifest without rebuilding.
 *
 * The manifest mirrors the build inputs: the submodule pin, the tracked
 * patch hashes (flat dir: basenames are unique), the shipped artifact bytes,
 * and any on-disk patches outside git (a dirty build the gate refuses).
 *
 * Run: node wasm/write-build-info.mjs <repoRoot> <outDir> <buildType> <emsdk>
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const ARTIFACTS = ['vpinball-headless.js', 'vpinball-headless.wasm', 'vpinball-headless.data']

const [repoRoot, outDir, buildType, emsdk] = process.argv.slice(2)
if (!repoRoot || !outDir || !buildType || !emsdk) {
	console.error('usage: node wasm/write-build-info.mjs <repoRoot> <outDir> <buildType> <emsdk>')
	process.exit(1)
}

const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex')
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

const vpinball = git(['-C', join(repoRoot, 'external/vpinball'), 'rev-parse', 'HEAD'])
const patchDir = join(repoRoot, 'wasm/modules/headless/patches')
const series = git(['-C', repoRoot, 'ls-files', '--', 'wasm/modules/headless/patches/*.patch'])
	.split('\n')
	.map(line => line.trim())
	.filter(line => line.endsWith('.patch'))
const patches = Object.fromEntries(series.map(file => [basename(file), sha(join(repoRoot, file))]))
const present = new Set(readdirSync(patchDir).filter(file => file.endsWith('.patch')))
const untrackedPatches = [...present].filter(file => !series.some(s => basename(s) === file)).sort()
const artifacts = Object.fromEntries(ARTIFACTS.map(file => [file, sha(join(outDir, file))]))

const info = { vpinball, emsdk, buildType, patches, untrackedPatches, artifacts }
const path = join(outDir, 'build-info.json')
writeFileSync(path, `${JSON.stringify(info, null, 2)}\n`)
console.log(`[headless] manifest: ${path}`)
