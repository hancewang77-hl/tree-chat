export type TreeScrollState = {
  chapter: number;
  progress: number;
};

export function resolveTreeScrollState(
  scrollTop: number,
  stopTops: readonly number[],
): TreeScrollState {
  if (stopTops.length < 2) {
    return { chapter: 0, progress: 0 };
  }

  const firstStop = stopTops[0];
  const lastStop = stopTops[stopTops.length - 1];
  const span = lastStop - firstStop;
  if (span <= 0) {
    return { chapter: 0, progress: 0 };
  }

  const progress = Math.min(1, Math.max(0, (scrollTop - firstStop) / span));
  let chapter = 0;
  for (let index = 1; index < stopTops.length; index += 1) {
    if (scrollTop >= stopTops[index]) {
      chapter = index;
    }
  }

  return { chapter, progress };
}
