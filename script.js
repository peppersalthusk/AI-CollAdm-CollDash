// 全局状态
let schools = [];           // 原始学校数据
let currentCountry = 'all'; // 当前选中的国家
let satRange = { min: 400, max: 1600 }; // 当前 SAT 筛选范围
let highlightOn = false;    // 高亮差异开关是否打开
let currentLang = 'zh';     // 当前界面语言
let currentPage = 'home';   // 当前页面：home | dashboard

// 中英文翻译字典
const i18n = {
  zh: {
    title: '目标校对比看板',
    homeTitle: 'CollDash',
    homeLine1: '把几所学校并排一摆，',
    homeLine2a: '差距',
    homeLine2b: '一眼看清',
    ctaDashboard: '进入看板 →',
    featureCompare: '并排对比',
    featureCompareDesc: '多所学校同屏展示，录取率、SAT、截止日一眼对比',
    featureHighlight: '高亮差异',
    featureHighlightDesc: '自动标出差距最大的指标，快速定位关键区别',
    featureFilter: '国家筛选',
    featureFilterDesc: '按国家切换背景与数据，聚焦目标地区',
    navHome: '首页',
    navDashboard: '看板',
    countryLabel: '国家：',
    allCountries: '全部国家',
    satLabel: 'SAT 范围：',
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
    homeTitle: 'CollDash',
    homeLine1: 'Compare schools side by side, ',
    homeLine2a: 'see the gap ',
    homeLine2b: 'at a glance',
    ctaDashboard: 'Open Dashboard →',
    featureCompare: 'Side by Side',
    featureCompareDesc: 'Compare acceptance rate, SAT and deadlines across schools',
    featureHighlight: 'Highlight Differences',
    featureHighlightDesc: 'Automatically spot the metric with the largest gap',
    featureFilter: 'Country Filter',
    featureFilterDesc: 'Switch backgrounds and data by country',
    navHome: 'Home',
    navDashboard: 'Dashboard',
    countryLabel: 'Country: ',
    allCountries: 'All Countries',
    satLabel: 'SAT Range: ',
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
  'USA': 'resource/USA.jpg',
  'UK': 'resource/UK.jpg',
  'Hong Kong, China': 'resource/HK.jpg'
};

// 默认渐变背景（与 styles.css 中 --default-bg 一致）
const DEFAULT_BACKGROUND = 'linear-gradient(135deg, #f5e3b2 0%, #fce28d 100%)';

// 根据当前选中的国家切换页面背景（首页与空白页使用世界背景图）
function updateBackground() {
  const body = document.body;

  if (currentPage === 'home' || currentPage === 'blank') {
    // 首页使用世界背景图
    body.style.backgroundImage = `url('${WORLD_BACKGROUND}')`;
    body.style.backgroundSize = 'cover';
    body.style.backgroundPosition = 'center';
    body.style.backgroundAttachment = 'fixed';
    body.style.backgroundRepeat = 'no-repeat';
    body.classList.add('has-bg-image', 'view-all-countries');
    return;
  }

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
    body.style.backgroundImage = DEFAULT_BACKGROUND;
    body.classList.remove('has-bg-image');
  }
}

// 切换页面：home | dashboard | blank，带黑屏淡出动画
function showPage(page) {
  if (page === currentPage) return;

  const transition = document.getElementById('page-transition');
  transition.classList.add('active');

  setTimeout(() => {
    currentPage = page;

    // 三个页面只显示目标页，其余隐藏
    const pages = {
      home: document.getElementById('home-page'),
      dashboard: document.getElementById('dashboard-page'),
      blank: document.getElementById('blank-page')
    };
    Object.entries(pages).forEach(([name, el]) => {
      el.classList.toggle('page-hidden', name !== page);
    });

    document.body.classList.toggle('page-home', page === 'home');
    document.body.classList.toggle('page-dashboard', page === 'dashboard');
    document.body.classList.toggle('page-blank', page === 'blank');

    updateBackground();
    window.scrollTo({ top: 0 });

    requestAnimationFrame(() => {
      transition.classList.remove('active');
    });
  }, 500);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// 动态加载脚本（用于 file:// 下读取 data.js）
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

// 加载学校数据：HTTP(S) 优先 fetch data.json，file:// 或 fetch 失败时用 data.js
async function loadSchoolData() {
  if (location.protocol !== 'file:') {
    try {
      const response = await fetch('data.json');
      if (response.ok) return response.json();
    } catch (_) {
      // fetch 失败时回退到 data.js
    }
  }

  if (window.SCHOOLS_DATA) return window.SCHOOLS_DATA;

  await loadScript('data.js');
  if (window.SCHOOLS_DATA) return window.SCHOOLS_DATA;

  throw new Error('Failed to load school data');
}

// 初始化：读取数据并绑定事件（默认先展示首页）
async function init() {
  try {
    showPage('home');
    updateStaticUI();
    bindEvents();

    document.getElementById('cards-container').innerHTML =
      `<div class="loading">${t('loading')}</div>`;

    schools = await loadSchoolData();
    populateCountryFilter();
    renderCards();
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
  document.title = currentPage === 'dashboard' ? t('title') : t('homeTitle');
  document.getElementById('lang-switch').textContent = t('langSwitch');
  document.getElementById('nav-home-btn').textContent = t('navHome');
  document.getElementById('nav-dashboard').textContent = t('navDashboard');
  const cta = document.getElementById('cta-dashboard');
  if (cta) cta.textContent = t('ctaDashboard');
  const highlightBtn = document.getElementById('highlight-btn');
  if (highlightBtn) highlightBtn.textContent = t('highlight');
  document.querySelector('.home-textbox .line1').textContent = t('homeLine1');
  document.querySelector('.home-textbox .line2').innerHTML =
    t('homeLine2a') + '<span class="highlight-blue">' + t('homeLine2b') + '</span>';
  document.querySelectorAll('.feature-title').forEach((el, i) => {
    el.textContent = [t('featureCompare'), t('featureHighlight'), t('featureFilter')][i];
  });
  document.querySelectorAll('.feature-desc').forEach((el, i) => {
    el.textContent = [t('featureCompareDesc'), t('featureHighlightDesc'), t('featureFilterDesc')][i];
  });
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
  // 回到首页（CollDash / 首页按钮）
  function goHome() {
    showPage('home');
    updateStaticUI();
  }

  document.getElementById('nav-home').addEventListener('click', goHome);
  document.getElementById('nav-home-btn').addEventListener('click', goHome);

  // 进入看板（顶栏 + CTA）
  function goDashboard() {
    showPage('dashboard');
    updateStaticUI();
  }

  document.getElementById('nav-dashboard').addEventListener('click', goDashboard);
  document.getElementById('cta-dashboard').addEventListener('click', goDashboard);

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

  // SAT 范围双滑块
  bindSatRangeFilter();

  // 高亮差异开关
  const highlightBtn = document.getElementById('highlight-btn');
  if (highlightBtn) {
    highlightBtn.addEventListener('click', () => {
      highlightOn = !highlightOn;
      highlightBtn.classList.toggle('active', highlightOn);
      renderCards();
    });
  }

  bindTopBarScroll();

  // 滚轮切换：首页向下滚动进入空白页，空白页向上滚动返回首页
  bindWheelPageSwitch();

  // 返回顶部：空白页时返回首页，其余页面滚动到顶部
  document.getElementById('back-to-top').addEventListener('click', () => {
    if (currentPage === 'blank') {
      showPage('home');
      updateStaticUI();
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

// 滚轮切换：首页向下滚动进入空白页，空白页向上滚动返回首页
function bindWheelPageSwitch() {
  let locked = false; // 切换动画期间锁定，防止连续触发

  window.addEventListener('wheel', (e) => {
    if (locked) return;

    if (currentPage === 'home' && e.deltaY > 0) {
      locked = true;
      showPage('blank');
      updateStaticUI();
      setTimeout(() => { locked = false; }, 1000);
    } else if (currentPage === 'blank') {
      // 空白页无内容，禁止页面本身滚动
      e.preventDefault();
      if (e.deltaY < 0) {
        locked = true;
        showPage('home');
        updateStaticUI();
        setTimeout(() => { locked = false; }, 1000);
      }
    }
  }, { passive: false });
}

// SAT 范围双滑块：范围 400 ~ 1600，只显示 SAT 上下限完全落在范围内的卡片
function bindSatRangeFilter() {
  const minInput = document.getElementById('sat-min');
  const maxInput = document.getElementById('sat-max');
  const valuesEl = document.getElementById('sat-range-values');
  const MIN = 400;
  const MAX = 1600;

  function update() {
    let min = parseInt(minInput.value, 10);
    let max = parseInt(maxInput.value, 10);

    // 防止滑块交叉，至少保持 10 分间隔
    if (min > max - 10) {
      min = max - 10;
      minInput.value = min;
    }
    if (max < min + 10) {
      max = min + 10;
      maxInput.value = max;
    }

    satRange.min = min;
    satRange.max = max;
    valuesEl.textContent = `${min} - ${max}`;

    // 更新轨道高亮区域
    const track = document.querySelector('.sat-track');
    if (track) {
      const left = ((min - MIN) / (MAX - MIN)) * 100;
      const right = ((MAX - max) / (MAX - MIN)) * 100;
      track.style.left = left + '%';
      track.style.right = right + '%';
    }

    renderCards();
  }

  minInput.addEventListener('input', update);
  maxInput.addEventListener('input', update);
  update();
}

// 顶栏：向下/向上滚动持续 0.5 秒后再收起/展开，到顶部强制展开
function bindTopBarScroll() {
  const topBar = document.querySelector('.top-bar');
  const DELAY_MS = 500;
  let lastScrollY = window.scrollY;
  let pendingDirection = null; // 'down' | 'up' | null
  let delayTimer = null;
  let ticking = false;

  function clearDelay() {
    if (delayTimer) {
      clearTimeout(delayTimer);
      delayTimer = null;
    }
    pendingDirection = null;
  }

  function schedule(direction) {
    if (pendingDirection === direction) return; // 同方向已在计时，不重置
    clearDelay();
    pendingDirection = direction;
    delayTimer = setTimeout(() => {
      if (direction === 'down') {
        topBar.classList.add('collapsed');
      } else {
        topBar.classList.remove('collapsed');
      }
      pendingDirection = null;
      delayTimer = null;
    }, DELAY_MS);
  }

  function updateTopBar() {
    const currentY = window.scrollY;

    // 首页和空白页不自动收起/展开顶栏
    if (currentPage === 'home' || currentPage === 'blank') {
      clearDelay();
      topBar.classList.remove('collapsed');
      lastScrollY = currentY;
      ticking = false;
      return;
    }

    if (currentY <= 0) {
      // 滚动到顶部时强制展开，取消待执行动作
      clearDelay();
      topBar.classList.remove('collapsed');
    } else if (currentY > lastScrollY) {
      schedule('down');
    } else if (currentY < lastScrollY) {
      schedule('up');
    }

    lastScrollY = currentY;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(updateTopBar);
      ticking = true;
    }
  }, { passive: true });
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

  // 按 SAT 范围筛选：上下限都在范围内才显示
  displayData = displayData.filter(s => s.satRange[0] >= satRange.min && s.satRange[1] <= satRange.max);

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
