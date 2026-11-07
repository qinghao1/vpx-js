// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
export const CAM = { fov: 45, near: 10, far: 10000 }
export const CAM_ANIM = { durationMode: 900, durationReset: 700 }
export const LIGHT_HEMI = { sky: 0xffffff, ground: 0x444444, intensity: 0.35 }
export const LIGHT_DIR = { color: 0xffffff, intensity: 0.4, pos: [400, -600, 1200] }
export const LIGHT_AMBIENT = { color: 0xffffff, intensity: 0.18 }
// Minimum hemi + ambient fill for lamp-only, unlit tables without a baked playfield; see needsNoBakeFill.
export const LIGHT_NOBAKE_FILL = { hemi: 0.55, ambient: 0.32 }

export const DMD = { w: 128, h: 32, scale: 4 }

export const RE_BAKE_MAP = /bake|nestmap/i
const RE_CAB = /vrcab|cabinet|lockbar|pincab/i
const RE_OUTER = /VRCab_(Cabinet|Backbox|LegsFront|LegsBack)$/i

export function isTableHit(object, root) {
	for (let c = object; c && c !== root; c = c.parent) {
		const n = String(c.name || '')
		if (RE_CAB.test(n) || RE_OUTER.test(n)) return true
		const ln = n.toLowerCase()
		if (ln.includes('playfield') || ln.includes('apron')) return true
	}
	return false
}

export const NUDGE = { left: 75, right: 285, forward: 0, back: 180, force: 2.6 }

export const CONTROL_SCHEME = [
	{
		label: 'Left Flipper',
		section: 'Play',
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
	},
	{
		label: 'Fire / Lockbar',
		help: '<kbd>Alt</kbd><span class="hint">L</span><span class="sep">·</span>tap yellow apron button',
		keys: ['AltLeft'],
	},
	{
		label: 'Plunger',
		help: '<kbd>Enter</kbd><span class="hint">hold → release</span><span class="sep">·</span>touch bottom-right',
		keys: ['Enter'],
	},
	{
		label: 'Start / Coin',
		help: '<kbd>1</kbd><span class="sep">/</span><kbd>5</kbd>',
		keys: ['Digit1', 'Digit5'],
	},
	{
		label: 'Nudge',
		help: '<kbd>Z</kbd><kbd>/</kbd><kbd>Space</kbd><span class="hint">or swipe / shake</span>',
		keys: ['KeyZ', 'Slash', 'Space'],
	},
	{
		label: 'Coin Door',
		section: 'Service',
		help: '<kbd>End</kbd><span class="hint">open / close</span><span class="sep">·</span><kbd>Home</kbd><span class="hint">slam tilt</span>',
		keys: ['End', 'Home'],
	},
	{
		label: 'Service',
		help: '<kbd>7</kbd><span class="hint">cancel</span><span class="sep">·</span><kbd>8</kbd><span class="hint">down / advance</span><span class="sep">·</span><kbd>9</kbd><span class="hint">up</span><span class="sep">·</span><kbd>0</kbd><span class="hint">enter</span>',
		keys: ['Digit7', 'Digit8', 'Digit9', 'Digit0'],
	},
	{
		label: 'Sound',
		section: 'App',
		help: '<kbd>M</kbd> mute',
		keys: [],
	},
	{
		label: 'View',
		help: '<kbd>P</kbd> pause<span class="sep">·</span><kbd>O</kbd> orbit<span class="sep">·</span><kbd>Esc</kbd> exit',
		keys: ['KeyP', 'KeyO', 'Escape'],
	},
	{
		label: 'Panels',
		help: '<kbd>?</kbd> controls<span class="sep">·</span><kbd>`</kbd> stats',
		keys: [],
	},
]

export const TABLE_OPTS = {
	exportPlayfield: true,
	exportPrimitives: true,
	exportRubbers: true,
	exportSurfaces: true,
	exportFlippers: true,
	exportFlashers: true,
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
