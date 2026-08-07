// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

declare enum Compression {
	NONE = 0,
	BI_RLE8 = 1,
	BI_RLE4 = 2,
	BI_BIT_FIELDS = 3,
	BI_ALPHA_BIT_FIELDS = 6,
}

declare interface IColor {
	red: number
	green: number
	blue: number
	quad: number
}

declare interface IDecoderOptions {
	toRGBA?: boolean
}

declare interface IImage {
	flag: string
	fileSize: number
	reserved1?: number
	reserved2?: number
	offset: number
	headerSize: number
	width: number
	height: number
	planes?: number
	bitPP: number
	compression?: Compression
	rawSize: number
	hr?: number
	vr?: number
	colors?: number
	importantColors?: number
	palette?: IColor[]
	data: Buffer
}
