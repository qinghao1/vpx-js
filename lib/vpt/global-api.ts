// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { AssignKey, DIK_0, DIK_3, DIK_4, DIK_5, DIK_6, DIK_7, DIK_8, DIK_9, DIK_B, DIK_END, DIK_F3, DIK_F12, DIK_HOME, DIK_MINUS, DIK_PRIOR, DIK_T } from '../game/key-code.js'
import type { Player } from '../game/player.js'
import { getTextFile, storage } from '../refs.node.js'
import { VbsApi } from '../scripting/vbs-api.js'
import type { BallApi } from './ball/ball-api.js'
import type { Item } from './item.js'
import type { ItemData } from './item-data.js'
import type { Table } from './table/table.js'

/** Global API. */
export class GlobalApi extends VbsApi {
	private readonly table: Table
	private readonly player: Player

	constructor(table: Table, player: Player) {
		super()
		this.table = table
		this.player = player
	}

	get Name() {
		return 'Global'
	}
	get LeftFlipperKey() {
		return this.player.getKey(AssignKey.LeftFlipperKey)
	}
	get RightFlipperKey() {
		return this.player.getKey(AssignKey.RightFlipperKey)
	}
	get LeftTiltKey() {
		return this.player.getKey(AssignKey.LeftTiltKey)
	}
	get RightTiltKey() {
		return this.player.getKey(AssignKey.RightTiltKey)
	}
	get CenterTiltKey() {
		return this.player.getKey(AssignKey.CenterTiltKey)
	}
	get PlungerKey() {
		return this.player.getKey(AssignKey.PlungerKey)
	}
	get StartGameKey() {
		return this.player.getKey(AssignKey.StartGameKey)
	}
	get AddCreditKey() {
		return this.player.getKey(AssignKey.AddCreditKey)
	}
	get AddCreditKey2() {
		return this.player.getKey(AssignKey.AddCreditKey2)
	}
	get MechanicalTilt() {
		return this.player.getKey(AssignKey.MechanicalTilt)
	}
	get LeftMagnaSave() {
		return this.player.getKey(AssignKey.LeftMagnaSave)
	}
	get RightMagnaSave() {
		return this.player.getKey(AssignKey.RightMagnaSave)
	}
	get ExitGame() {
		return this.player.getKey(AssignKey.ExitGame)
	}
	get LockbarKey() {
		return this.player.getKey(AssignKey.LockbarKey)
	}
	// vpinball mirrors staged when m_tblMirrorEnabled; vpx-js has no mirror flag, return base flipper
	get StagedLeftFlipperKey() {
		return this.player.getKey(AssignKey.LeftFlipperKey)
	}
	get StagedRightFlipperKey() {
		return this.player.getKey(AssignKey.RightFlipperKey)
	}
	public VPXActionKey(actionIndex: number): number {
		switch (actionIndex) {
			case 0: return this.player.getKey(AssignKey.LeftFlipperKey)
			case 1: return this.player.getKey(AssignKey.RightFlipperKey)
			case 2: return this.player.getKey(AssignKey.LeftFlipperKey)
			case 3: return this.player.getKey(AssignKey.RightFlipperKey)
			case 4: return this.player.getKey(AssignKey.LeftTiltKey)
			case 5: return this.player.getKey(AssignKey.RightTiltKey)
			case 6: return this.player.getKey(AssignKey.CenterTiltKey)
			case 7: return this.player.getKey(AssignKey.PlungerKey)
			case 8: return this.player.getKey(AssignKey.StartGameKey)
			case 9: return this.player.getKey(AssignKey.AddCreditKey)
			case 10: return this.player.getKey(AssignKey.AddCreditKey2)
			case 11: return DIK_3
			case 12: return DIK_6
			case 13: return this.player.getKey(AssignKey.MechanicalTilt)
			case 14: return this.player.getKey(AssignKey.LeftMagnaSave)
			case 15: return this.player.getKey(AssignKey.RightMagnaSave)
			case 16: return this.player.getKey(AssignKey.ExitGame)
			case 17: return DIK_F12
			case 18: return this.player.getKey(AssignKey.LockbarKey)
			case 19: return DIK_F3
			case 20: return this.player.getKey(AssignKey.VolumeDown)
			case 21: return this.player.getKey(AssignKey.VolumeUp)
			case 22: return DIK_B
			case 23: return DIK_HOME
			case 24: return DIK_END
			case 25: return DIK_7
			case 26: return DIK_8
			case 27: return DIK_9
			case 28: return DIK_0
			case 29: return DIK_6
			case 30: return DIK_PRIOR
			case 31: return DIK_MINUS
			case 32: return 0
			case 64: return 0
			case 65: return 0
			case 66: return 0
			case 67: return 0
			default: return 0
		}
	}
	set MusicVolume(_v: number) {}
	get UserDirectory() {
		return '.'
	}
	get ScriptsDirectory() {
		return './Scripts/'
	}
	get TablesDirectory() {
		return './Tables/'
	}
	get MusicDirectory() {
		return '.'
	}
	get ActiveTable() {
		return this.table.getApi()
	}
	get PlatformOS() {
		return 'Linux'
	}
	get PlatformCPU() {
		return 'x86-64'
	}
	get PlatformBits() {
		return '64'
	}
	get GetPlayerHWnd() {
		return null
	}
	get ActiveBall() {
		return this.player.getActiveBall()
	}
	get GameTime() {
		return this.player.getGameTime()
	}
	get PreciseGameTime() {
		return this.player.getGameTime() / 1000
	}
	get FrameIndex() {
		return Math.floor(this.player.getGameTime() / 16.666)
	}
	get SystemTime() {
		return performance.now()
	}
	get NightDay() {
		return this.table.getApi().NightDay
	}
	get ShowDT() {
		return this.table.getApi().ShowDT
	}
	get ShowFSS() {
		return this.table.getApi().ShowFSS
	}
	get WindowWidth() {
		return this.player.width
	}
	get WindowHeight() {
		return this.player.height
	}
	set DMDWidth(_v: number) {}
	get DMDWidth() {
		return 0
	}
	set DMDHeight(_v: number) {}
	get DMDHeight() {
		return 0
	}
	get Version() {
		return this.table.getApi().Version
	}
	get VPBuildVersion() {
		return this.table.getApi().VPBuildVersion
	}
	get VersionMajor() {
		return this.table.getApi().VersionMajor
	}
	get VersionMinor() {
		return this.table.getApi().VersionMinor
	}
	get VersionRevision() {
		return this.table.getApi().VersionRevision
	}

	public GetTextFile(fileName: string): string {
		return getTextFile(fileName)
	}

	public PlaySound(
		_sampleName: string,
		_loopCount: number,
		_volume: number,
		_pan: number,
		_randomPitch: number,
		_pitch: number,
		_useSame: boolean,
		_restart: boolean,
		_frontRearFade: number,
	) {}

	public StopSound(_sampleName: string) {}

	public PlayMusic(_music: string, _volume: number) {}

	public EndMusic(_music: string) {}

	public FireKnocker(_count: number) {}

	public QuitPlayer(_closeType: number) {}

	public GetBalls(): BallApi[] {
		return this.player.getBalls().map(b => b.getApi())
	}

	public GetElements(): Array<Item<ItemData>> {
		return this.table.getItems()
	}

	public GetElementByName(name: string): Item<ItemData> | undefined {
		return this.table.items[name]
	}

	public MaterialColor(name: string, color: number): void {
		const material = this.table.getMaterial(name)
		if (!material) return
		material.baseColor = color
		try {
			const g = globalThis as unknown as Record<string, unknown>
			const groups: unknown[] = [g['tableGroup'], g['scene'], (g['viewer'] as Record<string, unknown> | undefined)?.['tableGroup'], (g['viewer'] as Record<string, unknown> | undefined)?.['scene']].filter(Boolean)
			const target = name.toLowerCase()
			for (const grp of groups) {
				const traverse = (grp as { traverse?: (cb: (o: unknown) => void) => void })?.traverse
				if (typeof traverse !== 'function') continue
				traverse.call(grp, (o: unknown) => {
					const obj = o as { material?: unknown }
					const mats = Array.isArray(obj.material) ? (obj.material as unknown[]) : obj.material ? [obj.material] : []
					for (const m of mats) {
						const mat = m as { name?: string; color?: { set: (c: number) => void }; needsUpdate?: boolean }
						if (!mat?.color) continue
						const n = (mat.name ?? '').toLowerCase()
						if (n === `material:${target}` || n === target || n.includes(target)) {
							mat.color.set(color)
							mat.needsUpdate = true
						}
					}
				})
			}
			const gen = (g['renderApi'] as { getMaterialGenerator?: () => { cachedMaterials?: Record<string, unknown> } } | undefined)?.getMaterialGenerator?.() ?? (g['viewer'] as { renderApi?: { getMaterialGenerator?: () => { cachedMaterials?: Record<string, unknown> } } } | undefined)?.renderApi?.getMaterialGenerator?.()
			if (gen?.cachedMaterials) {
				for (const [k, m] of Object.entries(gen.cachedMaterials)) {
					if (k.split(':')[0]?.toLowerCase() === target) {
						const mat = m as { color?: { set: (c: number) => void }; needsUpdate?: boolean }
						mat.color?.set(color)
						mat.needsUpdate = true
					}
				}
			}
		} catch {}
	}

	public Nudge(angle: number, force: number): void {
		this.player.nudge(angle, force)
	}

	public NudgeGetCalibration(): void {}

	public NudgeSetCalibration() {
		// not doing that for the browser
	}

	public NudgeSensorStatus(): void {}

	public NudgeTiltStatus(): void {}

	public GetCustomParam(): string {
		// these are command line args when launching vp, so none here!
		return ''
	}

	public AddObject(_name: string, _pdisp: unknown): void {}

	public SaveValue(tableName: string, valueName: string, value: unknown): void {
		const key = `${tableName}:${valueName}`
		storage.setItem(key, value)
	}

	public LoadValue(tableName: string, valueName: string): unknown {
		const key = `${tableName}:${valueName}`
		return storage.getItem(key)
	}

	public BeginModal(): void {
		// no idea what this is
	}

	public EndModal(): void {
		// still no idea
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(GlobalApi.prototype)
	}
}
