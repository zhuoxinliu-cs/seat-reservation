/* ============================================================
 * 图书馆座位预约系统 · 数据模型与存储服务
 * 纯前端实现：座位/预约/用户数据保存在 localStorage
 * 说明：座位分布、开放规则参考 CCNU 图书馆座位预约，界面为原创美化
 * ============================================================ */

'use strict';

/* ---------------- 常量 ---------------- */
const OPEN_START = 7.5;      // 开放开始时间（7:30）
const OPEN_END = 22;         // 开放结束时间（22:00）
const SLOT_MIN = 30;         // 时段粒度（分钟）
const SIGNIN_WINDOW = 30;    // 签到窗口（预约点前后 30 分钟）
const LEAVE_KEEP_MIN = 90;   // 暂离保留时长（分钟）
const MAX_VIOLATIONS = 4;    // 每月违约上限
const STORE_KEY = 'ccnu_seat_reservation_v1';

/* 时段序列：7:30 ~ 21:30，共 30 个可开始时段 */
const SLOTS = (() => {
  const arr = [];
  let t = OPEN_START;
  while (t < OPEN_END) {
    const h = Math.floor(t);
    const m = Math.round((t - h) * 60);
    arr.push({ label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, value: t });
    t += SLOT_MIN / 60;
  }
  return arr;
})();

/* ---------------- 校区 / 楼层 / 区域与座位布局 ---------------- */
/*
 * 布局采用"平面图"模式：每个区域用 plan 描述桌子的排布，
 * 支持多种桌型，桌与桌之间自然留出过道，避免死板网格。
 *
 * 桌型（k）：
 *  round   圆桌：4 人围坐（上/右/下/左）
 *  long    对坐长桌：上下两排面对面（n 对座，如 n=3 → 6 座）
 *  single  单人桌：1 人 1 桌
 *  side    单排长桌：一侧 n 座（像自习长桌）
 *  diag    斜对长桌：上下两排错位（斜向面对面）
 *  room    静音自习间：独立小房间，1 座
 *  aisle   过道（视觉分隔，不产生座位）
 * x / y 为桌子中心在画布上的坐标（画布逻辑宽 780px）
 */
const CAMPUSES = [
  {
    id: 'main', name: '主校区图书馆', short: '主馆',
    floors: [
      {
        floor: 1, name: '主馆一楼',
        areas: [
          {
            id: 'M1A', name: '大厅开敞学习区', prefix: 'M101', H: 470,
            plan: [
              { k: 'aisle', x: 382, y: 30, w: 26, h: 410, v: true, label: '过道' },
              { k: 'long',  x: 115, y: 95,  n: 3, label: '对坐长桌' },
              { k: 'long',  x: 275, y: 95,  n: 3, label: '对坐长桌' },
              { k: 'single', x: 115, y: 330, label: '单人桌' },
              { k: 'single', x: 215, y: 330, label: '单人桌' },
              { k: 'side',  x: 315, y: 330, n: 4, label: '单排长桌' },
              { k: 'round', x: 520, y: 100, label: '圆桌 1' },
              { k: 'round', x: 660, y: 100, label: '圆桌 2' },
              { k: 'side',  x: 515, y: 330, n: 4, label: '单排长桌' },
              { k: 'side',  x: 665, y: 330, n: 4, label: '单排长桌' },
            ]
          },
          {
            id: 'M1B', name: '第一自习室', prefix: 'M102', H: 500,
            plan: [
              { k: 'aisle', x: 330, y: 30, w: 26, h: 440, v: true, label: '过道' },
              { k: 'side', x: 140, y: 95,  n: 4, label: '自习桌' },
              { k: 'side', x: 140, y: 240, n: 4, label: '自习桌' },
              { k: 'side', x: 140, y: 385, n: 4, label: '自习桌' },
              { k: 'side', x: 430, y: 95,  n: 4, label: '自习桌' },
              { k: 'side', x: 430, y: 240, n: 4, label: '自习桌' },
              { k: 'side', x: 430, y: 385, n: 4, label: '自习桌' },
              { k: 'single', x: 600, y: 140, label: '单人桌' },
              { k: 'single', x: 680, y: 140, label: '单人桌' },
              { k: 'single', x: 600, y: 300, label: '单人桌' },
              { k: 'single', x: 680, y: 300, label: '单人桌' },
            ]
          },
          {
            id: 'M1C', name: '报刊阅览区', prefix: 'M103', H: 430,
            plan: [
              { k: 'round', x: 120, y: 130, label: '圆桌 1' },
              { k: 'round', x: 290, y: 130, label: '圆桌 2' },
              { k: 'round', x: 460, y: 130, label: '圆桌 3' },
              { k: 'round', x: 630, y: 130, label: '圆桌 4' },
              { k: 'single', x: 140, y: 340, label: '单人桌' },
              { k: 'single', x: 250, y: 340, label: '单人桌' },
              { k: 'single', x: 530, y: 340, label: '单人桌' },
              { k: 'single', x: 640, y: 340, label: '单人桌' },
            ]
          },
        ]
      },
      {
        floor: 2, name: '主馆二楼',
        areas: [
          {
            id: 'M2A', name: '静音自习区', prefix: 'M201', H: 470,
            plan: [
              { k: 'aisle', x: 382, y: 30, w: 26, h: 410, v: true, label: '过道' },
              { k: 'long',  x: 115, y: 95,  n: 3, label: '对坐长桌' },
              { k: 'long',  x: 285, y: 95,  n: 3, label: '对坐长桌' },
              { k: 'side',  x: 135, y: 330, n: 4, label: '单排长桌' },
              { k: 'side',  x: 300, y: 330, n: 4, label: '单排长桌' },
              { k: 'round', x: 520, y: 100, label: '圆桌 1' },
              { k: 'round', x: 660, y: 100, label: '圆桌 2' },
              { k: 'single', x: 505, y: 330, label: '单人桌' },
              { k: 'single', x: 595, y: 330, label: '单人桌' },
              { k: 'single', x: 685, y: 330, label: '单人桌' },
            ]
          },
          {
            id: 'M2B', name: '双人卡座区', prefix: 'M202', H: 470,
            plan: [
              { k: 'booth2', x: 140, y: 115, label: '双人卡座' },
              { k: 'booth2', x: 390, y: 115, label: '双人卡座' },
              { k: 'booth2', x: 640, y: 115, label: '双人卡座' },
              { k: 'booth2', x: 140, y: 345, label: '双人卡座' },
              { k: 'booth2', x: 390, y: 345, label: '双人卡座' },
              { k: 'booth2', x: 640, y: 345, label: '双人卡座' },
            ]
          },
          {
            id: 'M2C', name: '电子阅览区', prefix: 'M203', H: 450, pc: true,
            plan: [
              { k: 'diag', x: 135, y: 130, n: 2, label: '斜对桌' },
              { k: 'diag', x: 385, y: 130, n: 2, label: '斜对桌' },
              { k: 'diag', x: 135, y: 330, n: 2, label: '斜对桌' },
              { k: 'diag', x: 385, y: 330, n: 2, label: '斜对桌' },
              { k: 'side', x: 625, y: 130, n: 4, label: '电子桌' },
              { k: 'side', x: 625, y: 330, n: 4, label: '电子桌' },
            ]
          },
        ]
      },
      {
        floor: 3, name: '主馆三楼',
        areas: [
          {
            id: 'M3A', name: '学术研讨室', prefix: 'M301', H: 470,
            plan: [
              { k: 'round', x: 120, y: 125, label: '研讨桌 1' },
              { k: 'round', x: 300, y: 125, label: '研讨桌 2' },
              { k: 'round', x: 480, y: 125, label: '研讨桌 3' },
              { k: 'round', x: 660, y: 125, label: '研讨桌 4' },
              { k: 'round', x: 390, y: 350, label: '研讨桌 5' },
            ]
          },
          {
            id: 'M3B', name: '中庭环形阅读区', prefix: 'M302', H: 520,
            plan: [
              { k: 'side', x: 390, y: 70,  n: 6, label: '靠墙长桌' },
              { k: 'side', x: 390, y: 455, n: 6, label: '靠墙长桌' },
              { k: 'round', x: 115, y: 165, label: '圆桌' },
              { k: 'round', x: 665, y: 165, label: '圆桌' },
              { k: 'round', x: 115, y: 360, label: '圆桌' },
              { k: 'round', x: 665, y: 360, label: '圆桌' },
            ]
          },
        ]
      },
    ]
  },
  {
    id: 'nanhu', name: '南湖分馆', short: '南湖',
    floors: [
      {
        floor: 1, name: '南湖分馆一楼',
        areas: [
          {
            id: 'N1A', name: '开敞座位区', prefix: 'N101', H: 470,
            plan: [
              { k: 'aisle', x: 382, y: 30, w: 26, h: 410, v: true, label: '过道' },
              { k: 'long',  x: 115, y: 95,  n: 3, label: '对坐长桌' },
              { k: 'long',  x: 275, y: 95,  n: 3, label: '对坐长桌' },
              { k: 'single', x: 115, y: 330, label: '单人桌' },
              { k: 'single', x: 215, y: 330, label: '单人桌' },
              { k: 'side',  x: 315, y: 330, n: 4, label: '单排长桌' },
              { k: 'round', x: 520, y: 100, label: '圆桌 1' },
              { k: 'round', x: 660, y: 100, label: '圆桌 2' },
              { k: 'side',  x: 515, y: 330, n: 4, label: '单排长桌' },
              { k: 'side',  x: 665, y: 330, n: 4, label: '单排长桌' },
            ]
          },
          {
            id: 'N1B', name: '中庭开敞座位区', prefix: 'N102', H: 520,
            plan: [
              { k: 'side', x: 390, y: 70,  n: 6, label: '靠墙长桌' },
              { k: 'side', x: 390, y: 455, n: 6, label: '靠墙长桌' },
              { k: 'round', x: 115, y: 165, label: '圆桌' },
              { k: 'round', x: 665, y: 165, label: '圆桌' },
              { k: 'round', x: 115, y: 360, label: '圆桌' },
              { k: 'round', x: 665, y: 360, label: '圆桌' },
            ]
          },
          {
            id: 'N1C', name: '南湖一楼自习室', prefix: 'N103', H: 500,
            plan: [
              { k: 'aisle', x: 330, y: 30, w: 26, h: 440, v: true, label: '过道' },
              { k: 'side', x: 140, y: 95,  n: 4, label: '自习桌' },
              { k: 'side', x: 140, y: 240, n: 4, label: '自习桌' },
              { k: 'side', x: 140, y: 385, n: 4, label: '自习桌' },
              { k: 'side', x: 430, y: 95,  n: 4, label: '自习桌' },
              { k: 'side', x: 430, y: 240, n: 4, label: '自习桌' },
              { k: 'side', x: 430, y: 385, n: 4, label: '自习桌' },
              { k: 'single', x: 600, y: 140, label: '单人桌' },
              { k: 'single', x: 680, y: 140, label: '单人桌' },
              { k: 'single', x: 600, y: 300, label: '单人桌' },
              { k: 'single', x: 680, y: 300, label: '单人桌' },
            ]
          },
          {
            id: 'N1D', name: '静音自习间', prefix: 'N104', H: 470,
            plan: [
              { k: 'room', x: 100, y: 90,  label: '自习间' }, { k: 'room', x: 230, y: 90,  label: '自习间' },
              { k: 'room', x: 100, y: 230, label: '自习间' }, { k: 'room', x: 230, y: 230, label: '自习间' },
              { k: 'room', x: 100, y: 370, label: '自习间' }, { k: 'room', x: 230, y: 370, label: '自习间' },
              { k: 'room', x: 470, y: 90,  label: '自习间' }, { k: 'room', x: 600, y: 90,  label: '自习间' },
              { k: 'room', x: 470, y: 230, label: '自习间' }, { k: 'room', x: 600, y: 230, label: '自习间' },
              { k: 'room', x: 470, y: 370, label: '自习间' }, { k: 'room', x: 600, y: 370, label: '自习间' },
              { k: 'round', x: 390, y: 230, label: '讨论圆桌' },
            ]
          },
        ]
      },
      {
        floor: 2, name: '南湖分馆二楼',
        areas: [
          {
            id: 'N2A', name: '培训室', prefix: 'N201', H: 460,
            plan: [
              { k: 'diag', x: 135, y: 125, n: 2, label: '斜对桌' },
              { k: 'diag', x: 385, y: 125, n: 2, label: '斜对桌' },
              { k: 'diag', x: 135, y: 335, n: 2, label: '斜对桌' },
              { k: 'diag', x: 385, y: 335, n: 2, label: '斜对桌' },
              { k: 'single', x: 615, y: 150, label: '侧桌' },
              { k: 'single', x: 700, y: 150, label: '侧桌' },
              { k: 'single', x: 615, y: 330, label: '侧桌' },
              { k: 'single', x: 700, y: 330, label: '侧桌' },
            ]
          },
          {
            id: 'N2B', name: '卡座区', prefix: 'N202', H: 480,
            plan: [
            { k: 'aisle', x: 390, y: 60, w: 26, h: 390, v: true, label: '过道' },
            { k: 'booth', x: 105, y: 66, label: '单人卡座' },
            { k: 'booth', x: 105, y: 116, label: '单人卡座' },
            { k: 'booth', x: 105, y: 166, label: '单人卡座' },
            { k: 'booth', x: 105, y: 216, label: '单人卡座' },
            { k: 'booth', x: 105, y: 266, label: '单人卡座' },
            { k: 'booth', x: 105, y: 316, label: '单人卡座' },
            { k: 'booth', x: 105, y: 366, label: '单人卡座' },
            { k: 'booth', x: 105, y: 416, label: '单人卡座' },
            { k: 'booth', x: 675, y: 66, label: '单人卡座' },
            { k: 'booth', x: 675, y: 116, label: '单人卡座' },
            { k: 'booth', x: 675, y: 166, label: '单人卡座' },
            { k: 'booth', x: 675, y: 216, label: '单人卡座' },
            { k: 'booth', x: 675, y: 266, label: '单人卡座' },
            { k: 'booth', x: 675, y: 316, label: '单人卡座' },
            { k: 'booth', x: 675, y: 366, label: '单人卡座' },
            { k: 'booth', x: 675, y: 416, label: '单人卡座' },
            { k: 'booth2', x: 305, y: 80, label: '双人卡座' },
            { k: 'booth2', x: 305, y: 135, label: '双人卡座' },
            { k: 'booth2', x: 305, y: 190, label: '双人卡座' },
            { k: 'booth2', x: 305, y: 245, label: '双人卡座' },
            { k: 'booth2', x: 305, y: 300, label: '双人卡座' },
            { k: 'booth2', x: 305, y: 355, label: '双人卡座' },
            { k: 'booth2', x: 305, y: 410, label: '双人卡座' },
            { k: 'booth2', x: 475, y: 80, label: '双人卡座' },
            { k: 'booth2', x: 475, y: 135, label: '双人卡座' },
            { k: 'booth2', x: 475, y: 190, label: '双人卡座' },
            { k: 'booth2', x: 475, y: 245, label: '双人卡座' },
            { k: 'booth2', x: 475, y: 300, label: '双人卡座' },
            { k: 'booth2', x: 475, y: 355, label: '双人卡座' },
            { k: 'booth2', x: 475, y: 410, label: '双人卡座' },
            ]
          },
          {
            id: 'N2C', name: '圆桌讨论区', prefix: 'N203', H: 470,
            plan: [
              { k: 'round', x: 140, y: 125, label: '圆桌 1' },
              { k: 'round', x: 390, y: 125, label: '圆桌 2' },
              { k: 'round', x: 640, y: 125, label: '圆桌 3' },
              { k: 'round', x: 140, y: 345, label: '圆桌 4' },
              { k: 'round', x: 390, y: 345, label: '圆桌 5' },
              { k: 'round', x: 640, y: 345, label: '圆桌 6' },
            ]
          },
          {
            id: 'N2D', name: '二楼开敞座位区', prefix: 'N204', H: 470,
            plan: [
              { k: 'aisle', x: 382, y: 30, w: 26, h: 410, v: true, label: '过道' },
              { k: 'long',  x: 115, y: 95,  n: 3, label: '对坐长桌' },
              { k: 'long',  x: 285, y: 95,  n: 3, label: '对坐长桌' },
              { k: 'side',  x: 135, y: 330, n: 4, label: '单排长桌' },
              { k: 'side',  x: 300, y: 330, n: 4, label: '单排长桌' },
              { k: 'round', x: 520, y: 100, label: '圆桌 1' },
              { k: 'round', x: 660, y: 100, label: '圆桌 2' },
              { k: 'single', x: 505, y: 330, label: '单人桌' },
              { k: 'single', x: 595, y: 330, label: '单人桌' },
              { k: 'single', x: 685, y: 330, label: '单人桌' },
            ]
          },
        ]
      },
    ]
  },
];

/* ---------------- 座位生成（按桌子平面图展开） ---------------- */
function buildSeats() {
  const seats = [];
  CAMPUSES.forEach((campus) => {
    campus.floors.forEach((floor) => {
      floor.areas.forEach((area) => {
        const base = area.prefix;
        let n = 0;
        (area.plan || []).forEach((desk, di) => {
          if (desk.k === 'aisle') return;
          deskSeatOffsets(desk).forEach((p, si) => {
            n++;
            seats.push({
              id: `${base}-${String(n).padStart(2, '0')}`,
              campus: campus.id, floor: floor.floor,
              area: area.id, layout: 'plan',
              desk: di, dseat: si, dx: p[0], dy: p[1],
              pc: !!area.pc, disabled: false,
            });
          });
        });
      });
    });
  });
  return seats;
}

/* 每种桌型的座位局部坐标（相对桌中心） */
function deskSeatOffsets(d) {
  const n = d.n || 3;
  if (d.k === 'round') return [[0, -62], [62, 0], [0, 62], [-62, 0]];
  if (d.k === 'long') {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push([(i - (n - 1) / 2) * 46, -45]);
    for (let i = 0; i < n; i++) arr.push([(i - (n - 1) / 2) * 46, 45]);
    return arr;
  }
  if (d.k === 'side') {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push([(i - (n - 1) / 2) * 36, -40]);
    return arr;
  }
  if (d.k === 'diag') {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push([(i - (n - 1) / 2) * 42, -42]);
    for (let i = 0; i < n; i++) arr.push([(i - (n - 1) / 2) * 42 + 21, 42]);
    return arr;
  }
  if (d.k === 'single') return [[0, 38]];
  if (d.k === 'booth') return [[0, 38]];
  if (d.k === 'booth2') return [[-34, 38], [34, 38]];  // 双人卡座：两椅并排（消除隔桌缝隙感）
  if (d.k === 'room') return [[0, 26]];
  return [];
}

/* 桌子的像素尺寸（宽/高），用于渲染 */
function deskSize(d) {
  if (d.k === 'round') return [86, 86];
  if (d.k === 'long') return [150, 52];
  if (d.k === 'side') return [150, 46];
  if (d.k === 'diag') return [126, 44];
  if (d.k === 'single') return [42, 42];
  if (d.k === 'booth') return [78, 50];
  if (d.k === 'booth2') return [142, 50];
  if (d.k === 'room') return [92, 96];
  return [0, 0];
}

/* ---------------- localStorage 持久化 ---------------- */
const Store = {
  _data: null,

  load() {
    if (this._data) return this._data;
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      try { this._data = JSON.parse(raw); } catch (e) { this._data = null; }
      // 旧版数据（座位布局/桌型变更后）直接丢弃重建
      if (this._data && this._data.version !== 5) this._data = null;
    }
    if (!this._data) this._data = this._defaultData();
    this._save();
    return this._data;
  },

  _defaultData() {
    const now = new Date();
    const d = n => fmtDate(addDays(now, n));   // d(-1)=昨天
    const seats = buildSeats();
    /* 演示用固定用户（学号 1~5，密码 123456） */
    const users = [
      { id: 'u_001', name: '赵明', studentId: '1', password: '123456', role: 'user', violations: 0, createdAt: Date.now() - 86400000 * 30 },
      { id: 'u_002', name: '钱悦', studentId: '2', password: '123456', role: 'user', violations: 1, createdAt: Date.now() - 86400000 * 25 },
      { id: 'u_003', name: '孙毅', studentId: '3', password: '123456', role: 'user', violations: 4, createdAt: Date.now() - 86400000 * 20 },
      { id: 'u_004', name: '李涵', studentId: '4', password: '123456', role: 'user', violations: 2, createdAt: Date.now() - 86400000 * 15 },
      { id: 'u_005', name: '周璇', studentId: '5', password: '123456', role: 'user', violations: 0, createdAt: Date.now() - 86400000 * 10 },
    ];
    const R = (id, u, dd, seat, st, et, status, extra) => Object.assign({
      id, userId: u.id, userName: u.name, date: d(dd),
      campus: seat.startsWith('N') ? 'nanhu' : 'main',
      floorName: '', areaName: '', seatId: seat,
      startTime: st, endTime: et, status,
      createdAt: Date.now() - Math.abs(dd) * 86400000,
      signInTime: null, leaveTime: null, returnTime: null, endLeaveTime: null,
      violationReason: null,
    }, extra || {});
    /* 预设预约记录：赵明/周璇无违约；钱悦违约1次；李涵违约2次；孙毅违约已满4次 */
    const reservations = [
      R('r_001', users[0], -1, 'M101-01', 9, 11, '已结束', { signInTime: 9, endLeaveTime: 11 }),
      R('r_002', users[0], -1, 'M101-05', 14, 16, '已结束', { signInTime: 14, endLeaveTime: 16 }),
      R('r_003', users[0], -2, 'N201-01', 10, 12, '已结束', { signInTime: 10, endLeaveTime: 12 }),
      R('r_004', users[1], -2, 'M102-02', 8.5, 10.5, '已结束', { signInTime: 8.5, endLeaveTime: 10.5 }),
      R('r_005', users[1], -1, 'N103-04', 15, 17, '违约', { violationReason: '未在规定时间内签到' }),
      R('r_006', users[2], -4, 'M101-03', 8, 10, '违约', { violationReason: '未在规定时间内签到' }),
      R('r_007', users[2], -3, 'N102-02', 9, 11, '违约', { violationReason: '未在规定时间内签到' }),
      R('r_008', users[2], -2, 'M202-01', 14, 16, '违约', { violationReason: '暂离超时未返回' }),
      R('r_009', users[2], -1, 'N202-01', 10, 12, '违约', { violationReason: '未在规定时间内签到' }),
      R('r_010', users[3], -3, 'N201-03', 13, 15, '违约', { violationReason: '未在规定时间内签到' }),
      R('r_011', users[3], -1, 'M103-02', 9.5, 11.5, '违约', { violationReason: '暂离超时未返回' }),
      R('r_012', users[3], -1, 'M302-03', 16, 18, '已结束', { signInTime: 16, endLeaveTime: 18 }),
      R('r_013', users[4], -2, 'M201-01', 9, 10.5, '已结束', { signInTime: 9, endLeaveTime: 10.5 }),
      R('r_014', users[4], -2, 'N204-02', 15, 17, '已结束', { signInTime: 15, endLeaveTime: 17 }),
    ];
    return {
      version: 5,
      seats,
      reservations,
      users,
      admin: { name: '管理员', account: 'admin', password: 'admin123' },
      notices: [
        { id: 'n1', title: '阅览室座位管理系统（试运行）', content: '开放时间：周一至周日 7:30—22:00，周五 14:00 后闭馆。可预约当日与次日座位，次日座位每日 18:00 起开放预约。预约后请在预约时间点前后 30 分钟内完成签到，超时记为违约 1 次并释放座位；暂离保留座位 90 分钟。', createdAt: Date.now() - 86400000 * 2 },
        { id: 'n2', title: '预约时段与数量规则', content: '① 同一时间段内，每位读者最多预约 1 个座位（不同座位的时间段也不可重叠）。例如：已约 10:00—12:00，可再约另一座位 13:00—18:00，但不能再约 12:00—15:00（时间冲突）。② 同一自然日内，每位读者最多预约 2 个时段。③ 跨日预约互不影响：当日 18:00 后预约了今晚 20:00—21:00 的座位，仍可同时预约次日座位；但未到 18:00 前不可预约次日座位。', createdAt: Date.now() - 86400000 },
      ],
      demoTime: null,   // 演示时间（null 表示使用真实时间）
    };
  },

  _save() { localStorage.setItem(STORE_KEY, JSON.stringify(this._data)); },

  /* 清空本机全部数据，恢复初始状态 */
  _clear() {
    localStorage.removeItem(STORE_KEY);
    this._data = null;
  },

  get seats() { return this.load().seats; },
  get reservations() { return this.load().reservations; },
  get users() { return this.load().users; },
  get notices() { return this.load().notices; },

  saveReservations() { this._save(); },
  saveUsers() { this._save(); },
  saveNotices() { this._save(); },
  setDemoTime(t) { this.load().demoTime = t; this._save(); },
};

/* 跨标签页数据同步：其他标签写入 localStorage 后清空本页缓存 */
(function initStoreSync() {
  try {
    window.addEventListener('storage', function (e) {
      if (e.key === STORE_KEY) Store._data = null;
    });
  } catch (e) { /* 忽略 */ }
})();

/* ---------------- 时间工具 ---------------- */
function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDateCN(d) {
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 周${week}`;
}

function timeToLabel(t) {
  const h = Math.floor(t);
  const m = Math.round((t - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function dateFromStr(s) { // 'YYYY-MM-DD' -> Date（本地时区）
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/* 系统当前时间：支持演示模式（demoTime） */
function getNow() {
  const demo = Store.load().demoTime;
  return demo ? new Date(demo) : new Date();
}

function getTodayStr() { return fmtDate(getNow()); }

/* 预约可行性判断 */
function canReserveDate(dateStr) {
  const now = getNow();
  const today = fmtDate(now);
  const date = dateFromStr(dateStr);
  const t0 = dateFromStr(today);
  const diffDays = Math.round((date - t0) / 86400000);
  if (diffDays < 0) return { ok: false, reason: '不能预约过去的日期' };
  if (diffDays > 1) return { ok: false, reason: '仅可预约今天与明天' };
  // 今天 22:00 后不可再约今天
  if (diffDays === 0) {
    const h = now.getHours() + now.getMinutes() / 60;
    if (h >= OPEN_END) return { ok: false, reason: '已过今日预约截止时间（22:00）' };
  }
  // 明天 18:00 后才可约
  if (diffDays === 1) {
    const h = now.getHours() + now.getMinutes() / 60;
    if (h < 18) return { ok: false, reason: '次日座位每日 18:00 后开放预约' };
  }
  return { ok: true, reason: '' };
}

/* 座位在某日某时段的占用状态 */
function seatBusyRanges(seatId, dateStr) {
  const res = Store.load().reservations.filter(r =>
    r.seatId === seatId && r.date === dateStr &&
    (r.status === '待签到' || r.status === '履约中' || r.status === '暂离中'));
  return res.map(r => ({ start: r.startTime, end: r.endTime, id: r.id }));
}

function isSlotBusy(seatId, dateStr, start, end) {
  return seatBusyRanges(seatId, dateStr).some(r => start < r.end && end > r.start);
}

/* 某区域某日可用座位数 */
function areaAvailableCount(areaId, campusId, floor, dateStr) {
  const seats = Store.load().seats.filter(s => s.area === areaId && !s.disabled);
  let available = 0;
  for (const s of seats) {
    if (seatBusyRanges(s.id, dateStr).length === 0) available++;
  }
  return available;
}

/* ---------------- 违约与状态检查（每次进入页面时执行） ---------------- */
function runStatusCheck() {
  const data = Store.load();
  const now = getNow();
  let changed = false;

  data.reservations.forEach(r => {
    // 待签到：超过签到窗口 → 违约
    if (r.status === '待签到') {
      const startDt = new Date(dateFromStr(r.date).getTime() + r.startTime * 3600000);
      if (now.getTime() > startDt.getTime() + SIGNIN_WINDOW * 60000) {
        r.status = '违约';
        r.violationReason = '未在规定时间内签到';
        r.violationAt = now.getTime();   // 记录违约发生时刻（撤销留痕）
        const user = data.users.find(u => u.id === r.userId);
        if (user) user.violations = (user.violations || 0) + 1;
        changed = true;
      }
    }
    // 暂离中：超过 90 分钟 → 违约
    if (r.status === '暂离中' && r.leaveTime) {
      const leaveDt = new Date(dateFromStr(r.date).getTime() + r.leaveTime * 3600000);
      if (now.getTime() > leaveDt.getTime() + LEAVE_KEEP_MIN * 60000) {
        r.status = '违约';
        r.violationReason = '暂离超时未返回';
        r.violationAt = now.getTime();   // 记录违约发生时刻（撤销留痕）
        const user = data.users.find(u => u.id === r.userId);
        if (user) user.violations = (user.violations || 0) + 1;
        changed = true;
      }
    }
    // 履约中：超过预约结束时间 → 自动结束
    if (r.status === '履约中' && r.endTime) {
      const endDt = new Date(dateFromStr(r.date).getTime() + r.endTime * 3600000);
      if (now.getTime() > endDt.getTime()) {
        r.status = '已结束';
        r.endLeaveTime = r.endTime;
        changed = true;
      }
    }
  });

  if (changed) Store._save();
  return changed;
}

/* 工具：日期偏移 */
function addDays(d, n) {
  const nd = new Date(d.getTime() + n * 86400000);
  return nd;
}

/* ---------------- 座位平面图渲染（用户端 / 管理员端共用） ----------------
 * 在 canvas 元素上画出区域的"桌子 + 座位"平面图：
 *  - 桌子用浅木色形状表示（圆桌 / 长桌 / 单人桌 / 斜对桌 / 自习间）
 *  - 座位按桌型环绕桌子摆放，绝对定位
 *  - 过道用虚线浅色条表示
 * opts.onSeatClick(el, seat) 点击座位回调
 * 返回 { free, busy, leave, off }
 */
function drawPlanMap(canvas, area, dateStr, opts) {
  canvas.className = 'seat-canvas plan-canvas' + (opts.admin ? ' admin-seat-canvas' : '');
  canvas.style.height = (area.H || 470) + 'px';
  canvas.innerHTML = '';

  // 座位占用状态（按日期）
  const statusBySeat = {};
  Store.reservations.filter(r => r.date === dateStr).forEach(r => {
    if (r.status === '暂离中') statusBySeat[r.seatId] = 'leave';
    else if (r.status === '待签到' || r.status === '履约中') statusBySeat[r.seatId] = 'busy';
  });

  const areaSeats = Store.seats.filter(s => s.area === area.id);
  const counts = { free: 0, busy: 0, leave: 0, off: 0 };

  (area.plan || []).forEach((desk, di) => {
    if (desk.k === 'aisle') {
      const a = document.createElement('div');
      a.className = 'plan-aisle' + (desk.v ? ' v' : '');
      a.style.left = (desk.x - desk.w / 2) + 'px';
      a.style.top = (desk.y - desk.h / 2) + 'px';
      a.style.width = desk.w + 'px';
      a.style.height = desk.h + 'px';
      a.textContent = desk.label || '过道';
      canvas.appendChild(a);
      return;
    }

    // 画桌子
    const [dw, dh] = deskSize(desk);
    const t = document.createElement('div');
    t.className = 'desk desk-' + desk.k;
    t.style.left = (desk.x - dw / 2) + 'px';
    t.style.top = (desk.y - dh / 2) + 'px';
    t.style.width = dw + 'px';
    t.style.height = dh + 'px';
    t.textContent = desk.label || '';
    canvas.appendChild(t);

    // 画该桌座位
    const deskSeats = areaSeats.filter(s => s.desk === di);
    deskSeats.forEach(s => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'seat plan-seat';
      if (s.disabled) { el.classList.add('off'); counts.off++; }
      else if (statusBySeat[s.id] === 'leave') { el.classList.add('leave'); counts.leave++; }
      else if (statusBySeat[s.id] === 'busy') { el.classList.add('busy'); counts.busy++; }
      else { el.classList.add('free'); counts.free++; }
      if (s.pc) el.classList.add('has-pc');
      el.textContent = s.id.split('-')[1];
      el.title = `${s.id} · ${deskLabel(desk)}${s.pc ? ' · 带电脑' : ''}`;
      el.style.left = (desk.x + s.dx - 20) + 'px';
      el.style.top = (desk.y + s.dy - 16) + 'px';
      if (opts.onSeatClick) {
        el.addEventListener('click', () => opts.onSeatClick(el, s));
      }
      canvas.appendChild(el);
    });
  });

  return counts;
}

function deskLabel(d) {
  const map = { round: '圆桌', long: '对坐长桌', single: '单人桌', side: '单排长桌', diag: '斜对桌', booth: '单人卡座', booth2: '双人卡座', room: '自习间' };
  return map[d.k] || '座位';
}
