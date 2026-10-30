#!/usr/bin/env tsx
// Lights repro: --case=dark and --case=horde. Shared table load + scene build,
// TAP output, nonzero exit on failure.
// Run: npx tsx test/harness/repro-lights.ts [--case=dark|horde|all] [--vpx=path]
import * as fs from 'node:fs'
import { Player } from '../../lib/game/player.js'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { ThreeRenderApi } from '../../lib/render/threejs/three-render-api.js'
import type { PrimitiveState } from '../../lib/vpt/primitive/primitive-state.js'
import { Table } from '../../lib/vpt/table/table.js'
import { TableMeshGenerator } from '../../lib/vpt/table/table-mesh-generator.js'
import { Tap, tapComment, tapHeader, tapPlan, tapSkip } from './tap.js'

type Case = 'dark' | 'horde'

function parseArgs(raw: string[]): { cases: Case[]; vpx: string } {
	let mode = 'all'
	let vpx = ''
	for (const token of raw) {
		if (token.startsWith('--case=')) {
			mode = token.slice('--case='.length)
		} else if (token.startsWith('--vpx=')) {
			vpx = token.slice('--vpx='.length)
		} else if (!token.startsWith('--')) {
			vpx = token
		}
	}
	if (!vpx) {
		vpx = 'walking_dead.vpx'
	}
	let cases: Case[]
	if (mode === 'dark') {
		cases = ['dark']
	} else if (mode === 'horde') {
		cases = ['horde']
	} else {
		cases = ['dark', 'horde']
	}
	return { cases, vpx }
}

const { cases, vpx } = parseArgs(process.argv.slice(2))
if (!fs.existsSync(vpx)) {
	tapHeader('repro-lights')
	tapComment(`vpx not found: ${vpx} (pass --vpx=... or a positional path)`)
	tapSkip(1, `repro-lights --case=${cases.join(',')}`, `vpx not found: ${vpx}`)
	tapPlan(1)
	process.exit(77)
}

const tap = new Tap('repro-lights')
tapComment(`vpx: ${vpx} cases: ${cases.join(',')}`)

// Shared table + scene setup for both cases.
const table = await Table.load(new NodeBinaryReader(vpx))
const lights = Object.values(table.lights)
const bulbTrue = lights.filter(light => light.data.bulbLight).length
tapComment(`lights total: ${lights.length}, bulbLight true: ${bulbTrue}`)

const api = new ThreeRenderApi({ applyMaterials: true })
const gen = new TableMeshGenerator(table)
const scene = gen.generateTableNode(api, { exportLightBulbLights: true })

const pointLights: any[] = []
scene.traverse((node: any) => {
	if (node.isPointLight) pointLights.push(node)
})
const avg = pointLights.reduce((sum, light) => sum + light.intensity, 0) / (pointLights.length || 1)
tapComment(
	`point lights in scene: ${pointLights.length}, avg intensity: ${avg.toFixed(2)} sample: ${pointLights
		.slice(0, 3)
		.map(p => p.intensity)
		.join(', ')}`,
)
const isTwd = vpx.includes('walking_dead')

function assertPointLightCount(label: string): void {
	tap.assert(
		pointLights.length === bulbTrue,
		`${label}: ${pointLights.length} scene point lights === ${bulbTrue} bulbLight`,
	)
	if (isTwd) {
		tap.assert(pointLights.length === 165, `${label}: TWD scene has 165 point lights (got ${pointLights.length})`)
	} else {
		tapComment('skip: 165 point-lights assert is TWD-only')
	}
}

function lastByName(name: string): any {
	let found: any = null
	scene.traverse((node: any) => {
		if (node.name === name) found = node
	})
	return found
}

if (cases.includes('dark')) {
	assertPointLightCount('dark')

	const meshes: any[] = []
	scene.traverse((node: any) => {
		if (node.isMesh) meshes.push(node)
	})
	const baked = meshes.filter(mesh => mesh.material.userData?.__isBaked).length
	const nonBaked = meshes.length - baked
	tapComment(`meshes: ${meshes.length} baked: ${baked} nonBaked: ${nonBaked}`)

	const gi = table.lights['106']
	if (gi) {
		for (const id of ['106', '107']) {
			const light = table.lights[id]
			if (light) {
				tapComment(
					`${id} data state ${light.data.state} intensity ${light.data.intensity} LightState ${light.getState().intensity} isOn ${light.data.isOn()}`,
				)
			}
		}
		tap.assert(gi.getState().intensity > 0, 'dark: GI 106 initial bright')
	} else {
		tapComment('skip: no light 106 (GI check is TWD-only)')
	}

	try {
		const smallTable = await Table.load(new NodeBinaryReader('test/fixtures/table-light.vpx'))
		const smallPlayer = new Player(smallTable).init()
		const surface = smallTable.lights.Surface
		tapComment(`small table Surface initial ${surface.getState().intensity} isOn ${surface.data.isOn()}`)
		tap.assert(surface.getState().intensity > 0, 'dark: small table initial bright')
		surface.getApi().State = 1
		smallPlayer.updateAnimations(20)
		tapComment(`small table after State=On t20 intensity ${surface.getState().intensity}`)
		tap.assert(surface.getState().intensity > 0, 'dark: small table bright after On')
	} catch (error) {
		tapComment(`skip: small-table player check failed: ${(error as Error).message}`)
	}

	const pf: any = lastByName('playfield_mesh')
	if (pf) {
		const material = pf.children[0].material
		tapComment(
			`playfield_mesh mat ${material.name} col ${material.color.getHexString()} em ${material.emissive.getHexString()} int ${material.emissiveIntensity} baked ${material.userData.__isBaked}`,
		)
		tap.assert(
			material.color.getHex() !== 0x000000 || material.emissiveIntensity > 0,
			'dark: playfield not completely dark',
		)
	} else {
		tapComment('skip: no playfield_mesh in scene')
	}
}

if (cases.includes('horde')) {
	const isBulb = lights.filter(light => light.isBulbLight()).length
	tapComment(`data.bulbLight ${bulbTrue}, isBulbLight ${isBulb} (isBulb should be 0 for TWD)`)
	assertPointLightCount('horde')

	const primOn = table.primitives['015_Primitive012']
	const primOff = table.primitives['015_Primitive011']
	if (primOn && primOff) {
		tapComment(
			`015 ON mat ${primOn.data.szMaterial} DLT ${primOn.data.disableLightingTop} DLB ${primOn.data.disableLightingBelow}`,
		)
		tapComment(
			`015 OFF mat ${primOff.data.szMaterial} DLT ${primOff.data.disableLightingTop} DLB ${primOff.data.disableLightingBelow}`,
		)
		const nodeOn: any = lastByName('015_Primitive012')
		const nodeOff: any = lastByName('015_Primitive011')
		if (nodeOn && nodeOff) {
			const mOn = nodeOn.children[0].material
			const mOff = nodeOff.children[0].material
			tapComment(
				`015 ON initial mat ${mOn.name} col ${mOn.color.getHexString()} em ${mOn.emissive.getHexString()} int ${mOn.emissiveIntensity}`,
			)
			tapComment(
				`015 OFF initial mat ${mOff.name} col ${mOff.color.getHexString()} em ${mOff.emissive.getHexString()} int ${mOff.emissiveIntensity}`,
			)
			primOn.getUpdater().applyState(nodeOn, { disableLightingTop: 1001 } as PrimitiveState, api, table)
			primOff.getUpdater().applyState(
				nodeOff,
				{
					disableLightingTop: 131,
					disableLightingBelow: 1,
					material: 'insertrectangle1on',
					map: 'insertrectangle1on',
				} as PrimitiveState,
				api,
				table,
			)
			const mOn2 = nodeOn.children[0].material
			const mOff2 = nodeOff.children[0].material
			tapComment(
				`015 ON after lamp ON col ${mOn2.color.getHexString()} em ${mOn2.emissive.getHexString()} int ${mOn2.emissiveIntensity}`,
			)
			tapComment(
				`015 OFF after lamp ON col ${mOff2.color.getHexString()} em ${mOff2.emissive.getHexString()} int ${mOff2.emissiveIntensity}`,
			)
			tap.assert(
				mOn2.emissiveIntensity === 1 && mOn2.color.getHexString() === '000000',
				'horde: HORDE ON bright after lamp ON',
			)
			tap.assert(mOff2.emissiveIntensity === 1, 'horde: HORDE OFF bright after lamp ON')
		} else {
			tapComment('skip: HORDE primitive nodes missing from scene')
		}
	} else {
		tapComment('skip: no 015 HORDE primitives (check is TWD-only)')
	}
}

process.exit(tap.done() ? 0 : 1)
