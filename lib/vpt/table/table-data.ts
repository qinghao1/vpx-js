// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import type { Vertex3D } from '../../util/math.js'
import { Vertex2D } from '../../util/math.js'
import { handleBiffTag } from '../biff-helper.js'
import { Enums } from '../enums.js'
import { ItemData } from '../item-data.js'
import { Material, SaveMaterial, SavePhysicsMaterial } from '../material.js'

const BG = Enums.BackglassIndex

function bgMaps(): {
	BG_FLOAT_MAP: Record<string, [string, number]>
	BG_INT_MAP: Record<string, [string, number]>
	BG_IMAGE_MAP: Record<string, number>
} {
	const views = [BG.DESKTOP, BG.FULLSCREEN, BG.FULL_SINGLE_SCREEN] as const
	const floatDefs: [string[], string][] = [
		[['ROTA', 'ROTF', 'ROFS'], 'bgRotation'],
		[['LAYB', 'LAYF', 'LAFS'], 'bgLayback'],
		[['INCL', 'INCF', 'INFS'], 'bgInclination'],
		[['FOVX', 'FOVF', 'FOFS'], 'bgFov'],
		[['SCLX', 'SCFX', 'SCXS'], 'bgScaleX'],
		[['SCLY', 'SCFY', 'SCYS'], 'bgScaleY'],
		[['SCLZ', 'SCFZ', 'SCZS'], 'bgScaleZ'],
		[['XLTX', 'XLFX', 'XLXS'], 'bgXlateX'],
		[['XLTY', 'XLFY', 'XLYS'], 'bgXlateY'],
		[['XLTZ', 'XLFZ', 'XLZS'], 'bgXlateZ'],
		[['HOF0', 'HOF1', 'HOF2'], 'bgViewHOfs'],
		[['VOF0', 'VOF1', 'VOF2'], 'bgViewVOfs'],
		[['WTZ0', 'WTZ1', 'WTZ2'], 'bgWindowTopZOfs'],
		[['WBZ0', 'WBZ1', 'WBZ2'], 'bgWindowBottomZOfs'],
	]
	const BG_FLOAT_MAP: Record<string, [string, number]> = {}
	for (const [tags, field] of floatDefs) {
		tags.forEach((tag, i) => {
			BG_FLOAT_MAP[tag] = [field, views[i]!]
		})
	}
	const BG_INT_MAP: Record<string, [string, number]> = {
		VSM0: ['bgViewMode', BG.DESKTOP],
		VSM1: ['bgViewMode', BG.FULLSCREEN],
		VSM2: ['bgViewMode', BG.FULL_SINGLE_SCREEN],
	}
	const BG_IMAGE_MAP: Record<string, number> = {
		BIMG: BG.DESKTOP,
		BIMF: BG.FULLSCREEN,
		BIMS: BG.FULL_SINGLE_SCREEN,
	}
	return { BG_FLOAT_MAP, BG_INT_MAP, BG_IMAGE_MAP }
}

const { BG_FLOAT_MAP, BG_INT_MAP, BG_IMAGE_MAP } = bgMaps()

const FLOAT_MAP: Record<string, string> = {
	LEFT: 'left',
	TOPX: 'top',
	RGHT: 'right',
	BOTM: 'bottom',
	GAVT: 'gravity',
	FRCT: 'friction',
	ELAS: 'elasticity',
	ELFA: 'elasticityFalloff',
	PFSC: 'scatter',
	SCAT: 'defaultScatter',
	NDGT: 'nudgeTime',
	ZOOM: 'zoom',
	MAXS: '_3DmaxSeparation',
	MAXSEP: '_3DmaxSeparation',
	ZPD: '_3DZPD',
	STO: '_3DOffset',
	SLPX: 'angleTiltMax',
	SLOP: 'angletiltMin',
	GLAS: 'glassHeight',
	GLAB: 'glassBottomHeight',
	TBLH: 'tableHeight',
	LZHI: 'lightHeight',
	LZRA: 'lightRange',
	LIES: 'lightEmissionScale',
	ENES: 'envEmissionScale',
	GLES: 'globalEmissionScale',
	AOSC: 'aoScale',
	SSSC: 'ssrScale',
	BPRS: 'ballPlayfieldReflectionStrength',
	DBIS: 'defaultBulbIntensityScaleOnBall',
	BLST: 'bloomStrength',
	TDFT: 'globalDifficulty',
	SVOL: 'tableSoundVolume',
	MVOL: 'tableMusicVolume',
	CLBH: 'groundToLockbarHeight',
	EXPO: 'exposure',
}

const INT_MAP: Record<string, string> = {
	ORRP: 'overridePhysics',
	SEDT: 'numGameItems',
	SSND: 'numSounds',
	SIMG: 'numTextures',
	SFNT: 'numFonts',
	SCOL: 'numCollections',
	LZAM: 'lightAmbient',
	BREF: 'useReflectionForBalls',
	BTRA: 'useTrailForBalls',
	UAAL: 'useAA',
	BCLR: 'colorBackdrop',
	AVSY: 'tableAdaptiveVSync',
	ARAC: 'userDetailLevel',
	MASI: 'numMaterials',
	TMAP: 'toneMapper',
	TLCK: 'tablelocked',
	UFXA: 'useFXAA',
}

const BOOL_MAP: Record<string, string> = {
	ORPF: 'overridePhysicsFlipper',
	DECL: 'renderDecals',
	REEL: 'renderEMReels',
	OGST: 'overwriteGlobalStereo3D',
	FBCK: 'displayBackdrop',
	BIMN: 'imageBackdropNightDay',
	BDMO: 'ballDecalMode',
	OGAC: 'overwriteGlobalDetailLevel',
	OGDN: 'overwriteGlobalDayNight',
	GDAC: 'showGrid',
	REOP: 'reflectElementsOnPlayfield',
	BLSM: 'ballSphericalMapping',
	UAOC: 'useAO',
	USSR: 'useSSR',
}

const STRING_MAP: Record<string, string> = {
	IMAG: 'szImage',
	BLIM: 'szBallImage',
	BLIF: 'szBallImageFront',
	SSHT: 'szScreenShot',
	IMCG: 'szImageColorGrade',
	EIMG: 'szEnvImage',
	PLMA: 'szPlayfieldMaterial',
	NOTX: 'notesText',
}

/** Table global data.
 * @see https://github.com/vpinball/vpinball/blob/master/pintable.cpp */
export class TableData extends ItemData {
	public static BGI_DESKTOP = 110
	public static BGI_FULLSCREEN = 111
	public static BGI_FSS = 112

	public left!: number
	public top!: number
	public right!: number
	public bottom!: number

	public bgRotation: number[] = []
	public bgLayback: number[] = []
	public bgInclination: number[] = []
	public bgFov: number[] = []
	public bgScaleX: number[] = []
	public bgScaleY: number[] = []
	public bgScaleZ: number[] = []
	public bgXlateX: number[] = []
	public bgXlateY: number[] = []
	public bgXlateZ: number[] = []
	public bgViewHOfs: number[] = []
	public bgViewVOfs: number[] = []
	public bgWindowTopZOfs: number[] = []
	public bgWindowBottomZOfs: number[] = []
	public bgViewMode: number[] = []
	public bgEnableFss = false
	public bgCurrentSet = 0
	public bgImage: string[] = []
	public imageBackdropNightDay = false
	public ballSphericalMapping = true
	public notesText?: string
	public groundToLockbarHeight?: number
	public toneMapper?: number
	public exposure?: number
	public tablelocked?: number

	public overridePhysics?: number
	public overridePhysicsFlipper = false
	public gravity!: number
	public friction!: number
	public elasticity!: number
	public elasticityFalloff!: number
	public scatter!: number
	public defaultScatter?: number
	public nudgeTime?: number
	public physicsMaxLoops = 0xffffffff
	public renderDecals = true
	public renderEMReels = true

	public offset = new Vertex2D()
	public _3DmaxSeparation?: number
	public _3DZPD?: number
	public zoom?: number
	public _3DOffset?: number
	public overwriteGlobalStereo3D = false

	public angleTiltMax!: number
	public angletiltMin!: number
	public glassHeight = 0
	public glassBottomHeight = 0
	public tableHeight = 0

	public szImage?: string
	public szBallImage?: string
	public szBallImageFront?: string
	public szScreenShot?: string
	public displayBackdrop = true

	public numGameItems!: number
	public numSounds!: number
	public numTextures!: number
	public numFonts!: number
	public numCollections!: number
	public scriptPos!: number
	public scriptLen!: number
	public declare name: string

	public Light: LightSource[] = [new LightSource()]
	public szImageColorGrade?: string
	public szEnvImage?: string
	public szPlayfieldMaterial?: string
	public lightAmbient?: number
	public lightHeight?: number
	public lightRange?: number
	public lightEmissionScale?: number
	public envEmissionScale?: number
	public globalEmissionScale?: number
	public aoScale?: number
	public ssrScale?: number
	public useReflectionForBalls?: number
	public playfieldReflectionStrength!: number
	public useTrailForBalls?: number
	public ballTrailStrength!: number
	public ballPlayfieldReflectionStrength?: number
	public defaultBulbIntensityScaleOnBall?: number
	public useAA?: number
	public useAO?: number
	public useSSR?: number
	public useFXAA?: number
	public bloomStrength?: number
	public colorBackdrop?: number
	public rgcolorcustom?: number[]
	public globalDifficulty!: number
	public szT?: string
	public vCustomInfoTag: string[] = []
	public tableSoundVolume!: number
	public ballDecalMode?: boolean
	public tableMusicVolume!: number
	public tableAdaptiveVSync?: number
	public overwriteGlobalDetailLevel = false
	public overwriteGlobalDayNight = false
	public showGrid = true
	public reflectElementsOnPlayfield = false
	public userDetailLevel?: number

	public numMaterials!: number
	public materials: Material[] = []

	public plungerNormalize?: number
	public plungerFilter?: boolean

	public readonly overrideContactFriction = 0.075
	public readonly overrideElasticity = 0.25
	public readonly overrideElasticityFalloff = 0
	public readonly overrideScatterAngle = 0

	public static async fromStorage(storage: Storage, itemName: string): Promise<TableData> {
		const d = new TableData(itemName)
		await storage.streamFiltered(itemName, 0, BiffParser.stream(d.fromTag.bind(d), { streamedTags: ['CODE'] }))
		return d
	}

	public constructor(itemName: string) {
		super(itemName)
	}

	public getName(): string {
		return this.name
	}

	public getFriction(): number {
		return this.overridePhysics ? this.overrideContactFriction : this.friction!
	}
	public getElasticity(): number {
		return this.overridePhysics ? this.overrideElasticity : this.elasticity!
	}
	public getElasticityFalloff(): number {
		return this.overridePhysics ? this.overrideElasticityFalloff : this.elasticityFalloff!
	}
	public getScatter(): number {
		return this.overridePhysics ? this.overrideScatterAngle : this.scatter!
	}

	private async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
		const bg = BG_FLOAT_MAP[tag]
		if (bg) {
			;(this as unknown as Record<string, number[]>)[bg[0]][bg[1]] = this.getFloat(buffer)
			return 0
		}
		const bgInt = BG_INT_MAP[tag]
		if (bgInt) {
			;(this as unknown as Record<string, number[]>)[bgInt[0]][bgInt[1]] = this.getInt(buffer)
			return 0
		}
		const bgImg = BG_IMAGE_MAP[tag]
		if (bgImg !== undefined) {
			this.bgImage[bgImg] = this.getString(buffer, len)
			return 0
		}
		if (handleBiffTag(this, tag, buffer, len, { float: FLOAT_MAP, int: INT_MAP, bool: BOOL_MAP, string: STRING_MAP }))
			return 0
		switch (tag) {
			case 'PHML': {
				const v = this.getInt(buffer)
				this.physicsMaxLoops = v === 0xffffffff ? 0 : v
				break
			}
			case 'PLST':
				this.playfieldReflectionStrength = this.getInt(buffer) / 255
				break
			case 'BTST':
				this.ballTrailStrength = this.getInt(buffer) / 255
				break
			case 'MPGC':
			case 'MPDF':
				this.getFloat(buffer)
				break
			case 'PIID':
			case 'VERS':
				this.getInt(buffer)
				break
			case 'EFSS':
				this.bgEnableFss = this.getBool(buffer)
				if (this.bgEnableFss) this.bgCurrentSet = BG.FULL_SINGLE_SCREEN
				break
			case 'OFFX':
				this.offset.x = this.getFloat(buffer)
				break
			case 'OFFY':
				this.offset.y = this.getFloat(buffer)
				break
			case 'CODE':
				this.scriptPos = offset
				this.scriptLen = len
				break
			case 'NAME':
				this.name = this.getWideString(buffer, len)
				break
			case 'LZDI':
				this.Light[0].emission = this.getInt(buffer)
				break
			case 'CCUS':
				this.rgcolorcustom = this.getUnsignedInt4s(buffer, 16)
				break
			case 'CUST':
				this.szT = this.getString(buffer, len)
				this.vCustomInfoTag.push(this.szT)
				break
			case 'MATE':
				this.materials = this.getMaterials(buffer, len, this.numMaterials)
				break
			case 'PHMA':
				this.applyPhysicsMaterials(buffer, len, this.numMaterials)
				break
			case 'SECB':
			case 'MATR':
			case 'RPRB':
				// deprecated/10.8+ tags: 10.8+ materials and render probes are stored as separate streams;
				// MATE/PHMA cover legacy path; SECB is protection data (ignored)
				break
		}
		return 0
	}

	private getMaterials(buffer: Uint8Array, len: number, num: number): Material[] {
		if (len < num * SaveMaterial.size)
			throw new Error(`Cannot parse ${num} materials of ${num * SaveMaterial.size} bytes from a ${len} bytes buffer.`)
		return Array.from({ length: num }, (_, i) => Material.fromSaved(new SaveMaterial(buffer, i)))
	}

	private applyPhysicsMaterials(buffer: Uint8Array, len: number, num: number): void {
		if (len < num * SavePhysicsMaterial.size)
			throw new Error(
				`Cannot parse ${num} physical materials of ${num * SavePhysicsMaterial.size} bytes from a ${len} bytes buffer.`,
			)
		for (let i = 0; i < num; i++) {
			const pm = new SavePhysicsMaterial(buffer, i)
			const mat = this.materials.find((m) => m.name === pm.name)
			if (!mat)
				throw new Error(`Cannot find material "${pm.name}" in [${this.materials.map((m) => m.name).join(', ')}]`)
			mat.physUpdate(pm)
		}
	}
}

class LightSource {
	public emission?: number
	public pos?: Vertex3D
}
