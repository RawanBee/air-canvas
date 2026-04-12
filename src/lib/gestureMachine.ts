/**
 * Debounced pinch → draw state. Requires stable frames before transitions.
 */
export function createDrawGestureMachine(
  enterFrames = 3,
  exitFrames = 5,
): (pinchActive: boolean) => boolean {
  let drawing = false;
  let pinchStreak = 0;
  let releaseStreak = 0;

  return (pinchActive: boolean) => {
    if (pinchActive) {
      releaseStreak = 0;
      pinchStreak++;
      if (!drawing && pinchStreak >= enterFrames) drawing = true;
    } else {
      pinchStreak = 0;
      releaseStreak++;
      if (drawing && releaseStreak >= exitFrames) drawing = false;
    }
    return drawing;
  };
}
