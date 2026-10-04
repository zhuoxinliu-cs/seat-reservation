/* ============================================================
 * 图书馆座位预约系统 · 用户端逻辑
 * ============================================================ */
'use strict';

const SESSION_KEY = 'ccnu_seat_session';

const App = {
  currentUser: null,
  selectedDate: '',            // 'YYYY-MM-DD'
  selectedCampus: 'main',
  selectedFloor: null,         // floor 对象
  selectedArea: null,          // area 对象
  currentSeat: null,           // 预约弹窗当前座位
  recordFilter: 'all',

  /* ---------------- 启动 ---------------- */
  init() {
    runStatusCheck();
    this.bindAuth();
    this.bindNav();
    this.bindRecordFilters();
    this.bindMisc();

    // 恢复登录态
    const uid = sessionStorage.getItem(SESSION_KEY);
    if (uid) {
      const user = Store.users.find(u => u.id === uid);
      if (user) { this.currentUser = user; this.enterApp(); return; }
    }
    this.showAuth();
  },

  /* ---------------- 认证 ---------------- */
  showAuth() {
    document.getElementById('auth-view').classList.remove('hidden');
    document.getElementById('app-view').classList.add('hidden');
  },

  enterApp() {
    document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('app-view').classList.remove('hidden');
    document.getElementById('user-chip').textContent = this.currentUser.name;
    document.getElementById('mine-avatar').textContent = this.currentUser.name.charAt(0);
    document.getElementById('mine-name').textContent = this.currentUser.name;
    document.getElementById('mine-studentid').textContent = `学号 ${this.currentUser.studentId}`;
    this.renderDemoClock();
    this.refreshMineStats();
    this.showView('home');
  },

  bindAuth() {
    const tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(tab => tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isReg = tab.dataset.tab === 'register';
      document.getElementById('login-form').classList.toggle('hidden', isReg);
      document.getElementById('register-form').classList.toggle('hidden', !isReg);
    }));

    document.getElementById('login-form').addEventListener('submit', e => {
      e.preventDefault();
      const account = document.getElementById('login-account').value.trim();
      const pwd = document.getElementById('login-password').value;
      const user = Store.users.find(u => u.studentId === account && u.password === pwd);
      if (!user) return toast('学号或密码错误');
      this.currentUser = user;
      sessionStorage.setItem(SESSION_KEY, user.id);
      this.enterApp();
    });

    document.getElementById('register-form').addEventListener('submit', e => {
      e.preventDefault();
      const name = document.getElementById('reg-name').value.trim();
      const sid = document.getElementById('reg-studentid').value.trim();
      const pwd = document.getElementById('reg-password').value;
      if (!name || !sid) return toast('请填写姓名与学号');
      if (Store.users.some(u => u.studentId === sid)) return toast('该学号已注册，请直接登录');
      const user = { id: 'u_' + Date.now(), name, studentId: sid, password: pwd, role: 'user', violations: 0, createdAt: Date.now() };
      Store.users.push(user);
      Store._save();
      toast('注册成功，请登录');
      document.querySelector('.auth-tab[data-tab="login"]').click();
      document.getElementById('login-account').value = sid;
    });
  },

  /* ---------------- 导航 ---------------- */
  bindNav() {
    document.querySelectorAll('.nav-item, .tab-item').forEach(item => {
      item.addEventListener('click', () => this.showView(item.dataset.view));
    });
    document.getElementById('logout-btn').addEventListener('click', () => {
      this.currentUser = null;
      sessionStorage.removeItem(SESSION_KEY);
      location.reload();
    });
  },

  showView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById('view-' + view);
    if (target) target.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
    document.querySelectorAll('.tab-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
    window.scrollTo(0, 0);

    if (view === 'home') this.renderHome();
    if (view === 'records') this.renderRecords();
    if (view === 'notices') this.renderNotices();
    if (view === 'mine') this.refreshMineStats();
  },

  /* ---------------- 预约选座首页 ---------------- */
  renderHome() {
    const now = getNow();
    const today = fmtDate(now);

    // 日期槽：今天 / 明天
    const slotHtml = [];
    const dates = [today, fmtDate(addDays(now, 1))];
    const ds0 = canReserveDate(today).ok ? today : dates[1];
    const ds1 = dates[1];
    if (this.selectedDate !== ds0 && this.selectedDate !== ds1) this.selectedDate = ds0;

    for (let i = 0; i < dates.length; i++) {
      const ds = dates[i];
      const d = dateFromStr(ds);
      const chk = canReserveDate(ds);
      const active = this.selectedDate === ds ? 'active' : '';
      const disabled = !chk.ok ? 'disabled' : '';
      const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
      const label = i === 0 ? '今天' : '明天';
      slotHtml.push(`
        <button class="date-slot ${active} ${disabled}" data-date="${ds}" ${disabled ? 'disabled' : ''}>
          <span class="date-week">${label} · ${week}</span>
          <span class="date-num">${d.getMonth() + 1}月${d.getDate()}日</span>
          ${disabled ? `<span class="date-tip">${chk.reason}</span>` : ''}
        </button>`);
    }
    document.getElementById('date-slots').innerHTML = slotHtml.join('');
    document.querySelectorAll('.date-slots .date-slot').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('disabled')) return;
        this.selectedDate = btn.dataset.date;
        this.renderHome();
      });
    });

    // 提示语
    const tipEl = document.getElementById('date-rule-tip');
    const chk = canReserveDate(this.selectedDate);
    tipEl.textContent = chk.ok
      ? (this.selectedDate === today ? '今日座位预约中（22:00 截止）' : '次日座位（每日 18:00 起开放预约）')
      : chk.reason;

    // 校区切换
    const campusHtml = CAMPUSES.map(c => `
      <button class="campus-btn ${this.selectedCampus === c.id ? 'active' : ''}" data-campus="${c.id}">
        ${c.name}
      </button>`).join('');
    document.getElementById('campus-switch').innerHTML = campusHtml;
    document.querySelectorAll('.campus-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedCampus = btn.dataset.campus;
        this.selectedFloor = null;
        this.renderHome();
      });
    });
    const campus = CAMPUSES.find(c => c.id === this.selectedCampus);
    document.getElementById('campus-tag').textContent = campus ? campus.short : '';

    // 楼层与区域
    this.renderFloorAreas();
  },

  renderFloorAreas() {
    const wrap = document.getElementById('floor-area-wrap');
    const campus = CAMPUSES.find(c => c.id === this.selectedCampus);
    if (!campus) { wrap.innerHTML = ''; return; }

    // 楼层切换
    const floorTabs = campus.floors.map(f => `
      <button class="floor-tab ${this.selectedFloor && this.selectedFloor.floor === f.floor ? 'active' : ''}" data-floor="${f.floor}">
        ${f.name}
      </button>`).join('');

    const floor = this.selectedFloor || campus.floors[0];
    if (!this.selectedFloor) this.selectedFloor = campus.floors[0];

    const areaCards = floor.areas.map(a => {
      const total = Store.seats.filter(s => s.area === a.id && !s.disabled).length;
      const avail = areaAvailableCount(a.id, campus.id, floor.floor, this.selectedDate);
      return `
        <div class="area-card" data-area="${a.id}">
          <div class="area-info">
            <div class="area-name">${a.name}</div>
            <div class="area-meta">
              <span>共 ${total} 座</span>
              <span class="${avail === 0 ? 'danger' : ''}">可用 ${avail}</span>
            </div>
          </div>
          <div class="area-bar">
            <div class="area-bar-fill" style="width:${total ? Math.round(avail / total * 100) : 0}%"></div>
          </div>
          <button class="btn-primary btn-sm area-enter">查看座位 →</button>
        </div>`;
    }).join('');

    wrap.innerHTML = `
      <div class="floor-tabs">${floorTabs}</div>
      <div class="area-grid">${areaCards}</div>`;

    wrap.querySelectorAll('.floor-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedFloor = campus.floors.find(f => f.floor === Number(btn.dataset.floor));
        this.renderFloorAreas();
      });
    });
    wrap.querySelectorAll('.area-enter').forEach(btn => {
      btn.addEventListener('click', () => {
        const areaId = btn.closest('.area-card').dataset.area;
        this.selectedArea = floor.areas.find(a => a.id === areaId);
        this.renderSeatMap();
      });
    });
  },

  /* ---------------- 座位分布图（平面图：桌子 + 座位 + 过道） ---------------- */
  renderSeatMap() {
    const campus = CAMPUSES.find(c => c.id === this.selectedCampus);
    const area = this.selectedArea;
    document.getElementById('seatmap-area-name').textContent = `${campus.name} · ${area.name}`;
    document.getElementById('seatmap-date-info').textContent = `${this.selectedDate}（${fmtDateCN(dateFromStr(this.selectedDate))}）`;
    this.showViewRaw('seatmap');

    const canvas = document.getElementById('seat-canvas');
    const counts = drawPlanMap(canvas, area, this.selectedDate, {
      onSeatClick: (el, seat) => this.onSeatClick(seat),
    });
    document.getElementById('seatmap-stats').textContent = `可预约 ${counts.free} · 已预约 ${counts.busy}`;
  },

  showViewRaw(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById('view-' + view);
    if (target) target.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
    document.querySelectorAll('.tab-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
    window.scrollTo(0, 0);
  },

  /* ---------------- 座位点击 → 预约弹窗 ---------------- */
  onSeatClick(seat) {
    if (seat.disabled) return toast('该座位已停用');
    const busy = Store.reservations.some(r => r.seatId === seat.id && r.date === this.selectedDate &&
      (r.status === '待签到' || r.status === '履约中' || r.status === '暂离中'));
    if (busy) {
      toast('该座位当日已有预约，请选择其他座位');
      return;
    }
    this.currentSeat = seat;
    const campus = CAMPUSES.find(c => c.id === this.selectedCampus);
    document.getElementById('rseat-id').textContent = seat.id;
    document.getElementById('rseat-loc').textContent = `${campus.name} · ${this.selectedFloor.name} · ${this.selectedArea.name}`;

    // 渲染时间轴（该座位当日占用情况）
    this.renderTimeAxis(seat);

    // 渲染开始/结束下拉
    this.renderTimeSelects(seat);

    document.getElementById('reserve-modal').classList.remove('hidden');
  },

  /* 获取空闲区间 */
  getFreeRanges(seatId) {
    const busy = seatBusyRanges(seatId, this.selectedDate).map(r => [r.start, r.end]);
    const ranges = [];
    let curStart = SLOTS[0].value;
    for (const s of SLOTS) {
      const start = s.value;
      const end = start + SLOT_MIN / 60;
      const isBusy = busy.some(b => start < b[1] && end > b[0]);
      if (!isBusy) {
        // 找到连续空闲的结束
      } else {
        if (start > curStart) ranges.push([curStart, start]);
        curStart = end;
      }
    }
    if (curStart < OPEN_END) ranges.push([curStart, OPEN_END]);
    return ranges;
  },

  renderTimeAxis(seat) {
    const axis = document.getElementById('time-axis');
    const busy = seatBusyRanges(seat.id, this.selectedDate);
    const html = SLOTS.map((s, i) => {
      const start = s.value;
      const end = start + SLOT_MIN / 60;
      const isBusy = busy.some(b => start < b.end && end > b.start);
      return `<div class="slot-cell ${isBusy ? 'busy' : 'free'}" title="${s.label}">${i % 2 === 0 ? s.label.slice(0, 2) : ''}</div>`;
    }).join('');
    axis.innerHTML = html;
  },

  renderTimeSelects(seat) {
    const ranges = this.getFreeRanges(seat.id);
    const startSel = document.getElementById('r-start');
    const endSel = document.getElementById('r-end');
    startSel.innerHTML = '';
    endSel.innerHTML = '<option value="">请选择结束时间</option>';

    // 今天：开始时间不能早于当前时间（向上取整到 30 分钟）
    const now = getNow();
    let minStart = OPEN_START;
    if (this.selectedDate === fmtDate(now)) {
      minStart = Math.max(OPEN_START, Math.ceil((now.getHours() + now.getMinutes() / 60 - 0.01) / 0.5) * 0.5);
    }

    ranges.forEach(r => {
      const s = Math.max(r[0], minStart);
      if (s < r[1]) {
        startSel.innerHTML += `<option value="${s}">${timeToLabel(s)}</option>`;
      }
    });
    if (!startSel.options.length) {
      startSel.innerHTML = '<option value="">今日无可预约时段</option>';
      document.getElementById('r-confirm').disabled = true;
    } else {
      document.getElementById('r-confirm').disabled = false;
    }

    startSel.addEventListener('change', () => {
      this.fillEndOptions(seat);
    });
    this.fillEndOptions(seat);
  },

  fillEndOptions(seat) {
    const start = Number(document.getElementById('r-start').value);
    const endSel = document.getElementById('r-end');
    endSel.innerHTML = '<option value="">请选择结束时间</option>';
    if (!start) return;
    const ranges = this.getFreeRanges(seat.id);
    const range = ranges.find(r => start >= r[0] && start < r[1]);
    if (!range) return;
    for (let t = start + SLOT_MIN / 60; t <= range[1]; t += SLOT_MIN / 60) {
      endSel.innerHTML += `<option value="${t}">${timeToLabel(t)}</option>`;
    }
  },

  closeReserveModal() {
    document.getElementById('reserve-modal').classList.add('hidden');
    this.currentSeat = null;
  },

  /* 确认预约 */
  confirmReserve() {
    const seat = this.currentSeat;
    const start = Number(document.getElementById('r-start').value);
    const end = Number(document.getElementById('r-end').value);
    if (!seat || !start) return toast('请选择开始时间');
    if (!end || end <= start) return toast('请选择有效的结束时间');

    // 再次校验该时段是否被占（防止并发）
    if (isSlotBusy(seat.id, this.selectedDate, start, end)) return toast('该时段刚刚被预约，请重新选择');

    // 规则①：同一日期最多预约 2 个时段
    const ACTIVE_STATUS = ['待签到', '履约中', '暂离中'];
    const myDay = Store.reservations.filter(r => r.userId === this.currentUser.id
      && r.date === this.selectedDate && ACTIVE_STATUS.includes(r.status));
    if (myDay.length >= 2)
      return toast('每人每天最多预约 2 个时段，请等待已有预约结束或取消后再约');

    // 规则②：同一日期内时段不得与其他预约时间冲突（不同座位也不可重叠）
    const clash = myDay.find(r => start < r.endTime && end > r.startTime);
    if (clash)
      return toast(`与 ${clash.seatId} 号座位 ${timeToLabel(clash.startTime)}-${timeToLabel(clash.endTime)} 的时段冲突，请重新选择`);

    const res = {
      id: 'r_' + Date.now(),
      userId: this.currentUser.id,
      userName: this.currentUser.name,
      date: this.selectedDate,
      campus: this.selectedCampus,
      floorName: this.selectedFloor.name,
      areaName: this.selectedArea.name,
      seatId: seat.id,
      startTime: start,
      endTime: end,
      status: '待签到',
      createdAt: Date.now(),
      signInTime: null, leaveTime: null, returnTime: null, endLeaveTime: null,
      violationReason: null,
    };
    Store.reservations.push(res);
    Store._save();
    this.closeReserveModal();
    this.showSuccessModal(res);
  },

  /* ---------------- 预约成功弹窗（含签到提醒 + 天气） ---------------- */
  async showSuccessModal(res) {
    const campus = CAMPUSES.find(c => c.id === res.campus);
    document.getElementById('s-seat-id').textContent = `${res.seatId} 号座位`;
    document.getElementById('s-seat-loc').textContent = `${campus.name} ${res.floorName} ${res.areaName}`;
    document.getElementById('s-time').textContent =
      `${res.date} ${timeToLabel(res.startTime)} — ${timeToLabel(res.endTime)}`;

    // 签到窗口
    const winStart = timeToLabel(res.startTime - SIGNIN_WINDOW / 60);
    const winEnd = timeToLabel(res.startTime + SIGNIN_WINDOW / 60);
    document.getElementById('s-signin-text').textContent =
      `请于预约时间点（${timeToLabel(res.startTime)}）前后 30 分钟内完成签到，即 ${winStart} — ${winEnd} 之间。超时未签到将记为违约并释放座位。`;

    // 天气
    const wBox = document.getElementById('s-weather');
    wBox.innerHTML = '<div class="weather-loading">⏳ 正在获取当天天气…</div>';
    document.getElementById('success-modal').classList.remove('hidden');
    try {
      const w = await Weather.fetchByDate(res.date);
      const tips = Weather.adviceFor(w.tmax, w.tmin, w.code);
      wBox.innerHTML = `
        <div class="weather-card ${w.demo ? 'demo' : ''}">
          <div class="weather-main">
            <span class="weather-icon">${w.info.icon}</span>
            <span class="weather-text">${res.date} ${w.info.text}</span>
            <span class="weather-temp">${Math.round(w.tmin)}° ~ ${Math.round(w.tmax)}°</span>
          </div>
          <div class="weather-tips">
            ${tips.map(t => `<span>💡 ${t}</span>`).join('')}
            ${w.demo ? '<span class="weather-demo-tag">（离线演示天气数据）</span>' : ''}
          </div>
        </div>`;
    } catch (e) {
      wBox.innerHTML = '<div class="weather-card demo">天气服务暂不可用，请留意当天天气变化。</div>';
    }
  },

  closeSuccessModal() {
    document.getElementById('success-modal').classList.add('hidden');
    this.renderHome();
  },

  /* ---------------- 预约记录 ---------------- */
  bindRecordFilters() {
    document.querySelectorAll('.chip-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.chip-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.recordFilter = btn.dataset.filter;
        this.renderRecords();
      });
    });
  },

  renderRecords() {
    runStatusCheck();
    const list = document.getElementById('record-list');
    let mine = Store.reservations.filter(r => r.userId === this.currentUser.id)
      .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime) || b.startTime - a.startTime);
    if (this.recordFilter !== 'all') mine = mine.filter(r => r.status === this.recordFilter);

    if (!mine.length) {
      list.innerHTML = `<div class="empty-box">暂无${this.recordFilter !== 'all' ? this.recordFilter : ''}预约记录<br>去「预约选座」预约一个座位吧</div>`;
      return;
    }

    const campusMap = {};
    CAMPUSES.forEach(c => campusMap[c.id] = c.short);

    list.innerHTML = mine.map(r => {
      const st = this.statusBadge(r.status);
      const dateLabel = r.date.slice(5).replace('-', '/');
      return `
        <div class="record-card status-${r.status}" data-id="${r.id}">
          <div class="record-head">
            <span class="record-seat">${r.seatId}</span>
            <span class="record-status">${st}</span>
          </div>
          <div class="record-meta">
            <span>${dateLabel} ${timeToLabel(r.startTime)}—${timeToLabel(r.endTime)}</span>
            <span>${campusMap[r.campus] || r.campus} · ${r.areaName}</span>
          </div>
          ${r.status === '违约' && r.violationReason ? `<div class="record-violation">⚠️ ${r.violationReason}</div>` : ''}
          ${r.status === '已撤销' ? `<div class="record-violation revoked">✅ 该次违约已由管理员撤销${r.revokedAt ? `（${App.fmtDateTime(r.revokedAt)}）` : ''}</div>` : ''}
          <button class="btn-ghost btn-sm record-open">查看详情 →</button>
        </div>`;
    }).join('');

    list.querySelectorAll('.record-open').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.closest('.record-card').dataset.id;
        this.showRecordDetail(id);
      });
    });
  },

  fmtDateTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  },

  statusBadge(status) {
    const map = { '待签到': '待签到', '履约中': '履约中', '暂离中': '暂离中', '已结束': '已结束', '违约': '违约', '已撤销': '已撤销' };
    return `<span class="badge badge-${status}">${map[status] || status}</span>`;
  },

  /* 预约详情 */
  showRecordDetail(id) {
    const r = Store.reservations.find(x => x.id === id);
    if (!r) return;
    const campus = CAMPUSES.find(c => c.id === r.campus);
    const now = getNow();
    const body = document.getElementById('detail-body');

    // 时间线
    const tl = [];
    tl.push({ time: r.startTime, label: '预约开始', desc: `${r.seatId} 座位开始使用` });
    if (r.signInTime !== null) tl.push({ time: r.signInTime, label: '签到', desc: '已按时签到，座位生效' });
    if (r.leaveTime !== null) tl.push({ time: r.leaveTime, label: '暂离', desc: '暂离座位（保留 90 分钟）' });
    if (r.returnTime !== null) tl.push({ time: r.returnTime, label: '回馆', desc: '返回座位，恢复使用' });
    if (r.endLeaveTime !== null) tl.push({ time: r.endLeaveTime, label: '结束预约', desc: '离馆，预约结束' });
    if (r.status === '违约' || r.status === '已撤销') tl.push({
      time: r.violationAt ? (new Date(r.violationAt).getHours() + new Date(r.violationAt).getMinutes() / 60) : r.endTime,
      label: '违约', desc: r.violationReason || '未按规定履约', danger: true
    });
    if (r.revokedAt) tl.push({ time: new Date(r.revokedAt).getHours() + new Date(r.revokedAt).getMinutes() / 60, label: '撤销违约', desc: '管理员核实后撤销该次违约', ok: true });
    if (r.status === '已取消' && r.cancelTime !== null) tl.push({ time: r.cancelTime, label: '取消预约', desc: r.violationReason || '预约已取消' });

    const tlHtml = tl.map((t, i) => `
      <div class="tl-item ${t.danger ? 'tl-danger' : ''} ${t.ok ? 'tl-ok' : ''}">
        <div class="tl-dot"></div>
        <div class="tl-content">
          <div class="tl-time">${timeToLabel(t.time)}</div>
          <div class="tl-label">${t.label}</div>
          <div class="tl-desc">${t.desc}</div>
        </div>
        ${i < tl.length - 1 ? '<div class="tl-line"></div>' : ''}
      </div>`).join('');

    body.innerHTML = `
      <div class="detail-info">
        <div class="detail-seat">${r.seatId} 号座位</div>
        <div class="detail-loc">${campus ? campus.name : ''} ${r.floorName} · ${r.areaName}</div>
        <div class="detail-time">${r.date} ${timeToLabel(r.startTime)} — ${timeToLabel(r.endTime)}</div>
        <div class="detail-status">${this.statusBadge(r.status)}</div>
      </div>
      <div class="detail-timeline">${tlHtml}</div>`;

    // 操作按钮
    const actions = document.getElementById('detail-actions');
    actions.innerHTML = '';

    if (r.status === '待签到') {
      const startDt = new Date(dateFromStr(r.date).getTime() + r.startTime * 3600000);
      const inWindow = now.getTime() >= startDt.getTime() - SIGNIN_WINDOW * 60000 &&
                       now.getTime() <= startDt.getTime() + SIGNIN_WINDOW * 60000;
      const beforeWindow = now.getTime() < startDt.getTime() - SIGNIN_WINDOW * 60000;
      if (inWindow) {
        actions.innerHTML = `
          <button class="btn-primary" onclick="App.doSignIn('${r.id}')">✅ 现在签到</button>
          <button class="btn-danger" onclick="App.cancelRes('${r.id}')">取消预约</button>`;
      } else if (beforeWindow) {
        actions.innerHTML = `
          <span class="action-hint">签到窗口：${timeToLabel(r.startTime - 0.5)} — ${timeToLabel(r.startTime + 0.5)}</span>
          <button class="btn-danger" onclick="App.cancelRes('${r.id}')">取消预约</button>`;
      }
    } else if (r.status === '履约中') {
      actions.innerHTML = `
        <button class="btn-ghost" onclick="App.doLeave('${r.id}')">🚶 暂离</button>
        <button class="btn-primary" onclick="App.doEnd('${r.id}')">🏁 结束预约</button>`;
    } else if (r.status === '暂离中') {
      actions.innerHTML = `<button class="btn-primary" onclick="App.doReturn('${r.id}')">↩️ 回馆（恢复座位）</button>`;
    } else {
      actions.innerHTML = `<button class="btn-ghost" onclick="App.closeDetailModal()">关闭</button>`;
    }

    document.getElementById('detail-modal').classList.remove('hidden');
  },

  closeDetailModal() {
    document.getElementById('detail-modal').classList.add('hidden');
    this.renderRecords();
  },

  /* 操作：签到 / 暂离 / 回馆 / 结束 */
  doSignIn(id) {
    const r = Store.reservations.find(x => x.id === id);
    if (!r) return;
    const now = getNow();
    const t = now.getHours() + now.getMinutes() / 60;
    r.signInTime = Math.max(r.startTime - 0.5, Math.min(r.startTime + 0.5, Math.round(t * 2) / 2));
    r.status = '履约中';
    Store._save();
    toast('签到成功，座位已生效');
    this.closeDetailModal();
  },

  /* 未签到时取消预约 */
  cancelRes(id) {
    const r = Store.reservations.find(x => x.id === id);
    if (!r) return;
    if (r.status !== '待签到') return toast('当前状态不可取消');
    if (!confirm(`确认取消 ${r.seatId} 座位 ${timeToLabel(r.startTime)}—${timeToLabel(r.endTime)} 的预约？取消后座位将释放。`)) return;
    const now = getNow();
    r.status = '已取消';
    r.cancelTime = Math.round((now.getHours() + now.getMinutes() / 60) * 2) / 2;
    r.violationReason = '用户取消';
    Store._save();
    toast('预约已取消，座位已释放');
    this.closeDetailModal();
  },

  doLeave(id) {
    const r = Store.reservations.find(x => x.id === id);
    if (!r) return;
    const now = getNow();
    r.leaveTime = Math.round((now.getHours() + now.getMinutes() / 60) * 2) / 2;
    r.status = '暂离中';
    Store._save();
    toast('已暂离，座位为您保留 90 分钟');
    this.closeDetailModal();
  },

  doReturn(id) {
    const r = Store.reservations.find(x => x.id === id);
    if (!r) return;
    const now = getNow();
    r.returnTime = Math.round((now.getHours() + now.getMinutes() / 60) * 2) / 2;
    r.status = '履约中';
    Store._save();
    toast('已回馆，座位恢复使用');
    this.closeDetailModal();
  },

  doEnd(id) {
    const r = Store.reservations.find(x => x.id === id);
    if (!r) return;
    const now = getNow();
    r.endLeaveTime = Math.round((now.getHours() + now.getMinutes() / 60) * 2) / 2;
    r.status = '已结束';
    Store._save();
    toast('预约已结束，感谢使用');
    this.closeDetailModal();
  },

  /* ---------------- 通知公告 ---------------- */
  renderNotices() {
    const list = document.getElementById('notice-list');
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
      </div>`).join('');
  },

  /* ---------------- 我的 ---------------- */
  refreshMineStats() {
    if (!this.currentUser) return;
    const u = Store.users.find(x => x.id === this.currentUser.id) || this.currentUser;
    const mine = Store.reservations.filter(r => r.userId === u.id);
    document.getElementById('mine-total').textContent = mine.length;
    document.getElementById('mine-violations').textContent = u.violations || 0;
    document.getElementById('mine-active').textContent =
      mine.filter(r => r.status === '履约中' || r.status === '暂离中').length;
  },

  /* ---------------- 演示时间 ---------------- */
  renderDemoClock() {
    const dt = Store.load().demoTime;
    const el = document.getElementById('demo-clock-text');
    el.textContent = dt ? `演示 ${fmtDate(new Date(dt))} ${timeToLabel(new Date(dt).getHours() + new Date(dt).getMinutes() / 60)}` : '真实时间';
    document.getElementById('demo-clock-btn').classList.toggle('active', !!dt);
  },

  bindMisc() {
    document.getElementById('demo-clock-btn').addEventListener('click', () => {
      const now = getNow();
      const pad = n => String(n).padStart(2, '0');
      document.getElementById('demo-time-input').value =
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
      document.getElementById('demo-modal').classList.remove('hidden');
    });
    document.getElementById('mine-reset').addEventListener('click', () => {
      if (!confirm('确定清空本机全部预约与用户数据？系统将恢复初始状态（仅影响本浏览器）。')) return;
      Store._clear();
      sessionStorage.clear();
      location.reload();
    });
    document.getElementById('mine-about').addEventListener('click', () => {
      const body = document.getElementById('about-body');
      body.innerHTML = `
        <p><b>开放时间</b>：周一至周日 7:30—22:00（周五 14:00 后闭馆）</p>
        <p><b>预约规则</b>：可预约当日与次日座位；次日座位每日 18:00 起开放预约；当日 22:00 后停止预约。每人每天最多预约 2 个时段，且同一日期内不同座位的时段不可重叠（如已约 10:00—12:00，可再约另一座位 13:00—18:00，但不能约 12:00—15:00）。</p>
        <p><b>签到规则</b>：预约时间点前后 30 分钟内签到；超时未签到记违约 1 次并释放座位。</p>
        <p><b>暂离规则</b>：暂离保留座位 90 分钟，超时未返回记违约并释放座位。</p>
        <p><b>违约上限</b>：每月 4 次违约后暂停使用预约系统 7 天。</p>`;
      document.getElementById('about-modal').classList.remove('hidden');
    });
    document.getElementById('seatmap-back').addEventListener('click', () => this.showView('home'));
  },

  closeAboutModal() { document.getElementById('about-modal').classList.add('hidden'); },
  closeDemoModal() { document.getElementById('demo-modal').classList.add('hidden'); },

  setDemoQuick(minutes) {
    const now = getNow();
    this.setDemoTimeAt(new Date(now.getTime() + minutes * 60000));
  },

  applyDemoTime() {
    const v = document.getElementById('demo-time-input').value;
    if (!v) return toast('请选择时间');
    this.setDemoTimeAt(new Date(v));
  },

  setDemoTimeAt(d) {
    Store.setDemoTime(d.toISOString());
    toast('演示时间已应用');
    document.getElementById('demo-modal').classList.add('hidden');
    this.renderDemoClock();
    this.showView('home');
  },

  setDemoOff() {
    Store.setDemoTime(null);
    toast('已恢复真实时间');
    document.getElementById('demo-modal').classList.add('hidden');
    this.renderDemoClock();
    this.showView('home');
  },
};

/* ---------------- Toast ---------------- */
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

/* ---------------- 启动 ---------------- */
document.addEventListener('DOMContentLoaded', () => App.init());
