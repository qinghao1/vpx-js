// Reproduces render artifacts: underwall visibility, pending-BM visibility.
// Run: npx tsx test/harness/repro-artifact.ts
import * as fs from 'node:fs'
import type * as THREE from 'three'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { ThreeRenderApi } from '../../lib/render/threejs/three-render-api.js'
import { postProcessScene } from '../../lib/render/threejs/three-scene-postprocess.js'
import { Table } from '../../lib/vpt/table/table.js'
import { exists, VPX_CANDIDATES } from './bench-shared.js'

const vpx = VPX_CANDIDATES.find(candidate => exists(candidate, 1024 * 1024))
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
const logs: string[] = []
postProcessScene(group, { harnessLog: (message: string) => logs.push(message), viewerMode: 'viewer' })
console.log(logs.join(' | '))
function isEffectivelyVisible(node: THREE.Object3D, root: THREE.Object3D): boolean {
	if (!node.visible) return false
	for (let parent = node.parent; parent && parent !== root; parent = parent.parent) {
		if (!parent.visible) return false
	}
	return true
}
function isMesh(node: THREE.Object3D): node is THREE.Mesh {
	return (node as unknown as { isMesh?: unknown }).isMesh === true
}
let underwallEff = 0
let pendingBMVisible = 0
let surfaceVisible = 0
group.traverse(node => {
	if (!isMesh(node)) return
	const lower = (node.name || '').toLowerCase()
	const effective = isEffectivelyVisible(node, group)
	// check su/sling surface not incorrectly forced
	if (node.name.includes('Playfield_underwall') && node.visible) surfaceVisible++
	if (lower.includes('playfield_underwall') && effective) underwallEff++
	if (!effective) return
	if (!lower.includes('bm_') && !lower.includes('playfield')) return
	const material = Array.isArray(node.material) ? node.material[0] : node.material
	if (!material) return
	if (material.userData.pendingMap || material.userData.pendingmap) pendingBMVisible++
})
console.log(
	`underwall effective visible: ${underwallEff} => ${underwallEff === 0 ? 'PASS' : 'FAIL (vertical artifact)'}`,
)
console.log(
	`pending BM visible (should be 0 after postProcess for BM): ${pendingBMVisible} => ${pendingBMVisible === 0 ? 'PASS' : 'FAIL'}`,
)
console.log(`underwall mesh visible (should be 0): ${surfaceVisible} => ${surfaceVisible === 0 ? 'PASS' : 'FAIL'}`)
console.log('Harness done — all checks should be PASS for artifact fix')
if (underwallEff !== 0 || pendingBMVisible !== 0 || surfaceVisible !== 0) process.exit(1)
