import * as THREE from 'three'
import { DMD } from './config.js'

export class DmdController {
	constructor(viewer) {
		this.viewer = viewer
		this.w = DMD.w
		this.h = DMD.h
		this.scale = DMD.scale
		this.canvas = viewer.dom.dmdCanvas || null
		this.ctx = null
		this.wrap = viewer.dom.dmdWrap || document.getElementById('dmd-wrap')
		this.statusEl = viewer.dom.dmdStatus || document.getElementById('dmd-status')
		this.texture = null
		this.offscreen = null
		this.offCtx = null
		this.meshes = []
		this.lastHash = -1
		this._ensureCanvas()
		this._ensureTexture()
	}

	_ensureCanvas() {
		if (this.canvas) {
			this.canvas.classList.add('dmd-canvas')
			this.ctx = this.canvas.getContext('2d', { alpha: false })
			this._resize()
			return
		}
		if (!this.wrap) return
		this.wrap.hidden = true
		const c = document.createElement('canvas')
		c.id = 'dmd'
		c.className = 'dmd-canvas'
		c.width = this.w * this.scale
		c.height = this.h * this.scale
		c.style.setProperty('--dmd-w', `${this.w * this.scale}px`)
		c.style.setProperty('--dmd-h', `${this.h * this.scale}px`)
		this.wrap.appendChild(c)
		this.canvas = c
		this.viewer.dom.dmdCanvas = c
		this.ctx = c.getContext('2d', { alpha: false })
		if (this.statusEl) this.statusEl.textContent = ''
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
			this.viewer.log(
				'DMD: no on-table DMD mesh found — overlay fallback will be used in Play mode if needed',
				'warn',
			)
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
		const getFlasherSize = fl => {
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
		const getFlasherPos = fl => ({ x: fl.data?.center?.x ?? 0, y: fl.data?.center?.y ?? 0 })
		const dim = (() => {
			try {
				return table?.getDimensions?.() ?? { width: 1000, height: 2000 }
			} catch {
				return { width: 1000, height: 2000 }
			}
		})()
		const dupThreshold = Math.min(600, Math.max(dim.width, dim.height) * 0.3)
		const clusterFlashers = list => {
			const clusters = []
			for (const fl of list) {
				let placed = false
				const pos = getFlasherPos(fl)
				const size = getFlasherSize(fl)
				for (const cl of clusters) {
					const rep = cl[0]
					const repPos = getFlasherPos(rep)
					const d = Math.hypot(pos.x - repPos.x, pos.y - repPos.y)
					if (d > dupThreshold) continue
					const repSize = getFlasherSize(rep)
					if (size.w && repSize.w) {
						const wRatio = Math.abs(size.w - repSize.w) / Math.max(size.w, repSize.w)
						const hRatio = Math.abs(size.h - repSize.h) / Math.max(size.h, repSize.h)
						if (wRatio > 0.4 || hRatio > 0.4) continue
					}
					cl.push(fl)
					placed = true
					break
				}
				if (!placed) clusters.push([fl])
			}
			return clusters
		}
		const scoreFlasher = fl => {
			const visible = fl.data?.isVisible ? 1 : 0
			const pos = getFlasherPos(fl)
			const dist = distToCenter(pos.x, pos.y)
			return visible * 1e6 + dist
		}
		const clusters = clusterFlashers(flashers)
		const representatives = clusters.map(cl => {
			let best = cl[0]
			let bestScore = scoreFlasher(best)
			for (let i = 1; i < cl.length; i++) {
				const s = scoreFlasher(cl[i])
				if (s > bestScore) {
					best = cl[i]
					bestScore = s
				}
			}
			return { cluster: cl, chosen: best }
		})
		const chosenNames = representatives.map(r => r.chosen.getName()).join(', ')
		if (clusters.some(c => c.length > 1)) {
			this.viewer.log(
				`DMD: deduped ${flashers.length} flashers in ${clusters.length} cluster(s) -> ${chosenNames} (visible ? farthest)`,
				'info',
			)
		}
		const existingProcedural = []
		tableGroup.traverse(o => {
			if (o.userData?.isProceduralDMD) existingProcedural.push(o)
		})
		for (const o of existingProcedural) o.parent?.remove(o)
		const dmdNameSet = new Set([...flasherMap.keys(), 'dmd'])
		const candidates = []
		tableGroup.traverse(o => {
			if (!o.isMesh) return
			const n = (o.name || '').toLowerCase()
			const isDmdMesh = dmdNameSet.has(n) || n.includes('dmd')
			if (!isDmdMesh) return
			candidates.push(o)
		})
		for (const m of candidates) m.visible = true
		const applyDmdMaterial = m => {
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
				mat.depthWrite = true
			}
			m.renderOrder = 1000
			m.frustumCulled = false
		}
		if (candidates.length) {
			const tmpVec = new THREE.Vector3()
			const scoreForMesh = m => {
				const key = (m.name || '').toLowerCase().replace(/^dmd_/, '')
				const fl = flasherMap.get(key)
				if (fl) return scoreFlasher(fl)
				m.getWorldPosition(tmpVec)
				return distToCenter(tmpVec.x, tmpVec.y)
			}
			const candidatesByCluster = new Map()
			for (const rep of representatives) {
				candidatesByCluster.set(rep.chosen.getName().toLowerCase(), [])
			}
			const unmapped = []
			for (const m of candidates) {
				const key = (m.name || '').toLowerCase().replace(/^dmd_/, '')
				const fl = flasherMap.get(key)
				if (fl) {
					const rep = representatives.find(r => r.cluster.includes(fl))
					const repKey = rep?.chosen.getName().toLowerCase()
					if (repKey && candidatesByCluster.has(repKey)) {
						candidatesByCluster.get(repKey).push(m)
						continue
					}
				}
				unmapped.push(m)
			}
			const keep = []
			for (const rep of representatives) {
				const key = rep.chosen.getName().toLowerCase()
				const bucket = candidatesByCluster.get(key) ?? []
				if (bucket.length) {
					let best = bucket[0]
					let bestScore = scoreForMesh(best)
					for (let i = 1; i < bucket.length; i++) {
						const s = scoreForMesh(bucket[i])
						if (s > bestScore) {
							best = bucket[i]
							bestScore = s
						}
					}
					keep.push(best)
				} else if (unmapped.length) {
					let best = unmapped[0]
					let bestScore = scoreForMesh(best)
					let bestIdx = 0
					for (let i = 1; i < unmapped.length; i++) {
						const s = scoreForMesh(unmapped[i])
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
			if (unmapped.length && !keep.length) {
				let best = unmapped[0]
				let bestScore = scoreForMesh(best)
				for (let i = 1; i < unmapped.length; i++) {
					const s = scoreForMesh(unmapped[i])
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
				applyDmdMaterial(m)
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
		for (const rep of representatives) {
			const fl = rep.chosen
			const d = fl.data
			const pts = d.dragPoints ?? d._dragPoints ?? []
			let w = 600
			let h = 160
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
			const mat = new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide })
			const mesh = new THREE.Mesh(geom, mat)
			mesh.name = `DMD_${fl.getName()}`
			mesh.renderOrder = 1000
			mesh.frustumCulled = false
			mesh.position.set(d.center?.x ?? 470, d.center?.y ?? 40, -(d.height ?? 620))
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
		this.viewer.log(
			'DMD: no on-table DMD mesh found — overlay fallback will be used in Play mode if needed',
			'warn',
		)
		this.viewer.dmdMeshes = this.meshes
	}

	_resize() {
		if (!this.canvas || !this.ctx || !this.wrap || this.wrap.clientWidth === 0) return
		const maxW = Math.min(512, this.wrap.clientWidth - 24)
		const scale = Math.max(2, Math.floor(maxW / this.w))
		this.scale = scale
		this.canvas.style.setProperty('--dmd-w', `${this.w * scale}px`)
		this.canvas.style.setProperty('--dmd-h', `${this.h * scale}px`)
	}

	_showOverlay() {
		if (this.wrap) this.wrap.hidden = false
		if (this.canvas) this.canvas.classList.add('is-visible')
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
		if (this.canvas.width !== w * this.scale || this.canvas.height !== h * this.scale) {
			this.canvas.width = w * this.scale
			this.canvas.height = h * this.scale
			this._resize()
		}

		let max = 0
		for (let i = 0; i < frame.length; i++) if (frame[i] > max) max = frame[i]
		const is2bit = max <= 3,
			isNibble = max <= 15 && max > 3

		const draw = (ctx, scale) => {
			if (!ctx) return
			ctx.imageSmoothingEnabled = false
			const img = ctx.createImageData(w, h)
			for (let i = 0; i < w * h; i++) {
				const v = frame[i] ?? 0
				const lvl = is2bit ? v * 85 : isNibble ? Math.round((v / 15) * 255) : v
				const o = i * 4
				img.data[o] = lvl
				img.data[o + 1] = Math.round(lvl * 0.55)
				img.data[o + 2] = 0
				img.data[o + 3] = 255
			}
			if (scale === 1) ctx.putImageData(img, 0, 0)
			else {
				const off = document.createElement('canvas')
				off.width = w
				off.height = h
				off.getContext('2d').putImageData(img, 0, 0)
				ctx.fillStyle = '#05070a'
				ctx.fillRect(0, 0, w * scale, h * scale)
				ctx.drawImage(off, 0, 0, w * scale, h * scale)
			}
		}
		if (this.offCtx) draw(this.offCtx, 1)
		if (this.ctx) draw(this.ctx, this.scale)
		if (this.texture) this.texture.needsUpdate = true

		if (this.meshes.length) {
			if (this.wrap) this.wrap.hidden = true
		} else this._showOverlay()

		if (this.statusEl) {
			const emu = this.viewer.player.getPhysics?.()?.emu
			const mock =
				emu?.constructor.name === 'PinMameEmulator' && !emu.isInitialized?.()
					? ' (mock — no ROM)'
					: emu?.isInitialized?.()
						? ''
						: ' (loading…)'
			this.statusEl.textContent = `DMD ${w}×${h}${mock}`
		}
	}
}
