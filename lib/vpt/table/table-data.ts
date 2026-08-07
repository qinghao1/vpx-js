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

const BG_FLOAT_MAP: Record<string, [string, number]> = {
	ROTA: ['bgRotation', BG.DESKTOP],
	LAYB: ['bgLayback', BG.DESKTOP],
	INCL: ['bgInclination', BG.DESKTOP],
	FOVX: ['bgFov', BG.DESKTOP],
	SCLX: ['bgScaleX', BG.DESKTOP],
	SCLY: ['bgScaleY', BG.DESKTOP],
	SCLZ: ['bgScaleZ', BG.DESKTOP],
	XLTX: ['bgXlateX', BG.DESKTOP],
	XLTY: ['bgXlateY', BG.DESKTOP],
	XLTZ: ['bgXlateZ', BG.DESKTOP],
	ROTF: ['bgRotation', BG.FULLSCREEN],
	LAYF: ['bgLayback', BG.FULLSCREEN],
	INCF: ['bgInclination', BG.FULLSCREEN],
	FOVF: ['bgFov', BG.FULLSCREEN],
	SCFX: ['bgScaleX', BG.FULLSCREEN],
	SCFY: ['bgScaleY', BG.FULLSCREEN],
	SCFZ: ['bgScaleZ', BG.FULLSCREEN],
	XLFX: ['bgXlateX', BG.FULLSCREEN],
	XLFY: ['bgXlateY', BG.FULLSCREEN],
	XLFZ: ['bgXlateZ', BG.FULLSCREEN],
	ROFS: ['bgRotation', BG.FULL_SINGLE_SCREEN],
	LAFS: ['bgLayback', BG.FULL_SINGLE_SCREEN],
	INFS: ['bgInclination', BG.FULL_SINGLE_SCREEN],
	FOFS: ['bgFov', BG.FULL_SINGLE_SCREEN],
	SCXS: ['bgScaleX', BG.FULL_SINGLE_SCREEN],
	SCYS: ['bgScaleY', BG.FULL_SINGLE_SCREEN],
	SCZS: ['bgScaleZ', BG.FULL_SINGLE_SCREEN],
	XLXS: ['bgXlateX', BG.FULL_SINGLE_SCREEN],
	XLYS: ['bgXlateY', BG.FULL_SINGLE_SCREEN],
	XLZS: ['bgXlateZ', BG.FULL_SINGLE_SCREEN],
}

const BG_IMAGE_MAP: Record<string, number> = {
	BIMG: BG.DESKTOP,
	BIMF: BG.FULLSCREEN,
	BIMS: BG.FULL_SINGLE_SCREEN,
}

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
	MAXSEP: '_3DmaxSeparation',
	ZPD: '_3DZPD',
	STO: '_3DOffset',
	SLPX: 'angleTiltMax',
	SLOP: 'angletiltMin',
	GLAS: 'glassHeight',
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
	UFXA: 'useFXAA',
	BLST: 'bloomStrength',
	TDFT: 'globalDifficulty',
	SVOL: 'tableSoundVolume',
	MVOL: 'tableMusicVolume',
}

const INT_MAP: Record<string, string> = {
	ORRP: 'overridePhysics',
	MPGC: 'plungerNormalize',
	PHML: 'physicsMaxLoops',
	SEDT: 'numGameItems',
	SSND: 'numSounds',
	SIMG: 'numTextures',
	SFNT: 'numFonts',
	SCOL: 'numCollections',
	LZAM: 'lightAmbient',
	BREF: 'useReflectionForBalls',
	PLST: 'playfieldReflectionStrength',
	BTRA: 'useTrailForBalls',
	BTST: 'ballTrailStrength',
	UAAL: 'useAA',
	UAOC: 'useAO',
	USSR: 'useSSR',
	BCLR: 'colorBackdrop',
	AVSY: 'tableAdaptiveVSync',
	ARAC: 'userDetailLevel',
	MASI: 'numMaterials',
}

const BOOL_MAP: Record<string, string> = {
	ORPF: 'overridePhysicsFlipper',
	MPDF: 'plungerFilter',
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
}

const STRING_MAP: Record<string, string> = {
	IMAG: 'szImage',
	BLIM: 'szBallImage',
	BLIF: 'szBallImageFront',
	SSHT: 'szScreenShot',
	IMCG: 'szImageColorGrade',
	EIMG: 'szEnvImage',
	PLMA: 'szPlayfieldMaterial',
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
	public bgEnableFss = false
	public bgCurrentSet = 0
	public bgImage: string[] = []
	public imageBackdropNightDay = false

	public overridePhysics?: number
	public overridePhysicsFlipper = false
	public gravity!: number
	public friction!: number
	public elasticity!: number
	public elasticityFalloff!: number
	public scatter!: number
	public defaultScatter?: number
	public nudgeTime?: number
	public plungerNormalize!: number
	public plungerFilter = false
	public physicsMaxLoops = 0xffffffff
	public renderDecals = false
	public renderEMReels = false

	public offset = new Vertex2D()
	public _3DmaxSeparation?: number
	public _3DZPD?: number
	public zoom?: number
	public _3DOffset?: number
	public overwriteGlobalStereo3D = false

	public angleTiltMax!: number
	public angletiltMin!: number
	public glassHeight!: number
	public tableHeight!: number

	public szImage?: string
	public szBallImage?: string
	public szBallImageFront?: string
	public szScreenShot?: string
	public displayBackdrop = false

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
	public showGrid = false
	public reflectElementsOnPlayfield = false
	public userDetailLevel?: number

	public numMaterials!: number
	public materials: Material[] = []

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
			;(this as unknown as Record<string, Record<string, unknown>>)[bg[0]][bg[1]] = this.getFloat(buffer)
			return 0
		}
		const bgImg = BG_IMAGE_MAP[tag]
		if (bgImg !== undefined) {
			this.bgImage[bgImg] = this.getString(buffer, len)
			return 0
		}
		if (
			handleBiffTag(this as unknown as Record<string, unknown>, this, tag, buffer, len, {
				float: FLOAT_MAP,
				int: INT_MAP,
				bool: BOOL_MAP,
				string: STRING_MAP,
			})
		)
			return 0
		switch (tag) {
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
