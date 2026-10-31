// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import * as THREE from 'three'
import {
	BACKDROP_HEIGHT,
	BACKDROP_WIDTH,
	backdropContainScale,
	backdropRectToNdc,
	createBackdropPlane,
	createReelDigitQuad,
	digitCellUV,
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

	it('contain-fits the backdrop space: square units on any screen', () => {
		// 4:3 space is identity; wider screens pillarbox, taller letterbox.
		expect(backdropContainScale(4 / 3)).to.deep.equal({ scaleX: 1, scaleY: 1 })
		expect(backdropContainScale(16 / 9)).to.deep.equal({ scaleX: 3 / 4, scaleY: 1 })
		expect(backdropContainScale(1)).to.deep.equal({ scaleX: 1, scaleY: 3 / 4 })
		// Degenerate input falls back to a 16:9 screen.
		expect(backdropContainScale(0)).to.deep.equal(backdropContainScale(16 / 9))
		// A backdrop-space square covers square pixels at any resolution,
		// and contain never magnifies.
		for (const [w, h] of [
			[1920, 1080],
			[800, 600],
			[600, 800],
		]) {
			const fit = backdropContainScale(w / h)
			expect(fit.scaleX).to.be.at.most(1)
			expect(fit.scaleY).to.be.at.most(1)
			expect((fit.scaleX * w) / BACKDROP_WIDTH).to.be.closeTo((fit.scaleY * h) / BACKDROP_HEIGHT, 1e-9)
		}
	})

	it('builds cutout digit quads and a flat fallback backdrop', () => {
		const quad = createReelDigitQuad(
			new THREE.Texture(),
			backdropRectToNdc(0, 0, 21, 40),
			digitCellUV(0, 9, false, 1),
		)
		expect(quad.material.alphaTest).to.be.closeTo(128 / 255, 1e-9)
		expect(quad.material.depthTest).to.equal(true)
		expect(quad.material.depthWrite).to.equal(true)
		const flat = createBackdropPlane(undefined, 0x123456)
		expect(flat.material.color.getHex()).to.equal(0x123456)
	})
})
