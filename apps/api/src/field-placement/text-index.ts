import type { PlacementBox } from 'shared';
import { TEXT_LINE_CAP, type AnchorLocator } from './field-placement.types';

export interface TextPiece {
  readonly page: number;
  readonly text: string;
  readonly box: PlacementBox;
}

export interface TextSegment {
  readonly start: number;
  readonly end: number;
  readonly box: PlacementBox;
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
        segments: [{ start: 0, end: piece.text.length, box: piece.box }],
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

function boxForRange(line: TextLine, from: number, to: number): PlacementBox {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const segment of line.segments) {
    const overlapStart = Math.max(from, segment.start);
    const overlapEnd = Math.min(to, segment.end);
    if (overlapEnd <= overlapStart) continue;
    const span = Math.max(1, segment.end - segment.start);
    const leftFrac = (overlapStart - segment.start) / span;
    const rightFrac = (overlapEnd - segment.start) / span;
    const x0 = segment.box.x + segment.box.width * leftFrac;
    const x1 = segment.box.x + segment.box.width * rightFrac;
    minX = Math.min(minX, x0);
    maxX = Math.max(maxX, x1);
    minY = Math.min(minY, segment.box.y);
    maxY = Math.max(maxY, segment.box.y + segment.box.height);
  }
  if (!Number.isFinite(minX)) return line.box;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Substring matches in reading order: page, then y, then x.
 * Repeated hits inside one line are separate matches.
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
      matches.push({
        page: line.page,
        box: boxForRange(line, at, at + wanted.length),
        text: line.text.slice(at, at + wanted.length),
      });
      from = at + wanted.length;
    }
  }
  return matches;
}

export function anchorFieldBox(
  anchor: PlacementBox,
  size: { readonly width: number; readonly height: number },
  locator: AnchorLocator,
): PlacementBox {
  const gap = locator.gap ?? 6;
  const dx = locator.dx ?? 0;
  const dy = locator.dy ?? 0;
  const position = locator.position ?? 'right';
  let x = anchor.x;
  let y = anchor.y;
  if (position === 'right' || position === 'left') {
    const bottom = anchor.y + anchor.height + 3;
    y = bottom - size.height;
    x = position === 'right' ? anchor.x + anchor.width + gap : anchor.x - gap - size.width;
  } else if (position === 'above') {
    x = anchor.x;
    y = anchor.y - gap - size.height;
  } else if (position === 'below') {
    x = anchor.x;
    y = anchor.y + anchor.height + gap;
  } else {
    x = anchor.x + (anchor.width - size.width) / 2;
    y = anchor.y + (anchor.height - size.height) / 2;
  }
  return { x: x + dx, y: y + dy, width: size.width, height: size.height };
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
