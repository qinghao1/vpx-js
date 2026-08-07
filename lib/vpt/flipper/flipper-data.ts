// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import { registry } from '../../io/global-registry.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../util/math.js'
import { handleBiffTag } from '../biff-helper.js'
import { ItemData } from '../item-data.js'
import type { Table } from '../table/table.js'

const FLOAT_MAP: Record<string, string> = {
	BASR: 'baseRadius',
	ENDR: 'endRadius',
	FRTN: 'return',
	ANGS: 'startAngle',
	ANGE: 'endAngle',
	FORC: 'mass',
	FHGT: 'height',
	STRG: 'strength',
	ELAS: 'elasticity',
	ELFO: 'elasticityFalloff',
	FRIC: 'friction',
	RPUP: 'rampUp',
	SCTR: 'scatter',
	TODA: 'torqueDamping',
	TDAA: 'torqueDampingAngle',
	FRMN: 'flipperRadiusMin',
	RTHF: 'rubberThickness',
	RHGF: 'rubberHeight',
	RWDF: 'rubberWidth',
}
const INT_MAP: Record<string, string> = {
	OVRP: 'overridePhysics',
	RTHK: 'rubberThickness',
	RHGT: 'rubberHeight',
	RWDT: 'rubberWidth',
}
const BOOL_MAP: Record<string, string> = { VSBL: 'isVisible', ENBL: 'isEnabled', REEN: 'isReflectionEnabled' }
const STRING_MAP: Record<string, string> = {
	SURF: 'szSurface',
	MATR: 'szMaterial',
	RUMA: 'szRubberMaterial',
	IMAG: 'szImage',
}

/** Flipper data.
 * @see https://github.com/vpinball/vpinball/blob/master/flipper.cpp */
export class FlipperData extends ItemData {
	public baseRadius = 21.5
	public endRadius = 13.0
	public flipperRadiusMin = 0
	public flipperRadiusMax = 130.0
	public flipperRadius = 130.0
	public startAngle = 121.0
	public endAngle = 70.0
	public height = 50.0
	public center!: Vertex2D
	public color = 0xffffff
	public rubberColor = 0x323280 // RGB(128,50,50) as COLORREF 0x00BBGGRR
	public szImage?: string
	public szSurface?: string
	public szMaterial?: string
	public szRubberMaterial?: string
	public rubberThickness = 7.0
	public rubberHeight = 19.0
	public rubberWidth = 24.0
	public mass = 1.0
	public strength = 2200.0
	public elasticity = 0.8
	public elasticityFalloff = 0.43
	public friction = 0.6
	public return = 0.058
	public rampUp = 3.0
	public torqueDamping = 0.75
	public torqueDampingAngle = 6.0
	public scatter = 0
	public overrideMass?: number
	public overrideStrength?: number
	public overrideElasticity?: number
	public overrideElasticityFalloff?: number
	public overrideFriction?: number
	public overrideReturnStrength?: number
	public overrideCoilRampUp?: number
	public overrideTorqueDamping?: number
	public overrideTorqueDampingAngle?: number
	public overrideScatterAngle?: number
	public overridePhysics = 0
	public isVisible = true
	public isEnabled = true
	public isReflectionEnabled = true

	public constructor(itemName: string) {
		super(itemName)
		// Flipper default TimerEnabled is false (Settings_properties.inl:1009, flipper.cpp:130)
		// ItemData default is true for generic items — override for flipper
		this.timer.enabled = false
	}

	public static async fromStorage(storage: Storage, itemName: string): Promise<FlipperData> {
		const d = new FlipperData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(d.fromTag.bind(d)))
		// Post-load sanitization per flipper.cpp:942-950 (after Load)
		if (d.height > 1000) d.height = 50
		if (d.rubberHeight > 1000) d.rubberHeight = 8
		if (d.rubberThickness > 0 && d.height > 16 && d.rubberWidth === 0) d.rubberWidth = d.height - 16
		if (d.rubberWidth > 1000) d.rubberWidth = d.height - 16
		return d
	}

	public updatePhysicsSettings(table: Table): void {
		if (!this.doOverridePhysics(table)) return
		const idx = this.overridePhysics ? this.overridePhysics - 1 : table.data!.overridePhysics! - 1
		const get = (key: string, fallback: number, def: number): number => {
			const v = registry.getRegStringAsFloat('Player', `${key}${idx}`, def)
			return v < 0 ? fallback : v
		}
		this.overrideMass = get('FlipperPhysicsMass', this.mass, 1)
		this.overrideStrength = get('FlipperPhysicsStrength', this.strength!, 2200)
		this.overrideElasticity = get('FlipperPhysicsElasticity', this.elasticity!, 0.8)
		this.overrideScatterAngle = get('FlipperPhysicsScatter', this.scatter!, 0)
		this.overrideReturnStrength = get('FlipperPhysicsReturnStrength', this.return!, 0.058)
		this.overrideElasticityFalloff = get('FlipperPhysicsElasticityFalloff', this.elasticityFalloff!, 0.43)
		this.overrideFriction = get('FlipperPhysicsFriction', this.friction!, 0.6)
		this.overrideCoilRampUp = get('FlipperPhysicsCoilRampUp', this.rampUp!, 3.0)
		this.overrideTorqueDamping = get('FlipperPhysicsEOSTorque', this.torqueDamping!, 0.75)
		this.overrideTorqueDampingAngle = get('FlipperPhysicsEOSTorqueAngle', this.torqueDampingAngle!, 6.0)
	}

	public doOverridePhysics(table: Table): boolean {
		return !!this.overridePhysics || !!(table.data!.overridePhysicsFlipper && table.data!.overridePhysics)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'VCEN') {
			this.center = Vertex2D.get(buffer)
			return 0
		}
		if (tag === 'FLPR') {
			this.flipperRadiusMax = this.getFloat(buffer)
			this.flipperRadius = this.flipperRadiusMax
			return 0
		}
		if (
			handleBiffTag(this, tag, buffer, len, {
				float: FLOAT_MAP,
				int: INT_MAP,
				bool: BOOL_MAP,
				string: STRING_MAP,
			})
		)
			return 0
		this.getCommonBlock(buffer, tag, len)
		return 0
	}
}
