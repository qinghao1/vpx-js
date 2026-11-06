// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
/*
 * VPDB - Virtual Pinball Database
 * Copyright (C) 2019 freezy <freezy@vpdb.io>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

import type { Matrix3D } from '../lib/math/matrix.js'
import type {
	FlasherBlendTarget,
	IRenderApi,
	IRenderable,
	MaterialApplyDesc,
	RenderInfo,
} from '../lib/render/irender-api'
import { cloneMaterialForWrite } from '../lib/render/threejs/material-shared.js'
import { convertFlasherBlend } from '../lib/render/threejs/nodes/primitive-bdl-node.js'
import type { ItemState } from '../lib/vpt/item-state'
import type { LightData, LightState } from '../lib/vpt/light/light'
import type { Mesh } from '../lib/vpt/mesh'
import type { Table, TableGenerateOptions } from '../lib/vpt/table/table'
import type { Texture } from '../lib/vpt/texture'

export class TestRenderApi implements IRenderApi<any, any, any> {
	public addChildToParent(_parent: any, _child: any): void {}

	public applyLighting(_state: LightState, _node: any | undefined): void {}

	public applyMaterial(_node: any | undefined, _desc: MaterialApplyDesc): void {}

	public cloneMaterialForWrite<MATERIAL>(mat: MATERIAL): MATERIAL {
		return cloneMaterialForWrite(mat)
	}

	public convertFlasherBlend<MATERIAL>(mat: MATERIAL, target: FlasherBlendTarget): void {
		convertFlasherBlend(mat as any, target)
	}

	public applyMatrixToNode(_matrix: Matrix3D, _node: any | undefined): void {}

	public applyMeshToNode(_mesh: Mesh, _node: any | undefined): void {}

	public applyVisibility(_isVisible: boolean, _node: any | undefined): void {}

	public createLightGeometry(_lightData: LightData, _table: Table): any {
		return {}
	}

	public createBulbGlowGeometry(_lightData: LightData, _table: Table): any {
		return {}
	}

	public createMesh(_obj: RenderInfo<any>): any {
		return {}
	}

	public createObjectFromRenderable(
		_renderable: IRenderable<ItemState>,
		_table: Table,
		_opts: TableGenerateOptions,
	): any {
		return {}
	}

	public createParentNode(_name: string): any {
		return {}
	}

	public createPlayfieldGeometry(_table: Table, _opts: TableGenerateOptions): any {
		return {}
	}

	public createPointLight(_lightData: LightData): any {
		return undefined
	}

	public findInGroup(_parent: any, _name: string): any | undefined {
		return {}
	}

	public preloadTextures(_textures: Texture[], _table: Table): Promise<void> {
		return Promise.resolve()
	}

	public removeChildren(_node: any | undefined): void {}

	public removeFromParent(_parent: any, _child: any | undefined): void {}

	public transformScene(_scene: any, _table: Table): void {}
}
