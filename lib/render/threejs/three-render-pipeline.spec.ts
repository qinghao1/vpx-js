// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import * as THREE from 'three'
import { VpxRenderPipeline } from './three-render-pipeline.js'

function makePipeline(): { pipeline: VpxRenderPipeline; renderer: { toneMappingExposure?: number } } {
	const renderer: { toneMappingExposure?: number } = {}
	const pipeline = new VpxRenderPipeline(
		renderer as never,
		new THREE.Scene() as never,
		new THREE.PerspectiveCamera() as never,
		{ bloomEnabled: false },
	)
	return { pipeline, renderer }
}

describe('render pipeline exposure', () => {
	it('caps runtime exposure updates at the native 0..2 range', () => {
		const { pipeline, renderer } = makePipeline()
		pipeline.updateExposure(9)
		expect(renderer.toneMappingExposure).to.equal(2)
	})

	it('passes through in-range exposure updates', () => {
		const { pipeline, renderer } = makePipeline()
		pipeline.updateExposure(1.5)
		expect(renderer.toneMappingExposure).to.equal(1.5)
	})

	it('caps construction exposure at the low-quality 1.5 ceiling', () => {
		const renderer: { toneMappingExposure?: number } = {}
		new VpxRenderPipeline(renderer as never, new THREE.Scene() as never, new THREE.PerspectiveCamera() as never, {
			bloomEnabled: false,
			exposure: 9,
			lowQuality: true,
		})
		expect(renderer.toneMappingExposure).to.equal(1.5)
	})

	it('caps runtime exposure updates at the low-quality 1.5 ceiling', () => {
		const renderer: { toneMappingExposure?: number } = {}
		const pipeline = new VpxRenderPipeline(
			renderer as never,
			new THREE.Scene() as never,
			new THREE.PerspectiveCamera() as never,
			{ bloomEnabled: false, lowQuality: true },
		)
		pipeline.updateExposure(9)
		expect(renderer.toneMappingExposure).to.equal(1.5)
	})

	it('opts bloom out when the table strength is zero or less', () => {
		const off = new VpxRenderPipeline(
			{} as never,
			new THREE.Scene() as never,
			new THREE.PerspectiveCamera() as never,
			{ bloomStrength: 0 },
		)
		expect(off.pipeline.outputNode, 'zero table strength must skip the bloom composite').to.equal(off.sceneColor)
	})

	it('keeps bloom on by default and for positive table strength', () => {
		const def = new VpxRenderPipeline(
			{} as never,
			new THREE.Scene() as never,
			new THREE.PerspectiveCamera() as never,
			{},
		)
		expect(def.pipeline.outputNode).not.to.equal(def.sceneColor)
		const on = new VpxRenderPipeline(
			{} as never,
			new THREE.Scene() as never,
			new THREE.PerspectiveCamera() as never,
			{ bloomStrength: 0.5 },
		)
		expect(on.pipeline.outputNode).not.to.equal(on.sceneColor)
	})
})
