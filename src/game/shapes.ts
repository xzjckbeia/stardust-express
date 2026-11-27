import { BAY_SPEC_MAP, ParcelColor, ParcelKind, ParcelShape } from './types';

function traceStar(ctx: CanvasRenderingContext2D, rOuter: number, rInner: number, points: number): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function traceDiamond(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.08);
  ctx.lineTo(r * 0.92, 0);
  ctx.lineTo(0, r * 1.08);
  ctx.lineTo(-r * 0.92, 0);
  ctx.closePath();
}

function traceHexagon(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3 - Math.PI / 6;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function traceRoundedTriangle(ctx: CanvasRenderingContext2D, r: number): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < 3; i++) {
    const angle = (i * 2 * Math.PI) / 3 - Math.PI / 2;
    pts.push([Math.cos(angle) * r * 1.05, Math.sin(angle) * r * 1.05 + r * 0.1]);
  }
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const prev = pts[(i + 2) % 3];
    const curr = pts[i];
    const next = pts[(i + 1) % 3];
    const mx1 = curr[0] + (prev[0] - curr[0]) * 0.24;
    const my1 = curr[1] + (prev[1] - curr[1]) * 0.24;
    const mx2 = curr[0] + (next[0] - curr[0]) * 0.24;
    const my2 = curr[1] + (next[1] - curr[1]) * 0.24;
    if (i === 0) ctx.moveTo(mx1, my1);
    else ctx.lineTo(mx1, my1);
    ctx.quadraticCurveTo(curr[0], curr[1], mx2, my2);
  }
  ctx.closePath();
}

export function traceShapePath(ctx: CanvasRenderingContext2D, shape: ParcelShape, r: number): void {
  switch (shape) {
    case 'star':
      traceStar(ctx, r * 1.08, r * 0.5, 5);
      break;
    case 'diamond':
      traceDiamond(ctx, r);
      break;
    case 'hexagon':
      traceHexagon(ctx, r * 0.96);
      break;
    case 'triangle':
      traceRoundedTriangle(ctx, r);
      break;
    case 'prism':
      traceStar(ctx, r * 1.1, r * 0.62, 8);
      break;
    case 'vortex':
    case 'clock':
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.94, 0, Math.PI * 2);
      break;
  }
}

export interface DrawParcelOptions {
  x: number;
  y: number;
  radius: number;
  kind: ParcelKind;
  time: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  selected?: boolean;
  isGolden5x?: boolean;
  /** 0..1 urgency for black hole approaching eruption */
  dangerProgress?: number;
  /** 0..1 opacity override */
  alpha?: number;
}

export function drawParcelSprite(ctx: CanvasRenderingContext2D, opts: DrawParcelOptions): void {
  const {
    x,
    y,
    radius,
    kind,
    time,
    scaleX = 1,
    scaleY = 1,
    rotation = 0,
    selected = false,
    isGolden5x = false,
    dangerProgress = 0,
    alpha = 1,
  } = opts;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(scaleX, scaleY);

  if (kind === 'blackhole') {
    drawBlackHoleParcel(ctx, radius, time, dangerProgress);
    ctx.restore();
    return;
  }

  if (kind === 'slowmo') {
    drawSlowmoParcel(ctx, radius, time);
    ctx.restore();
    return;
  }

  if (kind === 'rainbow') {
    drawRainbowParcel(ctx, radius, time, rotation, selected);
    ctx.restore();
    return;
  }

  const spec = BAY_SPEC_MAP[kind];
  const pulse = 0.92 + Math.sin(time * 4.5 + x * 0.02) * 0.08;

  // Selection halo
  if (selected) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.38, 0, Math.PI * 2);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.6;
    ctx.setLineDash([6, 4]);
    ctx.rotate(time * 2.2);
    ctx.stroke();
    ctx.restore();
  }

  // Extra radiant golden shimmer halo for Wave 2+ Golden 5x parcels
  if (isGolden5x) {
    const gPulse = 1 + Math.sin(time * 9) * 0.1;
    ctx.fillStyle = 'rgba(255, 215, 64, 0.24)';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.65 * gPulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.rotate(time * 1.6);
    ctx.strokeStyle = '#FFE066';
    ctx.lineWidth = 2.4;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Outer luminous aura (lightweight layered halo)
  ctx.fillStyle = spec.glow.replace('0.52', '0.13');
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.48 * pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = spec.glow.replace('0.52', '0.26');
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.16 * pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.rotate(rotation);

  // Dark silhouette outline for crisp readability against bright starfields
  traceShapePath(ctx, spec.shape, radius * 1.05);
  ctx.fillStyle = isGolden5x ? '#3B2500' : '#070B1A';
  ctx.fill();

  // Main crystalline body
  traceShapePath(ctx, spec.shape, radius * 0.94);
  ctx.fillStyle = spec.primary;
  ctx.fill();

  // Upper bright crystalline bevel highlight
  ctx.save();
  ctx.translate(-radius * 0.06, -radius * 0.08);
  traceShapePath(ctx, spec.shape, radius * 0.72);
  ctx.fillStyle = isGolden5x ? '#FFF3B0' : spec.bright;
  ctx.globalAlpha = alpha * (isGolden5x ? 0.72 : 0.58);
  ctx.fill();
  ctx.restore();

  // Crisp luminous rim (thick gold rim for 5x parcels)
  traceShapePath(ctx, spec.shape, radius * 0.94);
  ctx.strokeStyle = isGolden5x ? '#FFE066' : spec.bright;
  ctx.lineWidth = isGolden5x ? 3.2 : 2;
  ctx.stroke();

  // Inner facet sheen
  traceShapePath(ctx, spec.shape, radius * 0.44);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
  ctx.fill();

  // Specular star glint
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.beginPath();
  ctx.arc(-radius * 0.24, -radius * 0.26, Math.max(2, radius * 0.12), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Crisp Golden "×5" badge on top-right corner
  if (isGolden5x) {
    const bx = radius * 0.72;
    const by = -radius * 0.72;
    ctx.fillStyle = '#FFD166';
    ctx.strokeStyle = '#070B1A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, by, Math.max(10, radius * 0.36), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#090F24';
    ctx.font = `900 ${Math.max(10, Math.round(radius * 0.38))}px "JetBrains Mono", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×5', bx, by + 0.5);
  }

  ctx.restore();
}

function drawSlowmoParcel(ctx: CanvasRenderingContext2D, radius: number, time: number): void {
  const pulse = 1 + Math.sin(time * 6) * 0.08;

  // Icy cyan aura
  ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.55 * pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(125, 211, 252, 0.32)';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.18 * pulse, 0, Math.PI * 2);
  ctx.fill();

  // Outer icy ring
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.96, 0, Math.PI * 2);
  ctx.fillStyle = '#071B34';
  ctx.fill();
  ctx.strokeStyle = '#7DD3FC';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Rotating clock/crystal ticks
  ctx.save();
  ctx.rotate(time * 0.8);
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.75)';
  ctx.lineWidth = 1.8;
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.62);
    ctx.lineTo(0, -radius * 0.84);
    ctx.stroke();
  }
  ctx.restore();

  // Clock hands
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -radius * 0.44);
  ctx.moveTo(0, 0);
  ctx.lineTo(radius * 0.34, radius * 0.16);
  ctx.stroke();

  // Crisp label
  ctx.fillStyle = '#E0F2FE';
  ctx.font = `800 ${Math.max(10, Math.round(radius * 0.36))}px "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('减速', 0, radius * 0.56);
}

function drawRainbowParcel(
  ctx: CanvasRenderingContext2D,
  radius: number,
  time: number,
  rotation: number,
  selected: boolean
): void {
  const hue = (time * 120) % 360;

  if (selected) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.45, 0, Math.PI * 2);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.rotate(time * 2.5);
    ctx.stroke();
    ctx.restore();
  }

  // Cycling prismatic halo
  ctx.fillStyle = `hsla(${hue}, 100%, 68%, 0.16)`;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.58, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = `hsla(${(hue + 90) % 360}, 100%, 72%, 0.28)`;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.22, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.rotate(rotation + time * 0.75);

  // Dark silhouette backing
  traceShapePath(ctx, 'prism', radius * 1.06);
  ctx.fillStyle = '#070B1A';
  ctx.fill();

  // Prismatic layered petals
  traceShapePath(ctx, 'prism', radius * 0.96);
  ctx.fillStyle = `hsl(${hue}, 96%, 64%)`;
  ctx.fill();

  ctx.save();
  ctx.rotate(Math.PI / 8);
  traceShapePath(ctx, 'prism', radius * 0.74);
  ctx.fillStyle = `hsl(${(hue + 135) % 360}, 96%, 68%)`;
  ctx.fill();
  ctx.restore();

  traceShapePath(ctx, 'prism', radius * 0.96);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Bright diamond core
  traceDiamond(ctx, radius * 0.44);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fill();
  ctx.restore();

  // Orbiting mini star motes
  for (let i = 0; i < 3; i++) {
    const a = time * 2.8 + (i * Math.PI * 2) / 3;
    const ox = Math.cos(a) * radius * 1.18;
    const oy = Math.sin(a) * radius * 1.18;
    ctx.fillStyle = `hsl(${(hue + i * 110) % 360}, 100%, 82%)`;
    ctx.beginPath();
    ctx.arc(ox, oy, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBlackHoleParcel(
  ctx: CanvasRenderingContext2D,
  radius: number,
  time: number,
  dangerProgress: number
): void {
  const pulse = 1 + Math.sin(time * (8 + dangerProgress * 12)) * 0.08;
  const urgencyColor = dangerProgress > 0.65 ? '#FF3366' : '#C084FC';

  // Swirling violet/crimson gravity field
  ctx.fillStyle = dangerProgress > 0.65 ? 'rgba(255, 51, 102, 0.2)' : 'rgba(168, 85, 247, 0.2)';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.56 * pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = dangerProgress > 0.65 ? 'rgba(255, 51, 102, 0.35)' : 'rgba(168, 85, 247, 0.34)';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.18 * pulse, 0, Math.PI * 2);
  ctx.fill();

  // Accretion spiral arms
  ctx.save();
  ctx.rotate(-time * (3.2 + dangerProgress * 3.5));
  for (let i = 0; i < 3; i++) {
    ctx.rotate((Math.PI * 2) / 3);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.98, 0.1, 1.45);
    ctx.strokeStyle = i % 2 === 0 ? urgencyColor : '#F472B6';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.restore();

  // Event horizon void core
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
  ctx.fillStyle = '#04020B';
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Danger telegraph ring (fills clockwise as eruption approaches)
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.08, dangerProgress));
  ctx.strokeStyle = dangerProgress > 0.65 ? '#FF3366' : '#E879F9';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Crisp "点" target cue in center so players immediately know to tap it
  ctx.fillStyle = '#FFE4F0';
  ctx.font = `800 ${Math.round(radius * 0.68)}px "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('点', 0, 1);
}

export function drawBayIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: ParcelColor
): void {
  const spec = BAY_SPEC_MAP[color];
  ctx.save();
  ctx.translate(x, y);
  traceShapePath(ctx, spec.shape, radius);
  ctx.fillStyle = spec.primary;
  ctx.fill();
  ctx.strokeStyle = spec.bright;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
}
