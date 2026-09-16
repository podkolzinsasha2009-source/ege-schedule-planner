// ==========================================================================
// РАСПОЗНАВАНИЕ ФИГУР «ХИМБИОРУС»
// Нарисуйте линию или фигуру и задержите стилус — как «Draw and Hold» в GoodNotes
// и QuickShape в Procreate. Узнаёт прямую, прямоугольник, треугольник, круг и овал.
// Точки — [x, y, нажим] в координатах доски.
// ==========================================================================

(function (global) {
  'use strict';

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  function pathLength(pts) {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
    return len;
  }

  function distToLine(p, a, b) {
    const len = dist(a, b);
    if (len === 0) return dist(p, a);
    return Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len;
  }

  // Упрощение ломаной (Рамер — Дуглас — Пекер): остаются только «углы»
  function simplify(pts, eps) {
    if (pts.length < 3) return pts.slice();
    let maxD = 0, idx = 0;
    const a = pts[0], b = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) {
      const d = distToLine(pts[i], a, b);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD <= eps) return [a, b];
    const left = simplify(pts.slice(0, idx + 1), eps);
    const right = simplify(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }

  // Поворот в вершине, градусы (0 — прямо, 90 — прямой угол)
  function turnAngle(prev, p, next) {
    const a1 = Math.atan2(p[1] - prev[1], p[0] - prev[0]);
    const a2 = Math.atan2(next[1] - p[1], next[0] - p[0]);
    let d = Math.abs(a2 - a1) * 180 / Math.PI;
    if (d > 180) d = 360 - d;
    return d;
  }

  // Точки вдоль отрезков с шагом step — чтобы сглаживание не скругляло углы
  function densify(vertices, step) {
    const out = [];
    for (let i = 0; i < vertices.length - 1; i++) {
      const a = vertices[i], b = vertices[i + 1];
      const n = Math.max(1, Math.ceil(dist(a, b) / step));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    out.push(vertices[vertices.length - 1].slice(0, 2));
    return out;
  }

  function withPressure(points, pressure) {
    return points.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, pressure]);
  }

  function recognize(raw) {
    const pts = raw.filter((p, i) => i === 0 || dist(p, raw[i - 1]) > 0.5);
    if (pts.length < 3) return null;
    const length = pathLength(pts);
    if (length < 24) return null;

    const pressure = Math.round(pts.reduce((s, p) => s + (p[2] || 0.5), 0) / pts.length * 100) / 100;
    const start = pts[0], end = pts[pts.length - 1];
    const chord = dist(start, end);

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach(p => {
      if (p[0] < x0) x0 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[0] > x1) x1 = p[0];
      if (p[1] > y1) y1 = p[1];
    });
    const w = x1 - x0, h = y1 - y0;
    const size = Math.max(w, h);

    // --- прямая
    const maxDev = pts.reduce((m, p) => Math.max(m, distToLine(p, start, end)), 0);
    if (chord >= 20 && chord > length * 0.8 && maxDev <= Math.max(4, chord * 0.08)) {
      let a = start.slice(0, 2), b = end.slice(0, 2);
      const angle = Math.abs(Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI);
      if (angle < 5 || angle > 175) { const y = (a[1] + b[1]) / 2; a[1] = y; b[1] = y; }
      else if (Math.abs(angle - 90) < 5) { const x = (a[0] + b[0]) / 2; a[0] = x; b[0] = x; }
      return { kind: 'line', points: withPressure(densify([a, b], 4), pressure) };
    }

    // --- замкнутые фигуры: конец рядом с началом
    const closed = size >= 30 && chord <= Math.max(20, size * 0.25);
    if (!closed) return null;

    // Круг или овал: насколько точки лежат на вписанном эллипсе
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const rx = Math.max(w / 2, 1), ry = Math.max(h / 2, 1);
    const ellipseError = pts.reduce((s, p) => s + Math.abs(Math.hypot((p[0] - cx) / rx, (p[1] - cy) / ry) - 1), 0) / pts.length;

    // Углы многоугольника
    const loop = pts.concat([start]);
    let corners = simplify(loop, Math.max(6, length * 0.045)).slice(0, -1);
    for (let changed = true; changed && corners.length > 2;) {
      changed = false;
      for (let i = 0; i < corners.length; i++) {
        const prev = corners[(i - 1 + corners.length) % corners.length];
        const next = corners[(i + 1) % corners.length];
        if (turnAngle(prev, corners[i], next) < 30 || dist(prev, corners[i]) < size * 0.12) {
          corners.splice(i, 1);
          changed = true;
          break;
        }
      }
    }

    if (ellipseError < 0.09 || (corners.length > 4 && ellipseError < 0.14)) {
      const round = Math.abs(rx - ry) / Math.max(rx, ry) < 0.12;
      const erx = round ? (rx + ry) / 2 : rx;
      const ery = round ? (rx + ry) / 2 : ry;
      const n = Math.max(48, Math.round(Math.PI * (erx + ery) / 4));
      const points = [];
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * Math.PI * 2;
        points.push([cx + erx * Math.cos(t), cy + ery * Math.sin(t)]);
      }
      return { kind: round ? 'circle' : 'ellipse', points: withPressure(points, pressure) };
    }

    if (corners.length === 3) {
      return { kind: 'triangle', points: withPressure(densify(corners.concat([corners[0]]), 4), pressure) };
    }

    if (corners.length === 4) {
      const axisAligned = corners.every((c, i) => {
        const n = corners[(i + 1) % 4];
        const ang = Math.abs(Math.atan2(n[1] - c[1], n[0] - c[0]) * 180 / Math.PI) % 90;
        return ang < 14 || ang > 76;
      });
      let vertices;
      if (axisAligned) {
        const xs = corners.map(c => c[0]).sort((a, b) => a - b);
        const ys = corners.map(c => c[1]).sort((a, b) => a - b);
        const left = (xs[0] + xs[1]) / 2, right = (xs[2] + xs[3]) / 2;
        const top = (ys[0] + ys[1]) / 2, bottom = (ys[2] + ys[3]) / 2;
        vertices = [[left, top], [right, top], [right, bottom], [left, bottom], [left, top]];
      } else {
        vertices = corners.concat([corners[0]]);
      }
      return { kind: axisAligned ? 'rectangle' : 'quad', points: withPressure(densify(vertices, 4), pressure) };
    }

    return null;
  }

  const api = { recognize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.HBShapes = api;
})(typeof window !== 'undefined' ? window : globalThis);
