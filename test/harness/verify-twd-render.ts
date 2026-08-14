import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { Table } from '../../lib/vpt/table/table.js'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { ThreeRenderApi } from '../../lib/render/threejs/three-render-api.js'
import { postProcessScene, isBakedMeshByNames, applyBakedMaterial } from '../../demo-browser/src/scene.js'

const vpxPath = '/home/qinghao1/Downloads/walking_dead.vpx'
const table = await Table.load(new NodeBinaryReader(vpxPath), { skipTextures: false } as any)
const api = new ThreeRenderApi({ applyMaterials: true, applyTextures: true, optimizeTextures: false } as any)
const group = (await (table as any).generateTableNode(api, {
  exportPlayfield: true,
  exportPrimitives: true,
  exportFlippers: true,
  exportBumpers: true,
  exportRamps: true,
  exportSurfaces: true,
  exportRubbers: true,
  exportLightBulbs: true,
  exportHitTargets: true,
  exportGates: true,
  exportKickers: true,
  exportTriggers: true,
  exportSpinners: true,
  exportPlungers: true,
  preloadTextures: false,
})) as THREE.Group

postProcessScene(group, { viewerMode: 'play', harnessLog: console.log })
group.updateMatrixWorld(true)

console.log('=== Checking Post-Process Scene State ===')
let bmPlayfield: any, pfMesh: any
let giCount = 0, flshCount = 0, insrtCount = 0, vrCount = 0

group.traverse(o => {
  if (!o.isMesh) return
  const n = (o.name || '').toLowerCase()
  const mat = Array.isArray(o.material) ? o.material[0] : o.material
  if (n === 'primitive-bm_playfield') bmPlayfield = o
  if (n === 'primitive-playfield_mesh') pfMesh = o
  if (n.includes('lm_')) {
    if (n.includes('gi0') || n.includes('gi1') || n.includes('_gi')) giCount++
    else if (n.includes('flsh')) flshCount++
    else if (n.includes('insrt')) insrtCount++
  }
  if (n.includes('vr_mega') || n.includes('vr_mini')) {
    if (o.visible) vrCount++
  }
})

console.log({
  bmPlayfield: {
    visible: bmPlayfield?.visible,
    opacity: bmPlayfield?.material?.opacity,
    emissiveIntensity: bmPlayfield?.material?.emissiveIntensity,
    pendingMap: bmPlayfield?.material?.userData?.pendingMap
  },
  pfMesh: {
    visible: pfMesh?.visible
  },
  giCount,
  flshCount,
  insrtCount,
  vrCount
})

if (!bmPlayfield?.visible) {
  console.error('FAIL: BM_Playfield is not visible!')
  process.exit(1)
}
if (pfMesh?.visible) {
  console.error('FAIL: playfield_mesh is visible (should be hidden to avoid z-fighting)!')
  process.exit(1)
}

console.log('=== Simulating Texture Streaming for VLM and VR Textures ===')
// Simulate texture streaming
const dummyTexture = (name: string) => {
  const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
  tex.name = name
  return tex
}

group.traverse(o => {
  if (!o.isMesh) return
  const mats = Array.isArray(o.material) ? o.material : [o.material]
  for (const m of mats) {
    const pending = m.userData?.pendingMap
    if (!pending) continue
    const tex = dummyTexture(pending)
    m.map = tex
    m.emissiveMap = tex
    delete m.userData.pendingMap
    const info = isBakedMeshByNames(o.name, m.name, tex.name, !!m.userData?.__isBaked, !!m.userData?.__addBlend)
    if (info.isBaked) {
      applyBakedMaterial(m, tex, info, o.name)
    } else if (info.isVrCab) {
      m.transparent = false
      m.opacity = 1
      m.depthWrite = true
    }
  }
})

console.log('=== Verifying Scene After Texture Streaming ===')
let badFlsh = 0, badInsrt = 0, goodGi = 0
group.traverse(o => {
  if (!o.isMesh || !o.visible) return
  const n = (o.name || '').toLowerCase()
  const mat = Array.isArray(o.material) ? o.material[0] : o.material
  if (n.includes('lm_')) {
    const isGI = n.includes('gi0') || n.includes('gi1') || n.includes('_gi')
    if (isGI) {
      if (mat.opacity === 1 && mat.emissiveIntensity === 1) goodGi++
    } else if (n.includes('flsh')) {
      if (mat.opacity > 0 || mat.emissiveIntensity > 0) badFlsh++
    } else if (n.includes('insrt')) {
      if (mat.opacity > 0 || mat.emissiveIntensity > 0) badInsrt++
    }
  }
})

console.log({ goodGi, badFlsh, badInsrt })
if (badFlsh > 0 || badInsrt > 0) {
  console.error(`FAIL: ${badFlsh} flashers and ${badInsrt} inserts were lit!`)
  process.exit(1)
}

console.log('SUCCESS: All checks passed cleanly!')
