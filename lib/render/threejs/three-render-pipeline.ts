// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { pass, uniform } from 'three/tsl'
import * as THREE from 'three/webgpu'
import { clampExposure, resolveToneMapping } from './tone-mapping.js'

export interface PipelineConfig {
	exposure?: number
	toneMapper?: number
	bloomEnabled?: boolean
	bloomStrength?: number
	bloomRadius?: number
	bloomThreshold?: number
	lowQuality?: boolean
}

export class VpxRenderPipeline {
	public readonly pipeline: THREE.RenderPipeline
	public readonly scenePass: any
	public readonly sceneColor: any
	private readonly uBloomStrength: any
	private readonly lowQuality: boolean

	constructor(
		private readonly renderer: THREE.WebGPURenderer,
		private readonly scene: THREE.Scene,
		private readonly camera: THREE.Camera,
		config: PipelineConfig = {},
	) {
		this.pipeline = new THREE.RenderPipeline(renderer)
		this.scenePass = pass(scene, camera)
		this.sceneColor = this.scenePass.getTextureNode('output')

		// resolveToneMapping owns the AgX default (upstream GetValidToneMapper);
		// callers pass the table value through, never their own fallback.
		;(this.renderer as any).toneMapping = resolveToneMapping(config.toneMapper)
		this.lowQuality = config.lowQuality ?? false
		;(this.renderer as any).toneMappingExposure = clampExposure(config.exposure, this.lowQuality)

		const bloomStrength = config.bloomStrength ?? 0.35
		this.uBloomStrength = uniform(bloomStrength)

		let compositeNode: any = this.sceneColor

		// Upstream IsBloomEnabled (Renderer.cpp): bloom runs only while the
		// table strength is positive (!m_bloomOff && m_bloom_strength > 0).
		// The 0.85 cutoff below is a vpx-js guess: upstream has no threshold
		// constant, UpdateBloom derives the cutoff from framebuffer luminance.
		if (config.bloomEnabled !== false && bloomStrength > 0) {
			const bloomNode = bloom(
				this.sceneColor,
				this.uBloomStrength,
				config.bloomRadius ?? 0.4,
				config.bloomThreshold ?? 0.85,
			)
			compositeNode = compositeNode.add(bloomNode)
		}

		this.pipeline.outputNode = compositeNode
		this.pipeline.outputColorTransform = true
	}

	public updateExposure(value: number): void {
		;(this.renderer as any).toneMappingExposure = clampExposure(value, this.lowQuality)
	}

	public updateToneMapper(tm: number): void {
		;(this.renderer as any).toneMapping = resolveToneMapping(tm)
	}

	public updateBloomStrength(strength: number): void {
		if (this.uBloomStrength && typeof this.uBloomStrength.value === 'number') {
			this.uBloomStrength.value = strength
		}
	}

	public render(): void {
		this.pipeline.render()
	}

	public dispose(): void {
		try {
			;(this.pipeline as any)?.dispose?.()
		} catch {}
	}
}
