// @ts-nocheck
import * as THREE from 'three'
import { DMD } from '../config.js'

const VISIBLE_WEIGHT = 1e6
const DUP_MAX = 600
const DUP_FACTOR = 0.3
const SIZE_TOL = 0.4

export class DmdRenderer {
	constructor(viewer) {
		this.viewer = viewer
		this.w = DMD.w
		this.h = DMD.h
		this.texture = null
		this.offscreen = null
		this.offCtx = null
		this.meshes = []
		this.lastHash = -1
		this._ensureTexture()
	}

	_ensureTexture() {
		if (this.offscreen && this.texture) return
		const c = document.createElement('canvas')
		c.width = DMD.w
		c.height = DMD.h
		this.offscreen = c
		this.offCtx = c.getContext('2d', { alpha: false })
		const tex = new THREE.CanvasTexture(c)
		tex.colorSpace = THREE.SRGBColorSpace
		tex.magFilter = THREE.NearestFilter
		tex.minFilter = THREE.NearestFilter
		tex.generateMipmaps = false
		tex.wrapS = THREE.ClampToEdgeWrapping
		tex.wrapT = THREE.ClampToEdgeWrapping
		tex.needsUpdate = true
		this.texture = tex
		this.viewer.dmdTexture = tex
		this.viewer._dmdOffscreen = c
		this.viewer._dmdOffCtx = this.offCtx
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
		// generic: prefer VR DMD when a VR cabinet exists (VRCab_*), otherwise desktop DMD.
		// References vpinball LoadVRRoom / VR_Cab collections — walking_dead has VRCab_Backbox etc.
		// Detecting cabinet presence via tableGroup is table-agnostic and avoids viewerMode hack.
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
		// use filteredReps for subsequent logic
		const finalReps = filteredReps
		if (clusters.some(c => c.length > 1)) {
			this.viewer.log(
				`DMD: deduped ${flashers.length} flashers in ${clusters.length} cluster(s) -> ${finalReps.map(r => r.chosen.getName()).join(', ')} (visible ? farthest)`,
				'info',
			)
		}

		// Remove previous procedural planes
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
			for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
				if (!mat || !this.texture) continue
				mat.map = this.texture
				mat.needsUpdate = true
				mat.side = THREE.DoubleSide
				mat.toneMapped = false
				if ('emissive' in mat) {
					mat.emissiveMap = this.texture
					mat.emissive = new THREE.Color(0xff8800)
					mat.emissiveIntensity = 1
					mat.color?.set?.(0xffffff)
				}
				mat.transparent = false
				// vpinball: flasher.cpp:1306 ZWRITEENABLE false, DrawMesh depthBias -10000 (1212 pos height, 1188 tempMatrix Translate(center,height)*RotX/Y/Z)
				// THREE generic: depthTest true, depthWrite false, strong polygonOffset to emulate -10000 bias without overlay show-through
				// (overlay depthTest false caused apron show-through; true+offset keeps correct occlusion vs playfield while surfacing DMD forward through backbox thickness).
				mat.depthTest = true
				mat.depthWrite = false
				mat.polygonOffset = true
				mat.polygonOffsetFactor = -4
				mat.polygonOffsetUnits = -8
			}
			// vpinball -10000 bias: strong forward bias in THREE is polygonOffset -4/-8 plus renderOrder 20 (after cab/backglass at 0, before overlay 1000)
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
			const mat = new THREE.MeshBasicMaterial({
				map: this.texture,
				side: THREE.DoubleSide,
				depthTest: true,
				depthWrite: false,
				polygonOffset: true,
				polygonOffsetFactor: -4,
				polygonOffsetUnits: -8,
				transparent: false,
			})
			const mesh = new THREE.Mesh(geom, mat)
			mesh.name = `DMD_${fl.getName()}`
			mesh.renderOrder = 20
			mesh.frustumCulled = false
			// vpinball: flasher.cpp FlasherData.m_height/m_rotX/Y/Z define DMD quad in playfield XY at positive Z up
			// (MatrixTranslate(center,height) * RotX/Y/Z). ThreeRenderApi.transformScene maps LH Z up → RH Y up
			// via scene.rotateX(π/2) (Y = -Z), so positive height must be negated locally to appear above
			// playfield in world space. Generic fallback 24 keeps DMD just above playfield for any table.
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

	render() {
		if (!this.viewer.player) return
		const frame = this.viewer.player.getDmdFrame?.()
		const dims = this.viewer.player.getDmdDimensions?.()
		if (!frame?.length) return
		const w = Math.round(dims?.x ?? DMD.w) || DMD.w
		const h = Math.round(dims?.y ?? DMD.h) || DMD.h
		if (!w || !h || frame.length < w * h) return

		let hash = 0
		for (let i = 0; i < frame.length; i++) hash = (hash * 31 + frame[i]) | 0
		if (hash === this.lastHash && this.w === w && this.h === h) return
		this.lastHash = hash
		this.w = w
		this.h = h
		this.viewer.dmdW = w
		this.viewer.dmdH = h
		this.viewer._dmdLastHash = hash
		this._ensureTexture()
		if (this.offscreen.width !== w || this.offscreen.height !== h) {
			this.offscreen.width = w
			this.offscreen.height = h
		}

		let max = 0
		for (let i = 0; i < frame.length; i++) if (frame[i] > max) max = frame[i]
		const is2bit = max <= 3,
			isNibble = max <= 15 && max > 3

		if (this.offCtx) {
			const ctx = this.offCtx
			ctx.imageSmoothingEnabled = false
			let img = (this as any)._imageData
			if (!img || img.width !== w || img.height !== h) {
				img = ctx.createImageData(w, h)
				;(this as any)._imageData = img
			}
			for (let i = 0; i < w * h; i++) {
				const v = frame[i] ?? 0
				const lvl = is2bit ? v * 85 : isNibble ? Math.round((v / 15) * 255) : v
				const o = i * 4
				img.data[o] = lvl
				img.data[o + 1] = Math.round(lvl * 0.55)
				img.data[o + 2] = 0
				img.data[o + 3] = 255
			}
			ctx.putImageData(img, 0, 0)
		}
		if (this.texture) this.texture.needsUpdate = true
	}
}

export { DmdRenderer as DmdController }
