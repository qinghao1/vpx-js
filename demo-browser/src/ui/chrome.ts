// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { ownsKey } from '../input/input-manager.js'
import type { Viewer } from '../viewer.js'
import { initHelp } from './help-dialog.js'
import { createStatsView, type HudStats } from './stats-overlay.js'

export interface Chrome {
	/** Frame-loop hook (2 Hz): the FPS readout always, the stats card while open. */
	updateHud(fps: number): void
	/** Reflect the engine's mute/volume in the sound button and slider. */
	syncSound(): void
}

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

/** Wires the static chrome in index.html (toolbar, HUD, shortcuts) to the viewer. */
export function initChrome(viewer: Viewer, readStats: () => HudStats): Chrome {
	const pill = byId('hud-toggle')
	const panel = byId('debug-panel')
	const soundBtn = byId('sound-btn')
	const slider = byId<HTMLInputElement>('sound-volume')
	const renderStats = createStatsView(panel)
	const toggleHelp = initHelp()
	let lastFps = 0

	const updateHud = (fps: number) => {
		lastFps = fps
		const label = fps ? `${fps} fps` : 'idle'
		if (pill.textContent !== label) pill.textContent = label
		if (!panel.hidden) renderStats(readStats())
	}
	const toggleStats = () => {
		panel.hidden = !panel.hidden
		pill.setAttribute('aria-expanded', String(!panel.hidden))
		updateHud(lastFps)
	}
	pill.addEventListener('click', toggleStats)

	// Mute/volume live in the engine (per table); the label stays fixed and aria-pressed carries the state.
	const syncSound = () => {
		const engine = viewer.wasmEngine
		if (!engine) return
		soundBtn.dataset.level = engine.muted || engine.volume <= 0 ? 'off' : engine.volume <= 0.5 ? 'low' : 'high'
		soundBtn.setAttribute('aria-pressed', String(engine.muted))
		slider.value = String(Math.round(engine.volume * 100))
	}
	soundBtn.addEventListener('click', () => viewer.toggleSoundMuted())
	slider.addEventListener('input', () => {
		viewer.wasmEngine?.setVolume(Number(slider.value) / 100)
		syncSound()
	})

	byId('reset').addEventListener('click', () => viewer._onResetView())
	byId('exit-play').addEventListener('click', () => viewer._switchToViewer())

	const copyLog = byId('copy-log')
	copyLog.addEventListener('click', async () => {
		try {
			await navigator.clipboard.writeText(viewer.log.text())
			copyLog.textContent = 'Copied'
		} catch (e) {
			console.warn('[app] copy log failed', e)
			copyLog.textContent = 'Copy failed'
		}
		setTimeout(() => {
			copyLog.textContent = 'Copy log'
		}, 1500)
	})

	// Hidden where pages cannot go full screen (iPhone Safari).
	const fullscreen = byId('fullscreen-btn')
	fullscreen.hidden = !document.fullscreenEnabled
	fullscreen.addEventListener('click', () => {
		const request = document.fullscreenElement
			? document.exitFullscreen()
			: document.documentElement.requestFullscreen({ navigationUI: 'hide' })
		request.catch(e => console.warn('[app] full screen failed', e))
	})
	addEventListener('fullscreenchange', () => {
		fullscreen.setAttribute('aria-pressed', String(!!document.fullscreenElement))
	})

	// A clicked chrome button must not keep focus: a focused button owns Enter/Space, which play needs.
	for (const bar of [byId('actions'), byId('hud')])
		bar.addEventListener('pointerdown', e => {
			if ((e.target as Element).closest('button')) e.preventDefault()
		})

	// App shortcuts; M still reaches the table as a key, like on a cabinet.
	const shortcuts: Record<string, () => void> = {
		Backquote: toggleStats,
		F2: toggleStats,
		KeyM: () => viewer.toggleSoundMuted(),
		KeyH: toggleHelp,
		'?': toggleHelp,
	}
	addEventListener('keydown', e => {
		if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || ownsKey(e.target, e.code)) return
		const action = shortcuts[e.key === '?' ? e.key : e.code]
		if (!action) return
		if (e.code !== 'KeyM') e.preventDefault()
		action()
	})

	// Keep the screen awake in play: gamepad and tilt play produce no touches to reset the idle timer.
	let wakeLock: Promise<WakeLockSentinel | undefined> | undefined
	const syncWakeLock = () => {
		if (viewer.viewerMode === 'play' && document.visibilityState === 'visible') {
			wakeLock ??= navigator.wakeLock?.request('screen').catch(() => undefined)
		} else {
			void wakeLock?.then(lock => lock?.release())
			wakeLock = undefined
		}
	}
	addEventListener('viewer:modechange', syncWakeLock)
	document.addEventListener('visibilitychange', syncWakeLock)

	return { updateHud, syncSound }
}
