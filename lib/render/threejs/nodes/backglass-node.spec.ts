// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import * as THREE from 'three'
import {
	BACKDROP_HEIGHT,
	BACKDROP_WIDTH,
	backdropRectToNdc,
	backglassPanelMatrix,
	createBackdropPlane,
	createReelDigitQuad,
	digitCellUV,
	fitBackglassPanel,
} from './backglass-node.js'

describe('Backglass layout', () => {
	it('lays a non-grid strip as one horizontal row', () => {
		// digitRange 9, no grid: 10 cells across, first row at top (high v).
		const first = digitCellUV(0, 9, false, 1)
		expect(first.u0).to.equal(0)
		expect(first.u1).to.be.closeTo(0.1, 1e-9)
		expect(first.v0).to.equal(0)
		expect(first.v1).to.equal(1)
		const last = digitCellUV(9, 9, false, 1)
		expect(last.u0).to.be.closeTo(0.9, 1e-9)
		expect(last.u1).to.equal(1)
		expect(last.v0).to.equal(first.v0)
	})

	it('lays a single-column grid as stacked rows', () => {
		const top = digitCellUV(0, 9, true, 1)
		expect(top.u0).to.equal(0)
		expect(top.u1).to.equal(1)
		expect(top.v1).to.equal(1)
		const second = digitCellUV(1, 9, true, 1)
		expect(second.v1).to.be.closeTo(0.9, 1e-9)
		expect(second.v0).to.be.closeTo(0.8, 1e-9)
	})

	it('wraps grid rows after imagesPerGridRow columns', () => {
		const fifth = digitCellUV(4, 9, true, 5)
		expect(fifth.u0).to.be.closeTo(0.8, 1e-9)
		expect(fifth.v1).to.equal(1)
		const sixth = digitCellUV(5, 9, true, 5)
		expect(sixth.u0).to.equal(0)
		expect(sixth.v1).to.be.closeTo(0.5, 1e-9)
	})

	it('clamps out-of-range digits instead of reading past the strip', () => {
		expect(digitCellUV(-1, 9, false, 1)).to.deep.equal(digitCellUV(0, 9, false, 1))
		expect(digitCellUV(10, 9, false, 1)).to.deep.equal(digitCellUV(9, 9, false, 1))
	})

	it('maps backdrop px to NDC with y down flipped', () => {
		const full = backdropRectToNdc(0, 0, BACKDROP_WIDTH, BACKDROP_HEIGHT)
		expect(full.centerX).to.equal(0)
		expect(full.centerY).to.equal(0)
		expect(full.sizeX).to.equal(2)
		expect(full.sizeY).to.equal(2)
		// Top-left quadrant lands at (-0.5, +0.5).
		const quad = backdropRectToNdc(0, 0, BACKDROP_WIDTH / 2, BACKDROP_HEIGHT / 2)
		expect(quad.centerX).to.be.closeTo(-0.5, 1e-9)
		expect(quad.centerY).to.be.closeTo(0.5, 1e-9)
	})

	const playfield = { left: 0, right: 952, top: 0, glassHeight: 210 }
	const corners = (panel: THREE.Matrix4) =>
		[
			[-1, -1],
			[1, -1],
			[-1, 1],
			[1, 1],
		].map(([x, y]) => new THREE.Vector3(x, y, 0).applyMatrix4(panel))

	it('stands the panel on the head of the table, shaped like the art', () => {
		const panel = backglassPanelMatrix(playfield, 16 / 9, 450)
		const [bottomLeft, bottomRight, topLeft] = corners(panel)
		// Height is -z in table space: the bottom edge sits at glass height.
		expect(-bottomLeft!.z).to.be.closeTo(210, 1e-6)
		// On the head line itself, never over the playfield (y grows down-table).
		expect(bottomLeft!.y).to.be.closeTo(0, 1e-6)
		expect(bottomRight!.x - bottomLeft!.x).to.be.closeTo(800, 1e-6)
		expect((bottomLeft!.x + bottomRight!.x) / 2).to.be.closeTo(476, 1e-6)
		// Upright with the authored lean: the top edge is higher and further back.
		expect(-topLeft!.z - 210).to.be.closeTo(450 * Math.cos(Math.atan2(57, 907)), 1e-6)
		expect(topLeft!.y).to.be.lessThan(bottomLeft!.y)
		expect(new THREE.Vector3(0, 0, 1).transformDirection(panel).y).to.be.greaterThan(0.99)
	})

	it('fits the panel into the room the view leaves above the table', () => {
		// Table-local VPX space is the world here; a camera down-table and above
		// the playfield (height is -z), looking at the head.
		const view = (fov: number, aspect: number) => {
			const camera = new THREE.PerspectiveCamera(fov, aspect, 1, 1e5)
			camera.up.set(0, 0, -1)
			camera.position.set(476, 2600, -1500)
			camera.lookAt(476, 600, 0)
			camera.updateMatrixWorld()
			return camera
		}
		const heightOf = (panel: THREE.Matrix4) => {
			const [bottomLeft, , topLeft] = corners(panel)
			return topLeft!.distanceTo(bottomLeft!)
		}
		const tight = view(40, 16 / 9)
		const fitted = fitBackglassPanel(playfield, 16 / 9, tight, new THREE.Matrix4())
		expect(heightOf(fitted)).to.be.greaterThan(0)
		for (const corner of corners(fitted)) {
			const ndc = corner.project(tight)
			expect(Math.abs(ndc.x)).to.be.at.most(0.96 + 1e-6)
			expect(ndc.y).to.be.at.most(0.96 + 1e-6)
		}
		// More room grows it, up to the authored backglass width (1.335 playfields).
		const roomy = fitBackglassPanel(playfield, 16 / 9, view(90, 0.5), new THREE.Matrix4())
		expect(heightOf(roomy)).to.be.greaterThan(heightOf(fitted))
		expect(heightOf(roomy) * (16 / 9)).to.be.closeTo(1.335 * 952, 1e-3)
	})

	it('builds cutout digit quads and a flat fallback backdrop', () => {
		const quad = createReelDigitQuad(
			new THREE.Texture(),
			backdropRectToNdc(0, 0, 21, 40),
			digitCellUV(0, 9, false, 1),
		)
		const quadMaterial = quad.material as THREE.MeshBasicMaterial
		expect(quadMaterial.alphaTest).to.be.closeTo(128 / 255, 1e-9)
		expect(quadMaterial.depthTest).to.equal(true)
		expect(quadMaterial.depthWrite).to.equal(true)
		const flat = createBackdropPlane(undefined, 0x123456)
		expect((flat.material as THREE.MeshBasicMaterial).color.getHex()).to.equal(0x123456)
	})
})
