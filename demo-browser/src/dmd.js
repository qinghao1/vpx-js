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
			this.ctx = this.canvas.getContext('2d', { alpha: false })
			this._resize()
			return
		}
		if (!this.wrap) return
		try {
			this.wrap.style.display = 'none'
		} catch {}
		const c = document.createElement('canvas')
		c.id = 'dmd'
		c.width = this.w * this.scale
		c.height = this.h * this.scale
		Object.assign(c.style, {
			width: `${this.w * this.scale}px`,
			height: `${this.h * this.scale}px`,
			imageRendering: 'pixelated',
			border: '1px solid #2a2f3a',
			borderRadius: '6px',
			background: '#05070a',
			display: 'none',
		})
		this.wrap.appendChild(c)
		this.canvas = c
		this.viewer.dom.dmdCanvas = c
		this.ctx = c.getContext('2d', { alpha: false })
		if (this.statusEl) this.statusEl.textContent = ''
	}

	_ensureTexture() {
		if (this.offscreen && this.texture) return
		try {
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
		} catch (e) {
			console.warn('DMD texture init', e)
		}
	}

	findMeshes() {
		this.meshes = []
		const { tableGroup, table } = this.viewer
		if (!tableGroup) return
		const names = new Set(['dmd', 'vr_dmd'])
		const flashers = []
		try {
			for (const k in table?.flashers || {})
				if (table.flashers[k]?.data?.isDMD) {
					names.add(k.toLowerCase())
					flashers.push(table.flashers[k])
				}
			for (const k in table?.textboxes || {}) if (table.textboxes[k]?.data?.isDMD) names.add(k.toLowerCase())
		} catch {}
		const isPlay = this.viewer.viewerMode === 'play'
		tableGroup.traverse(o => {
			if (!o.isMesh) return
			const n = (o.name || '').toLowerCase()
			if (!names.has(n) && !n.includes('dmd')) return
			if (isPlay && n.includes('vr_dmd')) {
				o.visible = false
				return
			}
			this.meshes.push(o)
			if (isPlay) {
				o.visible = true
				for (let p = o.parent; p && p !== tableGroup; p = p.parent) if (p.visible === false) p.visible = true
			}
			for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
				if (!m || !this.texture) continue
				m.map = this.texture
				m.needsUpdate = true
				m.side = THREE.DoubleSide
				m.toneMapped = false
				if ('emissive' in m) {
					m.emissiveMap = this.texture
					m.emissive = new THREE.Color(0xff8800)
					m.emissiveIntensity = 1
					m.color?.set?.(0xffffff)
				}
				m.transparent = false
				m.depthWrite = true
			}
			o.renderOrder = 1000
			o.frustumCulled = false
		})
		if (this.meshes.length) {
			this.viewer.log(
				`DMD: found ${this.meshes.length} on-table mesh(es): ${this.meshes.map(m => m.name).join(', ')}`,
				'info',
			)
			this.viewer.dmdMeshes = this.meshes
			return
		}
		let toCreate = flashers
		if (isPlay) {
			const f = flashers.filter(x => !x.getName().toLowerCase().includes('vr_'))
			if (f.length) toCreate = f
		}
		for (const fl of toCreate) {
			try {
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
			} catch (e) {
				console.warn('create procedural DMD', e)
			}
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
		this.canvas.style.width = `${this.w * scale}px`
		this.canvas.style.height = `${this.h * scale}px`
	}

	_showOverlay() {
		if (this.wrap?.style.display === 'none') this.wrap.style.display = 'flex'
		if (this.canvas?.style.display === 'none') this.canvas.style.display = 'block'
	}

	render() {
		if (!this.viewer.player) return
		let frame = null,
			dims = null
		try {
			frame = this.viewer.player.getDmdFrame?.()
			dims = this.viewer.player.getDmdDimensions?.()
		} catch {}
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
			if (this.wrap) this.wrap.style.display = 'none'
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
