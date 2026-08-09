// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IRenderable, RenderInfo } from '../game/irenderable.js'
import type { Matrix3D } from '../util/matrix.js'
import type { ItemState } from '../vpt/item-state.js'
import type { LightData } from '../vpt/light/light-data.js'
import type { LightState } from '../vpt/light/light-state.js'
import type { Material } from '../vpt/material.js'
import type { Mesh } from '../vpt/mesh.js'
import type { Table, TableGenerateOptions } from '../vpt/table/table.js'
import type { Texture } from '../vpt/texture.js'

export interface IRenderApi<NODE, GEOMETRY, POINT_LIGHT> {
	/**
	 * Pre-loads all the table's textures into the renderer's texture format
	 * so they can be loaded and swapped synchronously later.
	 * @param textures
	 * @param table
	 * @param onTexture optional per-texture progress callback (streaming)
	 */
	preloadTextures(textures: Texture[], table: Table, onTexture?: (tex: Texture, ok: boolean) => void): Promise<void>

	/**
	 * Applies global transformations to the scene.
	 *
	 * Use this to size and rotate the playfield to a suitable position.
	 *
	 * @param scene Root table node
	 * @param table Table
	 */
	transformScene(scene: NODE, table: Table): void

	/**
	 * Creates a new parent node.
	 *
	 * @param name Name of the node
	 */
	createParentNode(name: string): NODE

	/**
	 * Adds a child to a parent node.
	 *
	 * @param parent Parent node
	 * @param child Child node
	 */
	addChildToParent(parent: NODE, child: NODE | POINT_LIGHT): void

	/**
	 * Retrieves a child node from a parent node.
	 *
	 * @param parent Parent node
	 * @param name Name of the child node
	 */
	findInGroup(parent: NODE, name: string): NODE | undefined

	/**
	 * Removes a child from a parent node
	 *
	 * @param parent The parent node
	 * @param child The child node to remove
	 */
	removeFromParent(parent: NODE, child: NODE | undefined): void

	/**
	 * Removes all children from a parent node
	 * @param node Parent node
	 */
	removeChildren(node: NODE | undefined): void

	/**
	 * Applies a matrix transformation to a node.
	 *
	 * @param matrix The transformation matrix
	 * @param node The node to transform. Does nothing if not set.
	 */
	applyMatrixToNode(matrix: Matrix3D, node: NODE | undefined): void

	/**
	 * Updates a node with a new mesh.
	 *
	 * @param mesh New mesh. Must contain the same number of vertices as the node.
	 * @param node The node to which the new mesh is applied to.
	 */
	applyMeshToNode(mesh: Mesh, node: NODE | undefined): void

	/**
	 * Update's a light's parameters.
	 *
	 * @param state New light state
	 * @param initialIntensity Intensity at 100% from data
	 * @param node The light node
	 */
	applyLighting(state: LightState, initialIntensity: number, node: NODE | undefined): void

	/**
	 * Toggles visibility of an object.
	 *
	 * @param isVisible True if visible, false otherwise
	 * @param node Object to apply to
	 */
	applyVisibility(isVisible: boolean, node: NODE | undefined): void

	/**
	 * Applies a material to a node.
	 *
	 * If the node is a group node, the material is applied to all children.
	 * If the node is undefined, nothing is applied.
	 *
	 * @param node Node to apply material to
	 * @param material Material to apply
	 * @param map Name of the texture, if any
	 * @param normalMap Name of the normal map, if any
	 * @param envMap Name of the environment map, if any
	 * @param emissiveMap Name of the emissive map, if any
	 */
	applyMaterial(
		node: NODE | undefined,
		material?: Material,
		map?: string,
		normalMap?: string,
		envMap?: string,
		emissiveMap?: string,
	): void

	/**
	 * Creates a new node based on a renderable.
	 *
	 * @param renderable The renderable from the VPX file
	 * @param table The table object
	 * @param opts Options, see {@link TableGenerateOptions}.
	 */
	createObjectFromRenderable(renderable: IRenderable<ItemState>, table: Table, opts: TableGenerateOptions): NODE

	/**
	 * Creates a new node based on a RenderInfo object.
	 *
	 * @param obj RenderInfo
	 */
	createMesh(obj: RenderInfo<GEOMETRY>): NODE

	/**
	 * Creates a playfield light geometry.
	 *
	 * @param lightData Light parameters from the VPX file
	 * @param table The table object
	 */
	createLightGeometry(lightData: LightData, table: Table): GEOMETRY

	/**
	 * Creates the playfield geometry.
	 *
	 * @param table The table object
	 * @param opts Options, see {@link TableGenerateOptions}.
	 */
	createPlayfieldGeometry(table: Table, opts: TableGenerateOptions): GEOMETRY

	/**
	 * Creates a new point light.
	 *
	 * @param lightData Light parameters from the VPX file.
	 */
	createPointLight(lightData: LightData): POINT_LIGHT
}

export interface ITextureLoader<TEXTURE> {
	/**
	 * Loads a texture coming from an `Image{n}` stream.
	 *
	 * @param name Name of the texture
	 * @param ext Original file extension of the texture, including the dot
	 * @param data Binary data
	 */
	loadTexture(name: string, ext: string, data: Uint8Array): Promise<TEXTURE>

	/**
	 * Loads a raw texture coming from the `BITS` tag (pdsUint8Array)
	 *
	 * @param name Name of the texture
	 * @param data Binary data
	 * @param width Image width
	 * @param height Image height
	 */
	loadRawTexture(name: string, data: Uint8Array, width: number, height: number): Promise<TEXTURE>

	/**
	 * Loads a texture shipped by Visual Pinball
	 *
	 * @param name Name of the texture
	 * @param ext Original file extension of the texture, including the dot
	 * @param fileName Filename without path
	 */
	loadDefaultTexture(name: string, ext: string, fileName: string): Promise<TEXTURE>
}

export interface MeshConvertOptions {
	applyMaterials?: boolean
	applyTextures?: ITextureLoader<any>
	optimizeTextures?: boolean
}
