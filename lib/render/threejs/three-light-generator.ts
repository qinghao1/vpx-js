// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { type MeshStandardMaterial, type Object3D, PointLight, type Mesh as ThreeMesh } from 'three'
import type { LightData, LightState } from '../../vpt/light/light.js'
import { bakedIntensity } from '../../vpt/light/light-physics.js'
import type { Table } from '../../vpt/table/table.js'
import { getAuthoredVisible } from './authored-visible.js'
import { type MergedBulbGlowRef, setBulbGlowState, setMergedBulbGlowRangeState } from './nodes/bulb-glow-node.js'
import { ThreeRenderApi } from './three-render-api.js'

export class ThreeLightGenerator {
	public createPointLight(d: LightData, table?: Table): PointLight {
		// Bake-time live level mirrors native RenderSetup; the authored
		// falloff power rides decay as the closest physical analog of the
		// native lightmap falloff (1 - d/range)^falloffPower — an
		// approximation, three.js has no such curve. Distance is unchanged.
		const light = new PointLight(d.color, bakedIntensity(d), d.falloff * ThreeRenderApi.SCALE, d.falloffPower)
		light.name = 'light'
		// Negated: scene space maps local +z to world -y (transformScene
		// rotateX), so table-up is local -z — same as the extruded light mesh.
		const z = table ? table.getSurfaceHeight(d.szSurface, d.center.x, d.center.y) + d.height : d.height
		light.position.set(d.center.x, d.center.y, -z)
		light.updateMatrixWorld()
		return light
	}

	public applyLighting(state: LightState, obj?: Object3D): void {
		if (!obj) return
		this.applyLightToTarget(obj, state)
		const children = obj.children
		for (let i = 0; i < children.length; i++) {
			this.applyLightToTarget(children[i] as Object3D, state)
		}
	}

	private applyLightToTarget(child: Object3D, state: LightState): void {
		// 'bulb.light'/'surface.light' are intentionally static, matching
		// upstream: the base glass/socket draw uses a fixed material
		// ("Glass is always static", src/parts/light.cpp bulb-model block —
		// the values baked in getMeshes mirror that block exactly). Upstream
		// live modulation (bulb hull at intensity*0.02 plus the lightmap pass
		// at m_currentIntensity, both in the Light::Render body) rides the
		// 'light' point light and the 'bulb.glow' uniforms instead, both
		// driven below. Surface inserts have no live path: their node
		// materials expose no generic emissive uniform to scale, so their
		// bake stays at the authored state (live animation reaches
		// referencing primitives through the szLightmap fan-out).
		switch (child.name) {
			case 'light':
				if (state.intensity !== undefined) (child as PointLight).intensity = state.intensity
				if (state.color !== undefined) (child as PointLight).color.set(state.color)
				break
			case 'bulb.glow': {
				// Merged quad: write live state into its vertex range in place.
				const mergedRef = (child as ThreeMesh).userData?.__mergedGlow as MergedBulbGlowRef | undefined
				if (mergedRef) {
					if (state.intensity !== undefined || state.color !== undefined || state.colorFull !== undefined) {
						setMergedBulbGlowRangeState(
							mergedRef.mesh,
							{ start: mergedRef.start, count: mergedRef.count },
							{
								intensity: state.intensity,
								color: state.color,
								color2: (state as { colorFull?: number }).colorFull,
							},
						)
					}
					break
				}
				// Visibility follows the live lamp state (an off lamp adds no
				// light, so its quad stays out of the draw list); intensity 0
				// already renders nothing, this just skips the draw call.
				// Quads built before the createMesh stamp predate the flag and
				// default to visible; authored-invisible lights stay hidden
				// (upstream gates bulb/glow rendering on m_d.m_visible).
				if (state.intensity !== undefined) {
					child.visible = state.intensity > 0 && getAuthoredVisible(child)
				}
				const glow = (child as ThreeMesh).material as MeshStandardMaterial
				if (glow) {
					// Native drives the lightmap glow from the live lamp state
					// (lightColor_intensity + colors in fs_classic_light.sc).
					if (state.intensity !== undefined || state.color !== undefined || state.colorFull !== undefined) {
						setBulbGlowState(glow, {
							intensity: state.intensity,
							color: state.color,
							color2: (state as { colorFull?: number }).colorFull,
						})
					}
				}
				break
			}
		}
	}
}
