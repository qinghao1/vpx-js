// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { InterpolateLinear, PropertyBinding } from '../refs.node.js'
import { logger } from '../util/logger.js'
import type { AnimationClipInternal, KeyframeTrackInternal } from './gltf-internal.js'

export class Utils {
	public static insertKeyframe(track: KeyframeTrackInternal, time: number): number {
		const tolerance = 0.001 // 1ms
		const valueSize = track.getValueSize()

		const times = new Float32Array(track.times.length + 1)
		const values = new Float32Array(track.values.length + valueSize)
		const interpolant = (track as any).createInterpolant(new Float32Array(valueSize))

		let index = 0

		if (track.times.length === 0) {
			times[0] = time

			for (let i = 0; i < valueSize; i++) {
				values[i] = 0
			}

			index = 0
		} else if (time < track.times[0]) {
			if (Math.abs(track.times[0] - time) < tolerance) {
				return 0
			}

			times[0] = time
			times.set(track.times, 1)

			values.set(interpolant.evaluate(time), 0)
			values.set(track.values, valueSize)

			index = 0
		} else if (time > track.times[track.times.length - 1]) {
			if (Math.abs(track.times[track.times.length - 1] - time) < tolerance) {
				return track.times.length - 1
			}

			times[times.length - 1] = time
			times.set(track.times, 0)

			values.set(track.values, 0)
			values.set(interpolant.evaluate(time), track.values.length)

			index = times.length - 1
		} else {
			for (let i = 0; i < track.times.length; i++) {
				if (Math.abs(track.times[i] - time) < tolerance) {
					return i
				}

				if (track.times[i] < time && track.times[i + 1] > time) {
					times.set(track.times.slice(0, i + 1), 0)
					times[i + 1] = time
					times.set(track.times.slice(i + 1), i + 2)

					values.set(track.values.slice(0, (i + 1) * valueSize), 0)
					values.set(interpolant.evaluate(time), (i + 1) * valueSize)
					values.set(track.values.slice((i + 1) * valueSize), (i + 2) * valueSize)

					index = i + 1

					break
				}
			}
		}
		track.times = times as any
		track.values = values as any
		return index
	}

	public static mergeMorphTargetTracks(clip: AnimationClipInternal, root: any) {
		const tracks = []
		const mergedTracks: any = {}
		const sourceTracks = clip.tracks as any

		for (let sourceTrack of sourceTracks) {
			const sourceTrackBinding = PropertyBinding.parseTrackName(sourceTrack.name)
			const sourceTrackNode = PropertyBinding.findNode(root, sourceTrackBinding.nodeName) as any

			if (
				sourceTrackBinding.propertyName !== 'morphTargetInfluences' ||
				sourceTrackBinding.propertyIndex === undefined
			) {
				// Tracks that don't affect morph targets, or that affect all morph targets together, can be left as-is.
				tracks.push(sourceTrack)
				continue
			}

			if (
				sourceTrack.createInterpolant !== sourceTrack.InterpolantFactoryMethodDiscrete &&
				sourceTrack.createInterpolant !== sourceTrack.InterpolantFactoryMethodLinear
			) {
				if (sourceTrack.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline) {
					// This should never happen, because glTF morph target animations
					// affect all targets already.
					throw new Error('GLTFExporter: Cannot merge tracks with glTF CUBICSPLINE interpolation.')
				}

				logger().warn(
					'[GLTFExporter.mergeMorphTargetTracks]: Morph target interpolation mode not yet supported. Using LINEAR instead.',
				)

				sourceTrack = sourceTrack.clone()
				sourceTrack.setInterpolation(InterpolateLinear)
			}

			const targetCount = sourceTrackNode.morphTargetInfluences.length
			const targetIndex = sourceTrackNode.morphTargetDictionary[sourceTrackBinding.propertyIndex]

			if (targetIndex === undefined) {
				throw new Error(`GLTFExporter: Morph target name not found: ${sourceTrackBinding.propertyIndex}`)
			}

			let mergedTrack: any

			// If this is the first time we've seen this object, create a new
			// track to store merged keyframe data for each morph target.
			if (mergedTracks[sourceTrackNode.uuid] === undefined) {
				mergedTrack = sourceTrack.clone()
				const values = new mergedTrack.ValueBufferType(targetCount * mergedTrack.times.length)
				for (let j = 0; j < mergedTrack.times.length; j++) {
					values[j * targetCount + targetIndex] = mergedTrack.values[j]
				}

				mergedTrack.name = '.morphTargetInfluences'
				mergedTrack.values = values

				mergedTracks[sourceTrackNode.uuid] = mergedTrack
				tracks.push(mergedTrack)
				continue
			}

			const _mergedKeyframeIndex = 0
			const _sourceKeyframeIndex = 0
			const sourceInterpolant = sourceTrack.createInterpolant(new sourceTrack.ValueBufferType(1))

			mergedTrack = mergedTracks[sourceTrackNode.uuid]

			// For every existing keyframe of the merged track, write a (possibly
			// interpolated) value from the source track.
			for (let j = 0; j < mergedTrack.times.length; j++) {
				mergedTrack.values[j * targetCount + targetIndex] = sourceInterpolant.evaluate(mergedTrack.times[j])
			}

			// For every existing keyframe of the source track, write a (possibly
			// new) keyframe to the merged track. Values from the previous loop may
			// be written again, but keyframes are de-duplicated.
			for (let j = 0; j < sourceTrack.times.length; j++) {
				const keyframeIndex = Utils.insertKeyframe(mergedTrack, sourceTrack.times[j])
				mergedTrack.values[keyframeIndex * targetCount + targetIndex] = sourceTrack.values[j]
			}
		}
		clip.tracks = tracks
		return clip
	}
}
