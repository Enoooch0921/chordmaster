// Work in screen CSS pixels so the pen feels the same at every chart or lyric
// size. Both filters use elapsed sample time, including within coalesced events.
export function createPencilInput(x: number, y: number, time: number) {
  let lastX = x, lastY = y, lastTime = time;
  let velocityX = 0, velocityY = 0;
  let tip: [number, number] = [x, y];
  return (nextX: number, nextY: number, timestamp: number): [number, number] => {
    const elapsed = timestamp - lastTime;
    if (elapsed < 0) return tip;
    const dt = Number.isFinite(elapsed) && elapsed > 0 ? Math.max(1, elapsed) : 4;
    if (Number.isFinite(timestamp)) lastTime = timestamp;
    const dx = nextX - lastX, dy = nextY - lastY;
    lastX = nextX; lastY = nextY;
    const velocityGain = 1 - Math.exp(-dt / 38);
    velocityX += velocityGain * (dx / dt - velocityX);
    velocityY += velocityGain * (dy / dt - velocityY);
    if (!dx && !dy) return tip;
    if (Math.hypot(dx, dy) >= 7 || dt > 60) {
      tip = [nextX, nextY];
      return tip;
    }

    // Smooth slow lettering more than quick flicks. Limit the distance to the
    // nib at turns. Duplicate samples on lift keep the last displayed tip.
    const speed = Math.hypot(velocityX, velocityY);
    const response = 34 / (1 + (speed / .15) ** 2);
    const offsetX = nextX - tip[0], offsetY = nextY - tip[1];
    // Correct the lag along sustained travel while keeping transverse filtering.
    const along = .55 * Math.max(0, (offsetX * velocityX + offsetY * velocityY) / (speed * speed + .008));
    const errorX = offsetX - along * velocityX, errorY = offsetY - along * velocityY;
    const residual = Math.min(Math.exp(-dt / response), 1.65 / Math.hypot(errorX, errorY));
    tip = [nextX - residual * errorX, nextY - residual * errorY];
    return tip;
  };
}
