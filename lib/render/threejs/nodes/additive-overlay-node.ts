import type { Texture as ThreeTexture } from 'three'
import * as THREE from 'three'
import { AdditiveBlending, DoubleSide } from 'three'
import { color, Fn, texture, uniform, uv, vec4 } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'

export function createAdditiveOverlayNodeMaterial(
	map: ThreeTexture,
	initialIntensity = 1.0,
	tint = 0xffffff,
): MeshBasicNodeMaterial {
	const mat = new MeshBasicNodeMaterial()
	const uIntensity = uniform(initialIntensity)
	const uTint = uniform(new THREE.Color(tint))
	const texNode = texture(map, uv())

	mat.colorNode = Fn(() => {
		const base = texNode
		const rgb = base.rgb.mul(uTint).mul(uIntensity)
		return vec4(rgb, base.a.mul(uIntensity)) // alpha ignored for AdditiveBlending (ONE,ONE)
	})()

	mat.blending = AdditiveBlending
	mat.transparent = true
	mat.depthWrite = false
	mat.depthTest = true
	mat.toneMapped = false
	mat.side = DoubleSide
	mat.polygonOffset = true
	mat.polygonOffsetFactor = -2
	mat.polygonOffsetUnits = -4

	;(mat.userData as any).__uIntensity = uIntensity
	// Compat for regression test that checks emissiveIntensity on overlay (VLM.Bake lightmap)
	Object.defineProperty(mat, 'emissiveIntensity', {
		get() {
			return (this.userData as any).__uIntensity?.value ?? 1
		},
		set(v) {
			if ((this.userData as any).__uIntensity) (this.userData as any).__uIntensity.value = v
		},
		configurable: true,
		enumerable: false,
	})
	// Ensure initial value syncs
	;(mat as any).emissiveIntensity = initialIntensity
	return mat
}
