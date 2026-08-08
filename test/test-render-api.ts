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

import type { IRenderable, RenderInfo } from '../lib/game/irenderable'
import type { IRenderApi } from '../lib/render/irender-api'
import type { Matrix3D } from '../lib/util/math.js'
import type { ItemState } from '../lib/vpt/item-state'
import type { LightData } from '../lib/vpt/light/light-data'
import type { LightState } from '../lib/vpt/light/light-state'
import type { Material } from '../lib/vpt/material'
import type { Mesh } from '../lib/vpt/mesh'
import type { Table, TableGenerateOptions } from '../lib/vpt/table/table'
import type { Texture } from '../lib/vpt/texture'

// tslint:disable:no-empty
export class TestRenderApi implements IRenderApi<any, any, any> {
	public addChildToParent(_parent: any, _child: any): void {}

	public applyLighting(_state: LightState, _initialIntensity: number, _node: any | undefined): void {}

	public applyMaterial(
		_node: any | undefined,
		_material?: Material,
		_map?: string,
		_normalMap?: string,
		_envMap?: string,
		_emissiveMap?: string,
	): void {}

	public applyMatrixToNode(_matrix: Matrix3D, _node: any | undefined): void {}

	public applyMeshToNode(_mesh: Mesh, _node: any | undefined): void {}

	public applyVisibility(_isVisible: boolean, _node: any | undefined): void {}

	public createLightGeometry(_lightData: LightData, _table: Table): any {
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
