// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { DataTexture, Group, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { createBulbGlowNodeMaterial } from './nodes/bulb-glow-node.js'
import { createPrimitiveAdditiveMaterial } from './nodes/primitive-bdl-node.js'
import { ThreeNodeMaterialGenerator } from './three-node-material-generator.js'
import { postProcessScene } from './three-scene-postprocess.js'

function makeGenerator(textures: Map<string, DataTexture>) {
	return new ThreeNodeMaterialGenerator({
		hasTexture: (name: string) => textures.has(name.toLowerCase()),
		getTexture: (name: string) => textures.get(name.toLowerCase()),
	} as any)
}

function haloMesh(name: string): Mesh {
	const mat = createBulbGlowNodeMaterial({
		color: 0xffffff,
		color2: 0xffffff,
		centerX: 0,
		centerY: 0,
		falloff: 100,
		falloffPower: 2,
		intensity: 10,
	})
	const mesh = new Mesh(new PlaneGeometry(10, 10), mat)
	mesh.name = name
	return mesh
}

function additiveMesh(name: string): Mesh {
	const mat = createPrimitiveAdditiveMaterial({ tint: 0xffffff, intensity: 1, modulateVsAdd: 1 })
	const mesh = new Mesh(new PlaneGeometry(10, 10), mat)
	mesh.name = name
	return mesh
}

describe('backdrop arrival: postprocess stamp then streaming bind', () => {
	it('stamps the playfield name on backdrop arms only', () => {
		const root = new Group()
		const halo = haloMesh('test-halo')
		const flasher = additiveMesh('test-flasher')
		const plain = new Mesh(new PlaneGeometry(10, 10), new MeshStandardMaterial({ color: 0xffffff }))
		plain.name = 'test-plain'
		root.add(halo, flasher, plain)
		const stats = postProcessScene(root, { playfieldMapName: 'pf' })
		expect(stats.backdropStamped).toBe(2)
		for (const mesh of [halo, flasher]) {
			expect((mesh.material as { userData: Record<string, unknown> }).userData.__backdropName).toBe('pf')
		}
		expect((plain.material as { userData: Record<string, unknown> }).userData.__backdropName ?? null).toBe(null)
	})

	it('leaves taps unstamped without a playfield name', () => {
		const root = new Group()
		const halo = haloMesh('test-halo')
		root.add(halo)
		const stats = postProcessScene(root, {})
		expect(stats.backdropStamped ?? 0).toBe(0)
		expect((halo.material as { userData: Record<string, unknown> }).userData.__backdropName ?? null).toBe(null)
	})

	it('binds the tap in place once the playfield art streams in', () => {
		const root = new Group()
		const halo = haloMesh('test-halo')
		root.add(halo)
		postProcessScene(root, { playfieldMapName: 'pf' })
		const generator = makeGenerator(new Map())
		expect(generator.resolvePendingInScene(root)).toBe(0)
		const ud = halo.material as { userData: Record<string, unknown> }
		const nodes = ud.userData.__backdropNodes as { value: unknown }[]
		const stub = nodes[0].value
		const art = new DataTexture(new Uint8Array([10, 20, 30, 255]), 1, 1)
		generator.resolvePendingInScene(root)
		const bound = makeGenerator(new Map([['pf', art]]))
		expect(bound.resolvePendingInScene(root)).toBe(1)
		expect(nodes[0].value).toBe(art)
		expect(nodes[0].value).not.toBe(stub)
		expect(ud.userData.__backdropName).toBe('pf')
	})

	it('falls back to the playfield mesh map when the stamped name never resolves', () => {
		// Tables whose playfield map matches no image (the viewer
		// substitutes a texture on the playfield mesh): the taps follow
		// whatever the mesh actually shows.
		const root = new Group()
		const halo = haloMesh('test-halo')
		root.add(halo)
		postProcessScene(root, { playfieldMapName: 'missing-pf' })
		const art = new DataTexture(new Uint8Array([10, 20, 30, 255]), 1, 1)
		const pfMat = new MeshStandardMaterial({ color: 0xffffff, map: art as never })
		const pfMesh = new Mesh(new PlaneGeometry(10, 10), pfMat)
		pfMesh.name = 'primitive-playfield_mesh'
		root.add(pfMesh)
		const generator = makeGenerator(new Map())
		expect(generator.resolvePendingInScene(root)).toBe(1)
		const nodes = (halo.material as { userData: Record<string, unknown> }).userData.__backdropNodes as {
			value: unknown
		}[]
		expect(nodes[0].value).toBe(art)
		// Repeat drains are no-ops once bound.
		expect(generator.resolvePendingInScene(root)).toBe(0)
	})

	it('also follows node-material playfields and pending names', () => {
		const root = new Group()
		const halo = haloMesh('test-halo')
		root.add(halo)
		const art = new DataTexture(new Uint8Array([10, 20, 30, 255]), 1, 1)
		const pfMat = new MeshStandardMaterial({ color: 0xffffff })
		;(pfMat.userData as Record<string, unknown>).__map = { isNode: true, value: art }
		const pfMesh = new Mesh(new PlaneGeometry(10, 10), pfMat)
		pfMesh.name = 'primitive-playfield_mesh'
		root.add(pfMesh)
		const generator = makeGenerator(new Map())
		expect(generator.resolvePendingInScene(root)).toBe(1)
		const nodes = (halo.material as { userData: Record<string, unknown> }).userData.__backdropNodes as {
			value: unknown
		}[]
		expect(nodes[0].value).toBe(art)
	})

	it('ignores baked BM_Playfield meshes: atlas UVs are not playfield UVs', () => {
		// Tables whose playfield map matches no image show a lightmap atlas
		// on a baked mesh instead (e.g. VLM nestmaps). The tap samples with
		// planar playfield UVs, which read unrelated atlas islands there —
		// the gray wash — so the drain must not bind them; the tap keeps
		// the reference-constant stub.
		const root = new Group()
		const halo = haloMesh('test-halo')
		root.add(halo)
		const art = new DataTexture(new Uint8Array([10, 20, 30, 255]), 1, 1)
		const pfMat = new MeshStandardMaterial({ color: 0xffffff, map: art as never })
		const pfMesh = new Mesh(new PlaneGeometry(10, 10), pfMat)
		pfMesh.name = 'test-bm_playfield'
		root.add(pfMesh)
		const generator = makeGenerator(new Map())
		expect(generator.resolvePendingInScene(root)).toBe(0)
		const ud = (halo.material as { userData: Record<string, unknown> }).userData
		expect(ud.__backdropMap ?? null).toBeNull()
	})

	it('prefers the visible slab over the hidden decoy', () => {
		// Both planar-UV meshes carry art: the tap binds what the table
		// shows (the generated slab), not the force-hidden collision mesh.
		const root = new Group()
		const halo = haloMesh('test-halo')
		root.add(halo)
		const slabArt = new DataTexture(new Uint8Array([11, 22, 33, 255]), 1, 1)
		const slab = new Mesh(
			new PlaneGeometry(10, 10),
			new MeshStandardMaterial({ color: 0xffffff, map: slabArt as never }),
		)
		slab.name = 'playfield_base'
		const decoyArt = new DataTexture(new Uint8Array([44, 55, 66, 255]), 1, 1)
		const decoy = new Mesh(
			new PlaneGeometry(10, 10),
			new MeshStandardMaterial({ color: 0xffffff, map: decoyArt as never }),
		)
		decoy.name = 'primitive-playfield_mesh'
		decoy.visible = false
		root.add(slab, decoy)
		const generator = makeGenerator(new Map())
		expect(generator.resolvePendingInScene(root)).toBe(1)
		const nodes = (halo.material as { userData: Record<string, unknown> }).userData.__backdropNodes as {
			value: unknown
		}[]
		expect(nodes[0].value).toBe(slabArt)
	})

	it('keeps the stamped name when the fallback binds', () => {
		// The fallback binds the showing texture but must not rename the
		// tap: the stamped name stays the drain's identity for the named path.
		const root = new Group()
		const halo = haloMesh('test-halo')
		;(halo.material as { userData: Record<string, unknown> }).userData.__backdropName = 'pf'
		root.add(halo)
		const art = new DataTexture(new Uint8Array([10, 20, 30, 255]), 1, 1)
		const slabMat = new MeshStandardMaterial({ color: 0xffffff })
		slabMat.userData.pendingMap = 'slab-pending'
		const slab = new Mesh(new PlaneGeometry(10, 10), slabMat)
		slab.name = 'playfield_base'
		root.add(slab)
		const generator = makeGenerator(new Map([['slab-pending', art]]))
		expect(generator.resolvePendingInScene(root)).toBeGreaterThanOrEqual(1)
		const ud = halo.material as { userData: Record<string, unknown> }
		const nodes = ud.userData.__backdropNodes as { value: unknown }[]
		expect(nodes[0].value).toBe(art)
		expect(ud.userData.__backdropName).toBe('pf')
	})

	it('follows the pending name while the playfield itself still streams', () => {
		const root = new Group()
		const halo = haloMesh('test-halo')
		root.add(halo)
		const art = new DataTexture(new Uint8Array([10, 20, 30, 255]), 1, 1)
		const pfMat = new MeshStandardMaterial({ color: 0xffffff })
		;(pfMat.userData as Record<string, unknown>).pendingMap = 'pf-pending'
		const pfMesh = new Mesh(new PlaneGeometry(10, 10), pfMat)
		pfMesh.name = 'primitive-playfield_mesh'
		root.add(pfMesh)
		const generator = makeGenerator(new Map([['pf-pending', art]]))
		// The drain also resolves the playfield mesh's own slot; what
		// matters here is the tap following it.
		expect(generator.resolvePendingInScene(root)).toBeGreaterThanOrEqual(1)
		const nodes = (halo.material as { userData: Record<string, unknown> }).userData.__backdropNodes as {
			value: unknown
		}[]
		expect(nodes[0].value).toBe(art)
	})
})
