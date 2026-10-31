// Desktop backglass overlay: backdrop art plus EM score-reel digit quads,
// glued to the camera like native's screen-space backdrop pass — but
// contain-fitted to keep authored proportions true instead of stretching
// to fill (native's `DrawSprite(0, 0, 1, 1)` fills the window).
//
// Upstream draws the backdrop and every DispReel in-scene on desktop and FSS
// views (gated by decals/EM-reels flags); this mirrors that presentation
// view so the score stays readable whatever the table camera does. The
// group billboards in front of the camera every frame (world-space, so the
// depth-tested table occludes it exactly where it covers the screen);
// layout math and mesh builders live in lib (backglass-node).
import * as THREE from 'three'
import {
	applyDigitCellUV,
	backdropContainScale,
	backdropRectToNdc,
	buildBackdropPlane,
	buildReelDigitQuad,
	DEFAULT_ASPECT,
	digitCellUV,
} from '../../../dist-esm/lib/render/threejs/nodes/backglass-node.js'
import type { DirtyOverlay } from '../overlays/dirty-overlay.js'

interface ReelEntry {
	item: any
	data: any
	animation: any
	meshes: THREE.Mesh[]
	lastValues: number[]
	lastVisible: boolean
	map: THREE.Texture | undefined
}

export class BackglassRenderer implements DirtyOverlay {
	private readonly viewer: any
	private readonly group = new THREE.Group()
	private readonly fitGroup = new THREE.Group()
	private entries: ReelEntry[] = []
	private table: any = null
	private ready = false
	private syncKey: string | null = null
	private boundsTable: any = null
	private boundsCenter = new THREE.Vector3()
	private boundsRadius = 0
	private readonly scratchDir = new THREE.Vector3()

	constructor(viewer: any) {
		this.viewer = viewer
		// Plain depth testing occludes the backdrop exactly where the table
		// (or anything nearer) covers the screen — no order/depth hacks.
		// Art and reels live in the fit group so one scale keeps authored
		// proportions true on any screen; the fullscreen color quad stays
		// outside it, filling the bars like a clear color.
		this.group.add(this.fitGroup)
		this.group.visible = false
	}

	/** DirtyOverlay.update: true when reels/backdrop visibly changed. */
	update(): boolean {
		if (!this.table || !this.ready) return false
		this.billboardToCamera()
		let dirty = false
		const emReels = this.table.data?.renderEMReels !== false
		for (const entry of this.entries) {
			const visible = emReels && entry.data?.isVisible !== false && !!entry.map
			if (visible !== entry.lastVisible) {
				entry.lastVisible = visible
				for (const mesh of entry.meshes) mesh.visible = visible
				dirty = true
			}
			if (!visible) continue
			entry.animation ??= entry.item?.getAnimation?.()
			const values = entry.animation?.getReelValues?.() ?? []
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

	/** Rebuilds the overlay for the current table; textures stream in async. */
	async syncTable(table: any): Promise<void> {
		const key = table
			? `${table?.data?.szImage ?? table?.getName?.() ?? ''}|${table?.data?.bgImage?.[table?.data?.bgCurrentSet ?? 0] ?? ''}|${Object.keys(table?.dispReels ?? {}).length}`
			: null
		if (table === this.table && key === this.syncKey) return
		this.clear()
		this.table = table ?? null
		this.syncKey = key
		if (!this.table) return
		if (!this.group.parent) this.viewer.scene?.add(this.group)
		const reelItems = Object.values(table.dispReels ?? {})
		const bgName =
			table.data?.renderDecals !== false ? (table.data?.bgImage?.[table.data?.bgCurrentSet ?? 0] ?? '') : ''
		if (!reelItems.length && !bgName) return
		this.group.visible = true
		// Backdrop first so reels land on top; textures resolve below.
		this.group.add(buildBackdropPlane(undefined, table.data?.colorBackdrop ?? 0x000000))
		const wanted: any[] = []
		if (bgName && table.getTexture?.(bgName)) wanted.push(table.getTexture(bgName))
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
		// Late preload resolve after destroy must not resurrect meshes into a dead scene.
		if (this.viewer?._disposed) return
		const getTexture = (name: string) => this.viewer.renderApi?.getMapGenerator?.()?.getTexture?.(name)
		const bgMap = bgName ? getTexture(bgName) : undefined
		if (bgMap) this.fitGroup.add(buildBackdropPlane(bgMap, 0xffffff, 1))
		for (const item of reelItems) {
			const entry: ReelEntry = {
				item,
				data: item?.data,
				animation: item?.getAnimation?.(),
				meshes: [],
				lastValues: [],
				lastVisible: false,
			}
			const d = entry.data
			if (!d) continue
			entry.map = d.szImage ? getTexture(d.szImage) : undefined
			const spacing = Math.max(0, d.reelSpacing ?? 0)
			const width = Math.max(0, d.width ?? 0)
			const height = Math.max(0, d.height ?? 0)
			const count = Math.max(0, d.reelCount ?? 0)
			for (let r = 0; r < count; r++) {
				const rect = backdropRectToNdc(
					d.v1.x + spacing + r * (width + spacing),
					d.v1.y + spacing,
					width,
					height,
				)
				const mesh = entry.map
					? buildReelDigitQuad(
							entry.map,
							rect,
							digitCellUV(0, d.digitRange ?? 9, !!d.useImageGrid, d.imagesPerGridRow ?? 1),
						)
					: buildBackdropPlane(undefined, d.backColor ?? 0x404040)
				if (!entry.map) {
					mesh.position.set(rect.centerX, rect.centerY, 2)
					mesh.scale.set(rect.sizeX, rect.sizeY, 1)
				}
				mesh.visible = false
				this.fitGroup.add(mesh)
				entry.meshes.push(mesh)
				entry.lastValues.push(-1)
			}
			this.entries.push(entry)
		}
		this.ready = true
		this.viewer.invalidate?.()
	}

	/**
	 * Pins the NDC-space group onto the live camera frustum, just behind
	 * the table: plain depth testing then occludes it exactly where the
	 * table (or anything nearer) covers the screen, like native's backdrop
	 * pass — with real depth margin, since clinging to the far plane risks
	 * depth-precision failure against the cleared far value. World-space
	 * billboarding — never
	 * camera-parented, since some render paths skip camera children.
	 */
	private billboardToCamera(): void {
		const camera = this.viewer.camera
		if (!camera || this.group.parent !== this.viewer.scene) return
		if (this.table !== this.boundsTable) {
			this.boundsTable = this.table
			this.boundsRadius = 0
			try {
				const box = new THREE.Box3().setFromObject(this.viewer.tableGroup ?? this.group)
				box.getCenter(this.boundsCenter)
				this.boundsRadius = box.getSize(new THREE.Vector3()).length() / 2
			} catch {
				this.boundsCenter.set(0, 0, 0)
			}
		}
		// Just behind the table bounds: far enough that nothing nearer is
		// hidden, close enough for comfortable depth precision.
		const dist =
			this.boundsRadius > 0 ? camera.position.distanceTo(this.boundsCenter) + this.boundsRadius + 50 : 1000
		const fov = THREE.MathUtils.degToRad(Number.isFinite(camera.fov) ? camera.fov : 60)
		const halfH = Math.tan(fov / 2) * dist
		const halfW = halfH * (Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : DEFAULT_ASPECT)
		camera.getWorldDirection(this.scratchDir)
		this.group.position.copy(camera.position).addScaledVector(this.scratchDir, dist)
		this.group.quaternion.copy(camera.quaternion)
		this.group.scale.set(halfW, halfH, 1)
		// Contain-fit the backdrop space every frame: geometry is built
		// once in full-space NDC, so resizes need no rebuild.
		const fit = backdropContainScale(camera.aspect)
		this.fitGroup.scale.set(fit.scaleX, fit.scaleY, 1)
	}

	/** Releases overlay meshes; the viewer calls this on destroy. */
	dispose(): void {
		this.clear()
		this.viewer.scene?.remove(this.group)
	}

	private clear(): void {
		for (const child of [...this.fitGroup.children]) this.detach(child, this.fitGroup)
		for (const child of [...this.group.children]) {
			if (child !== this.fitGroup) this.detach(child, this.group)
		}
		this.entries = []
		this.ready = false
		this.group.visible = false
	}

	/** Removes one overlay mesh and frees its geometry/material. */
	private detach(child: THREE.Object3D, parent: THREE.Object3D): void {
		parent.remove(child)
		const mesh = child as THREE.Mesh
		mesh.geometry?.dispose?.()
		const material = mesh.material as THREE.Material | THREE.Material[]
		if (Array.isArray(material)) material.forEach(m => m.dispose())
		else material?.dispose?.()
	}
}
