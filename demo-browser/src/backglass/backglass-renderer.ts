// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
// Backglass: backdrop art plus EM score-reel digit quads, standing on the
// head of the table where an authored VR cabinet puts its backbox, as large
// as the play view's room above the table allows — so every table shows its
// backglass and score the same way.
//
// Upstream draws the backdrop and every DispReel in desktop screen space
// (gated by decals/EM-reels flags) and hides them in VR, where tables bring
// their own backbox. Tables that do (e.g. a `VRCab_Backbox`) keep theirs:
// this panel stands down while one is shown. Layout math and mesh builders
// live in lib (backglass-node).
import * as THREE from 'three'
import {
	applyDigitCellUV,
	backdropRectToNdc,
	createBackdropPlane,
	createReelDigitQuad,
	digitCellUV,
	fitBackglassPanel,
} from '../../../dist-esm/lib/render/threejs/nodes/backglass-node.js'
import { flatName } from '../../../dist-esm/lib/render/threejs/scene-classify.js'
import { computePlayFraming } from '../../../dist-esm/lib/render/threejs/three-camera-framing.js'
import type { DirtyOverlay } from '../overlays/dirty-overlay.js'

interface ReelEntry {
	name: string
	data: any
	meshes: THREE.Mesh[]
	lastValues: number[]
	lastVisible: boolean
	map: THREE.Texture | undefined
}

const isBackboxName = (name: string): boolean => /backbox|backglass/.test(flatName(name))

/** Shown in the table: the node and every ancestor up to `root` are visible. */
function isShown(node: THREE.Object3D, root: THREE.Object3D): boolean {
	for (let n: THREE.Object3D | null = node; n && n !== root; n = n.parent) if (!n.visible) return false
	return root.visible
}

export class BackglassRenderer implements DirtyOverlay {
	private readonly viewer: any
	/**
	 * Lives in the scene, not the table group (camera framing and picking
	 * walk that); its matrix pins it to the table each frame instead.
	 */
	private readonly group = new THREE.Group()
	private entries: ReelEntry[] = []
	private table: any = null
	private ready = false
	private syncKey: string | null = null
	/** Table-local panel transform, fitted to the play view (see `fitPanel`). */
	private panel = new THREE.Matrix4()
	/** Art width/height (NaN without art); the panel takes its shape. */
	private artAspect = Number.NaN
	/** Camera shape and table group the panel was last fitted for. */
	private fitKey = ''
	/** The table group's own backbox nodes, collected once per table group. */
	private authored: THREE.Object3D[] = []
	private authoredFrom: THREE.Object3D | null = null
	private readonly scratch = new THREE.Matrix4()

	constructor(viewer: any) {
		this.viewer = viewer
		this.group.matrixAutoUpdate = false
		this.group.visible = false
	}

	/** DirtyOverlay.update: true when the panel, its reels, or its visibility changed. */
	update(): boolean {
		if (!this.table || !this.ready) return false
		let dirty = this.place()
		const emReels = this.table.data?.renderEMReels !== false
		for (const entry of this.entries) {
			// Live engine digits; before the engine reports, reels rest at 0 as
			// after upstream's RenderSetup, with their authored visibility.
			const live = this.viewer.wasmEngine?.reel(entry.name)
			const visible = emReels && (live?.visible ?? entry.data?.isVisible !== false) && !!entry.map
			if (visible !== entry.lastVisible) {
				entry.lastVisible = visible
				for (const mesh of entry.meshes) mesh.visible = visible
				dirty = true
			}
			if (!visible) continue
			const values = live?.values ?? []
			for (let r = 0; r < entry.meshes.length; r++) {
				const value = values[r] ?? 0
				if (value !== entry.lastValues[r]) {
					entry.lastValues[r] = value
					applyDigitCellUV(
						entry.meshes[r].geometry,
						digitCellUV(
							value,
							entry.data.digitRange ?? 9,
							!!entry.data.useImageGrid,
							entry.data.imagesPerGridRow ?? 1,
						),
					)
					dirty = true
				}
			}
		}
		return dirty
	}

	/** Rebuilds the backglass for the current table; textures stream in async. */
	async syncTable(table: any): Promise<void> {
		const key = table
			? `${table?.data?.szImage ?? table?.getName?.() ?? ''}|${table?.data?.bgImage?.[table?.data?.bgCurrentSet ?? 0] ?? ''}|${Object.keys(table?.dispReels ?? {}).length}|${table?.data?.renderDecals !== false}|${table?.data?.renderEMReels !== false}`
			: null
		if (table === this.table && key === this.syncKey) return
		this.clear()
		this.table = table ?? null
		this.syncKey = key
		if (!this.table) return
		if (!this.group.parent) this.viewer.scene?.add(this.group)
		const reelItems: any[] = Object.values(table.dispReels ?? {})
		const bgName =
			table.data?.renderDecals !== false ? (table.data?.bgImage?.[table.data?.bgCurrentSet ?? 0] ?? '') : ''
		if (!reelItems.length && !bgName) return
		// Shaped like the art, so neither art nor reel layout distorts.
		const bgTexture = bgName ? table.getTexture?.(bgName) : undefined
		this.artAspect = bgTexture ? bgTexture.width / bgTexture.height : Number.NaN
		this.fitKey = ''
		// Backing first so art and reels land on top; textures resolve below.
		this.group.add(createBackdropPlane(undefined, table.data?.colorBackdrop ?? 0x000000))
		const wanted: any[] = bgTexture ? [bgTexture] : []
		for (const item of reelItems) {
			const image = item?.data?.szImage
			if (image && table.getTexture?.(image)) wanted.push(table.getTexture(image))
		}
		try {
			await this.viewer.renderApi?.preloadTextures?.(wanted, table)
		} catch {
			// Texture streaming is best effort; missing art degrades to flat colors.
		}
		if (this.table !== table) return
		const getTexture = (name: string) => this.viewer.renderApi?.getMapGenerator?.()?.getTexture?.(name)
		const bgMap = bgName ? getTexture(bgName) : undefined
		if (bgMap) this.group.add(createBackdropPlane(bgMap, 0xffffff, 1))
		for (const item of reelItems) {
			const entry: ReelEntry = {
				name: item?.getName?.() ?? '',
				data: item?.data,
				meshes: [],
				lastValues: [],
				lastVisible: false,
				map: undefined,
			}
			const reel = entry.data
			if (!reel) continue
			entry.map = reel.szImage ? getTexture(reel.szImage) : undefined
			if (!entry.map) continue
			const spacing = Math.max(0, reel.reelSpacing ?? 0)
			const width = Math.max(0, reel.width ?? 0)
			const height = Math.max(0, reel.height ?? 0)
			const count = Math.max(0, reel.reelCount ?? 0)
			for (let r = 0; r < count; r++) {
				const rect = backdropRectToNdc(
					reel.v1.x + spacing + r * (width + spacing),
					reel.v1.y + spacing,
					width,
					height,
				)
				const mesh = createReelDigitQuad(
					entry.map,
					rect,
					digitCellUV(0, reel.digitRange ?? 9, !!reel.useImageGrid, reel.imagesPerGridRow ?? 1),
				)
				mesh.visible = false
				this.group.add(mesh)
				entry.meshes.push(mesh)
				entry.lastValues.push(-1)
			}
			this.entries.push(entry)
		}
		this.ready = true
		this.viewer.invalidate?.()
	}

	/**
	 * Pins the panel to the table's world transform and shows it unless the
	 * table shows its own backbox (scripts toggle those per play mode).
	 * Returns whether the placement or visibility changed.
	 */
	private place(): boolean {
		const tableGroup: THREE.Object3D | null = this.viewer.tableGroup
		if (tableGroup !== this.authoredFrom) {
			this.authoredFrom = tableGroup
			this.authored = []
			tableGroup?.traverse(node => {
				if (isBackboxName(node.name)) this.authored.push(node)
			})
		}
		const visible = !!tableGroup && !this.authored.some(node => isShown(node, tableGroup))
		let changed = visible !== this.group.visible
		this.group.visible = visible
		const camera = this.viewer.camera
		if (!tableGroup || !camera) return changed
		tableGroup.updateWorldMatrix(true, false)
		const fitKey = `${tableGroup.uuid}|${camera.aspect}|${camera.fov}`
		if (fitKey !== this.fitKey) {
			this.fitKey = fitKey
			this.panel = this.fitPanel(tableGroup, camera)
		}
		this.scratch.multiplyMatrices(tableGroup.matrixWorld, this.panel)
		if (!this.scratch.equals(this.group.matrix)) {
			this.group.matrix.copy(this.scratch)
			this.group.matrixWorldNeedsUpdate = true
			changed = true
		}
		return changed
	}

	/**
	 * Fits the panel into the play view (the play framing, not the live
	 * camera), so it stays put while the player orbits and only refits when
	 * the screen shape or table changes.
	 */
	private fitPanel(tableGroup: THREE.Object3D, camera: THREE.PerspectiveCamera): THREE.Matrix4 {
		const play = computePlayFraming(tableGroup, camera)
		const view = new THREE.PerspectiveCamera(camera.fov, camera.aspect, play.near, play.far)
		view.position.copy(play.position)
		view.lookAt(play.target)
		view.updateMatrixWorld()
		const { left, right, top, glassHeight } = this.table.data
		return fitBackglassPanel({ left, right, top, glassHeight }, this.artAspect, view, tableGroup.matrixWorld)
	}

	private clear(): void {
		for (const child of [...this.group.children]) this.detach(child)
		this.entries = []
		this.ready = false
		this.group.visible = false
	}

	/** Removes one backglass mesh and frees its geometry/material. */
	private detach(child: THREE.Object3D): void {
		this.group.remove(child)
		const mesh = child as THREE.Mesh
		mesh.geometry?.dispose?.()
		const material = mesh.material as THREE.Material | THREE.Material[]
		if (Array.isArray(material)) material.forEach(m => m.dispose())
		else material?.dispose?.()
	}
}
