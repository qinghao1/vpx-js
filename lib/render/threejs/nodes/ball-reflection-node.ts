import { Color, DoubleSide, EquirectangularReflectionMapping, type Texture as ThreeTexture } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { BALL_METALNESS, BALL_ROUGHNESS } from '../material-shared.js'

export function createDynamicBallNodeMaterial(
	envTexture: ThreeTexture,
	tintColor = 0xc0c0c0,
): MeshStandardNodeMaterial {
	const mat = new MeshStandardNodeMaterial()
	envTexture.mapping = EquirectangularReflectionMapping
	mat.envMap = envTexture
	mat.envMapIntensity = 1.5
	mat.metalness = BALL_METALNESS
	mat.roughness = BALL_ROUGHNESS
	mat.color = new Color(tintColor)
	mat.side = DoubleSide
	mat.depthWrite = true
	mat.depthTest = true
	mat.toneMapped = false
	return mat
}
