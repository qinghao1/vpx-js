// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
import { DataTexture, EquirectangularReflectionMapping } from 'three'
import { describe, expect, it } from 'vitest'
import { Vertex3D } from '../../../math/vector.js'
import { Ball } from '../../../vpt/ball/ball.js'
import { BallData } from '../../../vpt/ball/ball-data.js'
import { BallState } from '../../../vpt/ball/ball-state.js'
import { BALL_METALNESS, BALL_ROUGHNESS } from '../material-shared.js'
import { ThreeNodeMaterialGenerator } from '../three-node-material-generator.js'
import { createDynamicBallNodeMaterial } from './ball-reflection-node.js'

function ballMaterial(): any {
	return { name: 'ball', baseColor: 0xc0c0c0, isMetal: true, roughness: 0.8 }
}

function generatorWith(textures: Map<string, DataTexture>): any {
	return new ThreeNodeMaterialGenerator({
		hasTexture: (name: string) => textures.has(name),
		getTexture: (name: string) => textures.get(name),
	} as any)
}

function ballEnvTex(): DataTexture {
	const tex = new DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1)
	tex.needsUpdate = true
	return tex
}

describe('dynamic ball material (chrome sphere)', () => {
	it('shades on the filmic curve with default env gain', () => {
		const mat = createDynamicBallNodeMaterial(ballEnvTex())
		expect(mat.metalness, 'full metal, no diffuse lobe').toBe(BALL_METALNESS)
		expect(mat.roughness, 'mirror roughness').toBe(BALL_ROUGHNESS)
		expect(mat.envMap, 'sole reflection source bound').not.toBeNull()
		expect(mat.envMap.mapping, 'equirect env sampled as panorama').toBe(EquirectangularReflectionMapping)
		expect(mat.envMapIntensity, 'three.js default gain, matching late arrivals').toBe(1)
		expect(mat.toneMapped, 'same filmic curve as every other lit material').toBe(true)
	})

	it('honors the file tint', () => {
		expect(createDynamicBallNodeMaterial(ballEnvTex(), 0xff0000).color.getHex(), 'custom tint').toBe(0xff0000)
		expect(createDynamicBallNodeMaterial(ballEnvTex()).color.getHex(), 'default silver').toBe(0xc0c0c0)
	})

	it('takes the dynamic path while the env texture is resident', () => {
		const gen = generatorWith(new Map([['ball.png', ballEnvTex()]]))
		const mat = gen.getMaterial({ material: ballMaterial(), envMap: 'ball.png' })
		expect(mat.envMap, 'env bound at creation').not.toBeNull()
		expect(mat.toneMapped, 'filmic curve on the creation path').toBe(true)
		expect(mat.metalness, 'full metal on the creation path').toBe(BALL_METALNESS)
	})

	it('stashes a pending env key instead of rendering envless forever', () => {
		const textures = new Map<string, DataTexture>()
		const gen = generatorWith(textures)
		const mat = gen.getMaterial({ material: ballMaterial(), envMap: 'ball.png' })
		expect(mat.userData.pendingEnvMap, 'missing env streams in later').toBe('ball.png')
		textures.set('ball.png', ballEnvTex())
		expect(gen.resolvePendingTextures(), 'arrival binds the env').toBeGreaterThan(0)
		expect(mat.envMap, 'metal never left without reflections').not.toBeNull()
	})
})

describe('ball renderable wiring', () => {
	it('publishes the silver metal material with the ball env map', () => {
		const ball = new Ball(0, new BallData(), BallState.claim('Ball0', Vertex3D.claim(0, 0, 0)))
		const meshes = ball.getMeshes({} as any)
		expect(meshes.ball.isVisible, 'audited as visible').toBe(true)
		expect(meshes.ball.material?.name, 'isBall branch selector').toBe('ball')
		expect(meshes.ball.envMap?.getName(), 'preloaded default env').toBe('ball.png')
	})
})
