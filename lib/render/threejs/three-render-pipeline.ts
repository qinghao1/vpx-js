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
}

export class VpxRenderPipeline {
	public readonly pipeline: THREE.RenderPipeline
	public readonly scenePass: any
	public readonly sceneColor: any
	private readonly uBloomStrength: any

	constructor(
		private readonly renderer: THREE.WebGPURenderer,
		private readonly scene: THREE.Scene,
		private readonly camera: THREE.Camera,
		config: PipelineConfig = {},
	) {
		this.pipeline = new THREE.RenderPipeline(renderer)
		this.scenePass = pass(scene, camera)
		this.sceneColor = this.scenePass.getTextureNode('output')

		;(this.renderer as any).toneMapping = resolveToneMapping(config.toneMapper)
		;(this.renderer as any).toneMappingExposure = clampExposure(config.exposure, 2)

		this.uBloomStrength = uniform(config.bloomStrength ?? 0.35)

		let compositeNode: any = this.sceneColor

		if (config.bloomEnabled !== false) {
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
		;(this.renderer as any).toneMappingExposure = clampExposure(value, 2.5)
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
