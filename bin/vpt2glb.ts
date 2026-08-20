#!/usr/bin/env node
// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { existsSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { NodeBinaryReader } from '../lib/io/binary-reader.node.js'
import { ThreeTextureLoaderNode } from '../lib/render/threejs/three-texture-loader-node.js'
import { Logger } from '../lib/util/logger.js'
import { Table } from '../lib/vpt/table/table.js'
import { TableExporter } from '../lib/vpt/table/table-exporter.js'

// Headless Node export: ThreeRenderApi here uses MeshStandardMaterial (three) and GLTFExporter.
// three/webgpu and three/tsl node materials (ThreeNodeMaterialGenerator, VpxRenderPipeline) are
// browser-only (WebGPU). This CLI intentionally stays on the classic material path so it
// works without a GPU. If TSL is imported in future, guard it with a fallback, e.g.:
//   let tsl: any = null; try { tsl = await import('three/tsl') } catch { /* fallback to MeshStandardMaterial */ }
// so vpt2glb remains headless-compatible.
;(async () => {
	try {
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

		const exportPrimitives = !process.argv.includes('--no-primitives')
		const exportTriggers = !process.argv.includes('--no-triggers')
		const exportKickers = !process.argv.includes('--no-kickers')
		const exportGates = !process.argv.includes('--no-gates')
		const exportHitTargets = !process.argv.includes('--no-targets')
		const exportFlippers = !process.argv.includes('--no-flippers')
		const exportBumpers = !process.argv.includes('--no-bumpers')
		const exportRamps = !process.argv.includes('--no-ramps')
		const exportSurfaces = !process.argv.includes('--no-surfaces')
		const exportRubbers = !process.argv.includes('--no-rubbers')
		const exportLightBulbs = !process.argv.includes('--no-bulbs')
		const exportPlayfieldLights = !process.argv.includes('--no-surface-lights')
		const exportPlayfield = !process.argv.includes('--no-playfield')
		const exportPlungers = !process.argv.includes('--no-plungers')
		const exportSpinners = !process.argv.includes('--no-spinners')

		// silence logs
		Logger.setLogger({
			debug(_format: any, ..._param: any[]): void {},
			error(_format: any, ..._param: any[]): void {},
			info(_format: any, ..._param: any[]): void {},
			verbose(_format: any, ..._param: any[]): void {},
			warn(_format: any, ..._param: any[]): void {},
			wtf(_format: any, ..._param: any[]): void {},
		})

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

			exportPrimitives,
			exportTriggers,
			exportKickers,
			exportGates,
			exportHitTargets,
			exportFlippers,
			exportBumpers,
			exportRamps,
			exportSurfaces,
			exportRubbers,
			exportLightBulbs,
			exportPlayfieldLights,
			exportPlayfield,
			exportPlungers,
			exportSpinners,
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
	} catch (err) {
		console.error(err)
	} finally {
		process.exit()
	}
})()
