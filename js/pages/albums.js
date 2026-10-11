/** 相册：日记照片聚合、按月分组、灯箱浏览 */
import { api, esc, fmtDate, emptyHTML, statHTML, $, chipsHTML } from '../ui.js';
import { registerPage, state, refresh } from '../app.js';

function cell(p, withCategory) {
  return `<div class="photo-cell" data-photo="${esc(p.url)}">
    <img src="${esc(p.url)}" alt="${esc(p.title || '照片')}" loading="lazy" />
    <div class="cap">${esc(p.pet_name || '')} · ${esc(fmtDate(p.happened_at))}${withCategory ? ` · ${esc(p.category)}` : ''}</div>
  </div>`;
}

registerPage('albums', {
  title: '相册',
  subtitle: () => '日记里的照片自动汇总成成长相册',
  async render(view) {
    const f = state.filters.albums || (state.filters.albums = { month: '' });
    const petQ = state.petId !== 'all' ? `?pet_id=${state.petId}` : '';
    const data = await api.get(`/api/albums${petQ}`);
    const photos = data.photos;
    const months = Object.keys(data.groups).sort().reverse();
    const list = f.month ? photos.filter((p) => p.happened_at.slice(0, 7) === f.month) : photos;

    const byPet = new Map();
    for (const p of photos) {
      const key = p.pet_name || '未指定';
      byPet.set(key, (byPet.get(key) || 0) + 1);
    }

    let body = '';
    if (f.month) {
      body = list.length
        ? `<div class="photo-grid" data-photo-group>${list.map((p) => cell(p, false)).join('')}</div>`
        : emptyHTML('这个月还没有照片', '🖼️');
    } else if (months.length) {
      body = months
        .map(
          (m) => `<div class="date-head">📸 ${esc(m.replace('-', ' 年 '))} 月
            <span class="muted small" style="font-weight:400">${data.groups[m].length} 张</span></div>
          <div class="photo-grid" data-photo-group style="margin-bottom:8px">${data.groups[m].map((p) => cell(p, true)).join('')}</div>`
        )
        .join('');
    } else {
      body = emptyHTML('还没有照片。在日记里上传照片，会自动出现在这里 📷', '🖼️');
    }

    view.innerHTML = `
      <div class="grid cols-4" style="margin-bottom:16px">
        ${statHTML('🖼️', photos.length, '照片总数')}
        ${statHTML('📅', months.length, '拍摄月份')}
        ${statHTML('🐾', byPet.size, '出镜毛孩子')}
        ${statHTML('📔', new Set(photos.map((p) => p.diary_id)).size, '来源日记')}
      </div>

      <div class="card tight" style="margin-bottom:16px">
        <div class="stack sm" style="gap:8px">
          ${chipsHTML(
            [{ value: '', label: '全部月份' }, ...months.map((m) => ({ value: m, label: `${m.replace('-', ' 年 ')} 月` }))],
            { active: f.month, action: 'month', name: 'month' }
          )}
          ${byPet.size ? `<div class="pill-row">${[...byPet.entries()].map(([name, count]) => `<span class="chip gray">${esc(name)} · ${count} 张</span>`).join('')}</div>` : ''}
        </div>
      </div>

      ${body}
    `;

    view.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip.clickable');
      if (chip) {
        state.filters.albums.month = chip.dataset.value;
        return refresh();
      }
    });
  },
});
