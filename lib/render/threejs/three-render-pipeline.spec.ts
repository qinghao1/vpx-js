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
})
