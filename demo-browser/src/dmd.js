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
		const names = new Set(['dmd', 'vr_dmd'])
		const flashers = []
		const flasherMap = new Map()
		for (const k in table?.flashers || {})
			if (table.flashers[k]?.data?.isDMD) {
				names.add(k.toLowerCase())
				flashers.push(table.flashers[k])
				flasherMap.set(k.toLowerCase(), table.flashers[k])
			}
		for (const k in table?.textboxes || {}) if (table.textboxes[k]?.data?.isDMD) names.add(k.toLowerCase())
		const isPlay = this.viewer.viewerMode === 'play'
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
		const tmpVec = new THREE.Vector3()
		const scoreForMesh = m => {
			const key = (m.name || '').toLowerCase().replace(/^dmd_/, '')
			const fl = flasherMap.get(key)
			if (fl) return distToCenter(fl.data.center.x, fl.data.center.y)
			m.getWorldPosition(tmpVec)
			return distToCenter(tmpVec.x, tmpVec.y)
		}
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
		const candidates = []
		tableGroup.traverse(o => {
			if (!o.isMesh) return
			const n = (o.name || '').toLowerCase()
			if (!names.has(n) && !n.includes('dmd')) return
			candidates.push(o)
		})
		const idealFlasher = (() => {
			if (!flashers.length) return null
			let pool = flashers
			if (isPlay) {
				const nonVr = flashers.filter(f => !f.getName().toLowerCase().includes('vr_'))
				if (nonVr.length) pool = nonVr
			}
			let best = pool[0]
			let bestScore = distToCenter(best.data.center.x, best.data.center.y)
			for (let i = 1; i < pool.length; i++) {
				const s = distToCenter(pool[i].data.center.x, pool[i].data.center.y)
				const better = isPlay ? s > bestScore : s < bestScore
				if (better) {
					best = pool[i]
					bestScore = s
				}
			}
			return best
		})()
		if (candidates.length) {
			const selectable = (() => {
				if (!isPlay) return candidates
				const nonVr = candidates.filter(m => !m.name.toLowerCase().includes('vr_'))
				return nonVr.length ? nonVr : candidates
			})()
			let best = null
			if (idealFlasher) {
				const idealKey = idealFlasher.getName().toLowerCase()
				best = selectable.find(m => (m.name || '').toLowerCase().replace(/^dmd_/, '') === idealKey) || null
				if (best)
					this.viewer.log(
						`DMD: found ${candidates.length} on-table mesh(es) -> keep ${best.name} (ideal ${idealKey})`,
						'info',
					)
			}
			if (!best) {
				best = selectable[0]
				let bestScore = scoreForMesh(best)
				for (let i = 1; i < selectable.length; i++) {
					const s = scoreForMesh(selectable[i])
					const better = isPlay ? s > bestScore : s < bestScore
					if (better) {
						best = selectable[i]
						bestScore = s
					}
				}
				this.viewer.log(
					`DMD: found ${candidates.length} on-table mesh(es) -> keep ${best.name} (geometric)`,
					'info',
				)
			}
			for (const m of candidates) if (m !== best) m.visible = false
			best.visible = true
			for (let p = best.parent; p && p !== tableGroup; p = p.parent) if (p.visible === false) p.visible = true
			applyDmdMaterial(best)
			this.meshes = [best]
			this.viewer.dmdMeshes = this.meshes
			return
		}
		if (!flashers.length) {
			this.viewer.log(
				'DMD: no on-table DMD mesh found — overlay fallback will be used in Play mode if needed',
				'warn',
			)
			this.viewer.dmdMeshes = this.meshes
			return
		}
		const chosen = idealFlasher || flashers[0]
		if (flashers.length > 1 && idealFlasher) {
			this.viewer.log(
				`DMD: deduped ${flashers.length} flashers -> ${chosen.getName()} (${isPlay ? 'play:farthest' : 'viewer:closest'} to center)`,
				'info',
			)
		}
		for (const fl of [chosen]) {
			const d = fl.data
			const pts = d.dragPoints || []
			let w = 600,
				h = 160
			if (pts.length >= 4) {
				const xs = pts.map(p => p.vertex.x),
					ys = pts.map(p => p.vertex.y)
				w = Math.max(...xs) - Math.min(...xs)
				h = Math.max(...ys) - Math.min(...ys)
				if (!w || !h) {
					w = 600
					h = 160
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
