// Play-room harness — cabinet/DMD visibility, procedural room, static batching.
// Run: npx tsx test/harness/verify-play-room.ts
// Exit: 0 pass, 1 failure.
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as THREE from 'three'
import { batchStaticOpaques } from '../../lib/render/threejs/three-batched-builder.js'
import { ThreeRenderApi } from '../../lib/render/threejs/three-render-api.js'
import {
	ensureProceduralRoom,
	hideCabFlippers,
	showCabFlippers,
} from '../../lib/render/threejs/three-scene-postprocess.js'
import { TableBuilder } from '../table-builder.js'
import { Tap } from './tap.js'

const tap = new Tap('play-room harness')

function makeMesh(name: string, matName: string, withMap = false): THREE.Mesh {
	const geo = new THREE.BoxGeometry(10, 10, 10)
	const mat = new THREE.MeshStandardMaterial({ color: 0x888888 }) as any
	mat.name = matName
	if (withMap) {
		const tex = new THREE.Texture()
		tex.name = matName
		mat.map = tex
	}
	const m = new THREE.Mesh(geo, mat)
	m.name = name
	return m
}

// 1. Static opaques batch through the real batchStaticOpaques path; movables and
// pending-texture meshes are excluded.
{
	const table = new TableBuilder().addFlipper('Flipper1').build()
	const api = new ThreeRenderApi({ applyMaterials: true } as any)
	const root = new THREE.Group()
	root.name = 'table'
	const sharedMat = new THREE.MeshStandardMaterial({ color: 0x888888 })
	sharedMat.name = 'staticMat'
	const meshA = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10, 3, 3, 3), sharedMat)
	meshA.name = 'staticA'
	meshA.position.set(0, 0, 0)
	const meshB = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10, 4, 4, 4), sharedMat)
	meshB.name = 'staticB'
	meshB.position.set(50, 0, 0)
	const moverMat = new THREE.MeshStandardMaterial({ color: 0x888888 })
	moverMat.name = 'moverMat'
	const mover = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), moverMat)
	mover.name = 'Flipper1'
	mover.position.set(100, 0, 0)
	const pendingMat = new THREE.MeshStandardMaterial({ color: 0x888888 })
	pendingMat.name = 'pendingMat'
	pendingMat.userData.pendingMap = 'some_streaming_tex'
	const pending = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), pendingMat)
	pending.name = 'pendingMesh'
	pending.position.set(150, 0, 0)
	root.add(meshA, meshB, mover, pending)
	const count = batchStaticOpaques(root, table, api)
	tap.assert(count === 1, `batching: two static opaques merge into one batch (count=${count})`)
	const batched = root.children.find(c => /^batched:/.test(c.name))
	tap.assert(!!batched, `batching: BatchedMesh added to root (${batched?.name ?? 'none'})`)
	tap.assert(meshA.visible === false && meshB.visible === false, 'batching: merged sources hidden')
	tap.assert(
		!!(meshA.userData as any).__batched && !!(meshB.userData as any).__batched,
		'batching: merged sources carry __batched back-pointers',
	)
	tap.assert(mover.visible === true, 'batching: movable (Flipper1) excluded from batch')
	tap.assert((mover.userData as any).__batched === undefined, 'batching: movable has no __batched pointer')
	tap.assert(pending.visible === true, 'batching: pending-texture mesh excluded from batch')
	tap.assert((pending.userData as any).__batched === undefined, 'batching: pending mesh has no __batched pointer')
}

// 2. hideCabFlippers hides only vrcab+flipper subtrees (with counts); showCabFlippers restores.
{
	const root = new THREE.Group()
	root.name = 'table'
	const cabFlipper = makeMesh('primitive-VRCab_FlipperLeft', 'cabFlipperMat')
	const cab = makeMesh('primitive-VRCab_Cabinet', 'cabMat')
	const backbox = makeMesh('primitive-VRCab_Backbox', 'backMat')
	const dmd = makeMesh('primitive-VR_DMD', 'dmdMat')
	dmd.userData.isProceduralDMD = true
	const wall = makeMesh('primitive-VR_MegaWall005', 'wallMat')
	const leg = makeMesh('primitive-VRCab_LegsFront', 'legMat')
	const pf = makeMesh('playfield', 'pfMat')
	const asm = new THREE.Group()
	asm.name = 'VRCab_FlipperAssembly'
	const screw = makeMesh('screw_01', 'screwMat')
	asm.add(screw)
	root.add(cabFlipper, cab, backbox, dmd, wall, leg, pf, asm)
	const hidden = hideCabFlippers(root)
	tap.assert(hidden === 3, `hideCabFlippers hides flipper mesh + assembly + child (hidden=${hidden})`)
	tap.assert(cabFlipper.visible === false, 'hideCabFlippers: cab flipper mesh hidden')
	tap.assert(screw.visible === false, 'hideCabFlippers: child inside flipper assembly hidden')
	tap.assert(cab.visible === true, 'hideCabFlippers: VRCab_Cabinet stays visible')
	tap.assert(backbox.visible === true, 'hideCabFlippers: VRCab_Backbox stays visible')
	tap.assert(dmd.visible === true, 'hideCabFlippers: VR_DMD stays visible')
	tap.assert(pf.visible === true, 'hideCabFlippers: playfield stays visible')
	tap.assert(wall.visible === true, 'hideCabFlippers: VR_MegaWall stays visible (room as in viewer)')
	tap.assert(leg.visible === true, 'hideCabFlippers: legs stay visible')
	const shown = showCabFlippers(root)
	tap.assert(shown === 3, `showCabFlippers restores hidden subtree (shown=${shown})`)
	tap.assert(cabFlipper.visible === true && screw.visible === true, 'showCabFlippers: flipper + child visible again')
}

// 3. ensureProceduralRoom vs prerendered
{
	const scene = new THREE.Scene()
	const center = new THREE.Vector3(0, 0, 0)
	const size = new THREE.Vector3(1000, 2000, 500)
	const room = ensureProceduralRoom(scene, center, size, { hasVr: false })
	tap.assert(
		!!room && !!scene.getObjectByName('vr_procedural_room'),
		'viewer room: procedural room created when hasVr false',
	)
	tap.assert(
		scene.background === null,
		'viewer room: background should be null when procedural room exists (no blue)',
	)
	// play with hasVr false should also have room
	const scene2 = new THREE.Scene()
	const room2 = ensureProceduralRoom(scene2, center, size, { hasVr: false })
	tap.assert(!!room2, 'play room: procedural room created in play when hasVr false (room as in viewer)')
	// play with hasVr true -> no room, fallback to prerendered (blue) - but we now keep VR walls, so background is still blue
	const scene3 = new THREE.Scene()
	const room3 = ensureProceduralRoom(scene3, center, size, { hasVr: true })
	tap.assert(
		!room3 && !scene3.getObjectByName('vr_procedural_room'),
		'VR hasVr true: no procedural room (fallback to prerendered)',
	)
}

// 4. DMD/cabinet must stay visible under hideCabFlippers (not cab-flipper subtrees).
{
	const root = new THREE.Group()
	root.name = 'table'
	const dmdMesh = makeMesh('DMD_Board', 'dmdMat')
	const cabMesh = makeMesh('cabinet_outer', 'cabMat')
	const group = new THREE.Group()
	group.name = 'VRCab_Cabinet'
	const screw = makeMesh('screw_01', 'screwMat')
	group.add(screw)
	root.add(dmdMesh, cabMesh, group)
	const hidden = hideCabFlippers(root)
	tap.assert(hidden === 0, `non-flipper cabinet subtree untouched (hidden=${hidden})`)
	tap.assert(dmdMesh.visible === true, 'DMD must stay visible in play')
	tap.assert(cabMesh.visible === true, 'cabinet must stay visible in play')
	tap.assert(screw.visible === true, 'child screw inside cabinet must stay visible')
}

// 5. getPrerenderedBackground should be cached
{
	const viewerPath = path.resolve('demo-browser/src/viewer.ts')
	const content = fs.readFileSync(viewerPath, 'utf8')
	tap.assert(
		content.includes('_prerenderedBackground') && content.includes('if (_prerenderedBackground) return'),
		'getPrerenderedBackground is cached',
	)
	tap.assert(
		content.includes('ensureProceduralRoom') && content.includes('scene.background'),
		'play ensures room as in viewer (ensureProceduralRoom + background handling)',
	)
}

const passed = tap.done()
console.log(passed ? '\n# play-room harness PASS' : '\n# play-room harness FAIL')
process.exit(passed ? 0 : 1)
