// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** ItemType. */
export class ItemType {
	public static readonly Surface = 0
	public static readonly Flipper = 1
	public static readonly Timer = 2
	public static readonly Plunger = 3
	public static readonly Textbox = 4
	public static readonly Bumper = 5
	public static readonly Trigger = 6
	public static readonly Light = 7
	public static readonly Kicker = 8
	public static readonly Decal = 9
	public static readonly Gate = 10
	public static readonly Spinner = 11
	public static readonly Ramp = 12
	public static readonly Table = 13
	public static readonly LightCenter = 14
	public static readonly DragPoint = 15
	public static readonly Collection = 16
	public static readonly DispReel = 17
	public static readonly LightSeq = 18
	public static readonly Primitive = 19
	public static readonly Flasher = 20
	public static readonly Rubber = 21
	public static readonly HitTarget = 22
	public static readonly Count = 23
	public static readonly Invalid = 0xffffffff
}

/** Item property enums (values match upstream `vpinball` headers). */
export const Enums = {
	LightStatus: {
		LightStateOff: 0,
		LightStateOn: 1,
		LightStateBlinking: 2,
	},
	Filters: {
		Filter_None: 0,
		Filter_Additive: 1,
		Filter_Overlay: 2,
		Filter_Multiply: 3,
		Filter_Screen: 4,
	},
	TriggerShape: {
		TriggerNone: 0,
		TriggerWireA: 1,
		TriggerStar: 2,
		TriggerWireB: 3,
		TriggerButton: 4,
		TriggerWireC: 5,
		TriggerWireD: 6,
		TriggerInder: 7,
	},
	RampType: {
		RampTypeFlat: 0,
		RampType4Wire: 1,
		RampType2Wire: 2,
		RampType3WireLeft: 3,
		RampType3WireRight: 4,
		RampType1Wire: 5,
	},
	PlungerType: {
		PlungerTypeModern: 1,
		PlungerTypeFlat: 2,
		PlungerTypeCustom: 3,
	},
	TargetType: {
		DropTargetBeveled: 1,
		DropTargetSimple: 2,
		HitTargetRound: 3,
		HitTargetRectangle: 4,
		HitFatTargetRectangle: 5,
		HitFatTargetSquare: 6,
		DropTargetFlatSimple: 7,
		HitFatTargetSlim: 8,
		HitTargetSlim: 9,
	},
	GateType: {
		GateWireW: 1,
		GateWireRectangle: 2,
		GatePlate: 3,
		GateLongPlate: 4,
	},
	DecalType: {
		DecalText: 0,
		DecalImage: 1,
	},
	Fader: {
		None: 0,
		Linear: 1,
		Incandescent: 2,
	},
	SizingType: {
		AutoSize: 0,
		AutoWidth: 1,
		ManualSize: 2,
	},
	KickerType: {
		KickerInvisible: 0,
		KickerHole: 1,
		KickerCup: 2,
		KickerHoleSimple: 3,
		KickerWilliams: 4,
		KickerGottlieb: 5,
		KickerCup2: 6,
	},
	RampImageAlignment: {
		ImageModeWorld: 0,
		ImageModeWrap: 1,
	},
} as const
