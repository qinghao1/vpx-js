// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import {
	type MeshStandardMaterial,
	type Object3D,
	PointLight,
	type Mesh as ThreeMesh,
	Vector2,
} from '../../refs.node.js'
import { Enums } from '../../vpt/enums.js'
import type { LightData } from '../../vpt/light/light-data.js'
import type { LightState } from '../../vpt/light/light-state.js'
import { ThreeRenderApi } from './three-render-api.js'

/** Generates and updates Three.js lights. */
export class ThreeLightGenerator {
	public static readonly EMISSIVE_MAP_FACTOR = 0.1
	public static readonly BULB_FACTOR = 10
	private readonly hsl: { h: number; s: number; l: number } = { h: 0, s: 0, l: 0 }

	public createPointLight(d: LightData): PointLight {
		const intensity = d.state !== Enums.LightStatus.LightStateOff ? d.intensity * ThreeLightGenerator.BULB_FACTOR : 0
		const light = new PointLight(d.color, intensity, d.falloff * ThreeRenderApi.SCALE, 2)
		light.name = 'light'
		light.color.set(d.color)
		light.position.set(d.center.x, d.center.y, -10)
		light.updateMatrixWorld()
		if (ThreeRenderApi.SHADOWS && this.isSlingshot(d)) {
			light.castShadow = true
			light.shadow.bias = -0.001
			light.shadow.radius = 12
			light.shadow.mapSize = new Vector2(512, 512)
		}
		return light
	}

	public applyLighting(state: LightState, initial: number, obj?: Object3D): void {
		if (!obj) return
		for (const child of obj.children) {
			if (child.name === 'light') {
				const pl = child as PointLight
				pl.intensity = state.intensity * ThreeLightGenerator.BULB_FACTOR
				pl.color.set(state.color)
			} else if (child.name === 'bulb.light') {
				const m = (child as ThreeMesh).material as MeshStandardMaterial
				m.emissiveIntensity = state.intensity / initial
				m.color.set(state.color)
				m.emissive.set(state.color)
			} else if (child.name === 'surface.light') {
				const m = (child as ThreeMesh).material as MeshStandardMaterial
				m.emissiveIntensity = state.intensity * ThreeLightGenerator.EMISSIVE_MAP_FACTOR
				m.emissive.set(state.color)
				m.emissive.getHSL(this.hsl)
				m.emissive.setHSL(this.hsl.h, this.hsl.s, this.hsl.l * 1.25)
			}
		}
	}

	private isSlingshot(d: LightData): boolean {
		return (
			((d.center.x > 150 && d.center.x < 250) || (d.center.x > 600 && d.center.x < 750)) &&
			d.center.y > 1400 &&
			d.center.y < 1650
		)
	}
}
