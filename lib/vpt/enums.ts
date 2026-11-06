// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/**
 * File-format item type ids. An `as const` object like the other enum maps
 * below; values must match upstream `ItemTypeEnum`
 * (`external/vpinball/src/core/ieditable.h`).
 */
export const ItemType = {
	Surface: 0,
	Flipper: 1,
	Timer: 2,
	Plunger: 3,
	Textbox: 4,
	Bumper: 5,
	Trigger: 6,
	Light: 7,
	Kicker: 8,
	Decal: 9,
	Gate: 10,
	Spinner: 11,
	Ramp: 12,
	Table: 13,
	LightCenter: 14,
	DragPoint: 15,
	Collection: 16,
	DispReel: 17,
	LightSeq: 18,
	Primitive: 19,
	Flasher: 20,
	Rubber: 21,
	HitTarget: 22,
	Ball: 23,
	Invalid: 0xffffffff,
} as const

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
