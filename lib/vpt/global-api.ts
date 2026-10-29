// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { isScriptable } from '../game/interfaces.js'
import {
	AssignKey,
	DIK_0,
	DIK_3,
	DIK_6,
	DIK_7,
	DIK_8,
	DIK_9,
	DIK_B,
	DIK_END,
	DIK_F3,
	DIK_F12,
	DIK_HOME,
	DIK_MINUS,
	DIK_PRIOR,
} from '../game/key-code.js'
import type { Player } from '../game/player.js'
import { BiffParser } from '../io/biff-parser.js'
import { storage } from '../io/storage.js'
import { ERR } from '../scripting/stdlib/err.js'
import { VbsApi } from '../scripting/vbs-api.js'
import { getTextFile } from '../scripting/vbs-scripts.node.js'
import type { BallApi } from './ball/ball-api.js'
import type { ItemApi } from './item-api.js'
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
			case 0:
				return this.player.getKey(AssignKey.LeftFlipperKey)
			case 1:
				return this.player.getKey(AssignKey.RightFlipperKey)
			case 2:
				return this.player.getKey(AssignKey.LeftFlipperKey)
			case 3:
				return this.player.getKey(AssignKey.RightFlipperKey)
			case 4:
				return this.player.getKey(AssignKey.LeftTiltKey)
			case 5:
				return this.player.getKey(AssignKey.RightTiltKey)
			case 6:
				return this.player.getKey(AssignKey.CenterTiltKey)
			case 7:
				return this.player.getKey(AssignKey.PlungerKey)
			case 8:
				return this.player.getKey(AssignKey.StartGameKey)
			case 9:
				return this.player.getKey(AssignKey.AddCreditKey)
			case 10:
				return this.player.getKey(AssignKey.AddCreditKey2)
			case 11:
				return DIK_3
			case 12:
				return DIK_6
			case 13:
				return this.player.getKey(AssignKey.MechanicalTilt)
			case 14:
				return this.player.getKey(AssignKey.LeftMagnaSave)
			case 15:
				return this.player.getKey(AssignKey.RightMagnaSave)
			case 16:
				return this.player.getKey(AssignKey.ExitGame)
			case 17:
				return DIK_F12
			case 18:
				return this.player.getKey(AssignKey.LockbarKey)
			case 19:
				return DIK_F3
			case 20:
				return this.player.getKey(AssignKey.VolumeDown)
			case 21:
				return this.player.getKey(AssignKey.VolumeUp)
			case 22:
				return DIK_B
			case 23:
				return DIK_HOME
			case 24:
				return DIK_END
			case 25:
				return DIK_7
			case 26:
				return DIK_8
			case 27:
				return DIK_9
			case 28:
				return DIK_0
			case 29:
				return DIK_6
			case 30:
				return DIK_PRIOR
			case 31:
				return DIK_MINUS
			case 32:
				return 0
			case 64:
				return 0
			case 65:
				return 0
			case 66:
				return 0
			case 67:
				return 0
			default:
				return 0
		}
	}
	set MusicVolume(v: number) {
		this.player.getSoundEngine().setMusicVolume(v)
	}
	get MusicVolume() {
		return this.player.getSoundEngine().getMusicVolume()
	}
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
		return this.player.getActiveBall()?.getApi()
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
		sampleName: string,
		loopCount = 1,
		volume = 1,
		pan = 0,
		randomPitch = 0,
		pitch = 0,
		useSame = false,
		restart = true,
		frontRearFade = 0,
	): number {
		return this.player
			.getSoundEngine()
			.playSound(sampleName, { loopCount, volume, pan, randomPitch, pitch, useSame, restart, frontRearFade })
	}

	public PlaySoundAt(
		bstr: string,
		x: number,
		y: number,
		z = 0,
		loopCount = 1,
		volume = 1,
		randomPitch = 0,
		pitch = 0,
		useSame = false,
		restart = true,
	): void {
		this.table.getApi().PlaySoundAt(bstr, x, y, z, loopCount, volume, randomPitch, pitch, useSame, restart)
	}

	public StopSound(sampleName: string): void {
		this.player.getSoundEngine().stopSound(sampleName)
	}

	public PlayMusic(music: string, volume = 1): void {
		// Native multiplies the script volume by the table music level at play
		// time (ScriptGlobalTable::PlayMusic); the setter stays data-only there too.
		this.player.getSoundEngine().playMusic(music, volume * (this.table.data?.tableMusicVolume ?? 1))
	}

	// Native EndMusic takes no name and clears whatever is playing.
	public EndMusic(_music?: string): void {
		this.player.getSoundEngine().endMusic()
	}

	public FireKnocker(count = 1): void {
		this.player.getSoundEngine().fireKnocker(count)
	}

	public QuitPlayer(_closeType: number) {}

	// Upstream gates serial IO on VPX_HAS_WIN32_SDK: without it OpenSerial fails and
	// every other call succeeds without effect, so port that branch (no serial here).
	public OpenSerial(device: string): void {
		ERR.Raise(68, 'OpenSerial', `Serial device ${device} unavailable: this platform has no serial ports.`)
	}

	public CloseSerial(): void {}

	public FlushSerial(): void {}

	public SetupSerial(
		_baud: number,
		_bits: number,
		_parity: number,
		_stopbit: number,
		_rts: boolean,
		_dtr: boolean,
	): void {}

	public ReadSerial(_size: number): void {}

	public WriteSerial(_value: unknown): void {}

	public GetSerialDevices(): void {}

	public GetBalls(): BallApi[] {
		return this.player.getBalls().map(b => b.getApi())
	}

	public GetElements(): Array<ItemApi<ItemData>> {
		return this.table.getItems().flatMap(item => (isScriptable(item) ? [item.getApi()] : []))
	}

	public GetElementByName(name: string): ItemApi<ItemData> | undefined {
		const item = this.table.getItemByName(name)
		if (!item || !isScriptable(item)) {
			return undefined
		}
		return item.getApi()
	}

	public MaterialColor(name: string, color: number): void {
		const material = this.table.getMaterial(name)
		if (!material) return
		// Script colors are OLE_COLOR (BGR); baseColor and three.js use RGB.
		const rgb = BiffParser.bgrToRgb(color)
		material.baseColor = rgb
		const g = globalThis as any
		const target = name.toLowerCase()
		const updateMaterial = (m: any) => {
			if (!m) return
			const n = (m.name ?? '').toLowerCase()
			if (n === `material:${target}` || n === target || n.includes(target)) {
				const ud = m.userData as any
				if (ud?.__isBaked) {
					// Baked lightmap plates are pre-lit unshaded textures; do not tint with material albedo color
					return
				}
				if (ud?.__uTint?.value?.set) ud.__uTint.value.set(rgb)
				if (ud?.__uTintColor?.value?.set) ud.__uTintColor.value.set(rgb)
				if (ud?.__uAlbedo?.value?.set) ud.__uAlbedo.value.set(rgb)
				if (ud?.__uFlat?.value?.set) ud.__uFlat.value.set(rgb)
				const isNodeMat = !!ud?.__primitiveKind || !!ud?.__isBaked
				if (isNodeMat) {
					// Node materials manage live parameters via uniform values
				} else if (m.emissiveMap) {
					if (m.emissive?.set) m.emissive.set(rgb)
					m.emissiveIntensity = 1.0
				} else if (m.color?.set) {
					m.color.set(rgb)
				}
				m.needsUpdate = true
			}
		}
		const groups = [
			(this.table as any).tableNode,
			g.tableGroup,
			g.scene,
			g.viewer?.tableGroup,
			g.viewer?.scene,
		].filter(Boolean)
		for (const grp of groups) {
			grp.traverse?.((o: any) => {
				for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
					updateMaterial(m)
				}
			})
		}
		const generators = [
			(this.table as any).renderApi?.getMaterialGenerator?.(),
			g.renderApi?.getMaterialGenerator?.(),
			g.viewer?.renderApi?.getMaterialGenerator?.(),
		].filter(Boolean)
		for (const gen of generators) {
			for (const [k, m] of Object.entries((gen as any).cachedMaterials ?? {})) {
				if (k.split(':')[0]!.toLowerCase() === target) {
					updateMaterial(m)
				}
			}
		}
	}

	public Nudge(angle: number, force: number): void {
		this.player.nudge(angle, force)
	}

	public NudgeGetCalibration(): void {}

	public NudgeSetCalibration() {}

	public NudgeSensorStatus(): void {}

	public NudgeTiltStatus(): void {}

	public GetCustomParam(): string {
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

	public BeginModal(): void {}

	public EndModal(): void {}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(GlobalApi.prototype)
	}
}
