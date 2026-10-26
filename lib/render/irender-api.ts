// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IRenderable, RenderInfo } from '../game/interfaces.js'
import type { Matrix3D } from '../math/matrix.js'
import type { ItemState } from '../vpt/item-state.js'
import type { LightData, LightState } from '../vpt/light/light.js'
import type { Material } from '../vpt/material.js'
import type { Mesh } from '../vpt/mesh.js'
import type { Table, TableGenerateOptions } from '../vpt/table/table.js'
import type { Texture } from '../vpt/texture.js'

/**
 * Backend-agnostic scene vocabulary: NODE is a scene-graph node, GEOMETRY a
 * GPU-ready mesh payload, POINT_LIGHT a dynamic light. Three.js binds them to
 * Object3D, BufferGeometry, PointLight.
 */
export interface IRenderApi<NODE, GEOMETRY, POINT_LIGHT> {
	/**
	 * Pre-loads all the table's textures into the renderer's texture format
	 * so they can be loaded and swapped synchronously later.
	 *
	 * Never rejects for bad image data: per-texture outcome arrives via
	 * onTexture(tex, ok) and the promise still resolves, so one corrupt
	 * texture cannot abort the table load.
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
	 * The matrix arrives in VPX row-major (v·M) convention; each backend maps
	 * it into its own storage (three.js transposes into column-major).
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
	 * Fork-safe material clone for script writes.
	 *
	 * Backends whose materials stash live state outside the classic clone path
	 * (three.js TSL node materials keep uniform objects in `userData`, which a
	 * plain `.clone()` flattens into inert JSON) rebuild an equivalent material
	 * here so per-item script state never leaks between items nor dies on first
	 * write. Optional for backward compatibility with custom backends: updaters
	 * fall back to a plain `.clone()` when the backend does not provide it.
	 *
	 * @param mat Material to fork for exclusive write access
	 */
	cloneMaterialForWrite?<MATERIAL>(mat: MATERIAL): MATERIAL

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
	 * Creates a flat additive glow polygon for a bulb light.
	 *
	 * Native renders every light with drag-point vertices as a lightmap glow
	 * quad (`m_lightmapMeshBuffer` in `src/parts/light.cpp`, `fs_light.sc` bulb blend),
	 * independent of the bulb-mesh and surface-light paths.
	 */
	createBulbGlowGeometry(lightData: LightData, table: Table): GEOMETRY

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
	 * @param table Optional table for surface height.
	 */
	createPointLight(lightData: LightData, table?: Table): POINT_LIGHT
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

	/**
	 * Whether an engine-shipped default texture exists for this name, without loading it.
	 * Lets callers skip doomed load attempts for table-missing names that are no default.
	 * Optional for backward compatibility with custom loaders.
	 *
	 * @param name Texture name as referenced by the scene
	 */
	hasDefaultTexture?(name: string): boolean
}

export interface MeshConvertOptions {
	applyMaterials?: boolean
	applyTextures?: ITextureLoader<any>
}
