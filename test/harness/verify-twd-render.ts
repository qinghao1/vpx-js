// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
// TWD render harness — generates the Walking Dead scene in Node, runs the real
// texture-streaming path (used-texture selection + node decode + pending resolve),
// and asserts post-process + post-stream scene state.
// Run: npx tsx test/harness/verify-twd-render.ts [--vpx=/path/to/table.vpx]
// Exit: 0 pass, 1 failure, 77 skipped (VPX file not found).
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type * as THREE from 'three'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { ThreeRenderApi } from '../../lib/render/threejs/three-render-api.js'
import { postProcessScene } from '../../lib/render/threejs/three-scene-postprocess.js'
import { ThreeTextureLoaderNode } from '../../lib/render/threejs/three-texture-loader-node.js'
import { Table } from '../../lib/vpt/table/table.js'
import {
	collectUsedTextureNames,
	compareStreamTextures,
	defaultGenOpts,
	filterStreamTextures,
	findWalkingDead,
	getPlayfieldMapKey,
} from './bench-shared.js'
import { Tap, tapSkip } from './tap.js'

const tap = new Tap('twd-render harness')

type LightClass = 'gi' | 'flsh' | 'insrt'

function classifyLight(lowerName: string): LightClass | undefined {
	if (!lowerName.includes('lm_')) return undefined
	if (lowerName.includes('gi0') || lowerName.includes('gi1') || lowerName.includes('_gi')) return 'gi'
	if (lowerName.includes('flsh')) return 'flsh'
	if (lowerName.includes('insrt')) return 'insrt'
	return undefined
}

function meshMaterials(mesh: THREE.Mesh): THREE.Material[] {
	return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

function hasPendingMap(material: THREE.Material): boolean {
	return Boolean((material as any)?.userData?.pendingMap)
}

function parseVpxArg(argv: string[]): string | undefined {
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--vpx' && argv[i + 1]) return argv[i + 1]
		if (argv[i].startsWith('--vpx=')) return argv[i].slice(6)
	}
	return undefined
}

const expandHome = (file: string): string =>
	path.resolve(file.startsWith('~') ? path.join(os.homedir(), file.slice(1)) : file)

function resolveVpxPath(): string | null {
	const cli = parseVpxArg(process.argv.slice(2))
	if (cli) return fs.existsSync(expandHome(cli)) ? expandHome(cli) : null
	return findWalkingDead()
}

const vpxPath = resolveVpxPath()
if (!vpxPath) {
	const rawArg = parseVpxArg(process.argv.slice(2)) ?? process.env.WALKING_DEAD_VPX ?? 'walking_dead.vpx'
	tapSkip(1, 'twd-render', `VPX not found: ${rawArg}`)
	process.exit(77)
}
console.log(`# vpx: ${vpxPath}`)

const table = await Table.load(new NodeBinaryReader(vpxPath), { skipTextures: false } as any)
const loader = new ThreeTextureLoaderNode()
const api = new ThreeRenderApi({ applyMaterials: true, applyTextures: loader as any, optimizeTextures: false } as any)
const group = (await (table as any).generateTableNode(api, {
	...defaultGenOpts(),
	preloadTextures: false,
})) as THREE.Group

postProcessScene(group, { viewerMode: 'viewer', harnessLog: console.log })
group.updateMatrixWorld(true)

console.log('=== Checking Post-Process Scene State ===')
let bmPlayfield: any
let pfMesh: any
let giCount = 0
let flshCount = 0
let insrtCount = 0
let vrCount = 0
let pendingCount = 0

group.traverse(o => {
	if (!(o as THREE.Mesh).isMesh) return
	const mesh = o as THREE.Mesh
	const n = (o.name || '').toLowerCase()
	if (n === 'primitive-bm_playfield') bmPlayfield = o
	if (n === 'primitive-playfield_mesh') pfMesh = o
	const light = classifyLight(n)
	if (light === 'gi') giCount++
	else if (light === 'flsh') flshCount++
	else if (light === 'insrt') insrtCount++
	if (n.includes('vr_mega') || n.includes('vr_mini')) {
		if (o.visible) vrCount++
	}
	for (const material of meshMaterials(mesh)) {
		if (hasPendingMap(material)) pendingCount++
	}
})

console.log({
	bmPlayfield: {
		visible: bmPlayfield?.visible,
		opacity: bmPlayfield?.material?.opacity,
		emissiveIntensity: bmPlayfield?.material?.emissiveIntensity,
		pendingMap: bmPlayfield?.material?.userData?.pendingMap,
	},
	pfMesh: { visible: pfMesh?.visible },
	giCount,
	flshCount,
	insrtCount,
	vrCount,
	pendingCount,
})

// This leg is the TWD render contract: without a BM_Playfield there is
// nothing TWD-specific to assert, and the generic checks below would pass
// vacuously. Exit skipped so a non-TWD table can never green this leg.
const twdLike = !!bmPlayfield
if (!twdLike) {
	tapSkip(1, 'twd-render', 'not TWD-like (no BM_Playfield)')
	process.exit(77)
}
tap.assert(bmPlayfield?.visible === true, 'TWD: BM_Playfield is visible')
tap.assert(pfMesh?.visible !== true, 'TWD: playfield_mesh hidden (no z-fighting)')
tap.assert(
	giCount > 0 && flshCount > 0 && insrtCount > 0,
	`TWD: light classes present (gi=${giCount} flsh=${flshCount} insrt=${insrtCount})`,
)

console.log('=== Driving Real Texture Streaming ===')
const { used, mainBakeUsed } = collectUsedTextureNames(group)
const pfMap = getPlayfieldMapKey(table as any)
const allTextures = Object.values((table as any).textures ?? {})
const streamTextures = filterStreamTextures(allTextures as any, used, mainBakeUsed, pfMap).sort((a, b) =>
	compareStreamTextures(a, b, mainBakeUsed, pfMap),
)
console.log(
	`# used=${used.size} streamable=${streamTextures.length}/${allTextures.length} pendingMaterials=${pendingCount}`,
)

let fixed = 0
if (pendingCount > 0 && streamTextures.length > 0) {
	await api.preloadTextures(streamTextures as any, table as any)
	const matGen = api.getMaterialGenerator() as any
	fixed = (matGen.resolvePendingTextures?.() ?? 0) + (matGen.resolvePendingInScene?.(group) ?? 0)
	const { loaded } = await api.getMapGenerator().demandPendingMaps(group, table as any)
	if (loaded.length > 0) {
		fixed += (matGen.resolvePendingTextures?.() ?? 0) + (matGen.resolvePendingInScene?.(group) ?? 0)
	}
	console.log(`# resolvePendingTextures fixed=${fixed}`)
	tap.assert(fixed > 0, `real streaming resolved pending maps (fixed=${fixed})`)
} else {
	console.log('# nothing to stream (no pending maps or no streamable textures) — skipping streaming asserts')
}

let remainingPending = 0
let remainingStrayPending = 0
group.traverse(o => {
	if (!(o as THREE.Mesh).isMesh) return
	const mesh = o as THREE.Mesh
	for (const material of meshMaterials(mesh)) {
		if (hasPendingMap(material)) remainingPending++
		const userData = (material as any)?.userData as Record<string, unknown> | undefined
		for (const key of ['pendingNormalMap', 'pendingEnvMap', 'pendingEmissiveMap']) {
			if (typeof userData?.[key] === 'string' && userData[key]) remainingStrayPending++
		}
	}
})
console.log(`# remaining pending maps after streaming: ${remainingPending} (stray non-map: ${remainingStrayPending})`)
if (pendingCount > 0) {
	tap.assert(remainingPending === 0, `streaming drained all pending maps (${pendingCount}->${remainingPending})`)
}
tap.assert(
	remainingStrayPending === 0,
	`no stranded non-map pending keys after streaming (stray=${remainingStrayPending})`,
)

console.log('=== Verifying Scene After Texture Streaming ===')
let badFlsh = 0
let badInsrt = 0
let goodGi = 0
group.traverse(o => {
	if (!(o as THREE.Mesh).isMesh || !o.visible) return
	const n = (o.name || '').toLowerCase()
	const mesh = o as THREE.Mesh
	const mat = meshMaterials(mesh)[0] as any
	const light = classifyLight(n)
	if (light === 'gi') {
		if (mat.opacity === 1 && mat.emissiveIntensity === 1) goodGi++
	} else if (light === 'flsh') {
		if (mat.opacity > 0 || mat.emissiveIntensity > 0) badFlsh++
	} else if (light === 'insrt') {
		if (mat.opacity > 0 || mat.emissiveIntensity > 0) badInsrt++
	}
})

console.log({ goodGi, badFlsh, badInsrt })
if (giCount > 0) tap.assert(goodGi === giCount, `GI inserts fully lit after streaming (${goodGi}/${giCount})`)
tap.assert(badFlsh === 0, `no flashers lit after streaming (bad=${badFlsh})`)
tap.assert(badInsrt === 0, `no inserts lit after streaming (bad=${badInsrt})`)

const passed = tap.done()
console.log(passed ? '\n# twd-render harness PASS' : '\n# twd-render harness FAIL')
process.exit(passed ? 0 : 1)
