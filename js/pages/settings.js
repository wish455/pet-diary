/** 数据中心：统计概览、备份导出/导入、账号管理、使用说明 */
import { api, esc, statHTML, toast, confirmDialog, $, todayStr } from '../ui.js';
import { registerPage, state, refresh, loadPets } from '../app.js';

async function adminBlock() {
  if (state.user?.role !== 'admin') return '';
  let users = [];
  try {
    users = await api.get('/api/admin/users');
  } catch {
    return '';
  }
  return `
    <div class="card" style="grid-column:1/-1">
      <div class="card-head">
        <h3>👥 账号管理（管理员）</h3>
        <div class="right muted small">共 ${users.length} 个账号</div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>账号</th><th>昵称</th><th>角色</th><th>状态</th><th>宠物</th><th>日记</th><th>注册时间</th><th>最近登录</th><th></th></tr></thead>
          <tbody>
            ${users
              .map(
                (u) => `<tr>
              <td><strong>${esc(u.username)}</strong>${u.id === state.user.id ? ' <span class="chip green">我</span>' : ''}</td>
              <td>${esc(u.nickname || '—')}</td>
              <td><span class="chip ${u.role === 'admin' ? 'pink' : 'gray'}">${u.role === 'admin' ? '管理员' : '普通'}</span></td>
              <td><span class="chip ${u.status === 'active' ? 'green' : 'red'}">${u.status === 'active' ? '正常' : '已停用'}</span></td>
              <td>${u.pet_count}</td>
              <td>${u.diary_count}</td>
              <td class="small muted">${esc(String(u.created_at).slice(0, 10))}</td>
              <td class="small muted">${esc(String(u.last_login_at || '').slice(0, 10) || '—')}</td>
              <td>${u.id === state.user.id ? '' : `<button class="btn sm ${u.status === 'active' ? 'danger' : ''}" data-user="${u.id}" data-next="${u.status === 'active' ? 'disabled' : 'active'}">${u.status === 'active' ? '停用' : '启用'}</button>`}</td>
            </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <p class="muted small" style="margin:10px 0 0">
        停用账号会立即让其所有登录会话失效。新注册的账号默认是普通用户；可在服务器上设置 <code>ADMIN_USERS=用户名1,用户名2</code> 提升为管理员，或把 <code>OPEN_REGISTRATION=0</code> 关闭注册。
      </p>
    </div>`;
}

registerPage('settings', {
  title: '数据中心',
  subtitle: () => '备份、恢复、账号管理与统计',
  async render(view) {
    const [pets, diary, health, weights, plans, logs, recipes, reminders] = await Promise.all([
      api.get('/api/pets'),
      api.get('/api/diary?limit=1'),
      api.get('/api/health?limit=1'),
      api.get('/api/weights?limit=1'),
      api.get('/api/feeding-plans?limit=1'),
      api.get('/api/feeding-logs?limit=1'),
      api.get('/api/recipes?limit=1'),
      api.get('/api/reminders?limit=1'),
    ]);

    const counts = [
      ['🐾', pets.total, '宠物档案'],
      ['📔', diary.total, '日记记录'],
      ['💉', health.total, '健康记录'],
      ['⚖️', weights.total, '体重记录'],
      ['📋', plans.total, '喂食计划'],
      ['📝', logs.total, '喂食记录'],
      ['🍲', recipes.total, '自制食谱'],
      ['⏰', reminders.total, '提醒事项'],
    ];

    const admin = await adminBlock();

    view.innerHTML = `
      <div class="grid cols-4" style="margin-bottom:18px">
        ${counts.map(([i, v, l]) => statHTML(i, v, l)).join('')}
      </div>

      <div class="grid cols-2">
        <div class="card">
          <div class="card-head"><h3>💾 备份与恢复</h3></div>
          <p class="muted small">
            数据保存在服务器的 SQLite 数据库里，导出的是<strong>你账号自己的</strong>全部数据（宠物、日记、健康、喂食、食谱、提醒）。导入会先清空你账号现有数据，不会影响其他账号。
          </p>
          <div class="stack sm">
            <a class="btn primary block" href="/api/backup/export" download>⬇️ 导出我的全部数据（JSON）</a>
            <label class="btn block" style="text-align:center;cursor:pointer">
              ⬆️ 导入备份文件（覆盖我的数据）
              <input type="file" id="importFile" accept="application/json,.json" hidden />
            </label>
            <button class="btn block danger" data-action="wipe">🗑️ 清空我的所有数据</button>
          </div>
          <p class="muted small" style="margin-top:10px">提示：导入前建议先导出一次现有数据作为保险。</p>
        </div>

        <div class="card">
          <div class="card-head"><h3>📖 使用说明</h3></div>
          <div class="stack sm small">
            <div><strong>1. 先建档案</strong>：在「宠物档案」添加宠物，填生日可自动换算年龄，头像支持上传照片。</div>
            <div><strong>2. 日常记录</strong>：任何页面右上角「＋ 记一笔」都能快速写日记，支持一次上传多张照片。</div>
            <div><strong>3. 健康管理</strong>：记录体重会自动更新宠物当前体重并画曲线；疫苗/驱虫填「下次到期」会自动生成提醒。</div>
            <div><strong>4. 喂食计划</strong>：设定周重复计划，在「今日喂食」一键打卡，也可按日期补录。</div>
            <div><strong>5. 猫饭狗饭</strong>：新建食谱时选食材与克数，系统自动算热量、蛋白质、钙磷比与肉类/内脏占比，并按体重估算每天喂多少克。</div>
            <div><strong>6. 营养数据为通用参考值</strong>，长期全自制建议咨询兽医营养师或使用营养预混粉。</div>
          </div>
          <div class="card tight" style="margin-top:14px;background:var(--accent-soft);border-color:#e3ddff">
            <strong class="small">🔐 账号与隐私</strong>
            <div class="small muted" style="margin-top:4px">
              账号之间数据完全隔离，其他用户无法查看或修改你的记录。修改密码在左下角账号菜单里。
            </div>
          </div>
        </div>

        ${admin}
      </div>
    `;

    $('#importFile', view).addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const okImport = await confirmDialog('导入会覆盖你账号当前的宠物、日记、健康、喂食、食谱与提醒数据（其他账号不受影响）。确定继续吗？', { danger: true, submitText: '导入并覆盖' });
      if (!okImport) {
        e.target.value = '';
        return;
      }
      try {
        const json = JSON.parse(await file.text());
        const res = await api.post('/api/backup/import', json);
        toast(`导入完成：${Object.entries(res.counts).map(([k, v]) => `${k} ${v}`).join('、')}`, 'ok');
        await loadPets();
        await refresh();
      } catch (err) {
        toast(`导入失败：${err.message}`, 'err');
      } finally {
        e.target.value = '';
      }
    });

    view.addEventListener('click', async (e) => {
      const userBtn = e.target.closest('[data-user]');
      if (userBtn) {
        const id = userBtn.dataset.user;
        const next = userBtn.dataset.next;
        const okSwitch = await confirmDialog(next === 'disabled' ? '停用该账号？对方会立即退出登录，且无法再登录。' : '重新启用该账号？', { danger: next === 'disabled', submitText: '确定' });
        if (!okSwitch) return;
        try {
          await api.post(`/api/admin/users/${id}/status`, { status: next });
          toast(next === 'disabled' ? '账号已停用' : '账号已启用', 'ok');
          await refresh();
        } catch (err) {
          toast(err.message, 'err');
        }
        return;
      }
      if (e.target.closest('[data-action=wipe]')) {
        const okWipe = await confirmDialog('确定清空你账号下的所有数据吗？此操作不可恢复，建议先导出备份。', { danger: true, submitText: '全部清空' });
        if (!okWipe) return;
        await api.post('/api/backup/import', { tables: {} });
        toast('已清空你的数据', 'ok');
        await loadPets();
        await refresh();
      }
    });
  },
});
