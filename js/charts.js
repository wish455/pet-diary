/** 轻量 SVG 图表（零依赖）：折线图 / 柱状图 / 环形进度 */
import { esc, num } from './ui.js';

const W = 720;

/**
 * 折线图
 * @param {Array<{label:string, value:number}>} raw
 */
export function lineChart(raw, { height = 240, color = '#ff7aa8', unit = '', fillFrom = 'rgba(255,122,168,.22)' } = {}) {
  const data = (raw || []).filter((d) => Number.isFinite(Number(d.value)));
  if (data.length === 0) return `<div class="empty">暂无数据</div>`;
  if (data.length === 1) {
    return `<div class="empty"><span class="big">📈</span>只有 1 条记录（${num(data[0].value)}${unit}），再记录几次就能看到曲线了</div>`;
  }
  const padL = 52;
  const padR = 18;
  const padT = 18;
  const padB = 34;
  const innerW = W - padL - padR;
  const innerH = height - padT - padB;

  const values = data.map((d) => Number(d.value));
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 0.5;
    max += 0.5;
  }
  const span = max - min;
  min -= span * 0.15;
  max += span * 0.15;

  const x = (i) => padL + (innerW * i) / (data.length - 1);
  const y = (v) => padT + innerH - ((v - min) / (max - min)) * innerH;

  const ticks = 4;
  let grid = '';
  for (let i = 0; i <= ticks; i++) {
    const v = min + ((max - min) * i) / ticks;
    const yy = y(v);
    grid += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" stroke="#efedf7" stroke-width="1" />`;
    grid += `<text x="${padL - 9}" y="${(yy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#a09ab5">${num(v, 1)}</text>`;
  }

  const points = data.map((d, i) => `${x(i).toFixed(1)},${y(Number(d.value)).toFixed(1)}`).join(' ');
  const area = `${padL},${(padT + innerH).toFixed(1)} ${points} ${(W - padR).toFixed(1)},${(padT + innerH).toFixed(1)}`;

  const step = Math.max(1, Math.ceil(data.length / 8));
  let xLabels = '';
  let dots = '';
  data.forEach((d, i) => {
    if (i % step === 0 || i === data.length - 1) {
      xLabels += `<text x="${x(i).toFixed(1)}" y="${height - 10}" text-anchor="middle" font-size="11" fill="#a09ab5">${esc(String(d.label).slice(5))}</text>`;
    }
    dots += `<circle cx="${x(i).toFixed(1)}" cy="${y(Number(d.value)).toFixed(1)}" r="3.6" fill="#fff" stroke="${color}" stroke-width="2.2"><title>${esc(d.label)}：${num(d.value)}${unit}</title></circle>`;
  });

  const last = data[data.length - 1];
  const lastX = x(data.length - 1);
  const lastY = y(Number(last.value));
  const labelX = Math.min(Math.max(lastX, padL + 42), W - padR - 42);

  return `<svg class="chart" viewBox="0 0 ${W} ${height}" preserveAspectRatio="none" role="img">
    <defs><linearGradient id="lg-${Math.abs(hash(points))}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${fillFrom}" /><stop offset="100%" stop-color="rgba(255,255,255,0)" />
    </linearGradient></defs>
    ${grid}
    <polygon points="${area}" fill="url(#lg-${Math.abs(hash(points))})" />
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" />
    ${dots}
    <g>
      <rect x="${(labelX - 40).toFixed(1)}" y="${(lastY - 30).toFixed(1)}" width="80" height="20" rx="10" fill="#241f31" opacity=".88" />
      <text x="${labelX.toFixed(1)}" y="${(lastY - 16).toFixed(1)}" text-anchor="middle" font-size="11.5" fill="#fff">${num(last.value)}${esc(unit)}</text>
    </g>
    ${xLabels}
  </svg>`;
}

/**
 * 柱状图
 * @param {Array<{label:string, value:number}>} raw
 */
export function barChart(raw, { height = 190, color = '#7c6cff', unit = '' } = {}) {
  const data = raw || [];
  if (!data.length) return `<div class="empty">暂无数据</div>`;
  const padL = 34;
  const padR = 14;
  const padT = 16;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0));
  const bw = (innerW / data.length) * 0.56;

  let bars = '';
  let labels = '';
  data.forEach((d, i) => {
    const cx = padL + (innerW * (i + 0.5)) / data.length;
    const h = ((Number(d.value) || 0) / max) * innerH;
    const yTop = padT + innerH - h;
    bars += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, 2).toFixed(1)}" rx="7" fill="${color}" opacity="${0.35 + 0.65 * ((Number(d.value) || 0) / max)}"><title>${esc(d.label)}：${num(d.value)}${esc(unit)}</title></rect>`;
    labels += `<text x="${cx.toFixed(1)}" y="${height - 9}" text-anchor="middle" font-size="11" fill="#a09ab5">${esc(d.label)}</text>`;
    if (Number(d.value) > 0) {
      labels += `<text x="${cx.toFixed(1)}" y="${(yTop - 6).toFixed(1)}" text-anchor="middle" font-size="11" fill="#6f6a85">${num(d.value)}</text>`;
    }
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${height}">
    <line x1="${padL}" y1="${padT + innerH}" x2="${W - padR}" y2="${padT + innerH}" stroke="#efedf7" />
    ${bars}${labels}
  </svg>`;
}

/** 环形进度 */
export function ring(percent, { size = 96, color = '#23b98a', label = '', sub = '' } = {}) {
  const p = Math.max(0, Math.min(1, Number(percent) || 0));
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#f0eef8" stroke-width="9" />
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="9"
      stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}"
      transform="rotate(-90 ${size / 2} ${size / 2})" />
    <text x="${size / 2}" y="${size / 2 - 2}" text-anchor="middle" font-size="19" font-weight="700" fill="#241f31">${esc(label)}</text>
    <text x="${size / 2}" y="${size / 2 + 16}" text-anchor="middle" font-size="11" fill="#a09ab5">${esc(sub)}</text>
  </svg>`;
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}
