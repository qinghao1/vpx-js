// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { applyInitialEntryStates, assembleTableScene, syncTableRoom } from './table-scene.js'

function mesh(name: string): THREE.Mesh {
	const m = new THREE.Mesh(
		new THREE.BoxGeometry(10, 10, 10),
		new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 1 }),
	)
	m.name = name
	m.visible = true
	return m
}

describe('assembleTableScene', () => {
	it('hides the authored glass cover both renderers must drop (grey veil)', async () => {
		const scene = new THREE.Scene()
		const group = new THREE.Group()
		const glass = mesh('primitive-GlassCover')
		group.add(glass)
		const table = {
			getDimensions: () => ({ width: 1000, height: 2000 }),
			generateTableNode: async () => group,
		}
		const { node, stats } = await assembleTableScene({} as never, table as never, {
			viewerMode: 'play',
			maxLights: 16,
		})
		expect(node.getObjectByName('primitive-GlassCover')).toBe(glass)
		expect(glass.visible).toBe(false)
		expect(stats.glass).toBe(1)
		syncTableRoom(scene, node, new THREE.Vector3(), new THREE.Vector3(1000, 2000, 500))
		expect((scene.background as THREE.Color).getHex()).toBe(0x121a2b)
	})

	it('passes preloadTextures:false through (HEAD streaming behavior)', async () => {
		let seenOpts: Record<string, unknown> | null = null
		const table = {
			getDimensions: () => undefined,
			generateTableNode: async (_api: unknown, opts: Record<string, unknown>) => {
				seenOpts = opts
				return new THREE.Group()
			},
		}
		await assembleTableScene({} as never, table as never, { viewerMode: 'play' })
		expect(seenOpts?.preloadTextures).toBe(false)
		expect(seenOpts?.exportPlayfield).toBe(true)
	})

	it('runs onBeforePostprocess after generate, before postprocess hides', async () => {
		const group = new THREE.Group()
		const glass = mesh('primitive-GlassCover')
		group.add(glass)
		let hookVisible: boolean | null = null
		const table = {
			getDimensions: () => undefined,
			generateTableNode: async () => group,
		}
		await assembleTableScene({} as never, table as never, {
			viewerMode: 'play',
			onBeforePostprocess: () => {
				hookVisible = glass.visible
				// A worker-style authored sweep that re-shows the stray cover.
				glass.visible = true
			},
		})
		expect(hookVisible).toBe(true)
		expect(glass.visible).toBe(false)
	})
})

describe('applyInitialEntryStates', () => {
	it('applies every entry live state once, then fans out lightmap prims', () => {
		const calls: Array<{ name: string; state: unknown }> = []
		const entry = (name: string) => ({
			item: { getState: () => ({ on: true }) },
			node: { name },
			name,
			updater: {
				applyState: (_node: unknown, state: unknown) => {
					calls.push({ name, state })
				},
			},
		})
		const lamp = entry('LampGi')
		const prim = entry('primitive-lm_gi01')
		const cache = {
			entries: [lamp, prim],
			lightmap: new Map([['LampGi', ['primitive-lm_gi01']]]),
			lightNames: new Set(['LampGi']),
			idOf: (n: string) => (n === 'LampGi' ? 0 : 1),
		}
		applyInitialEntryStates(cache as never, {} as never, {} as never)
		const lampCalls = calls.filter(c => c.name === 'LampGi')
		const primCalls = calls.filter(c => c.name === 'primitive-lm_gi01')
		expect(lampCalls.length).toBe(1)
		expect(lampCalls[0]?.state).toEqual({ on: true })
		expect(primCalls.length).toBe(2)
		expect(
			primCalls.some(c => c.state !== null && typeof c.state === 'object' && Object.keys(c.state).length === 0),
		).toBe(true)
	})
})
