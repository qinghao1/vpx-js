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

import { resolve as resolvePath } from 'node:path'
import type { Mesh, Object3D } from '../lib/refs.node.js'

// Direct-scene lookup over the node returned by Table.generateTableNode (or a
// wrapper group/scene containing it). Mirrors the old GLB round-trip view:
// the exporter ran with onlyVisible, so invisible nodes are treated as
// absent, and GLTFLoader sanitized names (whitespace to '_', '[] . : /'
// stripped, duplicate siblings suffixed '_<n>') — matchesName applies the
// same rule so existing mesh names keep working. The table root is named
// "playfield*".
export class ThreeHelper {
	public first<T extends Object3D>(root: Object3D, groupName: string): T {
		const table = this.getTable(root)
		const group = table.children.filter(isPresent).find(child => matchesName(child, groupName))
		if (!group) {
			throw new Error(
				`Scene has no "${groupName}" group! ` +
					`(available: [${table.children.map(child => child.name).join(', ')}])`,
			)
		}
		const visible = group.children.filter(isPresent)
		if (!visible.length) {
			throw new Error(`The "${groupName}" group of the scene has no children.`)
		}
		if (!visible[0].children?.filter(isPresent).length) {
			throw new Error(`The first child of the group "${groupName}" of the scene has no children.`)
		}
		return visible[0].children.filter(isPresent)[0] as T
	}

	public find<T extends Object3D>(root: Object3D, groupName: string, itemName: string, objectName?: string): T {
		const { group, item, object } = this.lookup(root, groupName, itemName, objectName)
		const found = this.requireItem(group, groupName, itemName, item)
		if (!objectName) {
			return found as T
		}
		if (!object) {
			throw new Error(
				`Item "${itemName}" of group "${groupName}" of the scene has no child named "${objectName}". ` +
					`(available: [${found.children.map(child => child.name).join(', ')}])`,
			)
		}
		return object as T
	}

	private lookup(
		root: Object3D,
		groupName: string,
		itemName: string,
		objectName?: string,
	): { group: Object3D; item?: Object3D; object?: Object3D } {
		const table = this.getTable(root)
		const group = table.children.filter(isPresent).find(child => matchesName(child, groupName))
		if (!group) {
			throw new Error(
				`Scene has no "${groupName}" group! ` +
					`(available: [${table.children.map(child => child.name).join(', ')}])`,
			)
		}
		const item = group.children?.filter(isPresent).find(child => matchesName(child, itemName))
		const object =
			objectName && item
				? item.children.filter(isPresent).find(child => matchesName(child, objectName))
				: undefined
		return { group, item, object }
	}

	private requireItem(group: Object3D, groupName: string, itemName: string, item?: Object3D): Object3D {
		if (!group.children?.filter(isPresent).length) {
			throw new Error(`The "${groupName}" group of the scene has no children.`)
		}
		if (!item) {
			throw new Error(
				`The "${groupName}" group of the scene has no child named "${itemName}". ` +
					`(available: [${group.children.map(child => child.name).join(', ')}])`,
			)
		}
		return item
	}

	public vertices(mesh: Mesh): number[] {
		return (mesh.geometry as any).attributes.position.array
	}

	public getTable(root: Object3D): Object3D {
		if (root.name.startsWith('playfield')) {
			return root
		}
		const table = root.children?.find(child => child.name.startsWith('playfield'))
		if (!table) {
			throw new Error('Cannot find table in scene.')
		}
		return table
	}

	public expectNoObject(root: Object3D, groupName: string, itemName: string, objectName?: string): void {
		const { group, item, object } = this.lookup(root, groupName, itemName, objectName)
		if (objectName) {
			this.requireItem(group, groupName, itemName, item)
			if (object) {
				throw new Error(
					`The "${itemName}" item of the "${groupName}" group of the scene has a child named ` +
						`"${objectName}" but none was expected.`,
				)
			}
		} else if (item) {
			throw new Error(
				`The "${groupName}" group of the scene has a child named "${itemName}" but none was expected.`,
			)
		}
	}

	public expectObject(root: Object3D, groupName: string, itemName: string, objectName?: string): void {
		const { group, item, object } = this.lookup(root, groupName, itemName, objectName)
		const found = this.requireItem(group, groupName, itemName, item)
		if (objectName && !object) {
			throw new Error(
				`The "${itemName}" item in the "${groupName}" group of the scene has no child named ` +
					`"${objectName}". (available: [${found.children.map(child => child.name).join(', ')}])`,
			)
		}
	}

	public expectVerticesInArray(vertices: number[][], array: number[], accuracy = 3): void {
		const vertexHashes = new Set<string>()
		for (let i = 0; i < array.length; i += 3) {
			vertexHashes.add(this.hashVertex(array.slice(i, i + 3), accuracy))
		}
		const tol = 2
		for (const expectedVertex of vertices) {
			if (vertexHashes.has(this.hashVertex(expectedVertex, accuracy))) continue
			let found = false
			for (let i = 0; i < array.length; i += 3) {
				const dx = array[i] - expectedVertex[0]
				const dy = array[i + 1] - expectedVertex[1]
				const dz = array[i + 2] - expectedVertex[2]
				if (dx * dx + dy * dy + dz * dz < tol * tol) {
					found = true
					break
				}
			}
			if (!found) {
				throw new Error(`Vertex { ${expectedVertex.join(', ')} } not found in array.`)
			}
		}
	}

	public concatMeshes(root: Object3D, groupName: string, itemName: string, objectNames: string[]): number[] {
		const arr: number[] = []
		for (const objName of objectNames) {
			const mesh = this.find(root, groupName, itemName, objName) as Mesh
			const geometry = mesh.geometry as any
			arr.push(...geometry.attributes.position.array)
		}
		return arr
	}

	private hashVertex(vertex: number[], accuracy: number): string {
		const trim = 10 ** accuracy
		return `${Math.round(vertex[0] * trim)},${Math.round(vertex[1] * trim)},${Math.round(vertex[2] * trim)}`
	}

	public fixturePath(filename: string): string {
		return resolvePath('test', 'fixtures', filename)
	}
}

function isPresent(node: Object3D): boolean {
	return node.visible !== false
}

// Same name mangling the GLB round-trip applied (GLTFLoader after
// PropertyBinding.sanitizeNodeName, plus '_<n>' deduplication), so specs
// keep addressing meshes with their familiar names.
function matchesName(node: Object3D, name: string): boolean {
	const sane = sanitizeName(node.name)
	return sane === name || sane.startsWith(`${name}_`)
}

function sanitizeName(name: string): string {
	return name.replace(/\s/g, '_').replace(/[[\].:/]/g, '')
}
