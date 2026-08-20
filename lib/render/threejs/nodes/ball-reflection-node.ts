import type { Texture as ThreeTexture } from 'three'
import * as THREE from 'three'
import { DoubleSide } from 'three'
import {
	cameraPosition,
	cameraProjectionMatrix,
	cameraViewMatrix,
	dot,
	Fn,
	float,
	mix,
	normalize,
	normalView,
	normalWorld,
	positionWorld,
	reflect,
	smoothstep,
	texture,
	uniform,
	vec2,
	vec4,
} from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'

export function createDynamicBallNodeMaterial(
	envTexture: ThreeTexture,
	playfieldTexture?: ThreeTexture,
	tintColor = 0xc0c0c0,
): MeshBasicNodeMaterial {
	const mat = new MeshBasicNodeMaterial()
	const uTint = uniform(new THREE.Color(tintColor))
	const uPlayfieldNormal = uniform(new THREE.Vector3(0.0, 0.0, 1.0))
	const uPlayfieldOrigin = uniform(new THREE.Vector3(0.0, 0.0, 0.0))

	mat.colorNode = Fn(() => {
		// 1. Authentic MatCap mapping for ball.png sphere map
		const N_view = normalize(normalView)
		const matcapUv = N_view.xy.mul(vec2(0.495, 0.495)).add(vec2(0.5, 0.5))
		const envSample = texture(envTexture, matcapUv)
		let ballColor: any = envSample.rgb

		// 2. Playfield planar reflection overlay (fs_ball.sc:157-190)
		if (playfieldTexture) {
			const viewDir_w = normalize(positionWorld.sub(cameraPosition))
			const reflRay_w = reflect(viewDir_w, normalWorld)
			const NdotR = dot(uPlayfieldNormal, reflRay_w)
			const distToPlane = dot(uPlayfieldNormal, positionWorld.sub(uPlayfieldOrigin))
			const t = distToPlane.mul(float(-1)).div(NdotR)
			const playfieldHitPos = positionWorld.sub(reflRay_w.mul(t))
			const clipPos = cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(playfieldHitPos, 1.0))
			const ndc = clipPos.xy.div(clipPos.w)
			const playfieldUv = ndc.mul(0.5).add(vec2(0.5, 0.5))
			const playfieldColor = texture(playfieldTexture, playfieldUv)
			const hitValid = smoothstep(float(0.0), float(0.15), NdotR)
			ballColor = mix(ballColor, playfieldColor.rgb, hitValid.mul(0.5))
		}

		const finalRgb = ballColor.mul(uTint)
		return vec4(finalRgb, float(1.0))
	})()

	mat.side = DoubleSide
	mat.depthWrite = true
	mat.depthTest = true
	mat.toneMapped = false
	return mat
}
