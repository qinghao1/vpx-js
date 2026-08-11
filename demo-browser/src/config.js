export const BAKED_EMISSIVE = 0.85
export const BAKED_ROUGH = 0.75
export const BAKED_METAL = 0.1

export const CAM = { fov: 45, near: 10, far: 10000 }
export const CAM_ANIM = { durationMode: 900, durationReset: 700 }
export const LIGHT_HEMI = { sky: 0xffffff, ground: 0x444444, intensity: 1.0 }
export const LIGHT_DIR = { color: 0xffffff, intensity: 1.0, pos: [400, -600, 1200] }
export const LIGHT_AMBIENT = { color: 0xffffff, intensity: 0.6 }

export const DMD = { w: 128, h: 32, scale: 4 }

export const RE_BAKE_MAT = /bake/i
export const RE_BAKE_MAP = /bake|nestmap/i
export const RE_ALPHA_MESH = /armp|ramp|bat_|non[_-]?opaque|plastic|gate/i
export const RE_VR = /vr_/i
export const RE_CAB = /vrcab|cabinet|lockbar|pincab/i
export const RE_OUTER = /VRCab_(Cabinet|Backbox|LegsFront|LegsBack)$/i
export const RE_GLASS = /glass/i
export const RE_LM = /lm_/i
