// Harness to reproduce walking_dead artifacts generically
// Run: npx tsx test/harness/repro-artifact.ts
import * as fs from 'node:fs'
import * as path from 'node:path'
import type * as THREE from 'three'
import { postProcessScene } from '../../demo-browser/src/scene.js'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { ThreeRenderApi } from '../../lib/render/threejs/three-render-api.js'
import { Table } from '../../lib/vpt/table/table.js'

const candidates = [
	path.resolve('walking_dead.vpx'),
	path.join(process.env.HOME ?? '/home/qinghao1', 'Downloads/walking_dead.vpx'),
	path.resolve('test/fixtures/table-empty.vpx'),
]
function exists(p) {
	try {
		return fs.existsSync(p) && fs.statSync(p).size > 1024 * 1024
	} catch {
		return false
	}
}
const vpx = candidates.find(exists)
if (!vpx) {
	console.error('No VPX found')
	process.exit(1)
}
console.log(`Harness — vpx: ${vpx} ${(fs.statSync(vpx).size / 1024 / 1024).toFixed(1)} MB`)
const table = await Table.load(new NodeBinaryReader(vpx), { skipTextures: false } as any)
console.log(`Table: ${Object.keys(table.items).length} items, ${Object.keys(table.textures).length} textures`)
const api = new ThreeRenderApi({ applyMaterials: true, applyTextures: true, optimizeTextures: false } as any)
const group = (await table.generateTableNode(api, {
	exportPlayfield: true,
	exportPrimitives: true,
	exportFlippers: true,
	exportBumpers: true,
	exportRamps: true,
	exportSurfaces: true,
	exportRubbers: true,
	exportLightBulbs: true,
	exportHitTargets: true,
	exportGates: true,
	exportKickers: true,
	exportTriggers: true,
	exportSpinners: true,
	exportPlungers: true,
	preloadTextures: false,
})) as THREE.Group
group.updateMatrixWorld(true)
const logs = []
postProcessScene(group, { harnessLog: m => logs.push(m), viewerMode: 'viewer' })
console.log(logs.join(' | '))
function isEff(o, root) {
	if (!o.visible) return false
	for (let p = o.parent; p && p !== root; p = p.parent) if (!p.visible) return false
	return true
}
let underwallEff = 0
group.traverse(o => {
	if (o.isMesh && (o.name || '').toLowerCase().includes('playfield_underwall') && isEff(o, group)) underwallEff++
})
console.log(
	`underwall effective visible: ${underwallEff} => ${underwallEff === 0 ? 'PASS' : 'FAIL (vertical artifact)'}`,
)
let pendingBMVisible = 0
group.traverse(o => {
	if (!o.isMesh || !isEff(o, group)) return
	const n = (o.name || '').toLowerCase()
	if (!n.includes('bm_') && !n.includes('playfield')) return
	const m = Array.isArray(o.material) ? o.material[0] : o.material
	if (!m) return
	const pending = m.userData.pendingMap || m.userData.pendingmap
	if (pending) pendingBMVisible++
})
console.log(
	`pending BM visible (should be 0 after postProcess for BM): ${pendingBMVisible} => ${pendingBMVisible === 0 ? 'PASS' : 'FAIL'}`,
)
// check su/sling surface not incorrectly forced
let surfaceVisible = 0
group.traverse(o => {
	if (o.isMesh && o.name.includes('Playfield_underwall') && o.visible) surfaceVisible++
})
console.log(`underwall mesh visible (should be 0): ${surfaceVisible} => ${surfaceVisible === 0 ? 'PASS' : 'FAIL'}`)
console.log('Harness done — all checks should be PASS for artifact fix')
if (underwallEff !== 0 || pendingBMVisible !== 0 || surfaceVisible !== 0) process.exit(1)
