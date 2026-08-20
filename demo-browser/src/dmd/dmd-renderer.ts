// @ts-nocheck
import * as THREE from 'three'
import { GpuDmdNodeController } from '../../../dist-esm/lib/render/threejs/nodes/dmd-node.js'
import { DMD } from '../config.js'

// vpinball: flasher.cpp:1306 ZWRITEENABLE false, DrawMesh depthBias -10000 (flasher.cpp:1306, DrawMesh depthBias -10000)
// depthTest: true, depthWrite: false, polygonOffsetFactor: -4, polygonOffsetUnits: -8, renderOrder: 20, DoubleSide

const VISIBLE_WEIGHT = 1e6
const DUP_MAX = 600
const DUP_FACTOR = 0.3
const SIZE_TOL = 0.4

export class DmdRenderer {
	constructor(viewer) {
		this.viewer = viewer
		this.w = DMD.w
		this.h = DMD.h
		this.meshes = []
		this.lastHash = -1
		// compatibility stubs for legacy Canvas2D path - kept as null for API compat
		this.offscreen = null
		this.offCtx = null
		this._imageData = null
		this._controller = new GpuDmdNodeController(this.w, this.h)
		this.dataTexture = this._controller.getTexture()
		this.material = this._controller.material
		this.texture = this.dataTexture
		// expose uniform handles for backward compat (proxied from controller)
		this.uResolution = (this._controller as any).uResolution ?? null
		this.uLedColor = (this._controller as any).uLedColor ?? null
		this.uDotRadius = (this._controller as any).uDotRadius ?? null
		this.uGlowIntensity = (this._controller as any).uGlowIntensity ?? null
		this.uDynamicScale = (this._controller as any).uDynamicScale ?? null
		this._texNode = null
		this._syncViewerTexture()
	}

	_syncViewerTexture() {
		this.viewer.dmdTexture = this.texture
		this.viewer._dmdOffscreen = null
		this.viewer._dmdOffCtx = null
		this.viewer.dmdMeshes = this.meshes
	}

	_ensureTexture() {
		if (this.dataTexture && this.material && this.texture) {
			this._syncViewerTexture()
			return
		}
		// re-create controller if lost
		if (!this._controller) this._controller = new GpuDmdNodeController(this.w, this.h)
		this.dataTexture = this._controller.getTexture()
		this.material = this._controller.material
		this.texture = this.dataTexture
		this.uResolution = (this._controller as any).uResolution ?? null
		this.uLedColor = (this._controller as any).uLedColor ?? null
		this.uDotRadius = (this._controller as any).uDotRadius ?? null
		this.uGlowIntensity = (this._controller as any).uGlowIntensity ?? null
		this.uDynamicScale = (this._controller as any).uDynamicScale ?? null
		this._syncViewerTexture()
	}
	findMeshes() {
		this.meshes = []
		const { tableGroup, table } = this.viewer
		if (!tableGroup) return
		const flashers = []
		const flasherMap = new Map()
		for (const k in table?.flashers ?? {}) {
			const fl = table.flashers[k]
			if (fl?.data?.isDMD) {
				flashers.push(fl)
				flasherMap.set(k.toLowerCase(), fl)
				flasherMap.set(fl.getName().toLowerCase(), fl)
			}
		}
		for (const k in table?.textboxes ?? {}) {
			const tb = table.textboxes[k]
			if (tb?.data?.isDMD) {
				const fake = { getName: () => k, data: tb.data }
				flashers.push(fake)
				flasherMap.set(k.toLowerCase(), fake)
			}
		}
		if (!flashers.length) {
			this.viewer.log('DMD: no on-table DMD mesh found', 'warn')
			this.viewer.dmdMeshes = this.meshes
			return
		}

		const tableCenter = (() => {
			const d = table?.data
			if (
				d &&
				typeof d.left === 'number' &&
				typeof d.right === 'number' &&
				typeof d.top === 'number' &&
				typeof d.bottom === 'number'
			)
				return { x: (d.left + d.right) / 2, y: (d.top + d.bottom) / 2 }
			const dim = table?.getDimensions?.()
			if (dim) {
				const left = typeof d?.left === 'number' ? d.left : 0
				const top = typeof d?.top === 'number' ? d.top : 0
				return { x: left + dim.width / 2, y: top + dim.height / 2 }
			}
			return { x: 470, y: 600 }
		})()
		const distToCenter = (x, y) => Math.hypot(x - tableCenter.x, y - tableCenter.y)
		const getPos = fl => ({ x: fl.data?.center?.x ?? 0, y: fl.data?.center?.y ?? 0 })
		const getSize = fl => {
			const raw = fl.data?.dragPoints ?? fl.data?._dragPoints ?? []
			const pts = Array.isArray(raw) ? raw : []
			if (pts.length >= 4) {
				const xs = pts.map(p => p?.vertex?.x ?? p?.x ?? 0)
				const ys = pts.map(p => p?.vertex?.y ?? p?.y ?? 0)
				const w = Math.max(...xs) - Math.min(...xs)
				const h = Math.max(...ys) - Math.min(...ys)
				if (w > 1 && h > 1) return { w, h }
			}
			return { w: 0, h: 0 }
		}
		const dim = (() => {
			try {
				return table?.getDimensions?.() ?? { width: 1000, height: 2000 }
			} catch {
				return { width: 1000, height: 2000 }
			}
		})()
		const dupThreshold = Math.min(DUP_MAX, Math.max(dim.width, dim.height) * DUP_FACTOR)
		const isVR = s =>
			String(s || '')
				.toLowerCase()
				.includes('vr')
		const cluster = list => {
			const clusters = []
			for (const fl of list) {
				const pos = getPos(fl)
				const size = getSize(fl)
				let placed = false
				for (const cl of clusters) {
					const rep = cl[0]
					const repPos = getPos(rep)
					if (isVR(fl.getName()) !== isVR(rep.getName())) continue
					if (Math.hypot(pos.x - repPos.x, pos.y - repPos.y) > dupThreshold) continue
					const repSize = getSize(rep)
					if (size.w && repSize.w) {
						if (Math.abs(size.w - repSize.w) / Math.max(size.w, repSize.w) > SIZE_TOL) continue
						if (Math.abs(size.h - repSize.h) / Math.max(size.h, repSize.h) > SIZE_TOL) continue
					}
					cl.push(fl)
					placed = true
					break
				}
				if (!placed) clusters.push([fl])
			}
			return clusters
		}
		const score = fl => (fl.data?.isVisible ? VISIBLE_WEIGHT : 0) + distToCenter(getPos(fl).x, getPos(fl).y)

		const clusters = cluster(flashers)
		const reps = clusters.map(cl => {
			let best = cl[0],
				bestScore = score(best)
			for (let i = 1; i < cl.length; i++) {
				const s = score(cl[i])
				if (s > bestScore) {
					best = cl[i]
					bestScore = s
				}
			}
			return { cluster: cl, chosen: best }
		})
		const isVRName = n =>
			String(n || '')
				.toLowerCase()
				.includes('vr')
		const RE_CAB = /vrcab|cabinet/i
		const hasCab = (() => {
			try {
				let found = false
				tableGroup.traverse(o => {
					if (found) return
					const nm = (o.name || '').toLowerCase()
					if (
						nm.includes('vrcab') ||
						nm.includes('cabinet') ||
						nm.includes('pincab') ||
						nm.includes('lockbar')
					)
						found = true
				})
				return found
			} catch {
				return false
			}
		})()
		let filteredReps = reps
		if (reps.length > 1) {
			const hasVR = reps.some(r => isVRName(r.chosen.getName()))
			const hasNonVR = reps.some(r => !isVRName(r.chosen.getName()))
			if (hasVR && hasNonVR) {
				if (hasCab) {
					const pref = reps.filter(r => isVRName(r.chosen.getName()))
					if (pref.length) filteredReps = pref
				} else {
					const pref = reps.filter(r => !isVRName(r.chosen.getName()))
					if (pref.length) filteredReps = pref
				}
			}
		}
		const finalReps = filteredReps
		if (clusters.some(c => c.length > 1)) {
			this.viewer.log(
				`DMD: deduped ${flashers.length} flashers in ${clusters.length} cluster(s) -> ${finalReps.map(r => r.chosen.getName()).join(', ')} (visible ? farthest)`,
				'info',
			)
		}

		const oldProcedural = []
		tableGroup.traverse(o => {
			if (o.userData?.isProceduralDMD) oldProcedural.push(o)
		})
		for (const o of oldProcedural) o.parent?.remove(o)

		const dmdNames = new Set([...flasherMap.keys(), 'dmd'])
		const candidates = []
		tableGroup.traverse(o => {
			if (!o.isMesh) return
			const n = (o.name || '').toLowerCase()
			if (dmdNames.has(n) || n === 'dmd' || n.startsWith('dmd_') || n.startsWith('dmd.') || n.includes('_dmd'))
				candidates.push(o)
		})
		for (const m of candidates) m.visible = true

		const applyMat = m => {
			m.material = this.material
			m.renderOrder = 20
			m.frustumCulled = false
		}

		if (candidates.length) {
			const tmpVec = new THREE.Vector3()
			const meshScore = m => {
				const key = (m.name || '').toLowerCase().replace(/^dmd_/, '')
				const fl = flasherMap.get(key)
				if (fl) return score(fl)
				m.getWorldPosition(tmpVec)
				return distToCenter(tmpVec.x, tmpVec.y)
			}
			const buckets = new Map(finalReps.map(r => [r.chosen.getName().toLowerCase(), []]))
			const unmapped = []
			for (const m of candidates) {
				const key = (m.name || '').toLowerCase().replace(/^dmd_/, '')
				const fl = flasherMap.get(key)
				const rep = fl
					? (finalReps.find(r => r.cluster.includes(fl)) ?? reps.find(r => r.cluster.includes(fl)))
					: null
				const bKey = rep?.chosen.getName().toLowerCase()
				if (bKey && buckets.has(bKey)) buckets.get(bKey).push(m)
				else unmapped.push(m)
			}
			const keep = []
			for (const rep of finalReps) {
				const bucket = buckets.get(rep.chosen.getName().toLowerCase()) ?? []
				if (bucket.length) {
					let best = bucket[0],
						bestScore = meshScore(best)
					for (let i = 1; i < bucket.length; i++) {
						const s = meshScore(bucket[i])
						if (s > bestScore) {
							best = bucket[i]
							bestScore = s
						}
					}
					keep.push(best)
				} else if (unmapped.length) {
					let best = unmapped[0],
						bestScore = meshScore(best),
						bestIdx = 0
					for (let i = 1; i < unmapped.length; i++) {
						const s = meshScore(unmapped[i])
						if (s > bestScore) {
							best = unmapped[i]
							bestScore = s
							bestIdx = i
						}
					}
					keep.push(best)
					unmapped.splice(bestIdx, 1)
				}
			}
			if (!keep.length && unmapped.length) {
				let best = unmapped[0],
					bestScore = meshScore(best)
				for (let i = 1; i < unmapped.length; i++) {
					const s = meshScore(unmapped[i])
					if (s > bestScore) {
						best = unmapped[i]
						bestScore = s
					}
				}
				keep.push(best)
			}
			const keepSet = new Set(keep)
			for (const m of candidates) if (!keepSet.has(m)) m.visible = false
			for (const m of keep) {
				m.visible = true
				for (let p = m.parent; p && p !== tableGroup; p = p.parent) if (p.visible === false) p.visible = true
				applyMat(m)
			}
			this.meshes = keep
			this.viewer.dmdMeshes = this.meshes
			if (keep.length)
				this.viewer.log(
					`DMD: kept ${keep.length}/${candidates.length} on-table mesh(es) -> ${keep.map(m => m.name).join(', ')}`,
					'info',
				)
			return
		}

		for (const rep of finalReps) {
			const fl = rep.chosen
			const d = fl.data
			const pts = d.dragPoints ?? d._dragPoints ?? []
			let w = 600,
				h = 160
			if (Array.isArray(pts) && pts.length >= 4) {
				const xs = pts.map(p => p?.vertex?.x ?? p?.x ?? 0)
				const ys = pts.map(p => p?.vertex?.y ?? p?.y ?? 0)
				const bw = Math.max(...xs) - Math.min(...xs)
				const bh = Math.max(...ys) - Math.min(...ys)
				if (bw > 1 && bh > 1) {
					w = bw
					h = bh
				}
			}
			const geom = new THREE.PlaneGeometry(w, h)
			const mesh = new THREE.Mesh(geom, this.material)
			mesh.name = `DMD_${fl.getName()}`
			mesh.renderOrder = 20
			mesh.frustumCulled = false
			mesh.position.set(d.center?.x ?? 470, d.center?.y ?? 40, -(d.height ?? 24))
			mesh.rotation.set(
				THREE.MathUtils.degToRad(d.rotX ?? 0),
				THREE.MathUtils.degToRad(d.rotY ?? 0),
				THREE.MathUtils.degToRad(d.rotZ ?? 0),
			)
			mesh.translateZ(1.8)
			mesh.userData.isProceduralDMD = true
			tableGroup.add(mesh)
			this.meshes.push(mesh)
		}
		if (this.meshes.length) {
			this.viewer.log(`DMD: created ${this.meshes.length} procedural on-table mesh(es) from FlasherData`, 'info')
			this.viewer.dmdMeshes = this.meshes
			return
		}
		this.viewer.log('DMD: no on-table DMD mesh found', 'warn')
		this.viewer.dmdMeshes = this.meshes
	}

	updateFrame(rawFrame, width, height) {
		if (!rawFrame || rawFrame.length < width * height) return
		// delegate bit-depth hashing & texture upload to shared controller
		const prevW = this.w,
			prevH = this.h
		this._controller.updateFrame(rawFrame, width, height)
		// sync handles if controller reallocated (mutates in place so usually no change)
		this.dataTexture = this._controller.getTexture()
		this.texture = this.dataTexture
		this.material = this._controller.material
		this.w = width
		this.h = height
		// keep viewer mirrors in sync
		this.viewer.dmdTexture = this.texture
		this.viewer.dmdW = width
		this.viewer.dmdH = height
		// mirror hash for dedup check
		this.lastHash = (this._controller as any).lastHash ?? this.lastHash
		if (prevW !== width || prevH !== height) this._syncViewerTexture()
	}

	render() {
		if (!this.viewer.player) return
		const frame = this.viewer.player.getDmdFrame?.()
		const dims = this.viewer.player.getDmdDimensions?.()
		if (!frame?.length) return
		const w = Math.round(dims?.x ?? DMD.w) || DMD.w
		const h = Math.round(dims?.y ?? DMD.h) || DMD.h
		if (!w || !h || frame.length < w * h) return
		this.updateFrame(frame, w, h)
	}

	update() {
		return this.render()
	}

	getTexture() {
		this._ensureTexture()
		return this.texture
	}
}

export { DmdRenderer as DmdController, DmdRenderer as GpuDmdNodeController }
