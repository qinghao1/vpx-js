#!/usr/bin/env node
// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { existsSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { NodeBinaryReader } from '../lib/io/binary-reader.node.js'
import { ThreeTextureLoaderNode } from '../lib/render/threejs/three-texture-loader-node.js'
import { Table } from '../lib/vpt/table/table.js'
import { TableExporter, type TableExportOptions } from '../lib/vpt/table/table-exporter.js'
import { run, silenceLogger } from './cli.js'

// Headless export stays on MeshStandardMaterial (three/tsl is browser-only); keep any future TSL import guarded.

const itemFlags = {
	'--no-primitives': 'exportPrimitives',
	'--no-triggers': 'exportTriggers',
	'--no-kickers': 'exportKickers',
	'--no-gates': 'exportGates',
	'--no-targets': 'exportHitTargets',
	'--no-flippers': 'exportFlippers',
	'--no-bumpers': 'exportBumpers',
	'--no-ramps': 'exportRamps',
	'--no-surfaces': 'exportSurfaces',
	'--no-rubbers': 'exportRubbers',
	'--no-bulbs': 'exportLightBulbs',
	'--no-surface-lights': 'exportPlayfieldLights',
	'--no-playfield': 'exportPlayfield',
	'--no-plungers': 'exportPlungers',
	'--no-spinners': 'exportSpinners',
} as const satisfies Record<string, keyof TableExportOptions>

type ItemOption = (typeof itemFlags)[keyof typeof itemFlags]

function parseItemOptions(): Record<ItemOption, boolean> {
	const options = {} as Record<ItemOption, boolean>
	for (const [flag, option] of Object.entries(itemFlags)) {
		options[option] = !process.argv.includes(flag)
	}
	return options
}

run(async () => {
	const argSrc = process.argv[2]
	const argDest = process.argv[3]

	// other options
	if (process.argv.includes('--compress-vertices')) {
		console.warn('--compress-vertices is deprecated (Draco compression removed)')
	}
	if (process.argv.includes('--skip-optimize')) {
		console.warn('--skip-optimize is deprecated (sharp optimization removed)')
	}
	const applyTextures = !process.argv.includes('--no-textures') ? new ThreeTextureLoaderNode() : undefined
	const applyMaterials = !process.argv.includes('--no-materials')
	const exportLightBulbLights = !process.argv.includes('--no-lights')

	// silence logs
	silenceLogger()

	const start = Date.now()
	if (!argSrc) {
		console.log(
			'Converts a Visual Pinball table to a binary GLTF model.\n\nUSAGE: vpt2glb <source.vpx> [<dest.glb>]\n',
		)
		return
	}
	if (!/\.vp[xt]$/i.test(argSrc)) {
		throw new Error('First argument must be a .vpx or .vpt file.')
	}
	const vpxPath = resolve(argSrc)
	if (!existsSync(vpxPath)) {
		throw new Error(`The file "${vpxPath}" does not exist.`)
	}
	let glbPath: string
	if (argDest) {
		if (!/\.glb$/i.test(argDest)) {
			throw new Error("Second file's extension must be .glb.")
		}
		glbPath = resolve(argDest)
		if (!existsSync(dirname(glbPath))) {
			throw new Error(`The folder where to write ${glbPath} does not exist.`)
		}
	} else {
		const name = `${basename(vpxPath).split('.').slice(0, -1).join('.')}.glb`
		glbPath = resolve(dirname(vpxPath), name)
	}

	console.log('Parsing file from %s...', vpxPath)
	const table = await Table.load(new NodeBinaryReader(vpxPath))
	const exporter = new TableExporter(table)
	const loaded = Date.now()

	console.log('Exporting file to %s...', glbPath)
	const glb = await exporter.exportGlb({
		applyTextures,
		applyMaterials,
		exportLightBulbLights,
		gltfOptions: { binary: true },
		...parseItemOptions(),
	})
	const exported = Date.now()
	writeFileSync(glbPath, glb)

	console.log(
		'Done! Written %s MB. Load time: %sms, export time: %sms, write time: %sms.',
		Math.round(glb.length / 100000) / 10,
		loaded - start,
		exported - loaded,
		Date.now() - exported,
	)
})
