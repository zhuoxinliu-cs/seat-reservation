/* ============================================================
 * 天气查询（Open-Meteo 免费接口，无需 API Key）
 * 目标城市：武汉（华中师范大学）· 每日最高/最低温 + 天气码
 * 若网络不可用则返回模拟数据（标注"演示数据"）
 * ============================================================ */

'use strict';

const Weather = {
  // 武汉坐标
  LAT: 30.525, LON: 114.31,

  cache: {},

  /* 天气码 -> 中文描述 + 图标 + 建议 */
  codeInfo(code) {
    if (code === 0)   return { text: '晴', icon: '☀️', rain: false };
    if (code === 1)   return { text: '多云', icon: '🌤️', rain: false };
    if (code === 2)   return { text: '阴', icon: '⛅', rain: false };
    if (code === 3)   return { text: '阴', icon: '☁️', rain: false };
    if (code >= 45 && code <= 48) return { text: '雾', icon: '🌫️', rain: false };
    if (code >= 51 && code <= 67) return { text: '小雨', icon: '🌦️', rain: true };
    if (code >= 71 && code <= 77) return { text: '雪', icon: '🌨️', rain: true };
    if (code >= 80 && code <= 82) return { text: '阵雨', icon: '🌧️', rain: true };
    if (code >= 85 && code <= 86) return { text: '雨雪', icon: '🌨️', rain: true };
    if (code >= 95) return { text: '雷阵雨', icon: '⛈️', rain: true };
    return { text: '未知', icon: '🌡️', rain: false };
  },

  /* 依据温度与天气给出出行建议 */
  adviceFor(tmax, tmin, code) {
    const info = this.codeInfo(code);
    const tips = [];
    if (tmax >= 33) tips.push('高温炎热，注意防晒，建议携带遮阳伞或帽子，多补水');
    else if (tmax >= 30) tips.push('天气较热，建议带伞防晒、注意补水');
    else if (tmax <= 8) tips.push('气温较低，注意添衣保暖');
    else if (tmin <= 12) tips.push('早晚偏凉，建议备一件外套');
    if (info.rain) tips.push('预计有降水，记得携带雨伞');
    if (info.text === '晴' && tmax < 30) tips.push('天气晴好，适合到馆学习');
    return tips;
  },

  /* 获取指定日期（YYYY-MM-DD）的天气 */
  async fetchByDate(dateStr) {
    if (this.cache[dateStr]) return this.cache[dateStr];

    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${this.LAT}&longitude=${this.LON}`
      + `&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=Asia%2FShanghai`;

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const resp = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!resp.ok) throw new Error('weather api error');
      const json = await resp.json();
      const idx = json.daily.time.indexOf(dateStr);
      if (idx < 0) throw new Error('date not found');
      const wc = json.daily.weathercode[idx];
      const result = {
        date: dateStr,
        tmax: json.daily.temperature_2m_max[idx],
        tmin: json.daily.temperature_2m_min[idx],
        code: wc,
        info: this.codeInfo(wc),
        demo: false,
      };
      this.cache[dateStr] = result;
      return result;
    } catch (e) {
      // 降级：返回模拟天气（演示数据）
      const seed = dateStr.split('-').reduce((a, b) => a + Number(b), 0);
      const codes = [0, 1, 2, 3, 61, 80];
      const code = codes[seed % codes.length];
      const tmax = 18 + (seed % 12);
      const tmin = 12 + (seed % 8);
      const result = {
        date: dateStr,
        tmax, tmin, code,
        info: this.codeInfo(code),
        demo: true,
      };
      this.cache[dateStr] = result;
      return result;
    }
  },
};
