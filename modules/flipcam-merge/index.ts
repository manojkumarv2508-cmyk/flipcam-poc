import { requireNativeModule } from 'expo-modules-core';

const Native = requireNativeModule('FlipcamMerge');

/** Joins video files (in order) into one MP4, returns the output file path. */
export function mergeVideos(inputPaths: string[], outputPath: string): Promise<string> {
  return Native.mergeVideosAsync(inputPaths, outputPath);
}
