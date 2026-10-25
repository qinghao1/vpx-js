import type { Object3D } from 'three'
import type { IRenderApi } from '../../render/irender-api.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { FlasherData } from './flasher.js'
import type { FlasherState } from './flasher-state.js'

export class FlasherUpdater extends ItemUpdater<FlasherState> {
	constructor(
		state: FlasherState,
		private readonly data: FlasherData,
	) {
		super(state)
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: FlasherState,
		_renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		_table: Table,
	): void {
		Object.assign(this.state, state)
		const target = obj as unknown as Object3D
		if (!target) return

		const visible = this.state.isVisible && this.state.alpha > 0 && (!this.data.addBlend || this.state.color !== 0)

		target.visible = visible
		if (!visible) return

		const intensity = (this.state.alpha * (this.data.intensityScale || 1)) / 100
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
				} else {
					if (mat.color?.set) mat.color.set(this.state.color)
					mat.opacity = Math.min(1, Math.max(0, this.state.alpha / 100))
					mat.transparent = mat.opacity < 1
				}
				mat.needsUpdate = true
			}
		})
	}
}
