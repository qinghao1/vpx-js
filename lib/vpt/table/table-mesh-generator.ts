// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IRenderable } from '../../game/irenderable.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { progress } from '../../util/logger.js'
import type { Bumper } from '../bumper/bumper.js'
import type { Flipper } from '../flipper/flipper.js'
import type { ItemState } from '../item-state.js'
import type { Primitive } from '../primitive/primitive.js'
import type { Ramp } from '../ramp/ramp.js'
import type { Rubber } from '../rubber/rubber.js'
import type { Surface } from '../surface/surface.js'
import type { Table, TableGenerateOptions } from './table.js'

/** Generates table meshes. */
export class TableMeshGenerator {
	private readonly table: Table

	constructor(table: Table) {
		this.table = table
	}

	public generateTableNode<NODE, GEOMETRY, POINT_LIGHT>(
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		opts: TableGenerateOptions = {},
	): NODE {
		progress().show('Generating table nodes')
		opts = Object.assign({}, defaultOptions, opts)
		const tableNode = renderApi.createParentNode('playfield')
		renderApi.transformScene(tableNode, this.table)
		const renderGroups: IRenderGroup[] = [
			{ name: 'playfield', meshes: [this.table], enabled: !!opts.exportPlayfield },
			{ name: 'primitives', meshes: Object.values<Primitive>(this.table.primitives), enabled: !!opts.exportPrimitives },
			{ name: 'rubbers', meshes: Object.values<Rubber>(this.table.rubbers), enabled: !!opts.exportRubbers },
			{ name: 'surfaces', meshes: Object.values<Surface>(this.table.surfaces), enabled: !!opts.exportSurfaces },
			{ name: 'flippers', meshes: Object.values<Flipper>(this.table.flippers), enabled: !!opts.exportFlippers },
			{ name: 'bumpers', meshes: Object.values<Bumper>(this.table.bumpers), enabled: !!opts.exportBumpers },
			{ name: 'ramps', meshes: Object.values<Ramp>(this.table.ramps), enabled: !!opts.exportRamps },
			{
				name: 'lightBulbs',
				meshes: Object.values(this.table.lights).filter((l) => l.isBulbLight()),
				enabled: !!opts.exportLightBulbs,
			},
			{
				name: 'playfieldLights',
				meshes: Object.values(this.table.lights).filter((l) => l.isSurfaceLight(this.table)),
				enabled: !!opts.exportPlayfieldLights,
			},
			{ name: 'hitTargets', meshes: Object.values(this.table.hitTargets), enabled: !!opts.exportHitTargets },
			{ name: 'gates', meshes: Object.values(this.table.gates), enabled: !!opts.exportGates },
			{ name: 'kickers', meshes: Object.values(this.table.kickers), enabled: !!opts.exportKickers },
			{ name: 'triggers', meshes: Object.values(this.table.triggers), enabled: !!opts.exportTriggers },
			{ name: 'spinners', meshes: Object.values(this.table.spinners), enabled: !!opts.exportSpinners },
			{ name: 'plungers', meshes: Object.values(this.table.plungers), enabled: !!opts.exportPlungers },
		]

		for (const group of renderGroups.filter((g) => g.enabled)) {
			progress().details(group.name)
			const itemTypeGroup = renderApi.createParentNode(group.name)
			for (const renderable of group.meshes) {
				const itemGroup = renderApi.createObjectFromRenderable(renderable, this.table, opts)
				renderApi.addChildToParent(itemTypeGroup, itemGroup)
			}
			renderApi.addChildToParent(tableNode, itemTypeGroup)
		}

		// light bulb lights
		if (opts.exportLightBulbLights) {
			let lightGroup = renderApi.findInGroup(tableNode, 'lightBulbs')
			if (!lightGroup) {
				lightGroup = renderApi.createParentNode('lightBulbs')
				renderApi.addChildToParent(tableNode, lightGroup)
			}
			for (const lightInfo of Object.values(this.table.lights).filter((l) => l.isBulbLight())) {
				let itemGroup = renderApi.findInGroup(lightGroup, lightInfo.getName())
				if (!itemGroup) {
					itemGroup = renderApi.createParentNode(lightInfo.getName())
					renderApi.addChildToParent(lightGroup, itemGroup)
				}
				const pointLight = renderApi.createPointLight(lightInfo.data)
				renderApi.addChildToParent(itemGroup, pointLight)
			}
		}

		renderApi.addChildToParent(tableNode, renderApi.createParentNode('balls'))

		return tableNode
	}

	public getPlayfieldMesh<NODE, GEOMETRY, POINT_LIGHT>(
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		opts: TableGenerateOptions,
	): GEOMETRY {
		return renderApi.createPlayfieldGeometry(this.table, opts)
	}
}

interface IRenderGroup {
	name: string
	meshes: Array<IRenderable<ItemState>>
	enabled: boolean
}

const defaultOptions: TableGenerateOptions = {
	exportPlayfield: true,
	exportPrimitives: true,
	exportRubbers: true,
	exportSurfaces: true,
	exportFlippers: true,
	exportBumpers: true,
	exportRamps: true,
	exportPlayfieldLights: false,
	exportLightBulbs: true,
	exportLightBulbLights: true,
	exportHitTargets: true,
	exportGates: true,
	exportKickers: true,
	exportTriggers: true,
	exportSpinners: true,
	exportPlungers: true,
	gltfOptions: {},
}
