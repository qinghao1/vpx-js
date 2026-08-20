import type { Texture as ThreeTexture } from 'three'
import * as THREE from 'three'
import { DoubleSide, EquirectangularReflectionMapping } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'

export function createDynamicBallNodeMaterial(
	envTexture: ThreeTexture,
	tintColor = 0xc0c0c0,
): MeshStandardNodeMaterial {
	const mat = new MeshStandardNodeMaterial()
	envTexture.mapping = EquirectangularReflectionMapping
	mat.envMap = envTexture
	mat.envMapIntensity = 1.5
	mat.metalness = 1.0
	mat.roughness = 0.08
	mat.color = new THREE.Color(tintColor)
	mat.side = DoubleSide
	mat.depthWrite = true
	mat.depthTest = true
	mat.toneMapped = false
	return mat
}
