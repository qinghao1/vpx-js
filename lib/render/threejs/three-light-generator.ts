// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { type MeshStandardMaterial, type Object3D, PointLight, type Mesh as ThreeMesh } from '../../refs.node.js'
import { Enums } from '../../vpt/enums.js'
import type { LightData } from '../../vpt/light/light-data.js'
import type { LightState } from '../../vpt/light/light-state.js'
import type { Table } from '../../vpt/table/table.js'
import { ThreeRenderApi } from './three-render-api.js'

/** Generates and updates Three.js lights. */
export class ThreeLightGenerator {
	public createPointLight(d: LightData, table?: Table): PointLight {
		const intensity = d.state !== Enums.LightStatus.LightStateOff ? d.intensity : 0
		const light = new PointLight(d.color, intensity, d.falloff * ThreeRenderApi.SCALE, 2)
		light.name = 'light'
		light.color.set(d.color)
		const z = table ? table.getSurfaceHeight(d.szSurface, d.center.x, d.center.y) + d.height : d.height
		light.position.set(d.center.x, d.center.y, z)
		light.updateMatrixWorld()
		return light
	}

	public applyLighting(state: LightState, initial: number, obj?: Object3D): void {
		if (!obj) return
		for (const child of obj.children) {
			switch (child.name) {
				case 'light':
					;(child as PointLight).intensity = state.intensity
					;(child as PointLight).color.set(state.color)
					break
				case 'bulb.light': {
					const m = (child as ThreeMesh).material as MeshStandardMaterial
					m.emissiveIntensity = state.intensity / initial
					m.color.set(state.color)
					m.emissive.set(state.color)
					break
				}
				case 'surface.light': {
					const m = (child as ThreeMesh).material as MeshStandardMaterial
					m.emissiveIntensity = state.intensity
					m.emissive.set(state.color)
					break
				}
			}
		}
	}
}
