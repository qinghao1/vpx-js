// TWD render harness — generates the Walking Dead scene in Node, runs the real
// texture-streaming path (used-texture selection + node decode + pending resolve),
// and asserts post-process + post-stream scene state.
// Run: npx tsx test/harness/verify-twd-render.ts [--vpx=/path/to/table.vpx]
// Exit: 0 pass, 1 failure, 77 skipped (VPX file not found).
import * as fs from 'node:fs'
import * as THREE from 'three'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { applyInitialEntryStates, assembleTableScene, syncTableRoom } from '../../lib/render/threejs/table-scene.js'
import { ThreeRenderApi } from '../../lib/render/threejs/three-render-api.js'
import { ThreeTextureLoaderNode } from '../../lib/render/threejs/three-texture-loader-node.js'
import { buildNodeCache, fanOutLightmap } from '../../lib/render/worker/shared-scene.js'
import { Table } from '../../lib/vpt/table/table.js'
import {
	collectUsedTextureNames,
	compareStreamTextures,
	filterStreamTextures,
	getPlayfieldMapKey,
} from './bench-shared.js'
import { Tap, tapSkip } from './tap.js'
import { parseVpxArgs, resolveVpxPath } from './vpinball-resolver.js'

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

const DEFAULT_VPX = process.env.WALKING_DEAD_VPX ?? '/home/qinghao1/Downloads/walking_dead.vpx'
const parsed = parseVpxArgs(process.argv.slice(2))
const vpxInput = parsed.vpx ?? DEFAULT_VPX
const vpxPath = resolveVpxPath(vpxInput)
if (!vpxPath || !fs.existsSync(vpxPath)) {
	tapSkip(1, 'twd-render', `VPX not found: ${vpxInput}`)
	process.exit(77)
}
console.log(`# vpx: ${vpxPath}`)

const table = await Table.load(new NodeBinaryReader(vpxPath), { skipTextures: false } as any)
const loader = new ThreeTextureLoaderNode()
const api = new ThreeRenderApi({ applyMaterials: true, applyTextures: loader as any, optimizeTextures: false } as any)
// One shared assembly for both trees (same call the viewer and the worker
// boot use). The worker tree generates before Player init like the real
// worker boot: script init mutates shared item/material state (e.g. hiding
// the glass cover), which would mask a missing worker hide.
const { node: group, stats: ppMain } = await assembleTableScene(api, table as never, {
	viewerMode: 'play',
	harnessLog: console.log,
})
const { node: workerGroup, stats: ppWorker } = await assembleTableScene(api, table as never, {
	viewerMode: 'play',
	// Same sweep-before-postprocess order as the real worker boot: the sweep
	// must not re-show meshes postprocess hides (white-wall stray walls).
	onBeforePostprocess: workerNode => {
		applyInitialEntryStates(buildNodeCache(table as never, workerNode as never) as never, api, table)
	},
})
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

// TWD-specific asserts only apply to TWD-like tables (BM_Playfield present);
// other --vpx targets still exercise generate + postprocess + streaming below.
const twdLike = !!bmPlayfield
if (twdLike) {
	tap.assert(bmPlayfield?.visible === true, 'TWD: BM_Playfield is visible')
	tap.assert(pfMesh?.visible !== true, 'TWD: playfield_mesh hidden (no z-fighting)')
	tap.assert(
		giCount > 0 && flshCount > 0 && insrtCount > 0,
		`TWD: light classes present (gi=${giCount} flsh=${flshCount} insrt=${insrtCount})`,
	)
} else {
	console.log('# not TWD-like (no BM_Playfield) — skipping TWD-specific asserts')
}

console.log('=== Driving Real Texture Streaming ===')
// Production selection path (same helpers as bench-node/ranked-profile): stream
// what the scene references, playfield first, then resolve pending maps through
// the material generator — no dummy textures.
const { used, mainBakeUsed } = collectUsedTextureNames(group)
const pfMap = getPlayfieldMapKey(table as any)
const allTextures = Object.values((table as any).textures ?? {})
const streamTextures = filterStreamTextures(allTextures as any, used, mainBakeUsed, pfMap).sort((a, b) =>
	compareStreamTextures(a, b, mainBakeUsed, pfMap),
)
console.log(
	`# used=${used.size} streamable=${streamTextures.length}/${allTextures.length} pendingMaterials=${pendingCount}`,
)

console.log('=== Running Table Script Init (Player) ===')
// Tables assign images at init (TWD Table1_Init sets
// VRCab_Backbox.image) — after the used-texture filter ran. Mirror the
// viewer's first-frame state apply so script-referenced textures surface
// as pending maps before streaming + demand.
let scriptError: unknown = null
let appliedStates = 0
const deltaKeys: string[] = []
const initStates: Record<string, unknown> = {}
try {
	const { Player } = await import('../../lib/game/player.js')
	const player = new Player(table as any)
	player.init()
	const changed = player.popStates()
	deltaKeys.push(...Object.keys(changed.changedStates))
	for (const [name, state] of Object.entries(changed.changedStates)) {
		const item = (table as any).items?.[name]
		const node = group.getObjectByName(name) ?? group.getObjectByName(name.toLowerCase())
		if (!item?.getUpdater || !node) continue
		item.getUpdater().applyState(node, state, api, table)
		initStates[name] = state
		appliedStates++
	}
	// Viewer-identical lightmap fan-out (see viewer applyChangedStates): lamp
	// changes re-evaluate their referencing overlays, so script-driven inserts
	// match production instead of keeping generate-time appearance.
	const mainCache = buildNodeCache(table as never, group as never)
	fanOutLightmap(
		mainCache,
		api,
		table,
		deltaKeys.filter(name => mainCache.lightNames.has(name)),
	)
	;(changed as any).release?.()
} catch (e) {
	scriptError = e
}
console.log(`# applied first-frame states: ${appliedStates}`)
tap.assert(scriptError === null, `table script init runs clean (${String(scriptError ?? 'ok').slice(0, 160)})`)

let streamFixed = 0
if (pendingCount > 0 && streamTextures.length > 0) {
	await api.preloadTextures(streamTextures as any, table as any)
	streamFixed = api.getMaterialGenerator().resolvePendingTextures()
	console.log(`# resolvePendingTextures fixed=${streamFixed}`)
} else {
	console.log('# nothing to stream (no pending maps or no streamable textures) — skipping streaming asserts')
}

console.log('=== Demand-Loading Script-Referenced Textures ===')
// Textures the script referenced after filtering (never streamed) must load
// on demand now — otherwise their materials stay mapless (transparent-black).
const { loaded, missing } = await api.getMapGenerator().demandPendingMaps(group, table as any)
console.log(`# demand loaded=[${loaded.join(', ')}] missing=[${missing.join(', ')}]`)
let demandFixed = 0
if (loaded.length > 0) {
	const matGen = api.getMaterialGenerator() as any
	const fixedCache = matGen.resolvePendingTextures()
	const fixedScene = matGen.resolvePendingInScene(group)
	demandFixed = fixedCache + fixedScene
	console.log(`# demand resolve fixed=${fixedCache}+${fixedScene}`)
}
if (twdLike) {
	// The backbox image streams with the scene under production flags, so
	// demand only sees the leftovers (bumper/kicker caps here) — either way
	// every script reference must resolve and land on its material.
	tap.assert(loaded.length > 0, `TWD: demand loads script-referenced textures (loaded=${loaded.length})`)
	tap.assert(missing.length === 0, `TWD: no unloadable texture references (missing=[${missing.join(', ')}])`)
	const backbox = group.getObjectByName('primitive-VRCab_Backbox') as any
	const backboxMats = backbox ? meshMaterials(backbox) : []
	const backboxMapped = backboxMats.some((m: any) => !hasPendingMap(m) && (m.userData?.__map || m.map))
	tap.assert(backboxMapped, 'TWD: backbox material has its map after demand (not transparent-black)')
}

let remainingPending = 0
let remainingStrayPending = 0
group.traverse(o => {
	if (!(o as THREE.Mesh).isMesh) return
	const mesh = o as THREE.Mesh
	for (const material of meshMaterials(mesh)) {
		if (hasPendingMap(material)) remainingPending++
		const userData = (material as any)?.userData as Record<string, unknown> | undefined
		for (const key of ['pendingmap', 'pendingNormalMap', 'pendingEnvMap', 'pendingEmissiveMap']) {
			if (typeof userData?.[key] === 'string' && userData[key]) remainingStrayPending++
		}
	}
})
console.log(`# remaining pending maps after streaming: ${remainingPending} (stray non-map: ${remainingStrayPending})`)
if (pendingCount > 0) {
	tap.assert(remainingPending < pendingCount, `streaming drained pending maps (${pendingCount}->${remainingPending})`)
	// Preload and demand bind at different stages (pending counts
	// mesh-occurrences while resolvers dedupe per material), so the
	// pipeline-did-work meter spans both stages.
	tap.assert(
		streamFixed + demandFixed > 0,
		`real streaming resolved pending maps (fixed=${streamFixed + demandFixed})`,
	)
}
// Every non-map pending key must be consumed by a resolver once its texture
// loads (primitives never stash pendingEmissiveMap; baked resolve covers
// normal/env/emissive) — anything left is stranded forever. Only meaningful
// when demand found every reference loadable.
if (missing.length === 0) {
	tap.assert(
		remainingStrayPending === 0,
		`no stranded non-map pending keys after streaming (stray=${remainingStrayPending})`,
	)
} else {
	console.log(`# skipped stray-pending assert (missing=[${missing.join(', ')}])`)
}

console.log('=== Verifying Scene After Texture Streaming ===')
let badFlsh = 0
let badInsrt = 0
let goodGi = 0
let endVisibleGi = 0
group.traverse(o => {
	if (!(o as THREE.Mesh).isMesh || !o.visible) return
	const n = (o.name || '').toLowerCase()
	const mesh = o as THREE.Mesh
	const mat = meshMaterials(mesh)[0] as any
	const light = classifyLight(n)
	if (light === 'gi') {
		endVisibleGi++
		if (mat.opacity === 1 && mat.emissiveIntensity > 0) goodGi++
	} else if (light === 'flsh') {
		if (mat.opacity > 0 || mat.emissiveIntensity > 0) badFlsh++
	} else if (light === 'insrt') {
		if (mat.opacity > 0 || mat.emissiveIntensity > 0) badInsrt++
	}
})

console.log({ goodGi, badFlsh, badInsrt, endVisibleGi })
if (endVisibleGi > 0)
	tap.assert(goodGi === endVisibleGi, `visible GI inserts lit after streaming (${goodGi}/${endVisibleGi})`)
tap.assert(badFlsh === 0, `no flashers lit after streaming (bad=${badFlsh})`)
// Inserts mirror the viewer first frame here: with no lamp traffic the fan-out
// never re-evaluates them, so lamp-off overlays keep generate-time defaults on
// main (production converges as lamps toggle). The worker boot fan-out
// evaluates every lamp, so the strict inserts-off gate lives on the worker
// asserts below; the main residue count is informational.
console.log(`# info main lit inserts with lamps off (unevaluated residue): ${badInsrt}`)

console.log('=== Verifying Worker Boot Parity ===')
// The worker has no Player, so it rooms its scene and applies the authored-state baseline; require identical hidden-state.
const workerScene = new THREE.Scene()
workerScene.add(workerGroup)
const workerBox = new THREE.Box3().setFromObject(workerGroup)
syncTableRoom(
	workerScene,
	workerGroup,
	workerBox.getCenter(new THREE.Vector3()),
	workerBox.getSize(new THREE.Vector3()),
)
workerGroup.updateMatrixWorld(true)
// Mirror production delivery: script-settled init states reach the worker through per-frame deltas.
{
	const wCache = buildNodeCache(table as never, workerGroup as never)
	const wChanged = new Set<string>()
	for (const name of deltaKeys) {
		const state = initStates[name]
		if (!state) continue
		const entry = wCache.entries[wCache.idOf(name)]
		if (!entry) continue
		entry.updater.applyState(entry.node, state, api, table)
		if (wCache.lightNames.has(name)) wChanged.add(name)
	}
	fanOutLightmap(wCache, api, table, wChanged)
}
let workerGlass = 0
let wVisibleGi = 0
let wGoodGi = 0
let wBadFlsh = 0
let wBadInsrt = 0
workerGroup.traverse(o => {
	if (!(o as THREE.Mesh).isMesh) return
	const mesh = o as THREE.Mesh
	const n = (o.name || '').toLowerCase()
	if (/glass/i.test(n) && mesh.visible) workerGlass++
	const light = classifyLight(n)
	if (light === 'gi' && mesh.visible) wVisibleGi++
	if (!mesh.visible) return
	const mat = meshMaterials(mesh)[0] as any
	if (light === 'gi') {
		if (mat.opacity === 1 && mat.emissiveIntensity > 0) wGoodGi++
	} else if (light === 'flsh') {
		if (mat.opacity > 0 || mat.emissiveIntensity > 0) wBadFlsh++
	} else if (light === 'insrt') {
		if (mat.opacity > 0 || mat.emissiveIntensity > 0) wBadInsrt++
	}
})
console.log({ workerGlass, wVisibleGi, wGoodGi, wBadFlsh, wBadInsrt, ppWorker })

tap.assert(
	ppWorker.glass === ppMain.glass,
	`worker hides same glass as main (worker=${ppWorker.glass} main=${ppMain.glass})`,
)
tap.assert(
	ppWorker.lightmaps === ppMain.lightmaps,
	`worker counts same overlays as main (worker=${ppWorker.lightmaps} main=${ppMain.lightmaps})`,
)
if (twdLike) {
	tap.assert(workerGlass === 0, 'worker: no visible glass cover (grey veil)')
	tap.assert(
		(workerScene.background as THREE.Color)?.getHex?.() === 0x121a2b,
		'worker: room background set (no void)',
	)
	tap.assert(wBadFlsh === 0 && wBadInsrt === 0, `worker: flashers/inserts off (flsh=${wBadFlsh} insrt=${wBadInsrt})`)
	tap.assert(
		wGoodGi === wVisibleGi && wGoodGi === goodGi,
		`worker: visible GI lit matches main baseline (worker=${wGoodGi}/${wVisibleGi} main=${goodGi}/${endVisibleGi})`,
	)
}

const passed = tap.done()
console.log(passed ? '\n# twd-render harness PASS' : '\n# twd-render harness FAIL')
process.exit(passed ? 0 : 1)
