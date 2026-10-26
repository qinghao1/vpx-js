import { AdditiveBlending, Color, DoubleSide, type Texture as ThreeTexture } from 'three'
import { Fn, texture, uniform, uv, vec4 } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { defineEmissiveIntensityCompat } from '../material-shared.js'

export function createAdditiveOverlayNodeMaterial(
	map: ThreeTexture,
	initialIntensity = 1.0,
	tint = 0xffffff,
): MeshBasicNodeMaterial {
	const mat = new MeshBasicNodeMaterial()
	const uIntensity = uniform(initialIntensity)
	const uTint = uniform(new Color(tint))
	const texNode = texture(map, uv())

	mat.colorNode = Fn(() => {
		const rgb = texNode.rgb.mul(uTint).mul(uIntensity)
		// three.js AdditiveBlending is (SRC_ALPHA, ONE), so texel alpha scales the
		// contribution (upstream D3D additive is (ONE, ONE); kept as-is: the
		// overlays author their falloff in alpha and e2e brightness is calibrated).
		return vec4(rgb, texNode.a.mul(uIntensity))
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
	defineEmissiveIntensityCompat(mat)
	// Ensure initial value syncs
	;(mat as any).emissiveIntensity = initialIntensity
	return mat
}
