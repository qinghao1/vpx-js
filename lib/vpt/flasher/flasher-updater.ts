// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IRenderApi } from '../../render/irender-api.js'
import { ItemUpdater, noteTextureDemand } from '../item-updater.js'
import { updatePrimitiveBdl } from '../primitive/primitive-material-protocol.js'
import { type EmuFloatState, lightmapAlphaFactor, tryGetLinkedFloatState } from '../state-link.js'
import type { Table } from '../table/table.js'
import { clampModulateVsAdd } from './flasher-blend.js'
import { FlasherAddBlend, type FlasherData } from './flasher-data.js'

import { FlasherMeshGenerator } from './flasher-mesh-generator.js'
import type { FlasherState } from './flasher-state.js'

export class FlasherUpdater extends ItemUpdater<FlasherState> {
	private lastRotX: number
	private lastRotY: number
	private lastRotZ: number
	private lastHeight: number
	private lastImageA: string
	private lastAddBlend = true
	private lastAddBlendMode = FlasherAddBlend.Add
	private emuProvider?: () => EmuFloatState | undefined

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
		this.lastAddBlend = data.addBlend
		this.lastAddBlendMode = data.addBlendMode
	}

	/** Controller-state source for SLNK modulation (same contract as the primitive updater). */
	public setEmuProvider(provider: () => EmuFloatState | undefined): void {
		this.emuProvider = provider
	}

	/** Engine state overrides win over authored data; absent keeps the data path. */
	private get effIntensityScale(): number {
		return this.state.intensityScale ?? this.data.intensityScale
	}

	private get effModulateVsAdd(): number {
		return this.state.modulateVsAdd ?? this.data.modulateVsAdd
	}

	private get effAddBlend(): boolean {
		return this.state.addBlend ?? this.data.addBlend
	}

	private get effAddBlendMode(): number {
		return this.state.addBlendMode ?? this.data.addBlendMode
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: FlasherState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		this.state.mergeFrom(state)
		this.applyTransform(obj, renderApi, table)
		const target = obj as unknown as {
			visible: boolean
			traverse(cb: (child: any) => void): void
		}
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
			this.effIntensityScale !== 0 &&
			this.state.color !== 0

		target.visible = visible
		if (!visible) return

		const intensity = (alpha * this.effIntensityScale) / 100
		// The absorb sign flip lives in the shader encoding, not here.
		const absorb = this.effAddBlendMode === FlasherAddBlend.Absorb
		target.traverse((child: any) => {
			if (!child.isMesh || !child.material) return
			const mats = Array.isArray(child.material) ? child.material : [child.material]
			for (const mat of mats) {
				const userData = mat.userData as Record<string, any>
				if (this.effAddBlend) {
					if (userData?.__uTint?.value?.set) userData.__uTint.value.set(this.state.color)
					if (userData?.__uIntensity) userData.__uIntensity.value = intensity
					// Script-animated values track without rebuild.
					if (userData?.__uModulate) userData.__uModulate.value = clampModulateVsAdd(this.effModulateVsAdd)
					if (userData?.__uFlat?.value?.set)
						userData.__uFlat.value.set(this.state.color).multiplyScalar(intensity)
					renderApi.convertFlasherBlend?.(mat, absorb ? 'absorb' : 'additive')
				} else {
					// Node graphs ignore classic color/opacity writes; they convert instead.
					if (userData?.__addBlend === true) renderApi.convertFlasherBlend?.(mat, 'plain')
					else {
						// BDL overlays carry tint/fade as uniforms (same protocol
						// the primitive updater uses); the classic writes below
						// only reach classic materials. updatePrimitiveBdl
						// no-ops there, so both paths stay correct.
						updatePrimitiveBdl(mat, {
							albedo: this.state.color,
							opacity: Math.min(1, Math.max(0, alpha / 100)),
						})
						if (mat.color?.set) mat.color.set(this.state.color)
						mat.opacity = Math.min(1, Math.max(0, alpha / 100))
						const transparent = mat.opacity < 1
						if (mat.transparent !== transparent) {
							mat.transparent = transparent
							mat.needsUpdate = true
						}
					}
				}
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
		// Upstream applies the controller link *or* the lightmap ratio,
		// never both (@see Flasher::Render in src/parts/flasher.cpp:1011-1020).
		// The WASM row carries the raw authored alpha, so both paths live here.
		const slnk = this.slnkLinkState()
		if (slnk !== undefined) return this.state.alpha * slnk
		return this.state.alpha * lightmapAlphaFactor(table, this.data.szLightmap)
	}

	/**
	 * Resolved SLNK controller value, or undefined when no link is set, no
	 * emulator is wired, or the link does not resolve (upstream then falls back
	 * to the lightmap). @see Flasher::Render in src/parts/flasher.cpp
	 */
	private slnkLinkState(): number | undefined {
		const link = this.data.stateSrcLink
		if (!link || !this.emuProvider) return undefined
		const linked = tryGetLinkedFloatState(this.emuProvider(), link)
		return linked.ok ? linked.value : undefined
	}

	/**
	 * Rebinds the overlay texture on script image swaps. Upstream resolves
	 * `GetImage(m_d.m_szImageA)` every frame (`Flasher::Render`); the
	 * build-time map only covers the authored image. Runs ahead of the
	 * visibility gate so a reshown flasher never flashes a stale image.
	 * DMD flashers keep the live node material; a script image swap must
	 * not replace it.
	 */
	private applyImage<NODE, GEOMETRY, POINT_LIGHT>(
		target: {
			visible: boolean
			traverse(cb: (child: any) => void): void
		},
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
	): void {
		if (this.data.isDMD) return
		if (this.state.imageA === this.lastImageA) return
		this.lastImageA = this.state.imageA
		// Write back so a later transform regen (which rebuilds from data)
		// cannot resurrect the replaced image, like the fields below do.
		this.data.szImageA = this.state.imageA
		// Empty string clears the slot; `undefined` would keep a stale bind.
		renderApi.applyMaterial(target as unknown as NODE, { map: this.state.imageA })
		if (this.state.imageA) noteTextureDemand(renderApi, this.state.imageA)
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
			current.height === this.lastHeight &&
			this.effAddBlend === this.lastAddBlend &&
			this.effAddBlendMode === this.lastAddBlendMode
		) {
			return
		}
		// Geometry regenerates here; the overlay material converts in place in
		// applyState, since applyMeshToNode carries geometry only.
		this.lastAddBlend = this.effAddBlend
		this.lastAddBlendMode = this.effAddBlendMode
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
