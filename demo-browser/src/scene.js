import * as THREE from 'three'
import {
	BAKED_EMISSIVE,
	BAKED_METAL,
	BAKED_ROUGH,
	RE_ALPHA_MESH,
	RE_BAKE_MAP,
	RE_BAKE_MAT,
	RE_CAB,
	RE_GLASS,
	RE_LM,
	RE_VR,
} from './config.js'

const pendingOf = m => (m.userData?.pendingMap ?? m.userData?.pendingmap ?? '').toString().toLowerCase()
const classify = (mesh, mat, map, baked = false) => {
	const m = mat.toLowerCase()
	const mp = map.toLowerCase()
	const me = mesh.toLowerCase()
	const isBakedMat = baked || RE_BAKE_MAT.test(m) || RE_BAKE_MAP.test(mp) || RE_BAKE_MAP.test(me)
	// name heuristic fallback for TWD BM_*/VLM.Bake
	const isBakedFamily = me.includes('bm_') || me.includes('playfield') || me.includes('armp') || me.includes('ramp')
	const isRampFamily = me.includes('armp') || me.includes('ramp') || me.includes('botramp') || me.includes('rampscrw')
	return {
		isGlass: RE_GLASS.test(me) || RE_GLASS.test(m) || (me === 'primitive-primitive001' && m === 'material:glass'),
		isLm: RE_LM.test(me),
		isVr: RE_VR.test(me),
		isCab: RE_CAB.test(me),
		isVlmBake: (me.includes('playfield') || isRampFamily) && (RE_LM.test(me) || isBakedMat || me.includes('bm_')),
		isMainBake: isBakedFamily && isBakedMat && !RE_LM.test(me),
		isBakedMat,
		needsAlpha: RE_ALPHA_MESH.test(me),
		isRampFamily,
	}
}
const isBasePlayfield = (n, c) => n.includes('playfield') && !c.isMainBake && !c.isVlmBake && !c.isBakedMat
const isBakedMesh = c => c.isMainBake || c.isBakedMat || c.isVlmBake

export const isBakedMeshByNames = (meshName, matName, mapName) => {
	const c = classify(meshName ?? '', matName ?? '', mapName ?? '')
	return { ...c, isVrCab: !!(c.isVr || c.isCab), isBaked: isBakedMesh(c) }
}
export { classify, isBakedMesh }

function wrapTexBaked(tex) {
	if (!tex) return
	tex.wrapS = THREE.ClampToEdgeWrapping
	tex.wrapT = THREE.ClampToEdgeWrapping
	tex.generateMipmaps = true
	tex.minFilter = THREE.LinearMipmapLinearFilter
	tex.magFilter = THREE.LinearFilter
	tex.anisotropy = 1
	tex.needsUpdate = true
}

function fixBaked(mat, map) {
	const tex = map ?? mat.map
	if (tex) {
		mat.map = tex
		mat.emissiveMap = tex
		// tint via Material.m_cBase
		const tint = mat.color && mat.color.getHex() !== 0x000000 ? mat.color.clone() : new THREE.Color(0xffffff)
		if (!mat.emissive) mat.emissive = tint
		else mat.emissive.copy(tint)
		mat.emissiveIntensity = BAKED_EMISSIVE
		mat.color?.set?.(0x000000)
	} else {
		mat.color?.set?.(0xffffff)
		if (mat.emissive) mat.emissive.set(0x000000)
		mat.emissiveIntensity = 0
	}
	mat.side = THREE.DoubleSide
	mat.toneMapped = true
	mat.roughness = BAKED_ROUGH
	mat.metalness = BAKED_METAL
	wrapTexBaked(mat.map)
	if (mat.emissiveMap) wrapTexBaked(mat.emissiveMap)
	mat.needsUpdate = true
}

function fixVr(mat) {
	if (mat.map) wrapTexBaked(mat.map)
	if (mat.emissiveMap) wrapTexBaked(mat.emissiveMap)
	mat.side = THREE.DoubleSide
	mat.roughness = BAKED_ROUGH
	mat.metalness = BAKED_METAL
	mat.needsUpdate = true
}

export const wrapBakedTex = wrapTexBaked

export const applyBakedMaterial = (mat, tex, info, meshName) => {
	const nl = (meshName || '').toLowerCase()
	mat.emissiveMap = tex
	const cur = mat.color ? mat.color.getHex() : 0xffffff
	const tint = cur !== 0x000000 ? new THREE.Color(cur) : new THREE.Color(0xffffff)
	if (mat.emissive) mat.emissive.copy(tint)
	else mat.emissive = tint
	const isOverlay = info.isVlmBake && !info.isMainBake
	if (isOverlay) {
		const hasTex = !!tex
		if (!hasTex) {
			mat.emissiveIntensity = 0
			mat.transparent = true
			mat.opacity = 0
			mat.blending = THREE.AdditiveBlending
			mat.depthWrite = false
			mat.alphaTest = 0
		} else {
			mat.emissiveIntensity = 1.0
			mat.transparent = true
			mat.opacity = 1.0
			mat.blending = THREE.AdditiveBlending
			mat.depthWrite = false
			mat.alphaTest = 0
		}
		if (!mat.color) mat.color = new THREE.Color(0x000000)
		else mat.color.set(0x000000)
		mat.side = THREE.DoubleSide
		mat.toneMapped = true
		mat.roughness = BAKED_ROUGH
		mat.metalness = BAKED_METAL
		wrapTexBaked(tex)
		wrapTexBaked(mat.emissiveMap)
		mat.polygonOffset = true
		mat.polygonOffsetFactor = -2
		mat.polygonOffsetUnits = -4
	} else {
		mat.emissiveIntensity = BAKED_EMISSIVE
		if (!mat.color) mat.color = new THREE.Color(0x000000)
		else mat.color.set(0x000000)
		mat.side = THREE.DoubleSide
		mat.toneMapped = true
		mat.roughness = BAKED_ROUGH
		mat.metalness = BAKED_METAL
		wrapTexBaked(tex)
		wrapTexBaked(mat.emissiveMap)
		if (info.isMainBake && !nl.includes('non_opaque') && !/ramp|armp|botramp|rampscrw/i.test(nl)) {
			mat.polygonOffset = true
			mat.polygonOffsetFactor = -1
			mat.polygonOffsetUnits = -1
			mat.depthWrite = true
			mat.transparent = false
			mat.alphaTest = 0
		}
	}
}

export const swipeNudge = (dx, dy, NUDGE) => {
	const adx = Math.abs(dx)
	const ady = Math.abs(dy)
	if (adx > ady * 1.2) return dx < 0 ? NUDGE.left : NUDGE.right
	if (ady > adx * 1.2) return dy < 0 ? NUDGE.forward : NUDGE.back
	return null
}

function isInCabFlipper(obj) {
	for (let cur = obj; cur; cur = cur.parent) {
		const n = (cur.name || '').toLowerCase()
		if (n.includes('vrcab') && n.includes('flipper')) return true
	}
	return false
}

const _isDmdName = n => n.includes('dmd')
const _isCabVrName = n =>
	RE_VR.test(n) ||
	RE_CAB.test(n) ||
	n.includes('pincab') ||
	n.includes('lockbar') ||
	n.includes('coin') ||
	n.includes('leg') ||
	n.includes('support') ||
	n.includes('blackbox')

export function hideCabFlippers(root) {
	let hidden = 0
	root.traverse(o => {
		if (!isInCabFlipper(o)) return
		if (o.visible !== false) hidden++
		o.visible = false
	})
	return hidden
}

export function showCabFlippers(root) {
	let shown = 0
	root.traverse(o => {
		if (!isInCabFlipper(o)) return
		if (o.visible === false) {
			o.visible = true
			shown++
		}
	})
	return shown
}

function makeParentsVisible(mesh, root, stats) {
	for (let p = mesh.parent; p && p !== root; p = p.parent) {
		if (p.visible === false && !isInCabFlipper(p)) {
			p.visible = true
			stats.cabForced++
		}
	}
}

function sanitizeNaN(node, stats) {
	node.traverse(o => {
		const pos = o.geometry?.attributes?.position
		if (!o.isMesh || !pos?.array) return
		let bad = false
		for (let i = 0; i < pos.array.length; i++)
			if (!Number.isFinite(pos.array[i])) {
				bad = true
				break
			}
		if (!bad) return
		for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) pos.array[i] = 0
		pos.needsUpdate = true
		o.geometry.computeBoundingSphere()
		o.geometry.computeBoundingBox()
		stats.nanFixed++
	})
}

const hideMesh = (o, statsKey, stats) => {
	if (!o.visible) return
	o.visible = false
	if (statsKey) stats[statsKey]++
	o.geometry?.dispose?.()
}

export function postProcessScene(node, { viewerMode = 'viewer', harnessLog } = {}) {
	const stats = {
		vrKept: 0,
		cabForced: 0,
		lightmaps: 0,
		bumperLM: 0,
		vlmFixed: 0,
		metalFixed: 0,
		glass: 0,
		nanFixed: 0,
		nanHidden: 0,
		cabHidden: 0,
		cabFlipperHidden: 0,
		greenHidden: 0,
		playfieldHidden: 0,
	}
	sanitizeNaN(node, stats)
	const bakedCache = new Map()
	const vrCache = new Map()

	const getBaked = (base, mesh) => {
		const matName = (base.name || '').toLowerCase()
		const pending = pendingOf(base)
		const mapPre = (base.map?.name || pending || '').toLowerCase()
		const bakedFlag = !!base.userData?.__isBaked
		const { isMainBake, isVlmBake, needsAlpha } = classify(mesh, matName, mapPre, bakedFlag)
		const isOverlay = isVlmBake && !isMainBake
		const isApron = mesh.includes('bm_non_opaque') || mesh.includes('non_opaque')
		const isRamp =
			mesh.includes('ramp') || mesh.includes('armp') || mesh.includes('botramp') || mesh.includes('rampscrw')
		const alpha = !isMainBake && !isRamp && !isApron && needsAlpha
		const key = `${base.name}|${base.map?.name ?? pending}|${isMainBake ? 'main' : isOverlay ? 'overlay' : alpha ? 'alpha' : 'opaque'}|${base.polygonOffset ? `${base.polygonOffsetFactor}/${base.polygonOffsetUnits}` : '0'}`
		let v = bakedCache.get(key)
		if (v) return v
		v = base.clone() // unlit baked at 1.0 with AgX
		if (isMainBake) {
			fixBaked(v, v.map)
			// 1.0 unlit
			v.toneMapped = true
			v.needsUpdate = true
		} else if (isOverlay) {
			const hasMap = !!v.map
			fixBaked(v, v.map)
			if (!hasMap && pending) {
				v.emissiveIntensity = 0
				v.transparent = true
				v.opacity = 0
				v.blending = THREE.AdditiveBlending
				v.depthWrite = false
				v.toneMapped = true
				v.needsUpdate = true
			} else {
				// alpha/100 — 250 => 2.5 HDR
				v.emissiveIntensity = 1.0
				v.transparent = true
				v.opacity = 1.0
				v.blending = THREE.AdditiveBlending
				v.depthWrite = false
				v.toneMapped = true
				v.needsUpdate = true
			}
		} else fixVr(v)
		if (isMainBake && !v.map && pending) {
			v.color?.set?.(0x000000)
			if (!v.emissive) v.emissive = new THREE.Color(0xffffff)
			else v.emissive.set(0xffffff)
			v.emissiveIntensity = BAKED_EMISSIVE
			v.toneMapped = true
		}
		if (isOverlay) {
			const hasMapOverlay = !!v.map
			if (!hasMapOverlay && pending) {
				v.transparent = true
				v.alphaTest = 0
				v.depthWrite = false
				v.opacity = 0
				v.blending = THREE.AdditiveBlending
				v.polygonOffset = true
				v.polygonOffsetFactor = -2
				v.polygonOffsetUnits = -4
			} else {
				v.transparent = true
				v.alphaTest = 0
				v.depthWrite = false
				v.opacity = 1.0
				v.blending = THREE.AdditiveBlending
				v.polygonOffset = true
				v.polygonOffsetFactor = -2
				v.polygonOffsetUnits = -4
			}
		} else {
			v.transparent = !isMainBake && alpha && !isApron && !isRamp
			v.alphaTest = v.transparent ? 0.1 : 0
			v.depthWrite = !v.transparent
			if (v.opacity === undefined || !isOverlay) v.opacity = 1
			if (isMainBake && !isApron && !isRamp) {
				v.polygonOffset = true
				v.polygonOffsetFactor = -1
				v.polygonOffsetUnits = -1
			} else if (!isMainBake && alpha && !isApron && !isRamp) {
				v.polygonOffset = true
				v.polygonOffsetFactor = -2
				v.polygonOffsetUnits = -4
			} else if (!isOverlay) {
				v.polygonOffset = false
				v.polygonOffsetFactor = 0
				v.polygonOffsetUnits = 0
			}
			if (isApron || isRamp) {
				v.transparent = false
				v.alphaTest = 0
				v.depthWrite = true
				if (!isMainBake) {
					v.polygonOffset = false
					v.polygonOffsetFactor = 0
					v.polygonOffsetUnits = 0
				}
			}
		}
		bakedCache.set(key, v)
		return v
	}
	const getVr = base => {
		const pending = pendingOf(base)
		const key = `${base.name}|${base.map?.name ?? pending}|${base.polygonOffset ? `${base.polygonOffsetFactor}/${base.polygonOffsetUnits}` : '0'}`
		let v = vrCache.get(key)
		if (v) return v
		v = base.clone()
		fixVr(v)
		v.polygonOffset = false
		v.polygonOffsetFactor = 0
		v.polygonOffsetUnits = 0
		v.depthWrite = true
		v.transparent = false
		v.alphaTest = 0
		v.opacity = 1
		v.needsUpdate = true
		vrCache.set(key, v)
		return v
	}

	node.traverse(o => {
		if (isInCabFlipper(o) && viewerMode === 'play') {
			if (o.visible !== false) stats.cabFlipperHidden++
			o.visible = false
			return
		}
		if (!o.isMesh) {
			const n = (o.name || '').toLowerCase()
			if (n && RE_CAB.test(n) && o.visible === false) {
				o.visible = true
				stats.cabForced++
			}
			if (n && RE_VR.test(n) && o.visible === false) {
				o.visible = true
				stats.vrKept++
			}
			return
		}
		const n = (o.name || '').toLowerCase()
		const matName = (o.material?.name || '').toLowerCase()
		const mapName = (o.material?.map?.name || '').toLowerCase()
		const c = classify(n, matName, mapName, !!o.material?.userData?.__isBaked)
		if (c.isGlass) {
			hideMesh(o, 'glass', stats)
			return
		}
		if (c.isLm || (c.isVlmBake && !c.isMainBake)) {
			stats.lightmaps++
			if (n.includes('bumper')) stats.bumperLM++
		}
		if (n.includes('playfield') && o.visible === false) {
			o.visible = true
			makeParentsVisible(o, node, stats)
		}
		if (viewerMode === 'play' && c.isVr && !c.isCab) {
			if (o.visible) {
				o.visible = false
				stats.cabHidden++
				o.geometry?.dispose?.()
			}
			return
		}
		if (c.isVr) {
			if (o.visible === false) o.visible = true
			if (o.visible) {
				makeParentsVisible(o, node, stats)
				stats.vrKept++
			}
		}
		if (c.isCab && !o.visible) {
			o.visible = true
			stats.cabForced++
			makeParentsVisible(o, node, stats)
		}
		if (!o.visible) return
		const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []
		if (
			mats.some(mm => {
				const mn = (mm?.name || '').toLowerCase()
				const col = mm?.color?.getHexString?.()?.toLowerCase()
				return mn.includes('green') || col === '00ff00'
			})
		) {
			hideMesh(o, 'greenHidden', stats)
			return
		}
		for (let i = 0; i < mats.length; i++) {
			let m = mats[i]
			const mName = (m.name || '').toLowerCase()
			const mp = (m.map?.name || '').toLowerCase()
			const mc = classify('', mName, mp, !!m.userData?.__isBaked)
			if (n.includes('flipper')) {
				if (mc.isBakedMat && !m.map) {
					m.color?.set?.(0xffffff)
					m.emissive = new THREE.Color(0x444444)
					m.emissiveIntensity = BAKED_EMISSIVE
					m.roughness = 0.45
					m.metalness = 0
					m.side = THREE.DoubleSide
				}
				if (m.map && m.map.colorSpace !== THREE.SRGBColorSpace) {
					m.map.colorSpace = THREE.SRGBColorSpace
					m.map.needsUpdate = true
				}
				o.castShadow = false
				o.receiveShadow = false
				continue
			}
			if (c.isVr || c.isCab) {
				const v = getVr(m)
				if (v !== m) {
					if (Array.isArray(o.material)) o.material[i] = v
					else o.material = v
					m = v
				}
				o.castShadow = false
				o.receiveShadow = false
				o.frustumCulled = true
				o.geometry?.computeBoundingSphere?.()
				o.geometry?.computeBoundingBox?.()
				stats.vlmFixed++
				continue
			}
			if (mc.isBakedMat || c.isVlmBake) {
				const v = getBaked(m, n)
				if (v !== m) {
					if (Array.isArray(o.material)) o.material[i] = v
					else o.material = v
					m = v
				}
				o.castShadow = false
				o.receiveShadow = false
				o.frustumCulled = true
				o.geometry?.computeBoundingSphere?.()
				o.geometry?.computeBoundingBox?.()
				stats.vlmFixed++
				continue
			}
			if ((m.metalness > 0.3 || m.roughness < 0.4) && !m.name.toLowerCase().includes('ball')) {
				m.roughness = Math.max(m.roughness, 0.75)
				m.metalness = Math.min(m.metalness, 0.1)
				m.needsUpdate = true
				stats.metalFixed++
			}
			if (n.includes('plastic') && !m.map && !pendingOf(m)) {
				m.side = THREE.DoubleSide
				m.transparent = false
				m.depthWrite = true
				m.alphaTest = 0
				m.opacity = 1
				m.roughness = Math.max(m.roughness ?? 0.6, 0.6)
				m.metalness = Math.min(m.metalness ?? 0, 0.05)
				m.needsUpdate = true
			}
			if (m.map && m.map.colorSpace !== THREE.SRGBColorSpace) {
				m.map.colorSpace = THREE.SRGBColorSpace
				m.map.needsUpdate = true
			}
		}
		o.receiveShadow = false
		if (c.isVr || c.isCab) {
			o.frustumCulled = true
			o.geometry?.computeBoundingSphere?.()
			o.geometry?.computeBoundingBox?.()
		}
		if (n.includes('plastic') || n.includes('ramp'))
			for (const mat of Array.isArray(o.material) ? o.material : [o.material]) mat.side = THREE.DoubleSide
	})

	let hasReadyBake = false,
		hasPendingBake = false
	node.traverse(o => {
		if (!o.isMesh) return
		const n = (o.name || '').toLowerCase()
		if (!n.includes('playfield') && !n.includes('bm_')) return
		const m = Array.isArray(o.material) ? o.material[0] : o.material
		if (!m) return
		const pending = pendingOf(m)
		const mapName = (m.map?.name || '').toLowerCase()
		const eff = mapName || pending
		const c = classify(n, (m.name || '').toLowerCase(), eff, !!m.userData?.__isBaked)
		if (!isBakedMesh(c)) return
		if (mapName) hasReadyBake = true
		else if (pending) hasPendingBake = true
		else hasReadyBake = true
	})
	if (hasReadyBake) {
		node.traverse(o => {
			if (!o.isMesh) return
			const n = (o.name || '').toLowerCase()
			const m = Array.isArray(o.material) ? o.material[0] : o.material
			if (!m) return
			const pending = pendingOf(m)
			const mapName = (m.map?.name || '').toLowerCase()
			const c = classify(n, (m.name || '').toLowerCase(), mapName || pending, !!m.userData?.__isBaked)
			if (isBasePlayfield(n, c) && o.visible) hideMesh(o, 'playfieldHidden', stats)
		})
	} else if (hasPendingBake) {
		node.traverse(o => {
			if (!o.isMesh) return
			const n = (o.name || '').toLowerCase()
			const m = Array.isArray(o.material) ? o.material[0] : o.material
			if (!m) return
			const pending = pendingOf(m)
			const mapName = (m.map?.name || '').toLowerCase()
			const c = classify(n, (m.name || '').toLowerCase(), mapName || pending, !!m.userData?.__isBaked)
			if (c.isMainBake && pending && !mapName && o.visible) {
				o.visible = false
				stats.playfieldHidden++
			} else if (n.includes('playfield') && isBakedMesh(c) && pending && !mapName && o.visible) {
				const mats = Array.isArray(o.material) ? o.material : [o.material]
				for (const mm of mats) {
					mm.transparent = true
					mm.opacity = 0
					mm.depthWrite = false
					mm.blending = THREE.AdditiveBlending
					mm.needsUpdate = true
				}
			}
			if (isBasePlayfield(n, c) && o.visible === false) {
				o.visible = true
				makeParentsVisible(o, node, stats)
			}
		})
	}

	let hasBakedDuplicate = false
	node.traverse(o => {
		if (o.isMesh && o.visible && (o.name || '').toLowerCase().includes('bm_')) hasBakedDuplicate = true
	})
	if (hasBakedDuplicate) {
		node.traverse(o => {
			if (!o.isMesh) return
			const nn = (o.name || '').toLowerCase()
			const isBaked = nn.includes('bm_')
			const isDynamicFlipper = nn.includes('flipper') && !isBaked
			const isBakedFlipper = isBaked && (nn.includes('bat') || nn.includes('flipper'))
			if (viewerMode === 'play' && isBakedFlipper && o.visible) o.visible = false
			else if (viewerMode !== 'play' && isDynamicFlipper && o.visible) o.visible = false
		})
	}

	node.traverse(o => {
		if (!o.isMesh || o.visible) return
		const n = (o.name || '').toLowerCase()
		if (!(n.includes('su') || n.includes('sling'))) return
		const m = Array.isArray(o.material) ? o.material[0] : o.material
		const c = m
			? classify(n, (m.name || '').toLowerCase(), (m.map?.name || '').toLowerCase(), !!m.userData?.__isBaked)
			: { isGlass: false, isLm: false, isVlmBake: false, isMainBake: false }
		if (c.isGlass || c.isLm || (c.isVlmBake && !c.isMainBake)) return
		if (m && (m.name || '').toLowerCase().includes('green')) return
		o.visible = true
		makeParentsVisible(o, node, stats)
	})
	node.traverse(o => {
		if (o.isMesh || o.visible !== false) return
		const n = (o.name || '').toLowerCase()
		if (!n.includes('su') && !n.includes('sling')) return
		if (n.includes('vrcab') || n.includes('vr_')) return
		o.visible = true
		makeParentsVisible(o, node, stats)
		stats.cabForced++
	})
	if (stats.vrKept) harnessLog?.(`[VR] Kept ${stats.vrKept} VR meshes`, 'info')
	if (stats.cabForced) harnessLog?.(`[cabinet] ${stats.cabForced} cab`, 'info')
	if (stats.cabHidden) harnessLog?.(`[cabinet] Hid ${stats.cabHidden} VR/cab meshes in play`, 'info')
	if (stats.cabFlipperHidden) harnessLog?.(`[cabinet] Hid ${stats.cabFlipperHidden} VRCab flipper(s) in play`, 'info')
	if (stats.vlmFixed) harnessLog?.(`[VLM] ${stats.vlmFixed} baked`, 'info')
	if (stats.metalFixed) harnessLog?.(`[mat] ${stats.metalFixed} metals`, 'info')
	if (stats.playfieldHidden)
		harnessLog?.(`[playfield] Hid ${stats.playfieldHidden} base playfield (baked replaced)`, 'info')
	if (stats.greenHidden) harnessLog?.(`[ramp] Hid ${stats.greenHidden} green ramp(s)`, 'info')
	if (stats.glass) harnessLog?.(`[glass] Hid ${stats.glass}`, 'info')
	let whiteWallsHidden = 0
	const keepWhite = name => {
		const n = name.toLowerCase()
		return (
			n.includes('playfield') ||
			n.includes('ball') ||
			n.includes('flipper') ||
			n.includes('bumper') ||
			n.includes('light') ||
			n.includes('dmd') ||
			n.includes('vr_') ||
			n.includes('vrcab') ||
			n.includes('cabinet') ||
			n.includes('lockbar') ||
			n.includes('pincab') ||
			n.includes('ramp') ||
			n.includes('plastic') ||
			n.includes('gate') ||
			n.includes('kicker') ||
			n.includes('target') ||
			n.includes('spinner') ||
			n.includes('primitive-bm') ||
			n.includes('bm_')
		)
	}
	node.traverse(o => {
		if (!o.isMesh || !o.visible) return
		const n = (o.name || '').toLowerCase()
		if (keepWhite(n)) return
		const mats = Array.isArray(o.material) ? o.material : [o.material]
		if (mats.some(m => m.map || pendingOf(m))) return
		if (!mats.every(m => m.color?.getHexString?.().toLowerCase() === 'ffffff')) return
		hideMesh(o, null, stats)
		whiteWallsHidden++
	})
	if (whiteWallsHidden) harnessLog?.(`[wall] Hid ${whiteWallsHidden} white untextured stray meshes`, 'info')
	if (stats.nanFixed || stats.nanHidden)
		harnessLog?.(`[sanitize] ${stats.nanFixed} fixed ${stats.nanHidden} hidden`, 'info')
	return stats
}

export function ensureProceduralRoom(scene, center, size, opts = {}) {
	const e = scene.getObjectByName('vr_procedural_room')
	if (e) scene.remove(e)
	if (opts.hasVr) return null
	const maxDim = Math.max(size.x, size.y, size.z)
	const W = Math.max(1600, maxDim * 8),
		D = Math.max(1600, maxDim * 8),
		H = Math.max(900, maxDim * 6)
	const g = new THREE.Group()
	g.name = 'vr_procedural_room'
	const floorY = center.z - size.z * 0.6 - 50
	const box = new THREE.Mesh(
		new THREE.BoxGeometry(W, D, H),
		new THREE.MeshStandardMaterial({ color: 0x1c222e, roughness: 0.95, side: THREE.BackSide }),
	)
	box.position.set(center.x, center.y, floorY + H * 0.5)
	g.add(box)
	const floor = new THREE.Mesh(
		new THREE.PlaneGeometry(W * 0.98, D * 0.98),
		new THREE.MeshStandardMaterial({ color: 0x232a3a, roughness: 0.92, side: THREE.DoubleSide }),
	)
	floor.position.set(center.x, center.y, floorY + 0.6)
	g.add(floor)
	const grid = new THREE.GridHelper(Math.min(W, D) * 0.96, 16, 0x2f3a5a, 0x1e2535)
	grid.position.set(center.x, center.y, floorY + 1.2)
	grid.rotation.x = Math.PI / 2
	g.add(grid)
	const h = new THREE.HemisphereLight(0xffffff, 0x1a1f2e, 0.45)
	h.name = 'proc_hemi'
	g.add(h)
	scene.add(g)
	return g
}

function framingBox(node, exclude) {
	node.updateMatrixWorld(true)
	const box = new THREE.Box3().makeEmpty()
	node.traverse(o => {
		if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position) return
		if (exclude?.((o.name || '').toLowerCase())) return
		box.expandByObject(o)
	})
	if (box.isEmpty() || !Number.isFinite(box.min.x)) box.setFromObject(node)
	const center = box.getCenter(new THREE.Vector3())
	const size = box.getSize(new THREE.Vector3())
	return { box, center, size, maxDim: Math.max(size.x, size.y, size.z) }
}

const excludeNonPlayfield = n => !n.includes('playfield')
const excludeVrNonCab = n => RE_VR.test(n) && !RE_CAB.test(n)
const VIEWER = { dist: 1.2, elev: 0.85, azim: 0.65, near: 0.015, farScale: 8, farMin: 2000 }
const PLAY = { dist: 0.95, elev: 0.95, azim: 0.92, near: 0.012, farScale: 10, farMin: 4000, forwardBias: 0.07 }

function framingState(node, targetExclude, sizeExclude, cfg) {
	const target = framingBox(node, targetExclude).center.clone()
	const { size, maxDim } = framingBox(node, sizeExclude)
	if (cfg.forwardBias) target.z += size.z * cfg.forwardBias
	const dist = maxDim * cfg.dist
	return {
		center: target.clone(),
		size,
		maxDim,
		target: target.clone(),
		position: new THREE.Vector3(target.x, target.y + dist * cfg.elev, target.z + dist * cfg.azim),
		near: Math.max(1, maxDim * cfg.near),
		far: Math.max(cfg.farMin, maxDim * cfg.farScale),
	}
}

export const computeViewerFraming = node => framingState(node, excludeNonPlayfield, excludeVrNonCab, VIEWER)
export const computePlayFraming = node => framingState(node, excludeNonPlayfield, excludeNonPlayfield, PLAY)

export function applyCameraState(camera, controls, state) {
	controls.target.copy(state.target)
	camera.position.copy(state.position)
	camera.near = state.near
	camera.far = state.far
	camera.updateProjectionMatrix()
	camera.lookAt(state.target)
	controls.update()
}

export function frameCamera(node, camera, controls) {
	const state = computeViewerFraming(node)
	applyCameraState(camera, controls, state)
	return { center: state.center, size: state.size, maxDim: state.maxDim }
}

export const isDeferred = (tx, table) => {
	const pf = table.getPlayfieldMap().toLowerCase()
	if (tx.getName().toLowerCase() === pf) return false
	const p = (tx.szPath || '').toLowerCase()
	if (p.endsWith('.exr') || p.endsWith('.hdr') || tx.isHdr?.()) return true
	return tx.width * tx.height > 1_048_576
}
