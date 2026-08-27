// 全局状态
let schools = [];           // 原始学校数据
let currentCountry = 'all'; // 当前选中的国家
let highlightOn = false;    // 高亮差异开关是否打开
let currentLang = 'zh';     // 当前界面语言

// 中英文翻译字典
const i18n = {
  zh: {
    title: '目标校对比看板',
    subtitle: '把几所学校并排一摆，差距一眼看清',
    countryLabel: '国家：',
    allCountries: '全部国家',
    highlight: '✨ 高亮差异',
    langSwitch: 'EN',
    loading: '正在加载学校数据...',
    loadError: '加载数据失败，请检查 data.json 是否存在',
    acceptanceRate: '录取率',
    sat: '标化 (SAT)',
    deadline: '申请截止',
    popularMajors: '热门专业',
    diffTag: '差异大',
    rolling: '滚动'
  },
  en: {
    title: 'Target School Dashboard',
    subtitle: 'Compare schools side by side at a glance',
    countryLabel: 'Country: ',
    allCountries: 'All Countries',
    highlight: '✨ Highlight Differences',
    langSwitch: '中',
    loading: 'Loading school data...',
    loadError: 'Failed to load data. Please check data.json.',
    acceptanceRate: 'Acceptance Rate',
    sat: 'SAT Range',
    deadline: 'Deadline',
    popularMajors: 'Popular Majors',
    diffTag: 'Large Diff',
    rolling: 'Rolling'
  }
};

// 全部国家时使用的默认背景图
const WORLD_BACKGROUND = 'resource/World.jpg';

// 国家背景图片对照表（key 为英文国家名，未指定的国家使用默认渐变色背景）
const COUNTRY_BACKGROUNDS = {
  'USA': 'resource/USA.jpg'
};

// 根据当前选中的国家切换页面背景
function updateBackground() {
  const body = document.body;
  let img = null;

  if (currentCountry === 'all') {
    // “全部国家”使用地球背景图
    img = WORLD_BACKGROUND;
    body.classList.add('view-all-countries');
  } else {
    // 通过当前语言的国家名找到对应学校，取其英文国家名作为稳定的查找键
    const school = schools.find(s => s.country[currentLang] === currentCountry);
    const key = school ? school.country.en : null;
    img = key ? COUNTRY_BACKGROUNDS[key] : null;
    body.classList.remove('view-all-countries');
  }

  if (img) {
    body.style.backgroundImage = `url('${img}')`;
    body.classList.add('has-bg-image');
  } else {
    // 没有对应图片时，恢复默认渐变色背景
    body.style.backgroundImage = '';
    body.classList.remove('has-bg-image');
  }

  updateSubtitleColor();
}

// ===== 副标题自动反色 =====

// 背景图加载缓存：URL -> Promise<Image>
const bgImageCache = new Map();

function loadBgImage(url) {
  if (!bgImageCache.has(url)) {
    bgImageCache.set(url, new Promise((resolve, reject) => {
      const image = new Image();
      // onload 后再等待 decode，确保 drawImage 一定能画出像素
      image.onload = () => {
        image.decode()
          .then(() => resolve(image))
          .catch(() => resolve(image));
      };
      image.onerror = reject;
      image.src = url;
    }));
  }
  return bgImageCache.get(url);
}

// 返回当前使用的背景图 URL；渐变色模式返回 null
function getCurrentBackgroundUrl() {
  if (currentCountry === 'all') return WORLD_BACKGROUND;
  const school = schools.find(s => s.country[currentLang] === currentCountry);
  const key = school ? school.country.en : null;
  return key ? (COUNTRY_BACKGROUNDS[key] || null) : null;
}

// 对副标题所在区域的背景像素采样，返回 ImageData 的像素数组
async function sampleSubtitleBackground() {
  const rect = document.querySelector('.subtitle').getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  const ctx = canvas.getContext('2d');

  const url = getCurrentBackgroundUrl();
  if (url) {
    // 背景图：按 CSS cover + center + fixed 的公式，把视口坐标映射到图片坐标
    const img = await loadBgImage(url);
    const scale = Math.max(vw / img.width, vh / img.height);
    const originX = (vw - img.width * scale) / 2;
    const originY = (vh - img.height * scale) / 2;
    ctx.drawImage(
      img,
      (rect.left - originX) / scale,
      (rect.top - originY) / scale,
      rect.width / scale,
      rect.height / scale,
      0, 0, canvas.width, canvas.height
    );
  } else {
    // 渐变色兜底：重建与 CSS 相同的 135 度渐变（相对 body 全幅，再偏移到 rect）
    const bodyH = Math.max(document.body.scrollHeight, vh);
    const grad = ctx.createLinearGradient(-rect.left, -rect.top, vw - rect.left, bodyH - rect.top);
    grad.addColorStop(0, '#f5e3b2');
    grad.addColorStop(1, '#fce28d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

// 按颜色量化分组，返回加权平均色与占比最大组的颜色
function analyzePixels(data) {
  const total = data.length / 4;
  const bins = new Map(); // key -> { count, sumR, sumG, sumB }

  // 每通道量化为 16 档，相近颜色归入同一组
  for (let i = 0; i < data.length; i += 4) {
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    let bin = bins.get(key);
    if (!bin) {
      bin = { count: 0, sumR: 0, sumG: 0, sumB: 0 };
      bins.set(key, bin);
    }
    bin.count++;
    bin.sumR += data[i];
    bin.sumG += data[i + 1];
    bin.sumB += data[i + 2];
  }

  let weightSum = 0, r = 0, g = 0, b = 0;
  let dominant = null;
  for (const bin of bins.values()) {
    const share = bin.count / total;
    const weight = share * share; // 占比平方，放大主导颜色的话语权
    weightSum += weight;
    r += (bin.sumR / bin.count) * weight;
    g += (bin.sumG / bin.count) * weight;
    b += (bin.sumB / bin.count) * weight;

    if (!dominant || bin.count > dominant.count) {
      dominant = bin;
    }
  }

  return {
    avg: {
      r: Math.round(r / weightSum),
      g: Math.round(g / weightSum),
      b: Math.round(b / weightSum)
    },
    // 占比最大颜色组的平均色，用作副标题背景
    dominant: {
      r: Math.round(dominant.sumR / dominant.count),
      g: Math.round(dominant.sumG / dominant.count),
      b: Math.round(dominant.sumB / dominant.count)
    }
  };
}

// 反色：每个通道用 255 减去原值
function inverseColor({ r, g, b }) {
  return { r: 255 - r, g: 255 - g, b: 255 - b };
}

// RGB (0–255) → HSL（h: 0–360, s/l: 0–1）
function rgbToHsl({ r, g, b }) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: h * 360, s, l };
}

// HSL → RGB (0–255)
function hslToRgb({ h, s, l }) {
  h = ((h % 360) + 360) % 360 / 360;
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

// 将饱和度设为指定百分比（保留色相与亮度）
function setSaturation(rgb, percent) {
  const hsl = rgbToHsl(rgb);
  hsl.s = percent / 100;
  return hslToRgb(hsl);
}

function toHex({ r, g, b }) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function toRgba({ r, g, b }, alpha) {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// 副标题：背景用占比最大颜色（透明度 0.5），文字为加权平均反色后再提饱和度至 70%
let subtitleColorSeq = 0;

async function updateSubtitleColor() {
  const seq = ++subtitleColorSeq;
  try {
    const pixels = await sampleSubtitleBackground();
    // 若期间又触发了新的计算，丢弃过期结果
    if (seq !== subtitleColorSeq) return;

    const { avg, dominant } = analyzePixels(pixels);
    const textColor = setSaturation(inverseColor(avg), 70);
    const subtitle = document.querySelector('.subtitle');
    subtitle.style.backgroundColor = toRgba(dominant, 0.5);
    subtitle.style.color = toHex(textColor);
  } catch (error) {
    console.warn('副标题颜色计算失败：', error);
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// 初始化：读取数据并绑定事件
async function init() {
  try {
    document.getElementById('cards-container').innerHTML =
      `<div class="loading">${t('loading')}</div>`;

    const response = await fetch('data.json');
    schools = await response.json();
    updateStaticUI();
    populateCountryFilter();
    updateBackground();
    renderCards();
    bindEvents();
  } catch (error) {
    console.error('加载数据失败：', error);
    document.getElementById('cards-container').innerHTML =
      `<div class="loading">${t('loadError')}</div>`;
  }
}

// 英文月份名称
const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// 翻译工具函数：根据 key 返回当前语言文本
function t(key) {
  return i18n[currentLang][key] || key;
}

// 解析 M/D 格式的截止日期
function parseDeadline(deadline) {
  if (deadline === '滚动') return null;
  const match = String(deadline).match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  return {
    month: parseInt(match[1], 10),
    day: parseInt(match[2], 10)
  };
}

// 格式化截止日期：中文显示 x月x日，英文显示 January 5
function formatDeadline(deadline) {
  if (deadline === '滚动') return t('rolling');

  const parsed = parseDeadline(deadline);
  if (!parsed) return deadline;

  const { month, day } = parsed;
  if (currentLang === 'zh') {
    return `${month}月${day}日`;
  }
  return `${EN_MONTHS[month - 1]} ${day}`;
}

// 返回截止日期的排序数值（月*100+日，滚动排到末尾）
function getDeadlineSortValue(deadline) {
  if (deadline === '滚动') return Number.MAX_SAFE_INTEGER;

  const parsed = parseDeadline(deadline);
  if (!parsed) return Number.MAX_SAFE_INTEGER;

  return parsed.month * 100 + parsed.day;
}

// 更新不需要卡片的静态界面文字
function updateStaticUI() {
  document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
  document.title = t('title');
  document.getElementById('lang-switch').textContent = t('langSwitch');
  document.querySelector('.header h1').textContent = t('title');
  document.querySelector('.subtitle').textContent = t('subtitle');
  document.querySelector('.control-label').textContent = t('countryLabel');
  document.getElementById('highlight-btn').textContent = t('highlight');
}

// 填充国家下拉框选项
function populateCountryFilter() {
  const select = document.getElementById('country-filter');
  const countries = [...new Set(schools.map(s => s.country[currentLang]))];

  // 保留当前选中值，重新生成选项
  select.innerHTML = `<option value="all">${t('allCountries')}</option>`;
  countries.forEach(country => {
    const option = document.createElement('option');
    option.value = country;
    option.textContent = country;
    select.appendChild(option);
  });

  select.value = currentCountry;
}

// 绑定按钮事件
function bindEvents() {
  // 语言切换按钮
  document.getElementById('lang-switch').addEventListener('click', () => {
    const newLang = currentLang === 'zh' ? 'en' : 'zh';

    // 如果当前已选中具体国家，先映射成新语言下的国家名，保持筛选不变
    if (currentCountry !== 'all') {
      const school = schools.find(s => s.country[currentLang] === currentCountry);
      if (school) {
        currentCountry = school.country[newLang];
      }
    }

    currentLang = newLang;
    updateStaticUI();
    populateCountryFilter();
    updateBackground();
    renderCards();
  });

  // 国家筛选下拉框
  document.getElementById('country-filter').addEventListener('change', (e) => {
    currentCountry = e.target.value;
    updateBackground();
    renderCards();
  });

  // 高亮差异开关
  document.getElementById('highlight-btn').addEventListener('click', () => {
    highlightOn = !highlightOn;
    document.getElementById('highlight-btn').classList.toggle('active', highlightOn);
    renderCards();
  });

  // 窗口尺寸变化时重新计算副标题颜色（cover 映射随视口变化）
  window.addEventListener('resize', () => {
    updateSubtitleColor();
  });

  // 所有资源加载完成后再算一次，兜底首次加载时的时序问题
  window.addEventListener('load', () => {
    updateSubtitleColor();
  });
}

// 计算录取率和 SAT 在所有学校中的最大最小值，用于画柱状条
function getMetricBounds(data) {
  const rates = data.map(s => s.acceptanceRate);
  const sats = data.map(s => (s.satRange[0] + s.satRange[1]) / 2);

  return {
    rate: { min: Math.min(...rates), max: Math.max(...rates) },
    sat: { min: Math.min(...sats), max: Math.max(...sats) }
  };
}

// 把数值映射成 20% ~ 100% 的百分比，最小值也能显示一小段条
function normalize(value, min, max) {
  if (max === min) return 100;
  return ((value - min) / (max - min)) * 80 + 20;
}

// 计算哪些指标“差异最大”，返回要高亮的指标名数组
function getHighlights(data) {
  if (data.length < 2) return [];

  const rates = data.map(s => s.acceptanceRate);
  const sats = data.map(s => (s.satRange[0] + s.satRange[1]) / 2);

  // 用“相对极差”衡量差异：极差 / 平均值
  const rateMax = Math.max(...rates);
  const rateMin = Math.min(...rates);
  const rateDiff = (rateMax - rateMin) / ((rateMax + rateMin) / 2);

  const satMax = Math.max(...sats);
  const satMin = Math.min(...sats);
  const satDiff = (satMax - satMin) / ((satMax + satMin) / 2);

  // 返回差异最大的指标名
  return rateDiff >= satDiff ? ['acceptanceRate'] : ['sat'];
}

// 渲染所有学校卡片
function renderCards() {
  const container = document.getElementById('cards-container');
  let displayData = [...schools];

  // 按国家筛选
  if (currentCountry !== 'all') {
    displayData = displayData.filter(s => s.country[currentLang] === currentCountry);
  }

  const bounds = getMetricBounds(displayData);
  const highlights = highlightOn ? getHighlights(displayData) : [];

  // 逐个生成卡片 HTML
  container.innerHTML = displayData.map((school, index) => {
    const satMid = (school.satRange[0] + school.satRange[1]) / 2;

    return `
      <div class="school-card">
        <div class="card-header">
          <div class="school-name">${school.name[currentLang]}</div>
          <div class="school-region">${school.country[currentLang]} · ${school.region[currentLang]}</div>
        </div>

        <div class="metric-row ${highlights.includes('acceptanceRate') ? 'highlight' : ''}">
          <div class="metric-label">
            <span>${t('acceptanceRate')}</span>
            <span class="metric-value">
              ${school.acceptanceRate}%
              ${highlights.includes('acceptanceRate') ? `<span class="diff-tag">${t('diffTag')}</span>` : ''}
            </span>
          </div>
          <div class="bar-track">
            <div class="bar" data-width="${normalize(school.acceptanceRate, bounds.rate.min, bounds.rate.max)}%"></div>
          </div>
        </div>

        <div class="metric-row ${highlights.includes('sat') ? 'highlight' : ''}">
          <div class="metric-label">
            <span>${t('sat')}</span>
            <span class="metric-value">
              ${school.satRange[0]} ~ ${school.satRange[1]}
              ${highlights.includes('sat') ? `<span class="diff-tag">${t('diffTag')}</span>` : ''}
            </span>
          </div>
          <div class="bar-track">
            <div class="bar" data-width="${normalize(satMid, bounds.sat.min, bounds.sat.max)}%"></div>
          </div>
        </div>

        <div class="metric-row">
          <div class="metric-label">
            <span>${t('deadline')}</span>
            <span class="metric-value">${formatDeadline(school.deadline)}</span>
          </div>
        </div>

        <div class="majors">
          <div class="majors-label">${t('popularMajors')}</div>
          <div class="majors-tags">
            ${school.popularMajors[currentLang].map(m => `<span class="major-tag">${m}</span>`).join('')}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // 下一帧再设置宽度，触发 CSS 动画，让柱状条“长出来”
  requestAnimationFrame(() => {
    document.querySelectorAll('.bar').forEach(bar => {
      bar.style.width = bar.dataset.width;
    });
  });
}
