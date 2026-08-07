// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { AssignKey } from '../game/key-code.js'
import type { Player } from '../game/player.js'
import { getTextFile, now, storage } from '../refs.node.js'
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

	/** Get Name. */
	get Name() {
		return 'Global'
	}
	/** Get LeftFlipperKey. */
	get LeftFlipperKey() {
		return this.player.getKey(AssignKey.LeftFlipperKey)
	}
	/** Get RightFlipperKey. */
	get RightFlipperKey() {
		return this.player.getKey(AssignKey.RightFlipperKey)
	}
	/** Get LeftTiltKey. */
	get LeftTiltKey() {
		return this.player.getKey(AssignKey.LeftTiltKey)
	}
	/** Get RightTiltKey. */
	get RightTiltKey() {
		return this.player.getKey(AssignKey.RightTiltKey)
	}
	/** Get CenterTiltKey. */
	get CenterTiltKey() {
		return this.player.getKey(AssignKey.CenterTiltKey)
	}
	/** Get PlungerKey. */
	get PlungerKey() {
		return this.player.getKey(AssignKey.PlungerKey)
	}
	/** Get StartGameKey. */
	get StartGameKey() {
		return this.player.getKey(AssignKey.StartGameKey)
	}
	/** Get AddCreditKey. */
	get AddCreditKey() {
		return this.player.getKey(AssignKey.AddCreditKey)
	}
	/** Get AddCreditKey2. */
	get AddCreditKey2() {
		return this.player.getKey(AssignKey.AddCreditKey2)
	}
	/** Get MechanicalTilt. */
	get MechanicalTilt() {
		return this.player.getKey(AssignKey.MechanicalTilt)
	}
	/** Get LeftMagnaSave. */
	get LeftMagnaSave() {
		return this.player.getKey(AssignKey.LeftMagnaSave)
	}
	/** Get RightMagnaSave. */
	get RightMagnaSave() {
		return this.player.getKey(AssignKey.RightMagnaSave)
	}
	/** Get ExitGame. */
	get ExitGame() {
		return this.player.getKey(AssignKey.ExitGame)
	}
	/** Get LockbarKey. */
	get LockbarKey() {
		return this.player.getKey(AssignKey.LockbarKey)
	}
	set MusicVolume(v: number) {
		/* TODO implement */
	}
	/** Get UserDirectory. */
	get UserDirectory() {
		return '.'
	} // TODO implement
	/** Get GetPlayerHWnd. */
	get GetPlayerHWnd() {
		return null
	}
	/** Get ActiveBall. */
	get ActiveBall() {
		return this.player.getActiveBall()
	}
	/** Get GameTime. */
	get GameTime() {
		return this.player.getGameTime()
	}
	/** Get SystemTime. */
	get SystemTime() {
		return now()
	}
	/** Get NightDay. */
	get NightDay() {
		return this.table.getApi().NightDay
	}
	/** Get ShowDT. */
	get ShowDT() {
		return this.table.getApi().ShowDT
	}
	/** Get ShowFSS. */
	get ShowFSS() {
		return this.table.getApi().ShowFSS
	}
	/** Get WindowWidth. */
	get WindowWidth() {
		return this.player.width
	}
	/** Get WindowHeight. */
	get WindowHeight() {
		return this.player.height
	}
	set DMDWidth(v: number) {
		/* TODO implement */
	}
	/** Get DMDWidth. */
	get DMDWidth() {
		return 0
	} // TODO implement
	set DMDHeight(v: number) {
		/* TODO implement */
	}
	/** Get DMDHeight. */
	get DMDHeight() {
		return 0
	} // TODO implement
	/** Get Version. */
	get Version() {
		return this.table.getApi().Version
	}
	/** Get VPBuildVersion. */
	get VPBuildVersion() {
		return this.table.getApi().VPBuildVersion
	}
	/** Get VersionMajor. */
	get VersionMajor() {
		return this.table.getApi().VersionMajor
	}
	/** Get VersionMinor. */
	get VersionMinor() {
		return this.table.getApi().VersionMinor
	}
	/** Get VersionRevision. */
	get VersionRevision() {
		return this.table.getApi().VersionRevision
	}

	public GetTextFile(fileName: string): string {
		return getTextFile(fileName)
	}

	public PlaySound(
		sampleName: string,
		loopCount: number,
		volume: number,
		pan: number,
		randomPitch: number,
		pitch: number,
		useSame: boolean,
		restart: boolean,
		frontRearFade: number,
	) {
		// TODO implement sound
	}

	public StopSound(sampleName: string) {
		// TODO implement sound
	}

	public PlayMusic(music: string, volume: number) {
		// TODO implement sound
	}

	public EndMusic(music: string) {
		// TODO implement sound
	}

	public FireKnocker(count: number) {
		// TODO implement
	}

	public QuitPlayer(closeType: number) {
		// TODO implement
	}

	public GetBalls(): BallApi[] {
		return this.player.getBalls().map((b) => b.getApi())
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
			// TODO probably gotta apply this to the render realm as well
			material.baseColor = color
		}
	}

	public Nudge(angle: number, force: number): void {
		// TODO implement nudge
	}

	public NudgeGetCalibration() {
		// TODO implement nudge (or not, probably)
	}

	public NudgeSetCalibration() {
		// not doing that for the browser
	}

	public NudgeSensorStatus() {
		// TODO implement nudge (or not, probably)
	}

	public NudgeTiltStatus() {
		// TODO implement nudge (or not, probably)
	}

	public GetCustomParam(): string {
		// these are command line args when launching vp, so none here!
		return ''
	}

	public AddObject(name: string, pdisp: any): void {
		// TODO implement
	}

	public SaveValue(tableName: string, valueName: string, value: any): void {
		const key = `${tableName}:${valueName}`
		storage.setItem(key, value)
	}

	public LoadValue(tableName: string, valueName: string): void {
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
