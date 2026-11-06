// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Storage } from '../../io/ole-doc.js'
import { Matrix3D } from '../../math/matrix.js'
import type { Meshes } from '../../render/irender-api.js'
import { Item } from '../item.js'
import type { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import { forceHidePlayfieldMesh, PrimitiveData } from './primitive-data.js'
import { PrimitiveMeshGenerator } from './primitive-mesh-generator.js'
import { PrimitiveState } from './primitive-state.js'
import { PrimitiveUpdater } from './primitive-updater.js'

/** @see https://github.com/vpinball/vpinball/blob/master/primitive.cpp */
export class Primitive extends Item<PrimitiveData> {
	private readonly state: PrimitiveState
	private readonly meshGenerator: PrimitiveMeshGenerator
	private readonly updater: PrimitiveUpdater
	private mesh?: Mesh

	public static async fromStorage(storage: Storage, itemName: string, loadMeshes: boolean): Promise<Primitive> {
		const data = await PrimitiveData.fromStorage(storage, itemName, loadMeshes)
		return new Primitive(data)
	}

	public constructor(data: PrimitiveData) {
		super(data)
		// The authored playfield shape doubles as collision: hide it up front
		// so the claimed state (and the generated playfield_base) agree —
		// claiming first would freeze the storage value and let table init
		// re-show the mesh over the real playfield.
		forceHidePlayfieldMesh(data)
		this.state = PrimitiveState.claimFrom(
			data.getName(),
			data.position.clone(true),
			data.size.clone(true),
			[...data.rotAndTra],
			data.szMaterial!,
			data.szImage,
			data.szNormalMap,
			data.isVisible,
			data.color,
			data.disableLightingTop,
			data.disableLightingBelow,
			data.alpha,
		)
		this.updater = new PrimitiveUpdater(data, this.state)
		this.meshGenerator = new PrimitiveMeshGenerator(data)
	}

	public isTransparent(table: Table): boolean {
		const material = table.getMaterial(this.data.szMaterial)
		return !material || (material.isOpacityActive && material.opacity < 0.999)
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const isTransparent = this.isTransparent(table)
		return {
			primitive: {
				isVisible: this.data.isVisible,
				mesh: this.getMesh(table).clone().transform(Matrix3D.RIGHT_HANDED),
				map: table.getTexture(this.data.szImage),
				normalMap: table.getTexture(this.data.szNormalMap),
				material: table.getMaterial(this.data.szMaterial),
				isTransparent,
				depthBias: this.data.depthBias,
				disableLighting: this.data.disableLightingTop,
				disableLightingBelow: this.data.disableLightingBelow,
				addBlend: this.data.addBlend,
				backfacesEnabled: this.data.backfacesEnabled,
			},
		}
	}

	private getMesh(table: Table): Mesh {
		return (this.mesh ??= this.meshGenerator.getMesh(table))
	}

	public getState(): PrimitiveState {
		return this.state
	}

	public getUpdater(): PrimitiveUpdater {
		return this.updater
	}

	public setSides(num: number): void {
		this.data.sides = num
	}
}
