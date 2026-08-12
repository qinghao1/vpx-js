export const BAKED_EMISSIVE = 1.0 // baked is unlit
export const BAKED_ROUGH = 0.75
export const BAKED_METAL = 0.1

export const CAM = { fov: 45, near: 10, far: 10000 }
export const CAM_ANIM = { durationMode: 900, durationReset: 700 }
export const LIGHT_HEMI = { sky: 0xffffff, ground: 0x444444, intensity: 0.35 }
export const LIGHT_DIR = { color: 0xffffff, intensity: 0.4, pos: [400, -600, 1200] }
export const LIGHT_AMBIENT = { color: 0xffffff, intensity: 0.18 }

export const DMD = { w: 128, h: 32, scale: 4 }

export const RE_BAKE_MAT = /bake/i
export const RE_BAKE_MAP = /bake|nestmap/i
export const RE_ALPHA_MESH = /armp|ramp|bat_|non[_-]?opaque|plastic|gate/i
export const RE_VR = /vr_/i
export const RE_CAB = /vrcab|cabinet|lockbar|pincab/i
export const RE_OUTER = /VRCab_(Cabinet|Backbox|LegsFront|LegsBack)$/i
export const RE_GLASS = /glass/i
export const RE_LM = /lm_/i

export const NUDGE = { left: 75, right: 285, forward: 0, back: 180, force: 2.6 }

export const CONTROL_SCHEME = [
	{
		label: 'Left Flipper',
		help: '<kbd>Shift</kbd><span class="hint">L</span> <span class="sep">·</span> <kbd>←</kbd><span class="sep">·</span><kbd>A</kbd>',
		keys: ['ShiftLeft', 'ArrowLeft', 'KeyA'],
	},
	{
		label: 'Right Flipper',
		help: '<kbd>Shift</kbd><span class="hint">R</span> <span class="sep">·</span> <kbd>→</kbd><span class="sep">·</span><kbd>D</kbd>',
		keys: ['ShiftRight', 'ArrowRight', 'KeyD'],
	},
	{
		label: 'Magna Save',
		help: '<kbd>Ctrl</kbd><span class="hint">L / R</span>',
		keys: ['ControlLeft', 'ControlRight'],
		buttons: [
			{ regex: /magna.*left|left.*magna/i, code: 'ControlLeft' },
			{ regex: /magna/i, code: 'ControlRight' },
		],
	},
	{
		label: 'Fire / Lockbar',
		help: '<kbd>Alt</kbd><span class="hint">L</span><span class="sep">·</span>tap yellow apron button',
		keys: ['AltLeft'],
		buttons: { regex: /fire|lockbar/i, code: 'AltLeft' },
	},
	{
		label: 'Plunger',
		help: '<kbd>Enter</kbd><span class="hint">hold → release</span><span class="sep">·</span>touch bottom-right',
		keys: ['Enter'],
		buttons: { regex: /plunger|launch/i, code: 'Enter' },
	},
	{
		label: 'Start / Coin',
		help: '<kbd>1</kbd><span class="sep">/</span><kbd>5</kbd>',
		keys: ['Digit1', 'Digit5'],
		buttons: [
			{ regex: /coin/i, code: 'Digit5' },
			{ regex: /start/i, code: 'Digit1' },
			{ regex: /tour/i, code: 'Digit1' },
		],
	},
	{
		label: 'Nudge',
		help: '<kbd>Z</kbd><kbd>/</kbd><kbd>Space</kbd><span class="hint">or swipe / shake</span>',
		keys: ['KeyZ', 'Slash', 'Space'],
	},
	{
		label: 'View',
		help: '<kbd>P</kbd> pause<span class="sep">·</span><kbd>O</kbd> orbit<span class="sep">·</span><kbd>R</kbd> reset<span class="sep">·</span><kbd>?</kbd> help<span class="sep">·</span><kbd>Esc</kbd> exit',
		keys: ['KeyP', 'KeyO', 'KeyR', 'Escape'],
	},
]

export const BUTTON_CODE_PATTERNS = [
	...CONTROL_SCHEME.find(c => c.label === 'Start / Coin').buttons,
	...[CONTROL_SCHEME.find(c => c.label === 'Plunger').buttons].flat(),
	...[CONTROL_SCHEME.find(c => c.label === 'Fire / Lockbar').buttons].flat(),
	...CONTROL_SCHEME.find(c => c.label === 'Magna Save').buttons,
	{ regex: /button/i, code: 'Digit1' },
]

export const resolveButtonCode = name => {
	const n = String(name || '').toLowerCase()
	for (const { regex, code } of BUTTON_CODE_PATTERNS) if (regex.test(n)) return code
	return null
}

export const TABLE_OPTS = {
	exportPlayfield: true,
	exportPrimitives: true,
	exportRubbers: true,
	exportSurfaces: true,
	exportFlippers: true,
	exportBumpers: true,
	exportRamps: true,
	exportLightBulbs: true,
	exportPlayfieldLights: true,
	exportHitTargets: true,
	exportGates: true,
	exportKickers: true,
	exportTriggers: true,
	exportSpinners: true,
	exportPlungers: true,
	exportLightBulbLights: true,
}
