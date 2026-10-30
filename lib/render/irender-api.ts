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

	createParentNode(name: string): NODE

	addChildToParent(parent: NODE, child: NODE | POINT_LIGHT): void

	findInGroup(parent: NODE, name: string): NODE | undefined

	removeFromParent(parent: NODE, child: NODE | undefined): void

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
	 * @param mesh Must contain the same number of vertices as the node.
	 */
	applyMeshToNode(mesh: Mesh, node: NODE | undefined): void

	/**
	 * Writes prebuilt frame arrays into a node in place.
	 *
	 * Allocation-free counterpart to `applyMeshToNode` for animation ticks:
	 * the caller lerps prebuilt frame data into reused scratch and the backend
	 * copies it into the live buffers without intermediate meshes, geometries,
	 * or bound recomputations. Normals arrive in raw mesh coords (the backend
	 * applies its own winding convention while copying); bounds is the
	 * [minX, minY, minZ, maxX, maxY, maxZ] union the backend installs directly.
	 * Optional for backward compatibility: updaters fall back to
	 * `applyMeshToNode` when the backend does not provide it.
	 *
	 * @param positions Interpolated vertex positions (3 per vertex)
	 * @param normals Interpolated vertex normals (3 per vertex)
	 * @param bounds Precomputed bounding-box union for this tick
	 * @param node The node to which the arrays are applied to.
	 */
	applyFrameArrays?(
		positions: Float32Array,
		normals: Float32Array,
		bounds: Float32Array,
		node: NODE | undefined,
	): void

	applyLighting(state: LightState, node: NODE | undefined): void

	applyVisibility(isVisible: boolean, node: NODE | undefined): void

	/**
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

	createObjectFromRenderable(renderable: IRenderable<ItemState>, table: Table, opts: TableGenerateOptions): NODE

	createMesh(obj: RenderInfo<GEOMETRY>): NODE

	createLightGeometry(lightData: LightData, table: Table): GEOMETRY

	/**
	 * Native renders every light with drag-point vertices as a lightmap glow
	 * quad (`m_lightmapMeshBuffer` in `src/parts/light.cpp`, `fs_light.sc` bulb blend),
	 * independent of the bulb-mesh and surface-light paths.
	 */
	createBulbGlowGeometry(lightData: LightData, table: Table): GEOMETRY

	createPlayfieldGeometry(table: Table, opts: TableGenerateOptions): GEOMETRY

	createPointLight(lightData: LightData, table?: Table): POINT_LIGHT
}

export interface ITextureLoader<TEXTURE> {
	/** Loads a texture coming from an `Image{n}` stream. */
	loadTexture(name: string, ext: string, data: Uint8Array): Promise<TEXTURE>

	/** Loads a raw texture coming from the `BITS` tag (pdsUint8Array). */
	loadRawTexture(name: string, data: Uint8Array, width: number, height: number): Promise<TEXTURE>

	/** Loads a texture shipped by Visual Pinball. */
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
