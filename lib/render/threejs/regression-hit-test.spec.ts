// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import * as THREE from 'three'

chai.use((sinonChai as any).default ?? sinonChai)

const RE_CAB = /vrcab|cabinet|lockbar|pincab/i
const RE_OUTER = /VRCab_(Cabinet|Backbox|LegsFront|LegsBack)$/i

function isTableHit(object: THREE.Object3D, root: THREE.Object3D): boolean {
	for (let c: any = object; c && c !== root; c = c.parent) {
		const n = String(c.name || '')
		if (RE_CAB.test(n) || RE_OUTER.test(n)) return true
		const ln = n.toLowerCase()
		if (ln.includes('playfield') || ln.includes('apron')) return true
	}
	return false
}

function makeGroup(name: string): THREE.Group {
	const g = new THREE.Group()
	g.name = name
	return g
}

function makeMesh(name: string): THREE.Mesh {
	const geom = new THREE.BoxGeometry(1, 1, 1)
	const mat = new THREE.MeshStandardMaterial()
	const mesh = new THREE.Mesh(geom, mat)
	mesh.name = name
	return mesh
}

describe('regression: table hit test excludes root and is generic', () => {
	it('playfield base mesh via type group is hit, VR is not', () => {
		const root = makeGroup('playfield')
		const typePlayfield = makeGroup('playfield')
		const tableGroup = makeGroup('Table1')
		const meshEmpty = makeMesh('')
		root.add(typePlayfield)
		typePlayfield.add(tableGroup)
		tableGroup.add(meshEmpty)

		const primitives = makeGroup('primitives')
		root.add(primitives)
		const vrGroup = makeGroup('VR_MegaRailing')
		const vrMesh = makeMesh('primitive-VR_MegaRailing')
		primitives.add(vrGroup)
		vrGroup.add(vrMesh)

		root.updateMatrixWorld(true)

		expect(isTableHit(meshEmpty, root), 'base playfield empty mesh via playfield group').to.equal(true)
		expect(isTableHit(vrMesh, root), 'VR_MegaRailing must not be table hit').to.equal(false)
	})

	it('BM_Playfield is hit, BM_BatLeft is not', () => {
		const root = makeGroup('playfield')
		const primitives = makeGroup('primitives')
		root.add(primitives)
		const bmPlayGroup = makeGroup('BM_Playfield')
		const bmPlayMesh = makeMesh('primitive-BM_Playfield')
		primitives.add(bmPlayGroup)
		bmPlayGroup.add(bmPlayMesh)

		const bmBatGroup = makeGroup('BM_BatLeft')
		const bmBatMesh = makeMesh('primitive-BM_BatLeft')
		primitives.add(bmBatGroup)
		bmBatGroup.add(bmBatMesh)

		expect(isTableHit(bmPlayMesh, root), 'BM_Playfield contains playfield').to.equal(true)
		expect(isTableHit(bmBatMesh, root), 'BM_BatLeft must not be table hit (bm_ alone is not enough)').to.equal(
			false,
		)
	})

	it('cabinet is hit, VR wall is not', () => {
		const root = makeGroup('playfield')
		const cabGroup = makeGroup('VRCab_Cabinet')
		const cabMesh = makeMesh('cab-mesh')
		root.add(cabGroup)
		cabGroup.add(cabMesh)

		const vrWall = makeMesh('VR_MegaWall005')
		const vrWallGroup = makeGroup('VR_MegaWall005')
		const primitives = makeGroup('primitives')
		root.add(primitives)
		primitives.add(vrWallGroup)
		vrWallGroup.add(vrWall)

		expect(isTableHit(cabMesh, root), 'VRCab_Cabinet should be hit').to.equal(true)
		expect(isTableHit(vrWall, root), 'VR wall must not be hit').to.equal(false)
	})

	it('root itself is not considered hit - any mesh under root via root name alone must not be hit', () => {
		const root = makeGroup('playfield')
		const genericGroup = makeGroup('SomeGeneric')
		const genericMesh = makeMesh('primitive-generic')
		root.add(genericGroup)
		genericGroup.add(genericMesh)

		expect(isTableHit(genericMesh, root), 'generic mesh must not be hit just because root is playfield').to.equal(
			false,
		)
		const hits = [{ object: genericMesh } as any]
		const anyHit = hits.some(h => isTableHit(h.object, root))
		expect(anyHit, 'hitTest must be false for generic').to.equal(false)
	})

	it('hits.some with mixed VR and playfield returns true', () => {
		const root = makeGroup('playfield')
		const typePlayfield = makeGroup('playfield')
		const tableGroup = makeGroup('Table1')
		const meshEmpty = makeMesh('')
		root.add(typePlayfield)
		typePlayfield.add(tableGroup)
		tableGroup.add(meshEmpty)

		const primitives = makeGroup('primitives')
		root.add(primitives)
		const vrGroup = makeGroup('VR_MegaRailing')
		const vrMesh = makeMesh('primitive-VR_MegaRailing')
		primitives.add(vrGroup)
		vrGroup.add(vrMesh)

		const hits = [{ object: vrMesh }, { object: meshEmpty }] as any
		expect(
			hits.some((h: any) => isTableHit(h.object, root)),
			'mixed should be true',
		).to.equal(true)
		expect(
			[{ object: vrMesh } as any].some((h: any) => isTableHit(h.object, root)),
			'VR alone false',
		).to.equal(false)
	})

	it('apron is hit', () => {
		const root = makeGroup('playfield')
		const primitives = makeGroup('primitives')
		root.add(primitives)
		const apronGroup = makeGroup('Apron')
		const apronMesh = makeMesh('primitive-apron_001')
		primitives.add(apronGroup)
		apronGroup.add(apronMesh)
		expect(isTableHit(apronMesh, root), 'apron').to.equal(true)
	})
})
