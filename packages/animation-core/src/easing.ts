import type { AnimationEasing } from "./types.js";

function cubicCoordinate(t: number, first: number, second: number): number {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * first + 3 * inverse * t * t * second + t * t * t;
}

function cubicDerivative(t: number, first: number, second: number): number {
  const inverse = 1 - t;
  return 3 * inverse * inverse * first + 6 * inverse * t * (second - first) + 3 * t * t * (1 - second);
}

function cubicBezier(progress: number, x1: number, y1: number, x2: number, y2: number): number {
  let parameter = progress;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const error = cubicCoordinate(parameter, x1, x2) - progress;
    const derivative = cubicDerivative(parameter, x1, x2);
    if (Math.abs(error) < 1e-7 || Math.abs(derivative) < 1e-7) break;
    parameter = Math.min(1, Math.max(0, parameter - error / derivative));
  }
  return cubicCoordinate(parameter, y1, y2);
}

function spring(progress: number, easing: Extract<AnimationEasing, { type: "SPRING" }>): number {
  const omega0 = Math.sqrt(easing.stiffness / easing.mass);
  const zeta = easing.damping / (2 * Math.sqrt(easing.stiffness * easing.mass));
  let value: number;
  if (zeta < 1) {
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const envelope = Math.exp(-zeta * omega0 * progress);
    const coefficient = (zeta * omega0 - easing.initialVelocity) / omegaD;
    value = 1 - envelope * (Math.cos(omegaD * progress) + coefficient * Math.sin(omegaD * progress));
  } else {
    value = 1 - Math.exp(-omega0 * progress) * (1 + (omega0 - easing.initialVelocity) * progress);
  }
  return easing.overshootClamping ? Math.min(1, Math.max(0, value)) : value;
}

export function evaluateEasing(easing: AnimationEasing, input: number): number {
  const progress = Math.min(1, Math.max(0, input));
  switch (easing.type) {
    case "LINEAR":
      return progress;
    case "EASE":
      return cubicBezier(progress, 0.25, 0.1, 0.25, 1);
    case "EASE_IN":
      return cubicBezier(progress, 0.42, 0, 1, 1);
    case "EASE_OUT":
      return cubicBezier(progress, 0, 0, 0.58, 1);
    case "EASE_IN_OUT":
      return cubicBezier(progress, 0.42, 0, 0.58, 1);
    case "CUBIC_BEZIER":
      return cubicBezier(progress, easing.x1, easing.y1, easing.x2, easing.y2);
    case "SPRING":
      return spring(progress, easing);
    case "STEPS": {
      const step =
        easing.position === "START" ? Math.ceil(progress * easing.count) : Math.floor(progress * easing.count);
      return Math.min(1, Math.max(0, step / easing.count));
    }
  }
  return progress;
}
