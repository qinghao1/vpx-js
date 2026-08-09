// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { AssignKey } from '../game/key-code.js'
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
	set MusicVolume(_v: number) {}
	get UserDirectory() {
		return '.'
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
		if (material) {
			// TODO: apply to render realm
			material.baseColor = color
		}
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
