/** 总览仪表盘 */
import { api, esc, el, $, todayStr, fmtRelative, weekdayName, statHTML, emptyHTML, avatarHTML, speciesEmoji, dueMeta, num, toast, openModal, closeModal } from '../ui.js';
import { barChart } from '../charts.js';
import { registerPage, state, refresh, navigate, quickDiaryModal, loadPets } from '../app.js';

registerPage('dashboard', {
  title: '总览',
  subtitle: () => `今天是 ${todayStr()} ${weekdayName(todayStr())}`,
  async render(view) {
    const d = await api.get('/api/dashboard');
    state.badgeCount = d.upcoming.filter((u) => u.overdue || u.days <= 7).length;
    const pets = d.pets;

    const greet = new Date().getHours() < 11 ? '早上好' : new Date().getHours() < 18 ? '下午好' : '晚上好';
    const pending = d.upcoming.filter((u) => u.overdue || u.days <= 7);
    const feedDone = d.plansToday.filter((p) => p.done).length;

    view.innerHTML = `
      <section class="hero">
        <div class="spread" style="align-items:flex-start;flex-wrap:wrap">
          <div style="flex:1 1 320px;min-width:0">
            <h2>${greet}，铲屎官 👋</h2>
            <p class="muted" style="margin:2px 0 0">
              今天有 <strong>${d.plansToday.length}</strong> 顿喂食计划、<strong>${pending.length}</strong> 件待办需要留意。
            </p>
            <div class="pill-row" style="margin-top:12px">
              ${pets.map((p) => `<a class="chip pink" href="#/pets">${speciesEmoji(p.species)} ${esc(p.name)} · ${esc(p.age_text)} · ${num(p.weight, 1)}kg</a>`).join('')}
              ${pets.length === 0 ? `<span class="chip gray">还没有宠物，先去「宠物档案」添加吧</span>` : ''}
            </div>
          </div>
          <div class="row" style="flex:0 0 auto">
            <button class="btn primary" data-action="quick">＋ 记一笔</button>
            <button class="btn" data-action="add-pet">＋ 添加宠物</button>
          </div>
        </div>
      </section>

      <div class="grid cols-4" style="margin-top:16px">
        ${statHTML('🐾', d.stats.pet_count, '宠物数量')}
        ${statHTML('📔', d.stats.diary_total, '日记总数', 'pink')}
        ${statHTML('💉', d.stats.health_total, '健康记录')}
        ${statHTML('⏰', d.stats.reminder_pending, '待办提醒')}
      </div>

      <div class="grid cols-2" style="margin-top:16px">
        <div class="card">
          <div class="card-head">
            <h3>⏰ 近期提醒</h3>
            <div class="right"><a class="btn sm ghost" href="#/reminders">全部 ›</a></div>
          </div>
          <div class="list" id="dashReminders">
            ${
              d.upcoming.length
                ? d.upcoming
                    .slice(0, 6)
                    .map((u) => {
                      const meta = dueMeta(u.due_date);
                      return `<div class="list-item ${meta.cls}">
                        <span class="chip ${meta.tone === 'red' ? 'red' : meta.tone === 'amber' ? 'amber' : 'gray'}">${esc(meta.text)}</span>
                        <div class="grow">
                          <div class="title">${esc(u.title)}</div>
                          <div class="muted small">${esc(u.source)} · 到期日 ${esc(u.due_date)}</div>
                        </div>
                      </div>`;
                    })
                    .join('')
                : emptyHTML('最近 30 天没有到期事项，一切顺利 ✨', '🌿')
            }
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3>🍚 今日喂食</h3>
            <div class="right">
              <span class="chip ${feedDone === d.plansToday.length && d.plansToday.length ? 'green' : 'amber'}">${feedDone}/${d.plansToday.length} 已完成</span>
              <a class="btn sm ghost" href="#/feeding">管理 ›</a>
            </div>
          </div>
          <div class="list">
            ${
              d.plansToday.length
                ? d.plansToday
                    .map(
                      (p) => `<div class="list-item">
                        <span class="chip ${p.done ? 'green' : 'gray'}">${p.done ? '✓' : ''} ${esc(p.time_of_day)}</span>
                        <div class="grow">
                          <div class="title">${esc(p.food_name)} <span class="chip gray">${esc(p.pet_name)}</span></div>
                          <div class="muted small">${num(p.amount)}${esc(p.unit)} · ${esc(p.food_type)}${p.note ? ` · ${esc(p.note)}` : ''}</div>
                        </div>
                        <button class="btn sm ${p.done ? '' : 'primary'}" data-action="feed-toggle" data-id="${p.id}">${p.done ? '撤销' : '已喂'}</button>
                      </div>`
                    )
                    .join('')
                : emptyHTML('今天没有喂食计划', '🥣')
            }
          </div>
        </div>
      </div>

      <div class="grid cols-2" style="margin-top:16px">
        <div class="card">
          <div class="card-head"><h3>📈 近 7 天记录量</h3><div class="right muted small">共 ${d.stats.diary_week} 条</div></div>
          ${barChart(d.diaryTrend.map((t) => ({ label: t.date.slice(5), value: t.count })), { unit: ' 条' })}
        </div>
        <div class="card">
          <div class="card-head">
            <h3>🕒 最近动态</h3>
            <div class="right"><a class="btn sm ghost" href="#/diary">全部 ›</a></div>
          </div>
          <div class="timeline">
            ${
              d.recentDiary.length
                ? d.recentDiary
                    .map(
                      (r) => `<div class="tl-item ${r.category === '就医' ? 'amber' : 'accent'}">
                        <div class="title" style="font-weight:700">${esc(r.title || r.category)} <span class="chip gray">${esc(r.pet_name || '')}</span></div>
                        <div class="muted small">${esc(r.category)} · ${esc(fmtRelative(r.happened_at))} ${r.mood ? `· ${esc(r.mood)}` : ''}</div>
                        ${r.content ? `<div class="small" style="margin-top:3px">${esc(r.content.slice(0, 60))}${r.content.length > 60 ? '…' : ''}</div>` : ''}
                        ${r.photos?.length ? `<div class="thumb-strip" style="margin-top:6px"><div class="thumb"><img src="${esc(r.photos[0])}" alt="照片" /></div></div>` : ''}
                      </div>`
                    )
                    .join('')
                : emptyHTML('还没有记录，点右上角「记一笔」开始吧', '📝')
            }
          </div>
        </div>
      </div>
    `;

    view.addEventListener('click', async (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'quick') quickDiaryModal();
      if (action === 'add-pet') {
        const { petForm } = await import('./pets.js');
        petForm(null);
      }
      if (action === 'feed-toggle') {
        try {
          await api.post('/api/feeding/complete', { plan_id: Number(target.dataset.id) });
          toast('已更新喂食状态', 'ok');
          await refresh();
        } catch (err) {
          toast(err.message, 'err');
        }
      }
    });
  },
});
