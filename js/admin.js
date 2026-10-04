/* ============================================================
 * 图书馆座位预约系统 · 管理员端逻辑
 * ============================================================ */
'use strict';

const Admin = {
  loggedIn: false,
  panel: 'dashboard',
  resFilter: 'all',
  admCampus: 'main',
  admFloor: 1,
  admArea: '',

  init() {
    runStatusCheck();
    this.bindLogin();
    this.bindNav();
    this.bindLogout();
    this.bindResFilters();
    this.bindSeatSelects();
    this.bindNoticeAdd();
    this.bindUserTools();

    if (sessionStorage.getItem('ccnu_admin_session')) {
      this.loggedIn = true;
      this.enterAdmin();
    }
  },

  /* ---------------- 登录 ---------------- */
  bindLogin() {
    document.getElementById('admin-login-form').addEventListener('submit', e => {
      e.preventDefault();
      const account = document.getElementById('admin-account').value.trim();
      const pwd = document.getElementById('admin-password').value;
      const admin = Store.load().admin;
      if (account === admin.account && pwd === admin.password) {
        this.loggedIn = true;
        sessionStorage.setItem('ccnu_admin_session', '1');
        this.enterAdmin();
      } else {
        toast('账号或密码错误');
      }
    });
  },

  enterAdmin() {
    document.getElementById('admin-login').classList.add('hidden');
    document.getElementById('admin-app').classList.remove('hidden');
    this.showPanel('dashboard');
  },

  bindLogout() {
    document.getElementById('admin-logout').addEventListener('click', () => {
      this.loggedIn = false;
      sessionStorage.removeItem('ccnu_admin_session');
      location.reload();
    });
  },

  /* ---------------- 导航 ---------------- */
  bindNav() {
    document.querySelectorAll('.admin-nav-item').forEach(item => {
      item.addEventListener('click', () => this.showPanel(item.dataset.admin));
    });
  },

  showPanel(panel) {
    this.panel = panel;
    document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.toggle('active', n.dataset.admin === panel));
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('admin-' + panel).classList.add('active');

    if (panel === 'dashboard') this.renderDashboard();
    if (panel === 'reservations') this.renderReservations();
    if (panel === 'seats') this.renderSeatManage();
    if (panel === 'users') this.renderUsers();
    if (panel === 'notices') this.renderNoticeList();
  },

  /* ---------------- 数据看板 ---------------- */
  renderDashboard() {
    runStatusCheck();
    const res = Store.reservations;
    const today = fmtDate(getNow());
    const todayRes = res.filter(r => r.date === today);
    const stats = [
      { label: '今日预约', value: todayRes.length, icon: '📅' },
      { label: '履约中', value: todayRes.filter(r => r.status === '履约中' || r.status === '暂离中').length, icon: '🟢' },
      { label: '今日违约', value: todayRes.filter(r => r.status === '违约').length, icon: '⚠️' },
      { label: '累计预约', value: res.length, icon: '📊' },
    ];
    document.getElementById('dashboard-stats').innerHTML = stats.map(s => `
      <div class="stat-card">
        <div class="stat-icon">${s.icon}</div>
        <div class="stat-num">${s.value}</div>
        <div class="stat-label">${s.label}</div>
      </div>`).join('');

    // 楼层利用率
    const util = document.getElementById('util-bars');
    let utilHtml = '';
    CAMPUSES.forEach(c => {
      c.floors.forEach(f => {
        const seats = Store.seats.filter(s => s.campus === c.id && s.floor === f.floor && !s.disabled);
        const busy = seats.filter(s => Store.reservations.some(r =>
          r.seatId === s.id && r.date === today && (r.status === '待签到' || r.status === '履约中' || r.status === '暂离中'))).length;
        const pct = seats.length ? Math.round(busy / seats.length * 100) : 0;
        utilHtml += `
          <div class="util-row">
            <span class="util-label">${c.short} ${f.name}</span>
            <div class="util-bar"><div class="util-fill" style="width:${pct}%"></div></div>
            <span class="util-num">${pct}%</span>
          </div>`;
      });
    });
    util.innerHTML = utilHtml || '<p class="empty-box">暂无数据</p>';

    // 近 7 日趋势
    const trend = document.getElementById('trend-bars');
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(getNow(), -i);
      const ds = fmtDate(d);
      days.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, count: res.filter(r => r.date === ds).length });
    }
    const max = Math.max(1, ...days.map(d => d.count));
    trend.innerHTML = days.map(d => `
      <div class="trend-col">
        <div class="trend-bar" style="height:${Math.round(d.count / max * 100)}%"><span>${d.count}</span></div>
        <div class="trend-label">${d.label}</div>
      </div>`).join('');
  },

  /* ---------------- 预约管理 ---------------- */
  bindResFilters() {
    document.querySelectorAll('#admin-res-filters .chip-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#admin-res-filters .chip-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.resFilter = btn.dataset.filter;
        this.renderReservations();
      });
    });
  },

  renderReservations() {
    runStatusCheck();
    let res = [...Store.reservations].sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
    if (this.resFilter !== 'all') res = res.filter(r => r.status === this.resFilter);
    const tbody = document.querySelector('#admin-res-table tbody');
    if (!res.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">暂无预约记录</td></tr>';
      return;
    }
    const campusMap = {};
    CAMPUSES.forEach(c => campusMap[c.id] = c.short);

    tbody.innerHTML = res.map(r => `
      <tr class="row-${r.status}">
        <td>${r.date}</td>
        <td>${timeToLabel(r.startTime)} — ${timeToLabel(r.endTime)}</td>
        <td>${r.userName || r.userId}<br><small>${Store.users.find(u => u.id === r.userId)?.studentId || ''}</small></td>
        <td>${campusMap[r.campus] || r.campus} · ${r.areaName}</td>
        <td><b>${r.seatId}</b></td>
        <td>${this.badge(r.status)}</td>
        <td>
          ${(r.status === '待签到' || r.status === '履约中' || r.status === '暂离中')
            ? `<button class="btn-danger btn-sm" onclick="Admin.cancelRes('${r.id}')">取消预约</button>`
            : '<span class="muted">—</span>'}
        </td>
      </tr>`).join('');
  },

  badge(status) {
    return `<span class="badge badge-${status}">${status}</span>`;
  },

  cancelRes(id) {
    const r = Store.reservations.find(x => x.id === id);
    if (!r) return;
    if (!confirm(`确认取消 ${r.userName} 的 ${r.seatId} 座位预约？`)) return;
    r.status = '已取消';
    r.violationReason = '管理员取消';
    Store._save();
    toast('已取消该预约');
    this.renderReservations();
  },

  /* ---------------- 座位管理 ---------------- */
  bindSeatSelects() {
    const campusSel = document.getElementById('adm-campus');
    campusSel.innerHTML = CAMPUSES.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    campusSel.addEventListener('change', () => { this.admCampus = campusSel.value; this.syncFloorSelect(); });
    document.getElementById('adm-floor').addEventListener('change', () => {
      this.admFloor = Number(document.getElementById('adm-floor').value);
      this.syncAreaSelect();
    });
    document.getElementById('adm-area').addEventListener('change', () => {
      this.admArea = document.getElementById('adm-area').value;
      this.renderSeatManage();
    });
    document.getElementById('adm-seat-refresh').addEventListener('click', () => this.renderSeatManage());
    this.syncFloorSelect();
  },

  syncFloorSelect() {
    const campus = CAMPUSES.find(c => c.id === this.admCampus);
    const floorSel = document.getElementById('adm-floor');
    floorSel.innerHTML = campus.floors.map(f => `<option value="${f.floor}">${f.name}</option>`).join('');
    this.admFloor = Number(floorSel.value);
    this.syncAreaSelect();
  },

  syncAreaSelect() {
    const campus = CAMPUSES.find(c => c.id === this.admCampus);
    const floor = campus.floors.find(f => f.floor === this.admFloor);
    const areaSel = document.getElementById('adm-area');
    areaSel.innerHTML = floor.areas.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    this.admArea = areaSel.value;
    this.renderSeatManage();
  },

  renderSeatManage() {
    const campus = CAMPUSES.find(c => c.id === this.admCampus);
    const floor = campus.floors.find(f => f.floor === this.admFloor);
    const area = floor.areas.find(a => a.id === this.admArea);
    if (!area) return;

    const canvas = document.getElementById('admin-seat-canvas');
    drawPlanMap(canvas, area, fmtDate(getNow()), {
      admin: true,
      onSeatClick: (el, seat) => this.onAdminSeatClick(seat),
    });

    document.getElementById('adm-seat-detail').classList.add('hidden');
  },

  onAdminSeatClick(seat) {
    const campus = CAMPUSES.find(c => c.id === this.admCampus);
    const floor = campus.floors.find(f => f.floor === this.admFloor);
    const area = floor.areas.find(a => a.id === this.admArea);
    const today = fmtDate(getNow());
    const ranges = seatBusyRanges(seat.id, today);

    const detail = document.getElementById('adm-seat-detail');
    detail.classList.remove('hidden');
    detail.innerHTML = `
      <div class="seat-detail-head">
        <b>${seat.id}</b>
        <span>${campus.name} ${floor.name} · ${area.name}</span>
        <span class="badge ${seat.disabled ? 'badge-违约' : 'badge-已结束'}">${seat.disabled ? '已停用' : '启用中'}</span>
      </div>
      <div class="seat-detail-row">
        <div>
          <div class="seat-detail-label">今日占用时段</div>
          <div class="seat-detail-value">${ranges.length ? ranges.map(r => `${timeToLabel(r.start)}—${timeToLabel(r.end)}`).join('、') : '今日无预约'}</div>
        </div>
        <button class="${seat.disabled ? 'btn-primary' : 'btn-danger'} btn-sm" onclick="Admin.toggleSeat('${seat.id}')">
          ${seat.disabled ? '启用该座位' : '停用该座位'}
        </button>
      </div>`;
  },

  toggleSeat(id) {
    const seat = Store.seats.find(s => s.id === id);
    if (!seat) return;
    if (!seat.disabled) {
      const busy = Store.reservations.some(r => r.seatId === id && (r.status === '待签到' || r.status === '履约中' || r.status === '暂离中'));
      if (busy && !confirm('该座位当前有预约，仍要停用吗？（现有预约不受影响）')) return;
    }
    seat.disabled = !seat.disabled;
    Store._save();
    toast(seat.disabled ? '座位已停用' : '座位已启用');
    this.renderSeatManage();
  },

  /* ---------------- 用户管理 ---------------- */
  renderUsers() {
    runStatusCheck();
    const tbody = document.getElementById('admin-users-tbody');
    const users = Store.users.filter(u => u.role === 'user');
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">暂无用户</td></tr>';
      return;
    }
    tbody.innerHTML = users.map(u => {
      const cnt = Store.reservations.filter(r => r.userId === u.id).length;
      const vCnt = Store.reservations.filter(r => r.userId === u.id && r.status === '违约').length;
      return `
        <tr>
          <td>${u.name}</td>
          <td>${u.studentId}</td>
          <td>${fmtDate(new Date(u.createdAt))}</td>
          <td><span class="badge ${(u.violations || 0) >= 4 ? 'badge-违约' : 'badge-已结束'}">${u.violations || 0}</span></td>
          <td>${cnt}</td>
          <td>
            <button class="btn-ghost btn-sm" onclick="Admin.showViolations('${u.id}')">违约明细${vCnt ? `（${vCnt}）` : ''}</button>
            <button class="btn-ghost btn-sm" onclick="Admin.resetViolations('${u.id}')">清空违约</button>
          </td>
        </tr>`;
    }).join('');
  },

  resetViolations(id) {
    const u = Store.users.find(x => x.id === id);
    if (!u) return;
    if (!confirm(`确认清空 ${u.name}（${u.studentId}）的全部违约记录？`)) return;
    const nowTs = Date.now();
    Store.reservations.forEach(r => {
      if (r.userId === id && r.status === '违约') { r.status = '已撤销'; r.revokedAt = nowTs; }
    });
    u.violations = 0;
    Store._save();
    toast(`已清空 ${u.name} 的违约记录`);
    this.renderUsers();
  },

  /* 一键清空全部用户违约（每月月初） */
  bindUserTools() {
    document.getElementById('adm-clear-all-violations').addEventListener('click', () => {
      const users = Store.users.filter(u => u.role === 'user');
      const anyV = users.some(u => (u.violations || 0) > 0);
      if (!anyV) return toast('当前没有用户存在违约记录');
      if (!confirm('确认一键清空全部用户的本月违约记录（归 0）？\n此操作适合每月月初执行，清空后不可恢复。')) return;
      const nowTs = Date.now();
      Store.reservations.forEach(r => {
        if (r.status === '违约') { r.status = '已撤销'; r.revokedAt = nowTs; }
      });
      users.forEach(u => { u.violations = 0; });
      Store._save();
      toast('已清空全部用户的违约记录');
      this.renderUsers();
    });
  },

  /* 查看某用户的违约明细（每次违约对应一条预约记录） */
  showViolations(id) {
    const u = Store.users.find(x => x.id === id);
    if (!u) return;
    const list = Store.reservations
      .filter(r => r.userId === id && (r.status === '违约' || r.status === '已撤销'))
      .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));

    const title = document.getElementById('violation-modal-title');
    const body = document.getElementById('violation-modal-body');
    title.textContent = `${u.name} · 违约记录（共 ${list.length} 条）`;

    if (!list.length) {
      body.innerHTML = '<div class="empty-box">该用户暂无违约记录</div>';
    } else {
      body.innerHTML = list.map(r => {
        const vAt = r.violationAt ? Admin.fmtDateTime(r.violationAt) : `${r.date} ${timeToLabel(r.startTime)}—${timeToLabel(r.endTime)}`;
        const revoked = r.revokedAt ? `<div class="record-sub revoked-line">✅ 已于 <b>${Admin.fmtDateTime(r.revokedAt)}</b> 撤销</div>` : '';
        const btn = r.status === '违约'
          ? `<button class="btn-primary btn-sm" onclick="Admin.revokeViolation('${r.id}')">撤销此次违约</button>`
          : `<span class="badge badge-revoked">已撤销</span>`;
        return `
        <div class="record-card">
          <div class="record-main">
            <b>${r.date}</b>　${timeToLabel(r.startTime)} — ${timeToLabel(r.endTime)}
            <span class="record-seat">${r.seatId} · ${r.areaName || ''}</span>
            <div class="record-sub">违约时间：${vAt}</div>
            <div class="record-sub">原因：${r.violationReason || '违约'}</div>
            ${revoked}
          </div>
          ${btn}
        </div>`;
      }).join('');
    }
    document.getElementById('violation-modal').classList.remove('hidden');
  },

  /* 时间戳 -> YYYY-MM-DD HH:mm */
  fmtDateTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  },

  /* 撤销某用户的某次违约记录 */
  revokeViolation(resId) {
    const r = Store.reservations.find(x => x.id === resId);
    if (!r || r.status !== '违约') return;
    const u = Store.users.find(x => x.id === r.userId);
    if (!confirm(`确认撤销 ${u.name} 于 ${r.date} ${timeToLabel(r.startTime)}—${timeToLabel(r.endTime)}（${r.seatId}）的违约记录？`)) return;
    r.status = '已撤销';
    r.revokedAt = Date.now();   // 撤销留痕：保留违约原因与时间，追加撤销时刻
    if (u) u.violations = Math.max(0, (u.violations || 0) - 1);
    Store._save();
    toast('已撤销该次违约记录');
    this.closeViolationModal();
    this.renderUsers();
  },

  closeViolationModal() {
    document.getElementById('violation-modal').classList.add('hidden');
  },

  /* ---------------- 公告管理 ---------------- */
  bindNoticeAdd() {
    document.getElementById('adm-notice-add').addEventListener('click', () => {
      const title = document.getElementById('adm-notice-title').value.trim();
      const content = document.getElementById('adm-notice-content').value.trim();
      if (!title || !content) return toast('请填写标题与内容');
      Store.notices.push({ id: 'n_' + Date.now(), title, content, createdAt: Date.now() });
      Store._save();
      document.getElementById('adm-notice-title').value = '';
      document.getElementById('adm-notice-content').value = '';
      toast('公告已发布');
      this.renderNoticeList();
    });
  },

  renderNoticeList() {
    const list = document.getElementById('admin-notice-list');
    const notices = [...Store.notices].sort((a, b) => b.createdAt - a.createdAt);
    if (!notices.length) {
      list.innerHTML = '<div class="empty-box">暂无公告</div>';
      return;
    }
    list.innerHTML = notices.map(n => `
      <div class="notice-card">
        <div class="notice-title">📢 ${n.title}</div>
        <div class="notice-date">${fmtDate(new Date(n.createdAt))}</div>
        <div class="notice-content">${n.content.replace(/\n/g, '<br>')}</div>
        <button class="btn-danger btn-sm" onclick="Admin.deleteNotice('${n.id}')">删除公告</button>
      </div>`).join('');
  },

  deleteNotice(id) {
    const idx = Store.notices.findIndex(n => n.id === id);
    if (idx < 0) return;
    if (!confirm('确认删除该公告？')) return;
    Store.notices.splice(idx, 1);
    Store._save();
    toast('公告已删除');
    this.renderNoticeList();
  },
};

/* Toast（复用用户端样式） */
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2400);
}

document.addEventListener('DOMContentLoaded', () => Admin.init());
