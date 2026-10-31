// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Object3D } from 'three'
import type { IRenderApi } from '../../render/irender-api.js'
import { applyAbsorbBlendState } from '../../render/threejs/nodes/primitive-bdl-node.js'
import { ItemUpdater } from '../item-updater.js'
import type { Light } from '../light/light.js'
import type { LightAnimation } from '../light/light-physics.js'
import type { Table } from '../table/table.js'
import { FlasherAddBlend, type FlasherData } from './flasher-data.js'

import { FlasherMeshGenerator } from './flasher-mesh-generator.js'
import type { FlasherState } from './flasher-state.js'

export class FlasherUpdater extends ItemUpdater<FlasherState> {
	private lastRotX: number
	private lastRotY: number
	private lastRotZ: number
	private lastHeight: number
	private lastImageA: string
	private linkedLight?: Light

	constructor(
		state: FlasherState,
		private readonly data: FlasherData,
		private readonly meshGenerator = new FlasherMeshGenerator(),
	) {
		super(state)
		this.lastRotX = data.rotX
		this.lastRotY = data.rotY
		this.lastRotZ = data.rotZ
		this.lastHeight = data.height
		this.lastImageA = data.szImageA ?? ''
	}

	/** Resolves the LMAP-linked light. @see Flasher::RenderSetup (`m_lightmap = m_ptable->GetLight(m_d.m_szLightmap)`) */
	public resolveLightmap(table: Table): void {
		this.linkedLight = this.data.szLightmap ? table.lights[this.data.szLightmap] : undefined
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: FlasherState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		this.state.mergeFrom(state)
		this.applyTransform(obj, renderApi, table)
		const target = obj as unknown as Object3D
		if (!target) return
		this.applyImage(target, renderApi)

		const alpha = this.effectiveAlpha(table)
		// Native Render skips the draw when the intensity scale is 0
		// (flasher.cpp Render: m_intensity_scale == 0 returns, no fallback to 1),
		// and a locked sequencer element with inPlayState off is not rendered
		// (flasher.cpp Render: m_lockedByLS && !m_inPlayState returns).
		const visible =
			!this.isSequencerOff() &&
			this.state.isVisible &&
			alpha > 0 &&
			this.data.intensityScale !== 0 &&
			(!this.data.addBlend || this.state.color !== 0)

		target.visible = visible
		if (!visible) return

		const intensity = (alpha * this.data.intensityScale) / 100
		// Both additive modes share the tint/intensity uniform path upstream (the
		// absorb sign flip lives in the shader encoding); blending differs.
		const absorb = this.data.addBlendMode === FlasherAddBlend.Absorb
		target.traverse((child: any) => {
			if (!child.isMesh || !child.material) return
			const mats = Array.isArray(child.material) ? child.material : [child.material]
			for (const mat of mats) {
				const userData = mat.userData as Record<string, any>
				if (this.data.addBlend) {
					if (userData?.__uTint?.value?.set) userData.__uTint.value.set(this.state.color)
					if (userData?.__uIntensity) userData.__uIntensity.value = intensity
					if (userData?.__uFlat?.value?.set)
						userData.__uFlat.value.set(this.state.color).multiplyScalar(intensity)
					if (absorb) applyAbsorbBlendState(mat)
				} else {
					if (mat.color?.set) mat.color.set(this.state.color)
					mat.opacity = Math.min(1, Math.max(0, alpha / 100))
					mat.transparent = mat.opacity < 1
				}
				mat.needsUpdate = true
			}
		})
	}

	/** Sequencer hide: locked with inPlayState off. @see Flasher::Render in src/parts/flasher.cpp */
	private isSequencerOff(): boolean {
		return this.state.lockedByLS && !this.state.inPlayState
	}

	/**
	 * Opacity modulated by the controller link or the linked light, never both.
	 * @see Flasher::Render in src/parts/flasher.cpp:1007-1020
	 */
	private effectiveAlpha(table: Table): number {
		// The controller link (if resolved) is already folded into state.alpha by
		// FlasherAnimation, which then suppresses this lightmap fallback — upstream
		// applies `linkState` *or* the lightmap ratio, exclusively.
		if (this.state.slnkResolved) return this.state.alpha
		const alpha = this.state.alpha
		const light = this.linkedLight ?? (this.data.szLightmap ? table.lights[this.data.szLightmap] : undefined)
		if (light) {
			const intensity = light.data.intensity
			const scale = (light.getAnimation() as LightAnimation | undefined)?.intensityScale ?? 1
			if (intensity === 0 || scale === 0) {
				return 0
			}
			return (alpha * light.getState().intensity) / (intensity * scale)
		}
		return alpha
	}

	/**
	 * Rebinds the overlay texture on script image swaps. Upstream resolves
	 * `GetImage(m_d.m_szImageA)` every frame (`Flasher::Render`); the
	 * build-time map only covers the authored image. Runs ahead of the
	 * visibility gate so a reshown flasher never flashes a stale image.
	 */
	private applyImage<NODE, GEOMETRY, POINT_LIGHT>(
		target: Object3D,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
	): void {
		if (this.state.imageA === this.lastImageA) return
		this.lastImageA = this.state.imageA
		renderApi.applyMaterial(target as unknown as NODE, undefined, this.state.imageA || undefined)
	}

	/** Regenerates the baked mesh when rotation/height changed, like upstream's dynamic vertex buffer. */
	private applyTransform<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		const current = this.state
		if (
			current.rotX === this.lastRotX &&
			current.rotY === this.lastRotY &&
			current.rotZ === this.lastRotZ &&
			current.height === this.lastHeight
		) {
			return
		}
		this.lastRotX = current.rotX
		this.lastRotY = current.rotY
		this.lastRotZ = current.rotZ
		this.lastHeight = current.height
		this.data.rotX = current.rotX
		this.data.rotY = current.rotY
		this.data.rotZ = current.rotZ
		this.data.height = current.height
		const mesh = this.meshGenerator.generateMesh(this.data, table)
		const node = renderApi.findInGroup(obj, `flasher-${current.getName()}`)
		if (mesh && node) {
			renderApi.applyMeshToNode(mesh, node)
		}
	}
}
