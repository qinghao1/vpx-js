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
	max,
	mix,
	normalize,
	normalView,
	normalWorld,
	positionView,
	positionWorld,
	reflect,
	smoothstep,
	sqrt,
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
	const uEnvIntensity = uniform(1.2)
	const uPlayfieldNormal = uniform(new THREE.Vector3(0.0, 0.0, 1.0))
	const uPlayfieldOrigin = uniform(new THREE.Vector3(0.0, 0.0, 0.0))

	mat.colorNode = Fn(() => {
		// 1. Upstream fs_ball.sc spherical environment map reflection adapted to Three.js view space
		const V_view = normalize(positionView.negate())
		const N_view = normalize(normalView)
		const R_view = reflect(V_view.negate(), N_view)

		// Spherical map reflection UV for Three.js (camera looks down -Z, so R.z is positive towards camera)
		const m = float(0.35355339).div(sqrt(max(float(0.0001), float(1.0).add(R_view.z))))
		const envUv = vec2(float(0.5).add(m.mul(R_view.x)), float(0.5).add(m.mul(R_view.y)))
		const envSample = texture(envTexture, envUv)
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
			ballColor = mix(ballColor, playfieldColor.rgb, hitValid.mul(0.75))
		}

		// Subtle chrome Fresnel rim for realistic 3D specular depth
		const NdotV = max(float(0.0), dot(N_view, V_view))
		const fresnel = float(1.0).sub(NdotV).pow(float(3.0)).mul(float(0.35))
		const finalRgb = ballColor.add(fresnel).mul(uTint).mul(uEnvIntensity)
		return vec4(finalRgb, float(1.0))
	})()

	mat.side = DoubleSide
	mat.depthWrite = true
	mat.depthTest = true
	mat.toneMapped = false
	return mat
}
