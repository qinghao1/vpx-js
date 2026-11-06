import { Color, DoubleSide, EquirectangularReflectionMapping, type Texture as ThreeTexture } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { BALL_METALNESS, BALL_ROUGHNESS } from '../material-shared.js'

/**
 * Chrome ball: full metal at BALL_ROUGHNESS over the table's ball env map.
 * Stays on the renderer's filmic curve (toneMapped) with default env gain so
 * the ball shades like every other lit material instead of clipping to a flat
 * disc when the rig runs bright or collapsing to one when it runs dark.
 */
export function createDynamicBallNodeMaterial(
	envTexture: ThreeTexture,
	tintColor = 0xc0c0c0,
): MeshStandardNodeMaterial {
	const mat = new MeshStandardNodeMaterial()
	envTexture.mapping = EquirectangularReflectionMapping
	mat.envMap = envTexture
	mat.envMapIntensity = 1
	mat.metalness = BALL_METALNESS
	mat.roughness = BALL_ROUGHNESS
	mat.color = new Color(tintColor)
	mat.side = DoubleSide
	mat.depthWrite = true
	mat.depthTest = true
	mat.toneMapped = true
	return mat
}
