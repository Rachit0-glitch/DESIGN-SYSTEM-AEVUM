export interface LabColor {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function srgbToLab(red: number, green: number, blue: number): LabColor {
  const r = linear(red);
  const g = linear(green);
  const b = linear(blue);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / 1;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const convert = (value: number) => (value > 216 / 24389 ? Math.cbrt(value) : ((24389 / 27) * value) / 116 + 16 / 116);
  const fx = convert(x);
  const fy = convert(y);
  const fz = convert(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function deltaE76(left: LabColor, right: LabColor): number {
  return Math.hypot(left.l - right.l, left.a - right.a, left.b - right.b);
}
