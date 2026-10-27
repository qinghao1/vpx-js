// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
// Underfloor occlusion is a baked-material invariant, not a playfield
// special-case: every opaque baked main surface resolves to a double-sided
// depth writer (see baked-materials.ts), so the baked playfield — the only
// floor between a below-table camera and the lights/DMD on VR tables —
// occludes from underneath whatever the authored backfaces flag says.
import * as fs from 'node:fs'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { applyBakedMaterial, createBakedMaterialResolver } from './baked-materials.js'
import { GpuDmdNodeController } from './nodes/dmd-node.js'
import { createPrimitiveAdditiveMaterial, createPrimitiveBdlMaterial } from './nodes/primitive-bdl-node.js'
import { createUnshadedBakedNodeMaterial } from './nodes/unshaded-baked-node.js'
import { classify } from './scene-classify.js'
import { postProcessScene } from './three-scene-postprocess.js'

const walkingDeadVpx = ['walking_dead.vpx', '/home/qinghao1/Downloads/walking_dead.vpx'].find(p => {
	try {
		return fs.existsSync(p) && fs.statSync(p).size > 1_000_000
	} catch {
		return false
	}
})

describe('underfloor occlusion: opaque baked materials occlude from both sides', () => {
	it('resolves a single-sided primitive-lit main bake into a double-sided depth writer', () => {
		// Production shape (walking_dead BM_Playfield): the VLM.Bake material
		// has no texture at generation time, so it starts life as a lit
		// primitive node material honoring backfacesEnabled=false (FrontSide).
		const base = createPrimitiveBdlMaterial({ doubleSided: false })
		base.name = 'material:VLM.Bake.Active'
		const resolve = createBakedMaterialResolver()
		const out = resolve(base as never, 'primitive-bm_playfield') as unknown as THREE.MeshStandardMaterial
		expect(out.side, 'floor needs its underneath faces').toBe(THREE.DoubleSide)
		expect(out.depthWrite, 'floor must fail depth closed').toBe(true)
		expect(out.transparent, 'floor stays opaque').toBe(false)
		expect(base.side, 'shared source material must not be mutated').toBe(THREE.FrontSide)
	})

	it('resolves a single-sided baked node main bake into a double-sided depth writer', () => {
		const base = createUnshadedBakedNodeMaterial({ doubleSided: false })
		;(base.userData as Record<string, unknown>).__isBaked = true
		base.name = 'material:Playfield'
		const resolve = createBakedMaterialResolver()
		const out = resolve(base as never, 'primitive-bm_playfield') as unknown as {
			side?: number
			depthWrite?: boolean
			transparent?: boolean
			colorNode?: unknown
		}
		expect(out.side, 'floor needs its underneath faces').toBe(THREE.DoubleSide)
		expect(out.depthWrite, 'floor must fail depth closed').toBe(true)
		expect(out.transparent, 'floor stays opaque').toBe(false)
		expect(out.colorNode, 'node graph must survive the resolve').toBeDefined()
		expect(base.side, 'shared source material must not be mutated').toBe(THREE.FrontSide)
	})

	it('keeps a late texture arrival double-sided', () => {
		const mat = createUnshadedBakedNodeMaterial({ doubleSided: false })
		;(mat.userData as Record<string, unknown>).__isBaked = true
		const tex = new THREE.Texture()
		tex.name = 'playfield.png'
		const info = classify('primitive-bm_playfield', 'material:playfield', 'playfield.png', true, false)
		applyBakedMaterial(mat as never, tex, info, 'primitive-BM_Playfield')
		expect((mat as unknown as { side?: number }).side, 'arrived floor keeps its underneath faces').toBe(
			THREE.DoubleSide,
		)
	})

	it('leaves overlays non-occluding', () => {
		// Lightmap overlays must never become depth writers, or unlit inserts
		// would punch opaque holes in the playfield from the front.
		const overlay = createPrimitiveAdditiveMaterial({})
		overlay.name = 'material:VLM.Bake.GI'
		const resolve = createBakedMaterialResolver()
		const out = resolve(overlay as never, 'primitive-lm_insrt01_playfield') as unknown as THREE.MeshStandardMaterial
		expect(out.transparent, 'overlay stays blended').toBe(true)
		expect(out.depthWrite, 'overlay must not occlude').toBe(false)
	})
})

describe('underfloor occlusion: DMD depth-tests like upstream', () => {
	it('keeps overlay order/offset but occludes behind the floor', () => {
		const controller = new GpuDmdNodeController(128, 32)
		// Upstream flasher.cpp draws the DMD depth-tested (depthTest true,
		// depthWrite false); depthTest false would draw it through the floor.
		expect(controller.material.depthTest).toBe(true)
		expect(controller.material.depthWrite).toBe(false)
		expect(controller.material.side).toBe(THREE.DoubleSide)
		expect(controller.material.polygonOffset).toBe(true)
		expect(controller.material.polygonOffsetFactor).toBe(-4)
		expect(controller.material.polygonOffsetUnits).toBe(-8)
	})
})

describe.skipIf(!walkingDeadVpx)('underfloor occlusion: settled walking_dead from below', () => {
	it('occludes playfield lights and the DMD behind the playfield slab', async () => {
		const { NodeBinaryReader } = await import('../../io/binary-reader.node.js')
		const { ThreeRenderApi } = await import('./three-render-api.js')
		const { ensureProceduralRoom } = await import('./procedural-room.js')
		const { Table } = await import('../../vpt/table/table.js')
		const table: any = await Table.load(
			new NodeBinaryReader(walkingDeadVpx as any) as any,
			{
				skipTextures: true,
			} as any,
		)
		const api = new ThreeRenderApi({ applyMaterials: true } as any)
		const tableGroup = (await (table as any).generateTableNode(api, { preloadTextures: false } as any)) as any
		const stats = postProcessScene(tableGroup as any, { viewerMode: 'play' })

		// Settled: script init states like the first viewer frame.
		try {
			const { Player } = await import('../../game/player.js')
			const player = new Player(table as any)
			player.init()
			const changed = player.popStates()
			for (const [name, state] of Object.entries(changed.changedStates as Record<string, any>)) {
				const item = (table as any).items?.[name]
				const node = tableGroup.getObjectByName(name) ?? tableGroup.getObjectByName(name.toLowerCase())
				if (!item?.getUpdater || !node) continue
				item.getUpdater().applyState(node, state, api, table)
			}
			;(changed as any).release?.()
		} catch {
			// Scene-graph occlusion does not depend on script state; keep going.
		}

		api.transformScene(tableGroup as any, table as any)
		const scene = new THREE.Scene()
		scene.add(tableGroup as any)
		scene.updateMatrixWorld(true)

		// TWD ships VR meshes, so the viewer builds no procedural room: the
		// baked playfield is the only floor between a below-table camera and
		// the lights/DMD above it.
		let hasVr = false
		tableGroup.traverse((o: any) => {
			if (
				o.isMesh &&
				o.visible &&
				String(o.name ?? '')
					.toLowerCase()
					.includes('vr_')
			)
				hasVr = true
		})
		expect(hasVr, 'TWD must keep the VR-room path (no procedural room)').toBe(true)
		const box = new THREE.Box3().setFromObject(tableGroup as any)
		const room = ensureProceduralRoom(
			scene as any,
			box.getCenter(new THREE.Vector3()),
			box.getSize(new THREE.Vector3()),
			{ hasVr },
		)
		expect(room, 'no room occluder for VR tables').toBeNull()
		scene.updateMatrixWorld(true)

		const bm = tableGroup.getObjectByName('primitive-BM_Playfield') as THREE.Mesh
		expect(bm, 'baked playfield must exist').toBeTruthy()
		expect(bm.visible, 'baked playfield visible').toBe(true)
		const bmMats = (Array.isArray(bm.material) ? bm.material : [bm.material]) as THREE.Material[]
		for (const m of bmMats) {
			expect(m.side, 'floor needs underneath faces to occlude from below').toBe(THREE.DoubleSide)
			expect(m.depthWrite, 'floor must fail depth closed').toBe(true)
			expect(m.transparent, 'floor stays opaque').toBe(false)
		}
		const bmBox = new THREE.Box3().setFromObject(bm)
		expect(bmBox.isEmpty()).toBe(false)

		// Overlays above the playfield honor depth: with the floor writing
		// depth they cannot leak through from underneath.
		const depthBypass: string[] = []
		tableGroup.traverse((o: any) => {
			if (!o.isMesh) return
			const n = String(o.name ?? '').toLowerCase()
			if (!n.includes('bulb.glow') && !n.includes('lm_')) return
			const mats = (Array.isArray(o.material) ? o.material : [o.material]) as THREE.Material[]
			if (mats.some(m => m && (m as THREE.Material).depthTest === false)) depthBypass.push(o.name)
		})
		expect(depthBypass, 'no light overlay may bypass depth').toEqual([])

		// End to end: from below the playfield, every above-playfield light
		// target (plus a production-DMD posed quad) sits behind a
		// depth-writing surface, so a depth-tested draw stays hidden.
		const shown = (o: THREE.Object3D): boolean => {
			for (let cur: THREE.Object3D | null = o; cur; cur = cur.parent) if (!cur.visible) return false
			return true
		}
		const camX = (bmBox.min.x + bmBox.max.x) / 2
		const camZ = (bmBox.min.z + bmBox.max.z) / 2
		const cam = new THREE.Vector3(camX, bmBox.min.y - 8, camZ)
		const targets: Array<{ name: string; point: THREE.Vector3; testsDepth: boolean }> = []
		const glow: Array<{ name: string; point: THREE.Vector3 }> = []
		const overlays: Array<{ name: string; point: THREE.Vector3 }> = []
		// Settled attract mode leaves most lamps off (their quads hidden, as
		// in production). Occlusion is geometric, so pose a representative lit
		// set: force the sampled proxies visible like a lit insert would be.
		tableGroup.traverse((o: any) => {
			if (!o.isMesh) return
			const n = String(o.name ?? '').toLowerCase()
			if (!n.includes('bulb.glow') && !n.includes('lm_')) return
			const b = new THREE.Box3().setFromObject(o)
			if (b.isEmpty()) return
			const c = b.getCenter(new THREE.Vector3())
			if (c.y < bmBox.max.y + 0.5) return
			if (c.y < cam.y + 1) return
			if (!shown(o)) {
				o.visible = true
				for (let p = o.parent; p && p !== tableGroup; p = p.parent) p.visible = true
			}
			;(n.includes('bulb.glow') ? glow : overlays).push({ name: o.name, point: c })
		})
		scene.updateMatrixWorld(true)
		glow.sort((a, b) => (a.name < b.name ? -1 : 1))
		overlays.sort((a, b) => (a.name < b.name ? -1 : 1))
		for (const t of [...glow.slice(0, 25), ...overlays.slice(0, 15)]) {
			// Overlay depthTest is pinned true by the depthBypass check above.
			targets.push({ name: t.name, point: t.point, testsDepth: true })
		}
		// Production DMD: procedural quad with the shared controller material,
		// posed above the playfield like DmdRenderer does.
		const dmdController = new GpuDmdNodeController(128, 32)
		const dmdMesh = new THREE.Mesh(
			new THREE.PlaneGeometry(30, 8),
			dmdController.material as unknown as THREE.Material,
		)
		dmdMesh.position.set(camX, bmBox.max.y + 40, camZ)
		scene.add(dmdMesh)
		scene.updateMatrixWorld(true)
		targets.push({
			name: 'DMD(procedural)',
			point: dmdMesh.position.clone(),
			testsDepth: (dmdController.material as unknown as THREE.Material).depthTest !== false,
		})
		expect(targets.length, 'must sample light targets').toBeGreaterThan(5)

		const ray = new THREE.Raycaster()
		const unoccluded: string[] = []
		for (const t of targets) {
			const dir = t.point.clone().sub(cam)
			const dist = dir.length()
			dir.normalize()
			ray.set(cam, dir)
			ray.far = dist - 1e-3
			const hits = ray
				.intersectObjects(scene.children, true)
				.filter(h => (h.object as THREE.Mesh).isMesh && shown(h.object))
			const writesDepth = (m: unknown): boolean =>
				!!m && (m as THREE.Material).depthWrite !== false && (m as THREE.Material).visible !== false
			const blocker = hits.find(h => {
				const m = (h.object as THREE.Mesh).material
				return Array.isArray(m) ? m.some(writesDepth) : writesDepth(m)
			})
			// The target itself honors depth (pinned above for overlays, and
			// by the controller contract for the DMD), so a depth writer in
			// front hides it from this camera.
			if (!blocker || !t.testsDepth) unoccluded.push(`${t.name} (blocker=${blocker?.object.name ?? 'none'})`)
		}
		expect(unoccluded, 'lights/DMD must hide behind the floor from below').toEqual([])
		// No playfield-specific pass remains: the baked-material resolver owns this.
		expect(stats).not.toHaveProperty('underfloorFixed')
	})
})
