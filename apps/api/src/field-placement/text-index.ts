import type { PlacementBox } from 'shared';
import { TEXT_LINE_CAP, type AnchorLocator } from './field-placement.types';

/**
 * Displayed-space text run. `origin` is the baseline start. `along` is
 * the advance to the end of the run. `up` points from the baseline to
 * the top of the glyphs. Horizontal text has `along` on +x and `up` on -y.
 */
export interface TextRun {
  readonly originX: number;
  readonly originY: number;
  readonly alongX: number;
  readonly alongY: number;
  readonly upX: number;
  readonly upY: number;
}

export interface TextPiece {
  readonly page: number;
  readonly text: string;
  readonly box: PlacementBox;
  readonly run: TextRun;
}

export interface TextSegment {
  readonly start: number;
  readonly end: number;
  readonly box: PlacementBox;
  readonly run: TextRun;
}

export interface TextLine {
  readonly page: number;
  readonly text: string;
  readonly box: PlacementBox;
  readonly segments: readonly TextSegment[];
}

export interface AnchorMatch {
  readonly page: number;
  readonly box: PlacementBox;
  readonly text: string;
  readonly run: TextRun;
}

export function horizontalRun(box: PlacementBox): TextRun {
  return {
    originX: box.x,
    originY: box.y + box.height,
    alongX: box.width,
    alongY: 0,
    upX: 0,
    upY: -box.height,
  };
}

function sameBaseline(line: TextLine, piece: TextPiece): boolean {
  const tolerance = Math.max(2, piece.box.height * 0.5);
  return line.page === piece.page && Math.abs(line.box.y - piece.box.y) <= tolerance;
}

function unionBox(a: PlacementBox, b: PlacementBox): PlacementBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

/** Group words into lines. A new line starts when the baseline jumps. */
export function groupTextLines(pieces: readonly TextPiece[]): TextLine[] {
  const sorted = [...pieces].sort(
    (a, b) => a.page - b.page || a.box.y - b.box.y || a.box.x - b.box.x,
  );
  const lines: TextLine[] = [];
  for (const piece of sorted) {
    if (piece.text.length === 0) continue;
    const current = lines[lines.length - 1];
    if (current === undefined || !sameBaseline(current, piece)) {
      lines.push({
        page: piece.page,
        text: piece.text,
        box: piece.box,
        segments: [{ start: 0, end: piece.text.length, box: piece.box, run: piece.run }],
      });
      continue;
    }
    const gap = piece.box.x - (current.box.x + current.box.width);
    const separator = gap > 1 ? ' ' : '';
    const start = current.text.length + separator.length;
    const segment: TextSegment = {
      start,
      end: start + piece.text.length,
      box: piece.box,
      run: piece.run,
    };
    lines[lines.length - 1] = {
      page: current.page,
      text: current.text + separator + piece.text,
      box: unionBox(current.box, piece.box),
      segments: [...current.segments, segment],
    };
  }
  return lines;
}

function enclose(points: readonly { readonly x: number; readonly y: number }[]): PlacementBox {
  const first = points[0];
  if (!first) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x;
  let maxY = first.y;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function sliceRun(run: TextRun, fromFrac: number, toFrac: number): TextRun {
  const span = toFrac - fromFrac;
  return {
    originX: run.originX + run.alongX * fromFrac,
    originY: run.originY + run.alongY * fromFrac,
    alongX: run.alongX * span,
    alongY: run.alongY * span,
    upX: run.upX,
    upY: run.upY,
  };
}

export function boxForRun(run: TextRun): PlacementBox {
  return enclose([
    { x: run.originX, y: run.originY },
    { x: run.originX + run.alongX, y: run.originY + run.alongY },
    { x: run.originX + run.upX, y: run.originY + run.upY },
    { x: run.originX + run.alongX + run.upX, y: run.originY + run.alongY + run.upY },
  ]);
}

function boxForRange(
  line: TextLine,
  from: number,
  to: number,
): { readonly box: PlacementBox; readonly run: TextRun } {
  const runs: TextRun[] = [];
  let box: PlacementBox | null = null;
  for (const segment of line.segments) {
    const overlapStart = Math.max(from, segment.start);
    const overlapEnd = Math.min(to, segment.end);
    if (overlapEnd <= overlapStart) continue;
    const span = Math.max(1, segment.end - segment.start);
    const sliced = sliceRun(
      segment.run,
      (overlapStart - segment.start) / span,
      (overlapEnd - segment.start) / span,
    );
    runs.push(sliced);
    const slicedBox = boxForRun(sliced);
    box = box === null ? slicedBox : unionBox(box, slicedBox);
  }
  const first = runs[0];
  if (!first || box === null) return { box: line.box, run: horizontalRun(line.box) };
  if (runs.length === 1) return { box, run: first };
  return { box, run: horizontalRun(box) };
}

/**
 * Substring matches in reading order: page, then y, then x.
 * Repeated hits inside one line are separate matches. A match does
 * not cross a line break.
 */
export function findAnchorMatches(
  lines: readonly TextLine[],
  locator: AnchorLocator,
): AnchorMatch[] {
  const needle = locator.text;
  if (needle.length === 0) return [];
  const insensitive = locator.match === 'case_insensitive';
  const wanted = insensitive ? needle.toLowerCase() : needle;
  const ordered = [...lines].sort(
    (a, b) => a.page - b.page || a.box.y - b.box.y || a.box.x - b.box.x,
  );
  const matches: AnchorMatch[] = [];
  for (const line of ordered) {
    if (locator.page !== undefined && line.page !== locator.page) continue;
    const hay = insensitive ? line.text.toLowerCase() : line.text;
    let from = 0;
    while (from <= hay.length - wanted.length) {
      const at = hay.indexOf(wanted, from);
      if (at < 0) break;
      const located = boxForRange(line, at, at + wanted.length);
      matches.push({
        page: line.page,
        box: located.box,
        text: line.text.slice(at, at + wanted.length),
        run: located.run,
      });
      from = at + wanted.length;
    }
  }
  return matches;
}

function unit(x: number, y: number): { readonly x: number; readonly y: number } {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

/**
 * Place an axis-aligned field relative to a text run. `right` / `left`
 * follow the run's advance, not the page's +x. `above` / `below` follow
 * the glyph up-vector. For horizontal left-to-right text this is the
 * page-axis rule: right sits `gap` past the advance, and the field's
 * bottom is the baseline plus 3pt.
 */
export function anchorFieldBox(
  run: TextRun,
  size: { readonly width: number; readonly height: number },
  locator: AnchorLocator,
): PlacementBox {
  const gap = locator.gap ?? 6;
  const dx = locator.dx ?? 0;
  const dy = locator.dy ?? 0;
  const position = locator.position ?? 'right';
  const along = unit(run.alongX, run.alongY);
  const up = unit(run.upX, run.upY);

  if (position === 'over') {
    const cx = run.originX + run.alongX / 2 + run.upX / 2;
    const cy = run.originY + run.alongY / 2 + run.upY / 2;
    return {
      x: cx - size.width / 2 + dx,
      y: cy - size.height / 2 + dy,
      width: size.width,
      height: size.height,
    };
  }

  const forward = position === 'left' || position === 'below' ? -1 : 1;
  const useAlong = position === 'right' || position === 'left';
  const dir = useAlong
    ? { x: along.x * forward, y: along.y * forward }
    : { x: up.x * forward, y: up.y * forward };
  let baseX = run.originX + run.alongX / 2 + run.upX / 2;
  let baseY = run.originY + run.alongY / 2 + run.upY / 2;
  if (useAlong && forward > 0) {
    baseX = run.originX + run.alongX;
    baseY = run.originY + run.alongY;
  } else if (useAlong) {
    baseX = run.originX;
    baseY = run.originY;
  }
  const nudge = useAlong ? 3 : 0;
  const qx = baseX + dir.x * gap - up.x * nudge;
  const qy = baseY + dir.y * gap - up.y * nudge;
  const placed = axisAlignedFromCorner(qx, qy, dir, up, size, !useAlong);
  return {
    x: placed.x + dx,
    y: placed.y + dy,
    width: size.width,
    height: size.height,
  };
}

/**
 * `(qx, qy)` is the field corner on the text side. The box extends along
 * `dir`. The other axis follows `up` (the field overlaps the baseline and
 * grows through the glyphs), or is centered when `centerCross` is set.
 */
function axisAlignedFromCorner(
  qx: number,
  qy: number,
  dir: { readonly x: number; readonly y: number },
  up: { readonly x: number; readonly y: number },
  size: { readonly width: number; readonly height: number },
  centerCross: boolean,
): { readonly x: number; readonly y: number } {
  const horizontal = Math.abs(dir.x) >= Math.abs(dir.y);
  let x = qx - size.width / 2;
  if (horizontal) {
    if (dir.x >= 0) x = qx;
    else x = qx - size.width;
  } else if (!centerCross && up.x > 0) {
    x = qx;
  } else if (!centerCross && up.x < 0) {
    x = qx - size.width;
  }
  let y = qy - size.height / 2;
  if (!horizontal) {
    if (dir.y > 0) y = qy;
    else y = qy - size.height;
  } else if (!centerCross && up.y > 0) {
    y = qy;
  } else if (!centerCross && up.y < 0) {
    y = qy - size.height;
  }
  return { x, y };
}

export function paginatePlacementText<T>(
  items: readonly T[],
  start: number,
): { readonly slice: readonly T[]; readonly nextIndex: number | null } {
  const end = Math.min(items.length, start + TEXT_LINE_CAP);
  return {
    slice: items.slice(start, end),
    nextIndex: end < items.length ? end : null,
  };
}
