/* global BookmarkUtils */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const APP_VERSION = '0.7.10';
const MAX_SCREENSHOT_CONCURRENCY = 63;
const STORAGE_KEY = 'bookmarkPosterWall.settings.v1';
const AI_KEY = 'bookmarkPosterWall.aiRecommendations.v1';
const THUMBNAIL_KEY = 'bookmarkPosterWall.thumbnailCache.v1';
const THUMBNAIL_SCHEMA_VERSION = 'poster-local-design-v7';
const APP_HISTORY_MARKER = 'bookmark-wall-nav-v1';
const SETTINGS_TABS = ['basic', 'appearance', 'thumbnail', 'ai', 'data', 'privacy', 'about'];
// Increase default limits so large bookmark collections can be processed.  
// The previous defaults (80 for a session and 160 visible) meant only a small
// fraction of a user's bookmarks were posterized on each run. By raising
// these values to 300 we ensure that hundreds of bookmarks can be handled
// without prematurely stopping the generation queue.
const POSTER_SESSION_LIMIT = 300;
const POSTER_VISIBLE_LIMIT = 300;
const SCREENSHOT_RETRY_WINDOW = 1000 * 60 * 60 * 24 * 2;
const CAPTURE_TAB_GROUP_TITLE = 'BookmarkWall 截图工作区';
const CAPTURE_TAB_GROUP_COLOR = 'cyan';

const ProviderTemplates = {
  local: { name: '本地模拟', baseUrl: '', model: 'local-demo', type: 'local' },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', type: 'openai-compatible' },
  openai: { name: 'OpenAI 兼容', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', type: 'openai-compatible' },
  qwen: { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', type: 'openai-compatible' },
  openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', type: 'openai-compatible' },
  custom: { name: '自定义 API', baseUrl: '', model: '', type: 'openai-compatible' }
};

const I18N = {
  'zh-CN': {
    appName: '书签海报墙', search: '搜索书签或输入网址', sideSearch: '搜索书签或文件夹',
    all: '全部', currentFolder: '当前文件夹', allBookmarks: '全部书签', unfiled: '未分类书签', recent: '最近添加', duplicates: '重复书签', aiPending: 'AI 待确认',
    folders: '文件夹', settings: '设置', help: '帮助', sync: '同步书签',
    sortRecent: '最近添加', sortTitle: '标题', sortDomain: '域名', sortFolder: '文件夹', sortAi: 'AI 置信度',
    filter: '筛选', withAi: '有 AI 建议', noAi: '无 AI 建议', githubDomain: 'GitHub 域名',
    cardLarge: '卡片大小：大', cardMedium: '卡片大小：中', cardSmall: '卡片大小：小',
    landscape: '横向海报', portrait: '竖向海报', aiRun: 'AI 预整理', aiSetup: '开启 AI', aiDisabled: '未启用',
    aiReady: '{model} 已启用', bookmarkCount: '{count} 个书签', selectedCount: '已选择 {count} 项',
    realShot: '真实截图', realSample: '真实示例', ogCover: '网页封面', posterCover: '海报封面', siteIcon: '站点图标',
    screenshotFailed: '截图失败', posterFailed: '生成失败',
    unnamedBookmark: '未命名书签', uncategorized: '未分类', localPreview: '本地预览', posterAfterConsent: '同意后生成真实海报',
    aiSettingsToast: '请先在设置中启用 AI 预整理，保存后点击顶部按钮开始', empty: '当前没有可处理的书签'
  },
  en: {
    appName: 'BookmarkWall', search: 'Search bookmarks or enter a URL', sideSearch: 'Search bookmarks or folders',
    all: 'All', currentFolder: 'Current folder', allBookmarks: 'All Bookmarks', unfiled: 'Unfiled', recent: 'Recently Added', duplicates: 'Duplicates', aiPending: 'AI Pending',
    folders: 'Folders', settings: 'Settings', help: 'Help', sync: 'Sync bookmarks',
    sortRecent: 'Recent', sortTitle: 'Title', sortDomain: 'Domain', sortFolder: 'Folder', sortAi: 'AI confidence',
    filter: 'Filter', withAi: 'With AI', noAi: 'No AI', githubDomain: 'GitHub domain',
    cardLarge: 'Card size: Large', cardMedium: 'Card size: Medium', cardSmall: 'Card size: Small',
    landscape: 'Landscape poster', portrait: 'Portrait poster', aiRun: 'AI Organize', aiSetup: 'Set up AI', aiDisabled: 'Off',
    aiReady: '{model} ready', bookmarkCount: '{count} bookmarks', selectedCount: '{count} selected',
    realShot: 'Screenshot', realSample: 'Real preview', ogCover: 'Page cover', posterCover: 'Poster cover', siteIcon: 'Site icon',
    screenshotFailed: 'Shot failed', posterFailed: 'Failed',
    unnamedBookmark: 'Untitled bookmark', uncategorized: 'Uncategorized', localPreview: 'Local preview', posterAfterConsent: 'Generate real poster after consent',
    aiSettingsToast: 'Enable AI in Settings, save it, then use the top AI button to start', empty: 'No bookmarks to process'
  }
};

const DefaultSettings = {
  theme: 'light',
  language: 'zh-CN',
  cardSize: 'large',
  showFolderTag: true,
  showDate: false,
  sortBy: 'recent',
  thumbnails: {
    useReal: true,
    askPermission: true,
    autoGenerate: true,
    generationMode: 'screenshot-first',
    screenshotStrategy: 'debugger-cdp',
    preferOgImage: false,
    // 每批截取海报的默认数量限制，提高至 300，保证大规模书签一次生成
    backgroundLimit: 300,
    visibleLimit: 300,
    concurrent: 4,
    captureDelay: 1800,
    captureTimeout: 18000,
    captureWidth: 1440,
    captureHeight: 900,
    captureQuality: 82,
    posterWidth: 640,
    posterHeight: 360,
    posterAspect: 'landscape',
    cropMode: 'smart',
    whitePageEnhance: true,
    fallbackToOg: true
  },
  onboarding: { thumbnailIntroDone: false, introVersion: '', lastShownAt: 0, bookmarkBackupDone: false, posterConsentGranted: false },
  safety: { requireBackupBeforeOrganize: true, lastBookmarkExportAt: 0, lastBookmarkExportFormat: '' },
  ai: {
    enabled: false,
    provider: 'local',
    providerName: '本地模拟',
    baseUrl: '',
    apiKey: '',
    model: 'local-demo',
    batchSize: 30,
    minConfidence: 70,
    applyThreshold: 85,
    sendTitle: true,
    sendDomain: true,
    sendPath: true,
    sendFolder: true,
    sendFolderList: true,
    sendMeta: false,
    sendBody: false,
    allowCreateFolder: false,
    allowRename: false,
    allowDelete: false
  }
};

const DemoTree = [
  {
    id: '0', title: '', children: [
      { id: '1', title: '书签栏', children: [
        { id: '11', title: 'GitHub', url: 'https://github.com/' },
        { id: '12', title: 'MDN Web Docs', url: 'https://developer.mozilla.org/' },
        { id: '13', title: 'Vite 官方文档', url: 'https://cn.vitejs.dev/' },
        { id: '14', title: 'Vue.js 官方文档', url: 'https://cn.vuejs.org/' },
        { id: '15', title: 'React 官方文档', url: 'https://react.dev/' }
      ] },
      { id: '2', title: '其他书签', children: [
        { id: '21', title: '开发', children: [
          { id: '211', title: '前端', children: [
            { id: '2111', title: 'TypeScript 中文文档', url: 'https://www.typescriptlang.org/' },
            { id: '2112', title: 'ESLint - Pluggable JavaScript Linter', url: 'https://eslint.org/' },
            { id: '2113', title: 'Prettier 中文文档', url: 'https://prettier.io/' },
            { id: '2114', title: 'Axios', url: 'https://axios-http.com/' }
          ] },
          { id: '212', title: '后端', children: [
            { id: '2121', title: 'Node.js', url: 'https://nodejs.org/' },
            { id: '2122', title: 'PostgreSQL', url: 'https://www.postgresql.org/' }
          ] },
          { id: '213', title: '运维', children: [
            { id: '2131', title: 'Docker Docs', url: 'https://docs.docker.com/' },
            { id: '2132', title: 'Linux 命令行', url: 'https://linuxcommand.org/' }
          ] },
          { id: '214', title: '工具链', children: [
            { id: '2141', title: 'Postman API Platform', url: 'https://www.postman.com/' },
            { id: '2142', title: 'Stack Overflow', url: 'https://stackoverflow.com/' },
            { id: '2143', title: 'Git', url: 'https://git-scm.com/' }
          ] }
        ] },
        { id: '22', title: '设计', children: [
          { id: '221', title: 'Figma', url: 'https://www.figma.com/' },
          { id: '222', title: 'Dribbble', url: 'https://dribbble.com/' }
        ] },
        { id: '23', title: '论文', children: [
          { id: '231', title: 'arXiv', url: 'https://arxiv.org/' },
          { id: '232', title: 'Papers with Code', url: 'https://paperswithcode.com/' }
        ] },
        { id: '24', title: '视频', children: [
          { id: '241', title: 'Bilibili', url: 'https://www.bilibili.com/' },
          { id: '242', title: 'YouTube', url: 'https://www.youtube.com/' }
        ] },
        { id: '25', title: '稍后阅读', children: [
          { id: '251', title: '掘金', url: 'https://juejin.cn/' },
          { id: '252', title: 'GitHub duplicate demo', url: 'https://github.com/?utm_source=demo' }
        ] }
      ] }
    ]
  }
];

class StorageAdapter {
  static async get(key, fallback) {
    if (globalThis.chrome?.storage?.local) {
      const result = await chrome.storage.local.get(key);
      return result[key] ?? fallback;
    }
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }
  static async set(key, value) {
    if (globalThis.chrome?.storage?.local) return chrome.storage.local.set({ [key]: value });
    localStorage.setItem(key, JSON.stringify(value));
  }
}

class BookmarkAdapter {
  constructor() {
    this.demoTree = structuredClone(DemoTree);
    this.demoNextId = 9000;
  }
  get isChrome() { return Boolean(globalThis.chrome?.bookmarks); }
  _call(method, ...args) {
    return new Promise((resolve, reject) => {
      try {
        chrome.bookmarks[method](...args, (result) => {
          const err = chrome.runtime?.lastError;
          if (err) reject(new Error(err.message));
          else resolve(result);
        });
      } catch (err) { reject(err); }
    });
  }
  async getTree() {
    if (this.isChrome) return this._call('getTree');
    return structuredClone(this.demoTree);
  }
  async move(id, destination) {
    if (this.isChrome) return this._call('move', String(id), destination);
    const node = this._findAndDetach(id, this.demoTree);
    const parent = this._findNode(destination.parentId, this.demoTree);
    if (node && parent) {
      parent.children ||= [];
      parent.children.splice(destination.index ?? parent.children.length, 0, node);
      node.parentId = parent.id;
    }
    return node;
  }
  async update(id, changes) {
    if (this.isChrome) return this._call('update', String(id), changes);
    const node = this._findNode(id, this.demoTree);
    if (node) Object.assign(node, changes);
    return node;
  }
  async remove(id) {
    if (this.isChrome) return this._call('remove', String(id));
    return this._findAndDetach(id, this.demoTree);
  }
  async create(data) {
    if (this.isChrome) return this._call('create', data);
    const parent = this._findNode(data.parentId, this.demoTree) || this.demoTree[0];
    const node = { id: String(this.demoNextId++), title: data.title || '新建书签' };
    if (data.url) node.url = data.url;
    parent.children ||= [];
    parent.children.push(node);
    return node;
  }
  onChanged(callback) {
    if (!this.isChrome) return;
    chrome.bookmarks.onCreated.addListener(callback);
    chrome.bookmarks.onRemoved.addListener(callback);
    chrome.bookmarks.onChanged.addListener(callback);
    chrome.bookmarks.onMoved.addListener(callback);
    chrome.bookmarks.onChildrenReordered.addListener(callback);
  }
  _findNode(id, nodes) {
    for (const node of nodes) {
      if (String(node.id) === String(id)) return node;
      const found = node.children ? this._findNode(id, node.children) : null;
      if (found) return found;
    }
    return null;
  }
  _findAndDetach(id, nodes) {
    for (const node of nodes) {
      if (!node.children) continue;
      const idx = node.children.findIndex((child) => String(child.id) === String(id));
      if (idx >= 0) return node.children.splice(idx, 1)[0];
      const found = this._findAndDetach(id, node.children);
      if (found) return found;
    }
    return null;
  }
}

const App = {
  adapter: new BookmarkAdapter(),
  tree: [],
  bookmarks: [],
  folders: [],
  folderCount: {},
  folderMap: new Map(),
  settings: structuredClone(DefaultSettings),
  aiRecommendations: {},
  thumbnailCache: {},
  selectedIds: new Set(),
  collapsedFolderIds: new Set(),
  currentFolderId: 'all',
  query: '',
  sortBy: 'recent',
  filter: 'all',
  activeSettingsTab: 'basic',
  historyReady: false,
  historySyncMuted: false,
  pendingViewTransition: false,
  undoStack: [],
  posterQueueRunning: false,
  posterAbort: false,
  posterStats: { done: 0, total: 0, success: 0, failed: 0 },
  activeCaptureWindows: new Set(),
  activeCaptureTabs: new Set(),
  activeCaptureTabGroups: new Set(),
  captureTabGroupsByWindow: new Map(),
  autoPosterStarted: false,
  bookmarksLoaded: false,
  firstRunLocked: false,
  settingsSaveTimer: 0,
  modalCloseTimers: {},
  thumbnailGuideMinimized: false,
  thumbnailGuideDismissed: false,
  posterHudHideTimer: 0,
  posterHudMinimized: false,
  posterHudDismissed: false,
  posterHudDocked: false,
  posterHudPayload: null,
  posterRenderTimer: 0,
  posterHudRenderKey: '',
  posterHudRenderedDocked: false,
  posterHudRenderedMinimized: false,
  lastPosterHudUpdateAt: 0,
  thumbnailCacheDirty: false,
  thumbnailCacheSaveTimer: 0,
  thumbnailCacheSavePromise: null,
  bookmarkById: new Map(),
  duplicateBookmarkIds: new Set(),
  duplicateGroupCount: 0,
  unfiledBookmarkIds: new Set(),
  folderBookmarkIds: new Map(),
  mainRenderTimer: 0,
  mainRenderFrame: 0,
  cardMotionTimers: new Map(),

  async init() {
    this.settings = deepMerge(structuredClone(DefaultSettings), await StorageAdapter.get(STORAGE_KEY, {}));
    installStaticIcons();
    if (new URLSearchParams(location.search).has('noauto')) this.settings.thumbnails.autoGenerate = false;
    this.sortBy = this.settings.sortBy || 'recent';
    this.aiRecommendations = await StorageAdapter.get(AI_KEY, {});
    this.thumbnailCache = await StorageAdapter.get(THUMBNAIL_KEY, {});
    await this.migrateThumbnailCache();
    this.bindEvents();
    this.initAppHistory();
    this.adapter.onChanged(async () => {
      if (!this.bookmarksLoaded) return;
      await this.loadBookmarks();
      this.render();
    });
    if (this.shouldGateInitialBookmarkRead()) {
      this.firstRunLocked = true;
      this.renderLockedState();
      setTimeout(() => this.maybeShowOnboarding(true), 180);
      return;
    }
    await this.ensureBookmarksLoaded();
    this.render();
    this.showToast(this.adapter.isChrome ? '已连接浏览器原生书签' : '当前为演示数据模式：加载为扩展后会读取真实书签');
    setTimeout(() => this.maybeShowOnboarding(), 450);
    if (this.hasPosterGenerationConsent()) {
      setTimeout(() => this.kickoffAutoPosters('initial'), 900);
    }
  },

  async loadBookmarks() {
    this.tree = await this.adapter.getTree();
    const flat = BookmarkUtils.flattenTree(this.tree);
    this.bookmarks = flat.bookmarks.map((b) => {
      const normalizedUrl = BookmarkUtils.normalizeUrl(b.url);
      const row = {
        ...b,
        normalizedUrl,
        searchText: `${b.title || ''} ${b.url || ''} ${b.domain || ''} ${b.folderPath || ''}`.toLowerCase()
      };
      row.hasThumbnail = Boolean(this.getThumbnailForBookmark(row));
      return row;
    });
    this.folders = flat.folders.filter((f) => f.id !== '0');
    this.folderCount = BookmarkUtils.folderCounts(this.tree);
    this.folderMap = new Map(this.folders.map((f) => [String(f.id), f]));
    this.rebuildBookmarkIndexes();
    this.bookmarksLoaded = true;
    return this.tree;
  },

  rebuildBookmarkIndexes() {
    this.bookmarkById = new Map(this.bookmarks.map((b) => [String(b.id), b]));
    const duplicateGroups = BookmarkUtils.detectDuplicates(this.bookmarks);
    this.duplicateBookmarkIds = new Set(duplicateGroups.flat().map((b) => String(b.id)));
    this.duplicateGroupCount = duplicateGroups.length;
    this.unfiledBookmarkIds = new Set(this.bookmarks.filter((b) => ['1', '2'].includes(String(b.parentId))).map((b) => String(b.id)));
    this.folderBookmarkIds = new Map();
    const walk = (node) => {
      if (!node) return [];
      if (node.url) return [String(node.id)];
      const ids = (node.children || []).flatMap(walk);
      if (node.id != null) this.folderBookmarkIds.set(String(node.id), new Set(ids));
      return ids;
    };
    (this.tree || []).forEach(walk);
  },

  shouldGateInitialBookmarkRead() {
    return !(this.settings.onboarding?.thumbnailIntroDone && this.settings.onboarding?.introVersion === APP_VERSION);
  },

  async ensureBookmarksLoaded() {
    if (this.bookmarksLoaded) return;
    await this.loadBookmarks();
  },

  renderLockedState() {
    installStaticIcons();
    $('#sidebarTotal').textContent = '0';
    $('#duplicateCount').textContent = '0';
    $('#unfiledCount').textContent = '0';
    $('#recentCount').textContent = '0';
    $('#aiPendingCount').textContent = '0';
    $('#folderTree').innerHTML = '<div class="folder-locked">确认引导后读取浏览器书签</div>';
    $('#currentTitle').textContent = '欢迎使用书签海报墙';
    $('#currentSub').textContent = '阅读说明后再读取书签';
    $('#grid').className = `poster-grid ${this.settings.cardSize || 'large'} first-run-grid`;
    $('#grid').innerHTML = `<div class="first-run-state">
      <img class="first-run-icon app-icon" src="assets/icon.png" alt="" />
      <h3>先确认，再读取书签</h3>
      <p>首次打开时插件不会扫描书签、生成截图或执行整理。请先阅读引导，了解会读取哪些信息、为什么需要截图，以及如何先导出完整备份。</p>
      <div class="first-run-actions">
        <button id="firstRunOpenGuide" class="primary">${iconSvg('info')} 查看新手引导</button>
        <button id="firstRunExportHtml" class="ghost">${iconSvg('download')} 先导出 HTML 备份</button>
      </div>
    </div>`;
    $('#firstRunOpenGuide')?.addEventListener('click', () => this.maybeShowOnboarding(true));
    $('#firstRunExportHtml')?.addEventListener('click', () => this.exportAllBookmarks('html', { source: 'first-run-locked' }));
    this.renderBulkBar();
    this.renderAiVisibility();
    installStaticIcons();
  },

  async migrateThumbnailCache() {
    this.thumbnailCache = this.thumbnailCache || {};
    if (this.thumbnailCache.__schemaVersion === THUMBNAIL_SCHEMA_VERSION) return;
    const next = { __schemaVersion: THUMBNAIL_SCHEMA_VERSION };
    for (const [key, record] of Object.entries(this.thumbnailCache)) {
      if (key === '__schemaVersion') continue;
      if (!record || typeof record !== 'object') continue;
      // Previous builds could save ultra-thin “strip” screenshots when the smart crop
      // algorithm detected only horizontal text lines on white pages or captured a page
      // before meaningful content was rendered. Drop all old screenshot / failed records
      // so they are regenerated with the v4 quality gate and redesigned local fallback. Keep normal remote OG image URLs.
      if (record.source === 'screenshot' || record.status === 'failed' || record.screenshotFailedAt) continue;
      // Be conservative for pre-v3 local data URLs because they may already contain
      // the strip artifact. They are cheap to regenerate and safer to discard.
      if (record.dataUrl) continue;
      next[key] = record;
    }
    this.thumbnailCache = next;
    await StorageAdapter.set(THUMBNAIL_KEY, this.thumbnailCache);
  },

  bindEvents() {
    $('#searchInput').addEventListener('input', (e) => { this.query = e.target.value.trim(); const side = $('#sideSearchInput'); if (side && side.value !== e.target.value) side.value = e.target.value; this.queueMainRender(80); });
    $('#sideSearchInput')?.addEventListener('input', (e) => { this.query = e.target.value.trim(); const top = $('#searchInput'); if (top && top.value !== e.target.value) top.value = e.target.value; this.queueMainRender(80); });
    $$('.smart-item').forEach((item) => item.addEventListener('click', () => this.switchView(item.dataset.view)));
    $('#newFolderBtn')?.addEventListener('click', () => {
      if (!this.bookmarksLoaded && this.shouldGateInitialBookmarkRead()) { this.maybeShowOnboarding(true); return; }
      this.openMoveModal([]);
    });
    $('#sortSelect').addEventListener('change', (e) => { this.sortBy = e.target.value; this.settings.sortBy = e.target.value; this.saveSettings(); this.renderMain(); });
    $('#filterSelect').addEventListener('change', (e) => { this.filter = e.target.value; this.renderMain(); });
    $('#sizeSelect').addEventListener('change', (e) => { this.settings.cardSize = e.target.value; this.saveSettings(); this.renderMain(); });
    $('#posterAspectSelect')?.addEventListener('change', (e) => { this.settings.thumbnails = this.settings.thumbnails || {}; this.settings.thumbnails.posterAspect = e.target.value; this.saveSettings(); this.renderMain(); });
    $('#languageSelect')?.addEventListener('change', (e) => { this.settings.language = e.target.value; this.saveSettings(); this.applyLanguage(); this.render(); });
    $('#settingsLanguageSelect')?.addEventListener('change', (e) => {
      this.settings.language = e.target.value;
      const toolbar = $('#languageSelect');
      if (toolbar && toolbar.value !== e.target.value) toolbar.value = e.target.value;
      this.saveSettings();
      this.applyLanguage();
      this.render();
    });
    $('#settingsCardSizeSelect')?.addEventListener('change', (e) => {
      this.settings.cardSize = e.target.value;
      const toolbar = $('#sizeSelect');
      if (toolbar && toolbar.value !== e.target.value) toolbar.value = e.target.value;
      this.saveSettings();
      this.renderMain();
      this.syncToolbarSelects();
    });
    $('#settingsPosterAspectSelect')?.addEventListener('change', (e) => {
      this.settings.thumbnails = this.settings.thumbnails || {};
      this.settings.thumbnails.posterAspect = e.target.value;
      const toolbar = $('#posterAspectSelect');
      if (toolbar && toolbar.value !== e.target.value) toolbar.value = e.target.value;
      this.saveSettings();
      this.renderMain();
      this.syncToolbarSelects();
    });
    $('#scopeAll').addEventListener('click', () => this.switchView('all'));
    $('#scopeCurrent').addEventListener('click', () => {
      if (this.currentFolderId === 'all') this.switchView(this.folders[0]?.id || 'all');
      else this.renderMain();
    });
    $('#settingsBtn').addEventListener('click', () => this.openSettings());
    $('#closeSettings').addEventListener('click', () => this.closeSettings());
    $('#closeMoveModal').addEventListener('click', () => this.closeModal('#moveModal'));
    $('#closeEditModal').addEventListener('click', () => this.closeModal('#editModal'));
    $('#closeAiModal').addEventListener('click', () => this.closeModal('#aiModal'));
    $('#closeOnboardingX')?.addEventListener('click', () => this.closeOnboarding(false));
    $('#onboardingLater')?.addEventListener('click', () => this.finishOnboardingFlow());
    $('#onboardingSettings')?.addEventListener('click', () => { this.applyOnboardingPosterSettings(); this.finishOnboardingFlow({ openSettings: true }); });
    $('#onboardingExportHtml')?.addEventListener('click', async () => { await this.exportAllBookmarks('html', { source: 'onboarding' }); });
    $('#onboardingExportJson')?.addEventListener('click', async () => { await this.exportAllBookmarks('json', { source: 'onboarding' }); });
    $('#onboardingGenerate')?.addEventListener('click', () => { if ($('#onboardingAutoPosterConsent')?.checked === false) { this.showToast('请先勾选同意并发生成真实海报'); return; } this.applyOnboardingPosterSettings(); this.grantPosterGenerationConsent(); this.finishOnboardingFlow({ generate: true }); });
    $('#onboardingConcurrent')?.addEventListener('input', (e) => this.syncConcurrencyInputs(e.target.value, 'onboarding'));
    $('#onboardingConcurrentNumber')?.addEventListener('input', (e) => this.syncConcurrencyInputs(e.target.value, 'onboarding'));
    $('#posterConcurrent')?.addEventListener('input', (e) => this.syncConcurrencyInputs(e.target.value, 'settings'));
    $('#posterConcurrentNumber')?.addEventListener('input', (e) => this.syncConcurrencyInputs(e.target.value, 'settings'));
    $('#helpBtn')?.addEventListener('click', () => this.maybeShowOnboarding(true));
    $('#aiBtn').addEventListener('click', () => this.openAiConfirm('visible'));
    $('#bulkAiBtn').addEventListener('click', () => this.openAiConfirm('selected'));
    $('#bulkMoveBtn').addEventListener('click', () => this.openMoveModal([...this.selectedIds]));
    $('#bulkDeleteBtn').addEventListener('click', () => this.deleteSelected());
    $('#bulkRefreshBtn').addEventListener('click', () => {
      const selected = [...this.selectedIds]
        .map((id) => this.bookmarkById.get(String(id)))
        .filter(Boolean);
      const targets = selected.length ? selected : this.getVisibleBookmarks();
      // For a bulk refresh we want to process every visible bookmark rather than a fixed slice.
      const limit = Math.max(POSTER_VISIBLE_LIMIT, targets.length);
      this.generatePosters(targets.slice(0, limit), { silent: false });
    });
    $('#generateVisiblePostersBtn')?.addEventListener('click', () => { this.closeSettings(); this.generatePostersForVisible(true); });
    $('#generateVisibleThumbsBtn')?.addEventListener('click', () => { this.closeSettings(); this.openThumbnailConfirm('visible'); });
    $('#repairFailedPostersBtn')?.addEventListener('click', async () => {
      await this.collectAndSaveSettings({ silent: true });
      this.closeSettings();
      await this.repairFailedPosters('all');
    });
    $('#clearThumbsBtn')?.addEventListener('click', () => this.clearThumbnailCache());
    $('#cancelSelectionBtn').addEventListener('click', () => this.clearSelection());
    $('#undoBtn').addEventListener('click', () => this.undo());

    $('#saveSettingsBtn').addEventListener('click', () => this.collectAndSaveSettings());
    $('#saveAndRunAiBtn')?.addEventListener('click', async () => { await this.collectAndSaveSettings({ silent: true }); this.closeSettings(); this.openAiConfirm('visible'); });
    $('#settingsDockPrimary')?.addEventListener('click', () => this.handleSettingsDockPrimary());
    $('#settingsDockSecondary')?.addEventListener('click', () => this.handleSettingsDockSecondary());
    $('#testAiBtn').addEventListener('click', () => this.testAiConnection());
    $('#providerSelect').addEventListener('change', (e) => { this.applyProviderTemplate(e.target.value); this.renderSettingsSummaries(); });
    ['modelName', 'batchSize', 'captureSize', 'captureDelay', 'minConfidence', 'providerName', 'baseUrl'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', () => this.renderSettingsSummaries());
      document.getElementById(id)?.addEventListener('change', () => this.renderSettingsSummaries());
    });
    $('#editSaveBtn').addEventListener('click', () => this.saveEdit());
    $('#editDeleteBtn').addEventListener('click', () => this.deleteFromEdit());
    $('#folderSearch').addEventListener('input', () => this.renderMoveList());
    $('#moveCreateBtn').addEventListener('click', () => this.createFolderAndMove());
    $('#exportBtn').addEventListener('click', () => this.exportBackup());
    $('#exportBookmarksHtmlBtn')?.addEventListener('click', () => this.exportAllBookmarks('html', { source: 'settings' }));
    $('#exportBookmarksJsonBtn')?.addEventListener('click', () => this.exportAllBookmarks('json', { source: 'settings' }));
    $('#clearAiBtn').addEventListener('click', () => this.clearAiRecommendations());
    $('#refreshBtn').addEventListener('click', async () => {
      if (!this.bookmarksLoaded && this.shouldGateInitialBookmarkRead()) { await this.maybeShowOnboarding(true); return; }
      await this.loadBookmarks();
      this.render();
      this.showToast('已同步最新书签');
    });

    $$('.settings-nav button').forEach((btn) => btn.addEventListener('click', () => {
      this.activeSettingsTab = btn.dataset.tab;
      this.renderSettingsTabs();
    }));
    $$('[data-jump-tab]').forEach((btn) => btn.addEventListener('click', () => {
      this.activeSettingsTab = btn.dataset.jumpTab;
      this.renderSettingsTabs();
    }));

    $$('[data-proxy]').forEach((btn) => btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.proxy || '');
      if (target) target.click();
    }));

    $$('[data-setting-mirror="requireBackupBeforeOrganize"]').forEach((input) => {
      input.addEventListener('change', () => {
        const primary = $('#requireBackupBeforeOrganize');
        if (primary) primary.checked = input.checked;
      });
    });

    this.bindModalBackdropClose();
    this.bindGridEvents();
    // 绑定缩略图设置相关卡片和开关的点击事件
    this.bindThumbnailCustomControls();
    this.bindPosterPresetControls();
    this.enhanceToolbarSelects();
    this.bindCaptureSurfaceCleanupEvents();
  },

  bindCaptureSurfaceCleanupEvents() {
    if (this.captureSurfaceCleanupBound) return;
    this.captureSurfaceCleanupBound = true;
    const cleanup = () => {
      if (!this.activeCaptureTabs.size && !this.activeCaptureWindows.size) return;
      this.posterAbort = true;
      this.cleanupActiveCaptureSurfaces({ fireAndForget: true });
    };
    window.addEventListener('pagehide', cleanup);
    window.addEventListener('beforeunload', cleanup);
  },

  queueMainRender(delayMs = 0) {
    clearTimeout(this.mainRenderTimer);
    if (this.mainRenderFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.mainRenderFrame);
    this.mainRenderTimer = 0;
    this.mainRenderFrame = 0;
    const run = () => {
      this.mainRenderTimer = 0;
      this.mainRenderFrame = 0;
      this.renderMain();
    };
    if (delayMs > 0) {
      this.mainRenderTimer = setTimeout(run, delayMs);
      return;
    }
    if (typeof requestAnimationFrame === 'function') this.mainRenderFrame = requestAnimationFrame(run);
    else this.mainRenderTimer = setTimeout(run, 0);
  },

  bindGridEvents() {
    const grid = $('#grid');
    if (!grid || grid.dataset.gridEventsBound === '1') return;
    grid.dataset.gridEventsBound = '1';
    grid.addEventListener('click', (event) => {
      const card = event.target.closest('.poster-card');
      if (!card || !grid.contains(card)) return;
      const id = card.dataset.id;
      const menu = event.target.closest('.card-menu');
      if (menu) {
        this.pressElement(menu);
        this.openEdit(id);
        return;
      }
      if (event.target.closest('.select-dot') || event.metaKey || event.ctrlKey || event.shiftKey) {
        this.toggleSelect(id, event.shiftKey);
        return;
      }
      this.openEdit(id);
    });
    grid.addEventListener('dblclick', (event) => {
      const card = event.target.closest('.poster-card');
      if (!card || !grid.contains(card)) return;
      const b = this.bookmarkById.get(String(card.dataset.id));
      if (b?.url) window.open(b.url, '_blank', 'noopener,noreferrer');
    });
    grid.addEventListener('dragstart', (event) => {
      const card = event.target.closest('.poster-card');
      if (!card || !grid.contains(card)) return;
      const id = String(card.dataset.id);
      const ids = this.selectedIds.has(id) ? [...this.selectedIds] : [id];
      event.dataTransfer.setData('application/json', JSON.stringify(ids));
      event.dataTransfer.effectAllowed = 'move';
    });
  },

  bindModalBackdropClose() {
    ['#settingsModal', '#moveModal', '#editModal', '#aiModal'].forEach((selector) => {
      const modal = $(selector);
      if (!modal || modal.dataset.backdropCloseBound === '1') return;
      modal.dataset.backdropCloseBound = '1';
      const close = () => {
        if (selector === '#settingsModal') this.closeSettings();
        else this.closeModal(selector);
      };
      modal.addEventListener('pointerdown', (event) => {
        if (event.target === modal) modal.dataset.backdropDown = '1';
        else delete modal.dataset.backdropDown;
      });
      modal.addEventListener('pointerup', (event) => {
        const startedOnBackdrop = modal.dataset.backdropDown === '1';
        delete modal.dataset.backdropDown;
        if (startedOnBackdrop && event.target === modal) close();
      });
      modal.addEventListener('click', (event) => {
        if (event.target === modal) close();
      });
    });
  },

  enhanceToolbarSelects() {
    const ids = ['sortSelect', 'filterSelect', 'sizeSelect', 'posterAspectSelect', 'languageSelect'];
    ids.forEach((id) => {
      const select = document.getElementById(id);
      if (!select || select.dataset.customSelect === '1') return;
      const wrapper = document.createElement('div');
      wrapper.className = `custom-select custom-select-${id}`;
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'custom-select-trigger';
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      const menu = document.createElement('div');
      menu.className = 'custom-select-menu';
      menu.setAttribute('role', 'listbox');
      select.parentNode.insertBefore(wrapper, select);
      wrapper.append(select, trigger, menu);
      select.classList.add('toolbar-native-select');
      select.dataset.customSelect = '1';

      const close = () => {
        wrapper.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      };
      const sync = () => {
        const selected = select.selectedOptions[0] || select.options[0];
        trigger.textContent = selected ? selected.textContent : '';
        trigger.title = select.title || trigger.textContent;
        menu.innerHTML = [...select.options].map((option) => (
          `<button type="button" class="custom-select-option ${option.selected ? 'selected' : ''}" role="option" aria-selected="${option.selected}" data-value="${escapeHtml(option.value)}">${escapeHtml(option.textContent)}</button>`
        )).join('');
      };

      trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        $$('.custom-select.open').forEach((item) => {
          if (item !== wrapper) {
            item.classList.remove('open');
            item.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', 'false');
          }
        });
        const open = !wrapper.classList.contains('open');
        wrapper.classList.toggle('open', open);
        trigger.setAttribute('aria-expanded', String(open));
      });
      menu.addEventListener('click', (event) => {
        const option = event.target.closest('.custom-select-option');
        if (!option) return;
        select.value = option.dataset.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        sync();
        close();
      });
      select.addEventListener('change', sync);
      select._syncCustomSelect = sync;
      sync();
    });

    if (!this.toolbarSelectCloseBound) {
      this.toolbarSelectCloseBound = true;
      document.addEventListener('click', () => {
        $$('.custom-select.open').forEach((item) => {
          item.classList.remove('open');
          item.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', 'false');
        });
      });
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        $$('.custom-select.open').forEach((item) => {
          item.classList.remove('open');
          item.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', 'false');
        });
      });
    }
  },

  syncToolbarSelects() {
    ['sortSelect', 'filterSelect', 'sizeSelect', 'posterAspectSelect', 'languageSelect'].forEach((id) => {
      const select = document.getElementById(id);
      if (select?._syncCustomSelect) select._syncCustomSelect();
    });
  },

  initAppHistory() {
    if (this.historyReady || typeof history === 'undefined') return;
    this.historyReady = true;
    const initialState = this.normalizeAppHistoryState(history.state);
    history.replaceState(initialState, '');
    window.addEventListener('popstate', (event) => {
      this.applyAppHistoryState(event.state);
    });
  },

  isKnownSettingsTab(tab) {
    return SETTINGS_TABS.includes(String(tab || ''));
  },

  currentManagedModal() {
    if ($('#settingsModal')?.classList.contains('show')) return 'settings';
    if ($('#onboardingModal')?.classList.contains('show')) return 'onboarding';
    return null;
  },

  normalizeAppHistoryState(state) {
    const view = String(state?.view || this.currentFolderId || 'all');
    const modal = ['settings', 'onboarding'].includes(state?.modal) ? state.modal : null;
    const settingsTab = this.isKnownSettingsTab(state?.settingsTab) ? state.settingsTab : (this.activeSettingsTab || 'basic');
    return {
      __bookmarkWall: APP_HISTORY_MARKER,
      view,
      modal,
      settingsTab
    };
  },

  syncAppHistory(overrides = {}, options = {}) {
    if (!this.historyReady || this.historySyncMuted || typeof history === 'undefined') return;
    const current = this.normalizeAppHistoryState(history.state);
    const next = this.normalizeAppHistoryState({
      ...current,
      view: this.currentFolderId || 'all',
      modal: this.currentManagedModal(),
      settingsTab: this.activeSettingsTab || 'basic',
      ...overrides
    });
    history[options.replace ? 'replaceState' : 'pushState'](next, '');
  },

  applyAppHistoryState(state) {
    const next = this.normalizeAppHistoryState(state);
    this.historySyncMuted = true;
    try {
      const nextView = String(next.view || 'all');
      if (nextView !== String(this.currentFolderId)) {
        this.expandAncestorsOfFolder(nextView);
        this.currentFolderId = nextView;
        this.selectedIds.clear();
        this.pendingViewTransition = true;
      }

      if (this.isKnownSettingsTab(next.settingsTab)) this.activeSettingsTab = next.settingsTab;

      if (next.modal === 'settings') {
        this.openModal('#settingsModal', { immediate: true });
        this.fillSettingsForm();
        this.renderSettingsTabs({ syncHistory: false });
        this.closeModal('#onboardingModal', { immediate: true });
      } else if (next.modal === 'onboarding') {
        this.closeModal('#settingsModal', { immediate: true });
        this.openModal('#onboardingModal', { immediate: true });
        this.renderOnboardingBackupStatus();
      } else {
        this.closeModal('#settingsModal', { immediate: true });
        this.closeModal('#onboardingModal', { immediate: true });
      }

      if (this.firstRunLocked && !this.bookmarksLoaded) this.renderLockedState();
      else this.render();
    } finally {
      this.historySyncMuted = false;
    }
  },

  /**
   * 在设置面板中绑定截图引擎、裁剪方式卡片组以及胶囊开关的交互逻辑。
   * 用户点击卡片时会更新隐藏的 select 值并设置高亮样式；
   * 胶囊开关点击会切换复选框的选中状态。
   */
  bindThumbnailCustomControls() {
    // 引擎卡片选择
    const engineCards = $$('.engine-card');
    if (engineCards.length) {
      engineCards.forEach((card) => {
        if (card.dataset.choiceBound === '1') return;
        card.dataset.choiceBound = '1';
        card.addEventListener('click', () => {
          const value = card.dataset.value;
          const select = $('#screenshotStrategy');
          if (select) select.value = value;
          engineCards.forEach((c) => c.classList.toggle('active', c === card));
          this.renderSettingsSummaries();
        });
      });
      // 根据当前值设置高亮
      const current = $('#screenshotStrategy')?.value;
      engineCards.forEach((c) => c.classList.toggle('active', c.dataset.value === current));
    }
    // 裁剪卡片选择
    const cropCards = $$('.crop-card');
    if (cropCards.length) {
      cropCards.forEach((card) => {
        if (card.dataset.choiceBound === '1') return;
        card.dataset.choiceBound = '1';
        card.addEventListener('click', () => {
          const value = card.dataset.value;
          const select = $('#cropMode');
          if (select) select.value = value;
          cropCards.forEach((c) => c.classList.toggle('active', c === card));
          this.renderSettingsSummaries();
        });
      });
      const currentCrop = $('#cropMode')?.value;
      cropCards.forEach((c) => c.classList.toggle('active', c.dataset.value === currentCrop));
    }
    // 胶囊开关：点击标签即可切换 checkbox
    const togglePills = $$('.toggle-group label.toggle-pill');
    if (togglePills.length) {
      togglePills.forEach((pill) => {
        const input = pill.querySelector('input');
        if (input) {
          // 根据对应隐藏字段初始化选中状态
          const targetId = input.dataset.target;
          const original = targetId ? document.getElementById(targetId) : null;
          if (original) {
            input.checked = original.checked;
          }
          this.updateTogglePillClass(pill, input.checked);
          if (pill.dataset.toggleBound === '1') return;
          pill.dataset.toggleBound = '1';
          pill.addEventListener('click', (e) => {
            // 避免点击内部 checkbox 重复触发
            if (e.target.tagName.toLowerCase() === 'input') return;
            input.checked = !input.checked;
            // 同步到隐藏的原始开关
            if (original) original.checked = input.checked;
            this.updateTogglePillClass(pill, input.checked);
            this.renderSettingsSummaries();
          });
          input.addEventListener('change', () => {
            // 同步到原始开关
            if (original) original.checked = input.checked;
            this.updateTogglePillClass(pill, input.checked);
            this.renderSettingsSummaries();
          });
        }
      });
    }

    // 并发刻度按钮组：同步滑块值和刻度高亮
    const slider = $('#posterConcurrent');
    const marks = $$('.concurrency-mark');
    if (slider && marks.length) {
      // 初始化高亮状态
      marks.forEach((m) => {
        m.classList.toggle('active', Number(m.dataset.value) === Number(slider.value));
      });
      marks.forEach((m) => {
        if (m.dataset.markBound === '1') return;
        m.dataset.markBound = '1';
        m.addEventListener('click', () => {
          const v = m.dataset.value;
          this.syncConcurrencyInputs(v, 'settings');
          marks.forEach((k) => k.classList.toggle('active', k === m));
        });
      });
      if (slider.dataset.rangeBound !== '1') {
        slider.dataset.rangeBound = '1';
        slider.addEventListener('input', () => this.syncConcurrencyInputs(slider.value, 'settings'));
      }
    }
  },

  bindPosterPresetControls() {
    $$('.poster-preset').forEach((button) => {
      if (button.dataset.presetBound === '1') return;
      button.dataset.presetBound = '1';
      button.addEventListener('click', () => this.applyPosterPreset(button.dataset));
    });
    this.syncPosterPresetCards();
  },

  applyPosterPreset(data) {
    if (!data) return;
    const strategy = $('#screenshotStrategy');
    const captureSize = $('#captureSize');
    const captureDelay = $('#captureDelay');
    const cropMode = $('#cropMode');
    if (strategy && data.strategy) strategy.value = data.strategy;
    if (captureSize && data.size) captureSize.value = data.size;
    if (captureDelay && data.delay) captureDelay.value = data.delay;
    if (cropMode && data.crop) cropMode.value = data.crop;
    if (data.concurrent) this.syncConcurrencyInputs(data.concurrent, 'settings');
    this.bindThumbnailCustomControls();
    this.renderSettingsSummaries();
    this.syncPosterPresetCards();
  },

  syncPosterPresetCards() {
    const strategy = $('#screenshotStrategy')?.value || '';
    const size = $('#captureSize')?.value || '';
    const delay = $('#captureDelay')?.value || '';
    const crop = $('#cropMode')?.value || '';
    const concurrent = String(clampConcurrency($('#posterConcurrentNumber')?.value || $('#posterConcurrent')?.value || 4));
    $$('.poster-preset').forEach((button) => {
      const active = button.dataset.strategy === strategy
        && button.dataset.size === size
        && button.dataset.delay === delay
        && button.dataset.crop === crop
        && String(clampConcurrency(button.dataset.concurrent || 4)) === concurrent;
      button.classList.toggle('active', active);
    });
  },

  /**
   * 更新胶囊开关的外观：选中时使用主色高亮，未选中时使用默认色。
   * @param {HTMLElement} pill
   * @param {boolean} checked
   */
  updateTogglePillClass(pill, checked) {
    if (!pill) return;
    pill.classList.toggle('is-on', checked);
    if (checked) {
      pill.style.background = '#245edb';
      pill.style.borderColor = '#245edb';
      pill.style.color = '#fff';
    } else {
      pill.style.background = '#fff';
      pill.style.borderColor = '#e5ebf5';
      pill.style.color = '#334155';
    }
  },

  locale() {
    return this.settings.language === 'en' ? 'en' : 'zh-CN';
  },

  t(key, vars = {}) {
    const dict = I18N[this.locale()] || I18N['zh-CN'];
    let value = dict[key] || I18N['zh-CN'][key] || key;
    for (const [name, replacement] of Object.entries(vars)) value = value.replace(`{${name}}`, String(replacement));
    return value;
  },

  posterAspectClass() {
    return this.settings.thumbnails?.posterAspect === 'portrait' ? 'poster-portrait' : 'poster-landscape';
  },

  translateSmartTitle(title) {
    const map = {
      '全部书签': this.t('allBookmarks'),
      '重复书签': this.t('duplicates'),
      '最近添加': this.t('recent'),
      '未分类书签': this.t('unfiled'),
      'AI 建议待确认': this.t('aiPending'),
      '书签海报墙': this.t('appName')
    };
    return map[title] || title;
  },

  applyLanguage() {
    const lang = this.locale();
    document.documentElement.lang = lang;
    document.title = this.t('appName');
    const setText = (selector, value) => { const el = $(selector); if (el) el.textContent = value; };
    const setPlaceholder = (selector, value) => { const el = $(selector); if (el) el.placeholder = value; };
    setText('.brand strong', this.t('appName'));
    const settingsNav = $('.settings-nav');
    if (settingsNav) settingsNav.dataset.brand = this.t('appName');
    setPlaceholder('#searchInput', this.t('search'));
    setPlaceholder('#sideSearchInput', this.t('sideSearch'));
    setText('[data-view="all"] b', this.t('allBookmarks'));
    setText('[data-view="unfiled"] b', this.t('unfiled'));
    setText('[data-view="recent"] b', this.t('recent'));
    setText('[data-view="duplicates"] b', this.t('duplicates'));
    setText('[data-view="ai-pending"] b', this.t('aiPending'));
    setText('.side-section-title span', this.t('folders'));
    const settingsBtn = $('#settingsBtn');
    if (settingsBtn) settingsBtn.innerHTML = `${iconSvg('gear')} ${this.t('settings')}`;
    const helpBtn = $('#helpBtn');
    if (helpBtn) helpBtn.innerHTML = `${iconSvg('help')} ${this.t('help')}`;
    setText('#scopeAll', this.t('all'));
    setText('#scopeCurrent', this.t('currentFolder'));
    if ($('#sortSelect')) {
      const labels = ['sortRecent', 'sortTitle', 'sortDomain', 'sortFolder', 'sortAi'];
      [...$('#sortSelect').options].forEach((option, i) => { option.textContent = this.t(labels[i]); });
    }
    if ($('#filterSelect')) {
      const labels = ['filter', 'withAi', 'noAi', 'duplicates', 'githubDomain'];
      [...$('#filterSelect').options].forEach((option, i) => { option.textContent = this.t(labels[i]); });
    }
    if ($('#sizeSelect')) {
      const labels = ['cardLarge', 'cardMedium', 'cardSmall'];
      [...$('#sizeSelect').options].forEach((option, i) => { option.textContent = this.t(labels[i]); });
    }
    if ($('#posterAspectSelect')) {
      $('#posterAspectSelect').value = this.settings.thumbnails?.posterAspect || 'landscape';
      $('#posterAspectSelect').options[0].textContent = this.t('landscape');
      $('#posterAspectSelect').options[1].textContent = this.t('portrait');
    }
    if ($('#languageSelect')) $('#languageSelect').value = lang;
    if ($('#settingsLanguageSelect')) $('#settingsLanguageSelect').value = lang;
    const refresh = $('#refreshBtn');
    if (refresh) refresh.title = this.t('sync');
    this.syncToolbarSelects?.();
  },

  render() {
    installStaticIcons();
    this.applyLanguage();
    this.renderSidebar();
    this.renderMain();
    this.renderAiVisibility();
    installStaticIcons();
  },

  renderSidebar() {
    $('#sidebarTotal').textContent = this.bookmarks.length.toLocaleString();
    $('#duplicateCount').textContent = this.duplicateBookmarkIds.size;
    $('#unfiledCount').textContent = this.unfiledBookmarkIds.size;
    $('#recentCount').textContent = Math.min(80, this.bookmarks.length);
    $('#aiPendingCount').textContent = Object.values(this.aiRecommendations).filter((r) => r.status === 'pending').length;
    $('#folderTree').innerHTML = this.renderTreeHtml(this.tree[0]?.children || [], 0);
    $$('#folderTree .folder-toggle').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.toggleFolderCollapse(btn.dataset.id);
      });
    });
    $$('#folderTree .folder-select').forEach((btn) => {
      btn.addEventListener('click', () => this.switchView(btn.dataset.id));
    });
    $$('#folderTree .folder-row').forEach((row) => {
      row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drop-target'); });
      row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
      row.addEventListener('drop', async (e) => {
        e.preventDefault(); row.classList.remove('drop-target');
        const ids = JSON.parse(e.dataTransfer.getData('application/json') || '[]');
        await this.moveBookmarks(ids.length ? ids : [...this.selectedIds], row.dataset.id);
      });
    });
    $$('.smart-item').forEach((item) => item.classList.toggle('active', item.dataset.view === this.currentFolderId));
  },

  renderTreeHtml(nodes, depth) {
    return nodes.filter((n) => !n.url).map((node) => {
      const active = String(this.currentFolderId) === String(node.id) ? 'active' : '';
      const count = this.folderCount[node.id] ?? 0;
      const hasChildFolders = (node.children || []).some((child) => !child.url);
      const collapsed = this.collapsedFolderIds.has(String(node.id));
      const children = hasChildFolders && !collapsed
        ? `<div class="folder-children">${this.renderTreeHtml(node.children, depth + 1)}</div>` : '';
      const title = node.title || '未命名文件夹';
      return `<div class="folder-block" style="--depth:${depth}">
        <div class="folder-row ${active} ${hasChildFolders ? 'has-children' : 'is-leaf'} ${collapsed ? 'collapsed' : 'expanded'}" data-id="${escapeHtml(node.id)}" title="${escapeHtml(title)}">
          <button type="button" class="folder-toggle" data-id="${escapeHtml(node.id)}" aria-label="${collapsed ? '展开' : '收纳'} ${escapeAttr(title)}" aria-expanded="${collapsed ? 'false' : 'true'}" ${hasChildFolders ? '' : 'disabled tabindex="-1"'}>${hasChildFolders ? iconSvg('chevron') : ''}</button>
          <button type="button" class="folder-select" data-id="${escapeHtml(node.id)}">
            <span class="folder-icon">${iconSvg('folder')}</span><span class="folder-title">${escapeHtml(title)}</span><span class="count">${count}</span>
          </button>
        </div>${children}</div>`;
    }).join('');
  },

  switchView(folderId, options = {}) {
    const nextId = folderId || 'all';
    if (String(this.currentFolderId) === String(nextId) && !options.force) return;
    this.expandAncestorsOfFolder(nextId);
    this.currentFolderId = nextId;
    this.selectedIds.clear();
    this.pendingViewTransition = true;
    if (options.syncHistory !== false) this.syncAppHistory({ view: nextId, modal: this.currentManagedModal() }, { replace: Boolean(options.replaceHistory) });
    this.render();
  },

  toggleFolderCollapse(folderId) {
    const id = String(folderId || '');
    if (!id) return;
    if (this.collapsedFolderIds.has(id)) this.collapsedFolderIds.delete(id);
    else this.collapsedFolderIds.add(id);
    this.renderSidebar();
  },

  expandAncestorsOfFolder(folderId) {
    const targetId = String(folderId || '');
    if (!targetId || ['all', 'duplicates', 'recent', 'unfiled', 'ai-pending'].includes(targetId)) return;
    const walk = (nodes, ancestors = []) => {
      for (const node of nodes || []) {
        if (String(node.id) === targetId) return ancestors;
        const found = node.children ? walk(node.children.filter((child) => !child.url), [...ancestors, String(node.id)]) : null;
        if (found) return found;
      }
      return null;
    };
    (walk(this.tree[0]?.children || []) || []).forEach((id) => this.collapsedFolderIds.delete(id));
  },

  renderMain() {
    clearTimeout(this.mainRenderTimer);
    if (this.mainRenderFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.mainRenderFrame);
    this.mainRenderTimer = 0;
    this.mainRenderFrame = 0;
    if (this.firstRunLocked && !this.bookmarksLoaded) {
      this.renderLockedState();
      return;
    }
    const list = this.getVisibleBookmarks();
    const current = this.getCurrentTitle();
    $('#currentTitle').textContent = this.translateSmartTitle(current.title);
    $('#currentSub').textContent = this.t('bookmarkCount', { count: list.length });
    const grid = $('#grid');
    grid.className = `poster-grid ${this.settings.cardSize} ${this.posterAspectClass()}${this.pendingViewTransition ? ' view-switching' : ''}`;
    const guide = this.renderThumbnailGuide(list);
    grid.innerHTML = guide + (list.map((bookmark, index) => this.renderCard(bookmark, index)).join('') || this.renderEmptyState());
    this.bindThumbnailGuideEvents();
    $('#scopeAll').classList.toggle('active', this.currentFolderId === 'all');
    $('#scopeCurrent').classList.toggle('active', this.currentFolderId !== 'all');
    this.bindCardEvents();
    this.renderBulkBar();
    this.renderAiVisibility();
    this.scheduleVisiblePosterGeneration();
    this.pendingViewTransition = false;
  },

  scheduleVisiblePosterGeneration() {
    if (this.posterQueueRunning || this.settings.thumbnails?.autoGenerate === false || !this.hasPosterGenerationConsent()) return;
    clearTimeout(this.posterScheduleTimer);
    this.posterScheduleTimer = setTimeout(() => {
      // Identify all visible bookmarks that still need a poster.
      const candidates = this.getVisibleBookmarks().filter((b) => this.needsPosterGeneration(b));
      // Determine how many posters to process.  Respect the configured limit,
      // but never cap below the number of candidates so that all visible bookmarks are
      // eventually processed. This avoids only generating posters for a small
      // portion of a large bookmark collection.
      const configured = Number(this.settings.thumbnails?.visibleLimit || POSTER_VISIBLE_LIMIT);
      const limit = Math.max(configured, candidates.length);
      const missing = candidates.slice(0, limit);
      if (missing.length) {
        this.generatePosters(missing, { silent: true, reason: 'visible-auto' });
      }
    }, 1200);
  },

  renderThumbnailGuide(list) {
    if (!list.length) return '';
    let missing = 0;
    let screenshotCount = 0;
    let failedCount = 0;
    for (const b of list) {
      const thumb = this.getThumbnailForBookmark(b);
      if (this.needsPosterGeneration(b, thumb)) missing += 1;
      if (this.isFailedPosterThumb(thumb)) failedCount += 1;
      if (thumb?.source === 'screenshot') screenshotCount += 1;
    }
    if (this.thumbnailGuideDismissed && !this.posterQueueRunning && !failedCount) return '';
    const generated = list.length - missing;
    const autoOn = this.settings.thumbnails?.autoGenerate !== false;
    const total = Math.max(1, list.length);
    const progress = Math.min(100, Math.round((screenshotCount / total) * 100));
    const guideStateClass = this.thumbnailGuideMinimized ? ' minimized' : '';
    const guideControls = `<div class="guide-window-controls">
      <button type="button" id="guideMinimize" class="guide-window-btn" aria-label="${this.thumbnailGuideMinimized ? '展开提示窗' : '缩小提示窗'}">${iconSvg(this.thumbnailGuideMinimized ? 'expand' : 'minimize')}</button>
      <button type="button" id="guideDismiss" class="guide-window-btn" aria-label="关闭提示窗">${iconSvg('close')}</button>
    </div>`;
    if (this.posterQueueRunning) {
      const done = this.posterStats.done || 0;
      const queueTotal = this.posterStats.total || list.length;
      const runningPct = queueTotal ? Math.round(done / queueTotal * 100) : 0;
      this.updatePosterProgressHud({
        show: true,
        pct: runningPct,
        title: `正在生成海报 · 并发 ${this.posterStats.workers || clampConcurrency(this.settings.thumbnails?.concurrent || 4)}`,
        text: `已处理 ${done} / ${queueTotal}，成功 ${this.posterStats.success || 0}，失败 ${this.posterStats.failed || 0}`,
        done,
        total: queueTotal
      });
      return '';
    }
    this.hidePosterProgressHud();
    if (!missing && generated) return '';
    if (!this.hasPosterGenerationConsent()) {
      const localCount = list.length - screenshotCount;
      return `<div class="thumbnail-guide design-pill consent-needed${guideStateClass}">
        ${guideControls}
        <div class="guide-status"><span class="progress-dot ready" style="--p:${progress}"></span><div class="guide-copy"><strong>当前为本地预览模式，尚未访问网页</strong><span>已用轻量本地封面展示 ${localCount}/${list.length} 个书签。点击同意后，插件才会并发访问网页并生成真实截图海报。</span></div></div>
        <div class="guide-meter"><i style="width:${progress}%"></i></div>
        <div class="guide-actions"><button id="guideLearnThumbs" class="primary">查看引导并授权</button></div>
      </div>`;
    }
    const title = autoOn ? '真实网页截图会自动生成' : '当前显示的是占位 / 网页封面';
    const desc = autoOn
      ? `当前 ${screenshotCount}/${list.length} 个书签已有真实截图；缺失项会优先用增强 CDP 模式生成真实首屏海报。`
      : '点击后会优先使用增强 CDP 模式后台生成真实网页截图，失败时降级并在卡片标记。';
    if (failedCount) {
      const allFailedCount = this.getFailedPosterBookmarks('all').length;
      return `<div class="thumbnail-guide design-pill repair-needed${guideStateClass}">
        ${guideControls}
        <div class="guide-status"><span class="progress-dot warning" style="--p:${progress}"></span><div class="guide-copy"><strong>发现 ${failedCount} 个截图失败海报</strong><span>将一次性补拍全部失败项（共 ${allFailedCount} 个），使用兼容窗口、低并发和更长等待时间。</span></div></div>
        <div class="guide-meter"><i style="width:${progress}%"></i></div>
        <div class="guide-actions"><button id="guideRepairFailedPosters" class="primary">一键补拍失败项</button><button id="guideLearnThumbs" class="ghost">查看引导</button></div>
      </div>`;
    }
    return `<div class="thumbnail-guide design-pill${guideStateClass}">
      ${guideControls}
      <div class="guide-status"><span class="progress-dot ready" style="--p:${progress}"></span><div class="guide-copy"><strong>${title}</strong><span>${desc}</span></div></div>
      <div class="guide-meter"><i style="width:${progress}%"></i></div>
      <div class="guide-actions"><button id="guideGeneratePosters" class="primary">生成当前可见海报</button><button id="guideLearnThumbs" class="ghost">查看引导</button></div>
    </div>`;
  },

  bindThumbnailGuideEvents() {
    $('#guideMinimize')?.addEventListener('click', () => this.toggleThumbnailGuideMinimized());
    $('#guideDismiss')?.addEventListener('click', () => this.dismissThumbnailGuide());
    $('#guideGeneratePosters')?.addEventListener('click', () => {
      if (!this.hasPosterGenerationConsent()) {
        this.maybeShowOnboarding(true);
        this.showToast('请先在引导页确认允许生成真实海报');
        return;
      }
      this.generatePostersForVisible(true);
    });
    $('#guideRepairFailedPosters')?.addEventListener('click', () => this.repairFailedPosters('all'));
    $('#guideStopPosters')?.addEventListener('click', () => this.stopPosterGeneration('正在停止海报生成队列，并关闭临时截图窗口'));
    $('#guideLearnThumbs')?.addEventListener('click', () => this.maybeShowOnboarding(true));
  },

  toggleThumbnailGuideMinimized() {
    this.thumbnailGuideMinimized = !this.thumbnailGuideMinimized;
    this.renderMain();
  },

  dismissThumbnailGuide() {
    this.thumbnailGuideDismissed = true;
    const guide = $('.thumbnail-guide');
    if (!guide) {
      this.renderMain();
      return;
    }
    guide.classList.add('closing');
    setTimeout(() => this.renderMain(), 180);
  },

  hasPosterGenerationConsent() {
    return this.settings.onboarding?.posterConsentGranted === true;
  },

  async grantPosterGenerationConsent() {
    this.settings.onboarding = this.settings.onboarding || {};
    this.settings.onboarding.posterConsentGranted = true;
    this.settings.onboarding.thumbnailIntroDone = true;
    this.settings.onboarding.introVersion = APP_VERSION;
    this.settings.onboarding.lastShownAt = Date.now();
    this.settings.thumbnails = this.settings.thumbnails || {};
    this.settings.thumbnails.autoGenerate = true;
    await this.saveSettings();
  },

  async maybeShowOnboarding(force = false) {
    if (!force && this.settings.onboarding?.thumbnailIntroDone && this.settings.onboarding?.introVersion === APP_VERSION) return;
    const alreadyOpen = this.currentManagedModal() === 'onboarding';
    this.renderOnboardingBackupStatus();
    this.openModal('#onboardingModal');
    this.syncAppHistory({ modal: 'onboarding' }, { replace: alreadyOpen });
  },

  async closeOnboarding(markDone = false, options = {}) {
    const dontShow = $('#onboardingDontShow')?.checked;
    if (markDone || dontShow) {
      this.settings.onboarding = this.settings.onboarding || {};
      this.settings.onboarding.thumbnailIntroDone = true;
      this.settings.onboarding.introVersion = APP_VERSION;
      this.settings.onboarding.lastShownAt = Date.now();
      await this.saveSettings();
    }
    this.closeModal('#onboardingModal');
    this.syncAppHistory({ modal: null }, { replace: true });
    if (!options.skipRender) {
      if (this.bookmarksLoaded) this.renderMain();
      else this.renderLockedState();
    }
  },

  async finishOnboardingFlow(options = {}) {
    await this.closeOnboarding(true, { skipRender: true });
    await this.ensureBookmarksLoaded();
    this.firstRunLocked = false;
    this.render();
    this.showToast(this.adapter.isChrome ? '已读取浏览器书签，截图仍需单独确认' : '已进入演示数据模式');
    if (options.openSettings) {
      this.openSettings({ tab: 'thumbnail' });
    }
    if (options.generate) {
      await this.generatePostersForVisible(true);
    }
  },

  applyOnboardingPosterSettings() {
    this.settings.thumbnails = this.settings.thumbnails || {};
    const strategy = $('#onboardingStrategy')?.value;
    const concurrent = clampConcurrency($('#onboardingConcurrentNumber')?.value || $('#onboardingConcurrent')?.value || this.settings.thumbnails.concurrent || 4);
    if (strategy) this.settings.thumbnails.screenshotStrategy = strategy;
    this.settings.thumbnails.concurrent = concurrent;
    const valueEl = $('#posterConcurrentValue');
    if (valueEl) valueEl.textContent = String(concurrent);
    const rangeEl = $('#posterConcurrent');
    if (rangeEl) rangeEl.value = String(concurrent);
    const numberEl = $('#posterConcurrentNumber');
    if (numberEl) numberEl.value = String(concurrent);
    this.saveSettings();
  },

  syncConcurrencyInputs(value, scope = 'settings') {
    const current = this.settings.thumbnails?.concurrent || 4;
    const v = clampConcurrency(String(value ?? '').trim() === '' ? current : value);
    const range = scope === 'onboarding' ? $('#onboardingConcurrent') : $('#posterConcurrent');
    const number = scope === 'onboarding' ? $('#onboardingConcurrentNumber') : $('#posterConcurrentNumber');
    const label = scope === 'onboarding' ? $('#onboardingConcurrentValue') : $('#posterConcurrentValue');
    if (range && String(range.value) !== String(v)) range.value = String(v);
    if (number && String(number.value) !== String(v)) number.value = String(v);
    if (label) label.textContent = String(v);
    if (scope === 'settings' && $('#shotSummaryConcurrent')) $('#shotSummaryConcurrent').textContent = String(v);
    if (scope === 'settings') {
      this.settings.thumbnails = this.settings.thumbnails || {};
      this.settings.thumbnails.concurrent = v;
      this.queueSettingsSave();
      $$('.concurrency-mark').forEach((m) => m.classList.toggle('active', Number(m.dataset.value) === v));
      this.syncPosterPresetCards?.();
    }
    return v;
  },

  thumbnailImageSrc(thumb) {
    if (this.settings.thumbnails?.useReal === false) return '';
    return thumb?.dataUrl || thumb?.imageUrl || '';
  },

  thumbnailSourceLabel(thumb) {
    switch (thumb?.source) {
      case 'screenshot': return this.t('realShot');
      case 'bundled-real-preview': return this.t('realSample');
      case 'og-image': return this.t('ogCover');
      case 'fallback-card': return this.t('posterCover');
      case 'favicon': return this.t('siteIcon');
      default: return '';
    }
  },

  thumbnailFailureState(thumb) {
    const failed = this.isFailedPosterThumb(thumb);
    const hardFailed = thumb?.status === 'failed';
    const label = hardFailed ? this.t('posterFailed') : this.t('screenshotFailed');
    const text = thumb?.failedReason || thumb?.screenshotError || (hardFailed ? '海报生成失败' : '真实截图失败，已使用降级封面');
    return {
      failed,
      label,
      text,
      badge: failed ? `<span class="shot-failure-badge" title="${escapeAttr(text)}">${escapeHtml(label)}</span>` : ''
    };
  },

  isFailedPosterThumb(thumb) {
    return Boolean(thumb?.status === 'failed' || thumb?.screenshotFailedAt);
  },

  getFailedPosterBookmarks(scope = 'all') {
    const source = scope === 'visible' ? this.getVisibleBookmarks() : this.bookmarks;
    return (source || []).filter((bookmark) => (
      bookmark?.url &&
      /^https?:/i.test(bookmark.url) &&
      this.isFailedPosterThumb(this.getThumbnailForBookmark(bookmark))
    ));
  },

  renderCard(bookmark, index = 0) {
    const selected = this.selectedIds.has(String(bookmark.id));
    const rec = this.aiRecommendations[bookmark.id];
    const folder = bookmark.folderPath || this.t('uncategorized');
    const domain = bookmark.domain || BookmarkUtils.getDomain(bookmark.url);
    const date = bookmark.dateAdded ? new Date(bookmark.dateAdded).toISOString().slice(0, 10) : '';
    const thumb = this.getThumbnailForBookmark(bookmark);
    const imageSrc = this.thumbnailImageSrc(thumb);
    const hasPosterImage = Boolean(imageSrc && thumb?.status !== 'failed');
    const failure = this.thumbnailFailureState(thumb);
    const thumbLabel = this.thumbnailSourceLabel(thumb);
    const poster = hasPosterImage
      ? `<div class="poster-shot has-real source-${escapeHtml(thumb.source || 'poster')}">${failure.badge}<img class="poster-img" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(bookmark.title || '')}" loading="lazy"><div class="poster-glass"><span>${escapeHtml(thumbLabel || domain)}</span></div></div>`
      : this.renderLocalCover(bookmark, domain, failure.badge);
    const localIcon = localBookmarkIconDataUri(domain || bookmark.title || 'bookmark');
    const realIcon = siteFaviconUrl(bookmark.url) || localIcon;
    return `<article class="poster-card ${selected ? 'selected' : ''} ${failure.failed ? 'shot-failed' : ''}" draggable="true" data-id="${escapeHtml(bookmark.id)}" style="--stagger:${Math.min(index, 18)}">
      ${poster}
      <div class="card-body">
        <div class="card-head">
          <button class="select-dot ${selected ? 'on' : ''}" aria-label="选择书签">${selected ? '✓' : ''}</button>
          <div class="title-line"><img class="favicon real-favicon" src="${escapeAttr(realIcon)}" data-fallback-icon="${escapeAttr(localIcon)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=this.dataset.fallbackIcon;"><strong>${escapeHtml(shorten(bookmark.title || this.t('unnamedBookmark'), 44))}</strong></div>
          <button class="card-menu" aria-label="更多操作">•••</button>
        </div>
        <div class="domain-line">${escapeHtml(domain)}</div>
        <div class="tag-row">
          ${failure.failed ? `<span class="failure-tag" title="${escapeAttr(failure.text)}">${iconSvg('warning', 'tag-icon')} ${escapeHtml(failure.label)}</span>` : ''}
          ${rec && this.settings.ai.enabled ? `<span class="ai-tag" title="${escapeHtml(rec.reason || '')}">✦ ${escapeHtml(shorten(rec.suggestedFolder || 'AI 建议', 20))}</span>` : ''}
          ${this.settings.showFolderTag ? `<span class="folder-tag" title="${escapeAttr(folder)}">${iconSvg('folder', 'tag-icon')} ${escapeHtml(folder)}</span>` : ''}
          ${hasPosterImage ? `<span class="thumb-tag">${escapeHtml(thumbLabel || '海报')}</span>` : ''}
          ${this.settings.showDate && date ? `<span class="date-tag">${date}</span>` : ''}
        </div>
      </div>
    </article>`;
  },

  renderLocalCover(bookmark, domain, statusBadge = '') {
    const normalizedDomain = normalizeDisplayDomain(domain || BookmarkUtils.getDomain(bookmark.url) || 'website');
    const title = normalizePosterTitle(bookmark.title || normalizedDomain, normalizedDomain);
    const theme = localCoverTheme(normalizedDomain, title);
    const initials = domainInitials(normalizedDomain || title);
    const safeDomain = escapeHtml(shorten(normalizedDomain, 26));
    const safeTitle = escapeHtml(shorten(title, 42));
    return `<div class="poster-shot local-cover mock-web" style="--cover-bg-a:${theme.bg0};--cover-accent:${theme.accent};--cover-text:${theme.text};">
      <div class="mock-browser">
        <div class="mock-top"><i></i><i></i><i></i><span>${safeDomain}</span></div>
        <div class="mock-content">
          <div class="mock-site-mark">${escapeHtml(initials)}</div>
          <div class="mock-text">
            <span class="shot-domain">${safeDomain}</span>
            <b class="shot-title">${safeTitle}</b>
            <div class="mock-lines"><b></b><b></b><b></b></div>
          </div>
        </div>
      </div>
      ${statusBadge}
      <span class="shot-hint">${escapeHtml(this.t('localPreview'))}</span>
    </div>`;
  },

  getThumbnailForBookmark(bookmark) {
    if (!bookmark?.url) return null;
    const byId = this.thumbnailCache?.[String(bookmark.id)];
    if (byId?.dataUrl || byId?.imageUrl || byId?.status === 'failed') return byId;
    const normalized = bookmark.normalizedUrl || BookmarkUtils.normalizeUrl(bookmark.url);
    const byUrl = this.thumbnailCache?.[`url:${normalized}`];
    if (byUrl?.dataUrl || byUrl?.imageUrl || byUrl?.status === 'failed') return byUrl;
    const bundled = bundledPreviewForBookmark(bookmark);
    return bundled ? { imageUrl: bundled, source: 'bundled-real-preview', status: 'ready' } : null;
  },

  async saveThumbnailForBookmark(bookmark, dataUrl, source = 'screenshot') {
    if (!bookmark?.url || !dataUrl) return;
    return this.savePosterRecord(bookmark, { dataUrl, source });
  },

  async savePosterRecord(bookmark, partial = {}) {
    if (!bookmark?.url) return;
    const normalizedUrl = bookmark.normalizedUrl || BookmarkUtils.normalizeUrl(bookmark.url);
    const record = {
      bookmarkId: String(bookmark.id),
      url: bookmark.url,
      domain: bookmark.domain || BookmarkUtils.getDomain(bookmark.url),
      source: partial.source || 'auto-poster',
      generatedAt: Date.now(),
      status: partial.status || 'ready',
      ...partial
    };
    this.thumbnailCache[String(bookmark.id)] = record;
    this.thumbnailCache[`url:${normalizedUrl}`] = record;
    this.scheduleThumbnailCacheSave();
    return record;
  },

  scheduleThumbnailCacheSave(delayMs = 900) {
    this.thumbnailCacheDirty = true;
    clearTimeout(this.thumbnailCacheSaveTimer);
    this.thumbnailCacheSaveTimer = setTimeout(() => {
      this.thumbnailCacheSaveTimer = 0;
      this.flushThumbnailCacheSave().catch((err) => console.warn('thumbnail cache save failed', err));
    }, Math.max(120, delayMs));
  },

  async flushThumbnailCacheSave() {
    clearTimeout(this.thumbnailCacheSaveTimer);
    this.thumbnailCacheSaveTimer = 0;
    if (this.thumbnailCacheSavePromise) await this.thumbnailCacheSavePromise;
    if (!this.thumbnailCacheDirty) return;
    this.thumbnailCacheDirty = false;
    this.thumbnailCacheSavePromise = StorageAdapter.set(THUMBNAIL_KEY, this.thumbnailCache)
      .finally(() => { this.thumbnailCacheSavePromise = null; });
    await this.thumbnailCacheSavePromise;
    if (this.thumbnailCacheDirty) await this.flushThumbnailCacheSave();
  },

  needsPosterGeneration(bookmark, knownThumb) {
    if (!bookmark?.url || !/^https?:/i.test(bookmark.url)) return false;
    const thumb = knownThumb === undefined ? this.getThumbnailForBookmark(bookmark) : knownThumb;
    const mode = this.settings.thumbnails?.generationMode || 'screenshot-first';
    if (mode === 'off') return false;
    if (mode === 'og-first') return !(thumb?.dataUrl || thumb?.imageUrl);
    if (thumb?.source === 'screenshot' && (thumb.dataUrl || thumb.imageUrl)) return false;
    if (thumb?.screenshotFailedAt && Date.now() - thumb.screenshotFailedAt < SCREENSHOT_RETRY_WINDOW) return false;
    return true;
  },

  posterLimitForBatch(configured, fallback, count) {
    const requested = Number(configured || fallback);
    return Math.max(Number.isFinite(requested) ? requested : fallback, count || 0);
  },

  async kickoffAutoPosters(reason = 'manual') {
    // Guard every automatic entry point with explicit user consent.
    if (!this.hasPosterGenerationConsent()) return;
    if (this.posterQueueRunning || this.autoPosterStarted && reason === 'initial') return;
    this.autoPosterStarted = true;
    if (this.settings.thumbnails?.autoGenerate === false) return;
    const list = this.getVisibleBookmarks().filter((b) => this.needsPosterGeneration(b));
    if (!list.length) return;
    const limit = this.posterLimitForBatch(this.settings.thumbnails?.backgroundLimit, POSTER_SESSION_LIMIT, list.length);
    await this.generatePosters(list.slice(0, limit), { silent: true, reason });
  },

  async generatePostersForVisible(force = false) {
    if (!this.hasPosterGenerationConsent()) {
      await this.maybeShowOnboarding(true);
      this.showToast('请先阅读引导并点击“开始生成真实海报”，确认后才会并发截图');
      return;
    }
    const list = this.getVisibleBookmarks().filter((b) => b.url && (force || this.needsPosterGeneration(b)));
    if (!list.length) { this.showToast('当前海报墙已经有真实截图或无需重新生成'); return; }
    const limit = this.posterLimitForBatch(this.settings.thumbnails?.visibleLimit, POSTER_VISIBLE_LIMIT, list.length);
    await this.generatePosters(list.slice(0, limit), { silent: false, reason: 'manual-visible', forceScreenshot: true });
  },

  async repairFailedPosters(scope = 'all') {
    if (!this.hasPosterGenerationConsent()) {
      await this.maybeShowOnboarding(true);
      this.showToast('请先阅读引导并确认允许生成真实海报');
      return;
    }
    if (this.posterQueueRunning) {
      this.showToast('海报队列正在运行，请稍后再补拍失败项');
      return;
    }
    const targets = this.getFailedPosterBookmarks(scope);
    if (!targets.length) {
      this.showToast('当前没有需要补拍的失败海报');
      this.renderSettingsSummaries();
      return;
    }
    const limit = this.posterLimitForBatch(this.settings.thumbnails?.backgroundLimit, POSTER_SESSION_LIMIT, targets.length);
    const repairSettings = {
      screenshotStrategy: 'quiet-window',
      concurrent: Math.min(2, Math.max(1, targets.length)),
      captureDelay: Math.max(Number(this.settings.thumbnails?.captureDelay || 1800), 2600),
      captureTimeout: Math.max(Number(this.settings.thumbnails?.captureTimeout || 18000), 24000),
      captureWidth: 1365,
      captureHeight: 768,
      cropMode: 'top',
      askPermission: true,
      fallbackToOg: true
    };
    this.showToast(`开始补拍 ${targets.length} 个失败海报`);
    await this.withTemporaryThumbnailSettings(repairSettings, async () => {
      await this.generateScreenshotPosters(targets.slice(0, limit), { silent: false, reason: 'repair-failed', forceScreenshot: true });
    });
    const remaining = this.getFailedPosterBookmarks(scope).length;
    this.showToast(remaining ? `补拍完成，仍有 ${remaining} 个需要稍后再试` : '失败海报已全部补拍完成');
    this.renderSettingsSummaries();
  },

  async withTemporaryThumbnailSettings(partial, task) {
    const previous = { ...(this.settings.thumbnails || {}) };
    this.settings.thumbnails = { ...previous, ...partial };
    try {
      return await task();
    } finally {
      this.settings.thumbnails = previous;
      this.renderSettingsSummaries?.();
      this.syncPosterPresetCards?.();
    }
  },

  async generatePosters(bookmarks, options = {}) {
    if (!this.hasPosterGenerationConsent()) {
      await this.maybeShowOnboarding(true);
      this.showToast('请先在引导页确认允许生成真实海报');
      return;
    }
    const targets = (bookmarks || []).filter((b) => b?.url && /^https?:/i.test(b.url));
    if (!targets.length || this.posterQueueRunning) return;
    const mode = this.settings.thumbnails?.generationMode || 'screenshot-first';
    if (mode === 'og-first' || !this.canUseScreenshotApi()) {
      await this.generateMetaPosters(targets, options);
      return;
    }
    await this.generateScreenshotPosters(targets, options);
  },

  queuePosterGridRefresh(delayMs = 900) {
    if (this.posterRenderTimer) return;
    this.posterRenderTimer = setTimeout(() => {
      this.posterRenderTimer = 0;
      if (this.bookmarksLoaded) this.renderMain();
    }, Math.max(180, delayMs));
  },

  flushPosterGridRefresh() {
    clearTimeout(this.posterRenderTimer);
    this.posterRenderTimer = 0;
  },

  canUseScreenshotApi() {
    return Boolean(globalThis.chrome?.tabs?.captureVisibleTab && globalThis.chrome?.tabs?.create);
  },

  async generateMetaPosters(bookmarks, options = {}) {
    if (!bookmarks?.length || this.posterQueueRunning) return;
    this.posterQueueRunning = true;
    this.posterAbort = false;
    this.resetPosterHudState();
    this.posterStats = { done: 0, total: bookmarks.length, success: 0, failed: 0, screenshot: 0, fallback: 0 };
    this.renderMain();
    const concurrent = clampConcurrency(this.settings.thumbnails?.concurrent || 4);
    let cursor = 0;
    const worker = async () => {
      while (cursor < bookmarks.length && !this.posterAbort) {
        const bookmark = bookmarks[cursor++];
        try {
          const record = await this.fetchPosterForBookmark(bookmark);
          if (record?.imageUrl || record?.dataUrl) { this.posterStats.success += 1; this.posterStats.fallback += 1; }
          else this.posterStats.failed += 1;
        } catch (err) {
          console.warn('meta poster failed', bookmark.url, err);
          await this.savePosterRecord(bookmark, { source: 'failed', status: 'failed', failedReason: err?.message || '生成失败' });
          this.posterStats.failed += 1;
        } finally {
          this.posterStats.done += 1;
          const pct = bookmarks.length ? Math.round((this.posterStats.done / bookmarks.length) * 100) : 0;
          this.updatePosterProgressHud({
            show: true,
            pct,
            title: '正在生成网页海报',
            text: `已处理 ${this.posterStats.done} / ${bookmarks.length}`,
            done: this.posterStats.done,
            total: bookmarks.length
          });
          this.queuePosterGridRefresh(options.silent ? 1400 : 800);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrent, bookmarks.length) }, worker));
    this.posterQueueRunning = false;
    this.posterAbort = false;
    this.flushPosterGridRefresh();
    try { await this.flushThumbnailCacheSave(); }
    catch (err) { console.warn('thumbnail cache save failed', err); }
    await this.loadBookmarks();
    this.render();
    this.hidePosterProgressHud(options.silent ? 900 : 1600);
    if (!options.silent) this.showToast(`已生成 ${this.posterStats.success} 个网页海报`);
  },

  async generateScreenshotPosters(bookmarks, options = {}) {
    if (!bookmarks?.length || this.posterQueueRunning) return;
    const targets = bookmarks.filter((b) => b?.url && /^https?:/i.test(b.url));
    if (!targets.length) return;
    this.posterQueueRunning = true;
    this.posterAbort = false;
    this.resetPosterHudState();
    this.posterStats = { done: 0, total: targets.length, success: 0, failed: 0, screenshot: 0, fallback: 0, cdp: 0, window: 0, workers: 0 };
    this.renderMain();
    if (!options.silent) this.showScreenshotProgressModal(targets.length);
    let originalTab = null;
    const workerTemps = new Map();
    const strategy = this.settings.thumbnails?.screenshotStrategy || 'debugger-cdp';
    const requestedConcurrency = clampConcurrency(this.settings.thumbnails?.concurrent || 4);
    const concurrency = this.captureConcurrencyForStrategy(strategy, requestedConcurrency, targets.length);
    let cursor = 0;

    const nextTarget = () => {
      if (this.posterAbort || cursor >= targets.length) return null;
      const item = targets[cursor];
      cursor += 1;
      return item;
    };

    const worker = async (workerId) => {
      this.posterStats.workers = concurrency;
      while (!this.posterAbort) {
        const bookmark = nextTarget();
        if (!bookmark) break;
        this.updateScreenshotProgress(this.posterStats.done, targets.length, bookmark, `${this.describeCaptureStep(strategy)} · Worker ${workerId + 1}/${concurrency}`);
        try {
          const result = await this.captureBookmarkWithStrategy(
            bookmark,
            strategy,
            () => workerTemps.get(workerId),
            async () => {
              const temp = await this.createCaptureWindow();
              workerTemps.set(workerId, temp);
              return temp;
            }
          );
          if (!result?.dataUrl) throw new Error('未获取到截图');
          const quality = await inspectPosterImageQuality(result.dataUrl);
          if (quality.stripLike) {
            throw new Error(`截图内容过于空白或呈条状（white=${Math.round(quality.whiteRatio * 100)}%，nonBg=${Math.round(quality.nonBgRatio * 100)}%），已自动改用海报封面`);
          }
          await this.saveThumbnailForBookmark(bookmark, result.dataUrl, result.source || 'screenshot');
          this.posterStats.success += 1;
          this.posterStats.screenshot += 1;
          if (result.engine === 'cdp') this.posterStats.cdp += 1;
          if (result.engine === 'window') this.posterStats.window += 1;
        } catch (err) {
          console.warn('screenshot poster failed', bookmark.url, err);
          const fallback = this.settings.thumbnails?.fallbackToOg !== false
            ? await this.tryFallbackPoster(bookmark, err)
            : null;
          if (fallback?.dataUrl || fallback?.imageUrl) {
            this.posterStats.success += 1;
            this.posterStats.fallback += 1;
          } else {
            await this.savePosterRecord(bookmark, { source: 'failed', status: 'failed', screenshotFailedAt: Date.now(), failedReason: err?.message || '截图失败' });
            this.posterStats.failed += 1;
          }
        } finally {
          this.posterStats.done += 1;
          this.updateScreenshotProgress(this.posterStats.done, targets.length, bookmark, '正在海报化处理并写入本地缓存');
          this.queuePosterGridRefresh(options.silent ? 1400 : 800);
          if (strategy !== 'debugger-cdp') await delay(520);
        }
      }
    };

    try {
      originalTab = await this.getCurrentTabSafe();
      if (this.settings.thumbnails?.askPermission !== false) await this.ensureBatchPermissions(targets.map((b) => b.url));
      await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));
    } finally {
      await Promise.all([...workerTemps.values()].map((temp) => temp?.windowId ? this.removeWindowSafe(temp.windowId) : Promise.resolve()));
      await this.cleanupActiveCaptureSurfaces();
      if (originalTab?.id) { try { chrome.tabs.update(originalTab.id, { active: true }); } catch (_) {} }
      this.posterQueueRunning = false;
      this.posterAbort = false;
      this.flushPosterGridRefresh();
      try { await this.flushThumbnailCacheSave(); }
      catch (err) { console.warn('thumbnail cache save failed', err); }
      await this.loadBookmarks();
      this.render();
      if (!options.silent) {
        this.updateScreenshotProgress(targets.length, targets.length, null, `完成：并发 ${concurrency}，CDP ${this.posterStats.cdp || 0}，窗口 ${this.posterStats.window || 0}，降级标记 ${this.posterStats.fallback || 0}，失败 ${this.posterStats.failed}`);
        this.hidePosterProgressHud(1800);
        this.showToast(`真实海报 ${this.posterStats.screenshot} 个，降级并标记 ${this.posterStats.fallback} 个`);
      } else {
        this.hidePosterProgressHud(900);
      }
    }
  },

  describeCaptureStep(strategy) {
    if (strategy === 'debugger-cdp') return '正在后台用增强 CDP 模式渲染并截图';
    if (strategy === 'quiet-window') return '正在用临时截图窗口加载网页';
    return '正在当前窗口创建截图标签页';
  },

  captureConcurrencyForStrategy(strategy, requestedConcurrency, total) {
    const base = Math.min(clampConcurrency(requestedConcurrency || 1), Math.max(1, total || 1));
    if (strategy === 'active-tabs') return 1;
    return base;
  },

  async captureBookmarkWithStrategy(bookmark, strategy, getTemp, createTemp) {
    if (strategy === 'debugger-cdp') {
      if (!this.canUseDebuggerScreenshot()) {
        throw new Error('当前浏览器不支持 Debugger/CDP 截图，已改用降级封面');
      }
      try {
        const dataUrl = await this.captureBookmarkByDebugger(bookmark.url);
        return { dataUrl, engine: 'cdp', source: 'screenshot' };
      } catch (err) {
        console.warn('CDP screenshot failed, using marked poster fallback', bookmark.url, err);
        throw err;
      }
    }
    if (strategy === 'active-tabs') {
      const dataUrl = await this.captureBookmarkPage(bookmark.url);
      return { dataUrl, engine: 'window', source: 'screenshot' };
    }
    const temp = getTemp?.() || await createTemp();
    const dataUrl = await this.captureBookmarkInWindow(temp.windowId, temp.tabId, bookmark.url);
    return { dataUrl, engine: 'window', source: 'screenshot' };
  },

  canUseDebuggerScreenshot() {
    return Boolean(globalThis.chrome?.debugger?.attach && globalThis.chrome?.debugger?.sendCommand && globalThis.chrome?.tabs?.create);
  },

  debuggerCommand(debuggee, method, params = {}) {
    return new Promise((resolve, reject) => {
      try {
        chrome.debugger.sendCommand(debuggee, method, params, (result) => {
          const err = chrome.runtime?.lastError;
          if (err) reject(new Error(`${method}: ${err.message}`));
          else resolve(result || {});
        });
      } catch (err) { reject(err); }
    });
  },

  async attachDebugger(debuggee) {
    await new Promise((resolve, reject) => {
      chrome.debugger.attach(debuggee, '1.3', () => {
        const err = chrome.runtime?.lastError;
        if (err) reject(new Error(err.message)); else resolve();
      });
    });
  },

  async detachDebugger(debuggee) {
    await new Promise((resolve) => {
      try { chrome.debugger.detach(debuggee, () => resolve()); }
      catch (_) { resolve(); }
    });
  },

  async captureBookmarkByDebugger(url) {
    if (!this.canUseDebuggerScreenshot()) throw new Error('当前浏览器不支持 Debugger/CDP 截图');
    const viewport = this.captureViewportProfile();
    const quality = Number(this.settings.thumbnails?.captureQuality || 82);
    const timeout = Number(this.settings.thumbnails?.captureTimeout || 18000);
    const tab = await new Promise((resolve, reject) => {
      chrome.tabs.create({ url: 'about:blank', active: false }, (created) => {
        const err = chrome.runtime?.lastError;
        if (err) reject(new Error(err.message)); else resolve(created);
      });
    });
    const debuggee = { tabId: tab.id };
    this.trackCaptureTab(tab.id);
    await this.ensureCaptureTabWorkspace(tab.id, { collapsed: true });
    let attached = false;
    try {
      if (this.posterAbort) throw new Error('截图队列已停止');
      await this.attachDebugger(debuggee);
      attached = true;
      const readyPromise = this.waitForDebuggerPageReady(tab.id, timeout);
      await this.debuggerCommand(debuggee, 'Page.enable');
      await this.debuggerCommand(debuggee, 'Network.enable');
      if (viewport.userAgent) {
        await this.debuggerCommand(debuggee, 'Emulation.setUserAgentOverride', {
          userAgent: viewport.userAgent,
          platform: 'iPhone'
        });
      }
      await this.debuggerCommand(debuggee, 'Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor,
        mobile: viewport.mobile,
        screenWidth: viewport.screenWidth,
        screenHeight: viewport.screenHeight
      });
      await this.debuggerCommand(debuggee, 'Page.navigate', { url });
      await readyPromise;
      if (this.posterAbort) throw new Error('截图队列已停止');
      await delay(Number(this.settings.thumbnails?.captureDelay || 1800));
      if (this.posterAbort) throw new Error('截图队列已停止');
      try {
        await this.debuggerCommand(debuggee, 'Runtime.evaluate', {
          expression: 'try{window.scrollTo(0,0);document.documentElement.style.scrollBehavior="auto";document.body&&(document.body.style.scrollBehavior="auto");}catch(e){}',
          awaitPromise: false,
          returnByValue: false
        });
      } catch (_) {}
      const shot = await this.debuggerCommand(debuggee, 'Page.captureScreenshot', {
        format: 'jpeg',
        quality,
        fromSurface: true,
        captureBeyondViewport: false,
        optimizeForSpeed: true
      });
      if (!shot?.data) throw new Error('CDP 未返回截图数据');
      return await posterizeScreenshot(`data:image/jpeg;base64,${shot.data}`, this.posterOptions());
    } finally {
      if (attached) await this.detachDebugger(debuggee);
      this.untrackCaptureTab(tab.id);
      await this.removeTabSafe(tab.id);
    }
  },

  waitForDebuggerPageReady(tabId, timeout = 18000) {
    return new Promise((resolve) => {
      let settled = false;
      let loaded = false;
      let inflight = 0;
      let idleTimer = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(idleTimer);
        chrome.debugger.onEvent.removeListener(listener);
        resolve();
      };
      const armIdle = () => {
        clearTimeout(idleTimer);
        if (!loaded) return;
        idleTimer = setTimeout(finish, 900);
      };
      const listener = (source, method) => {
        if (source.tabId !== tabId || settled) return;
        if (method === 'Page.loadEventFired' || method === 'Page.domContentEventFired') {
          loaded = true;
          armIdle();
          return;
        }
        if (method === 'Network.requestWillBeSent') inflight += 1;
        if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') inflight = Math.max(0, inflight - 1);
        if (loaded && inflight <= 1) armIdle();
      };
      chrome.debugger.onEvent.addListener(listener);
      const timer = setTimeout(finish, timeout);
    });
  },

  async tryFallbackPoster(bookmark, error) {
    try {
      const record = await this.fetchPosterForBookmark(bookmark);
      if (record) {
        // If the fallback is only a favicon or an empty/suspicious data URL, replace it with
        // a designed local poster card so the grid never shows thin strips or giant icons.
        let safeRecord = record;
        if (record.source === 'favicon' || !record.dataUrl && !record.imageUrl) {
          safeRecord = {
            ...record,
            dataUrl: createDesignedFallbackPoster(bookmark, this.posterOptions()),
            imageUrl: '',
            source: 'fallback-card'
          };
        } else if (record.dataUrl) {
          const quality = await inspectPosterImageQuality(record.dataUrl);
          if (quality.stripLike) {
            safeRecord = {
              ...record,
              dataUrl: createDesignedFallbackPoster(bookmark, this.posterOptions()),
              imageUrl: '',
              source: 'fallback-card'
            };
          }
        }
        return await this.savePosterRecord(bookmark, {
          ...safeRecord,
          source: safeRecord.source || 'og-image',
          screenshotFailedAt: Date.now(),
          screenshotError: error?.message || '截图失败'
        });
      }
    } catch (fallbackErr) {
      console.warn('fallback poster failed', bookmark.url, fallbackErr);
    }
    return await this.savePosterRecord(bookmark, {
      source: 'fallback-card',
      status: 'ready',
      dataUrl: createDesignedFallbackPoster(bookmark, this.posterOptions()),
      screenshotFailedAt: Date.now(),
      screenshotError: error?.message || '截图失败'
    });
  },

  showScreenshotProgressModal(total) {
    this.updatePosterProgressHud({
      show: true,
      pct: 0,
      title: '正在生成真实网页海报',
      text: '准备启动增强截图引擎',
      done: 0,
      total
    });
  },

  updateScreenshotProgress(done, total, bookmark, text) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    const pctEl = $('#progressPct');
    const textEl = $('#progressText');
    const ring = $('.progress-ring');
    if (ring) ring.style.setProperty('--progress', String(pct));
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (textEl) textEl.textContent = bookmark ? `${text}：${shorten(bookmark.title, 30)}` : text;
    const workers = $('#shotWorkers');
    const ok = $('#shotOk');
    const fallback = $('#shotFallback');
    const fail = $('#shotFail');
    if (workers) workers.textContent = `并发 ${this.posterStats.workers || clampConcurrency(this.settings.thumbnails?.concurrent || 4)}`;
    if (ok) ok.textContent = `真实截图 ${this.posterStats.screenshot || 0}`;
    if (fallback) fallback.textContent = `降级标记 ${this.posterStats.fallback || 0}`;
    if (fail) fail.textContent = `失败 ${this.posterStats.failed || 0}`;
    this.updatePosterProgressHud({
      show: true,
      pct,
      title: '正在生成真实网页海报',
      text: bookmark ? `${text}：${shorten(bookmark.title, 30)}` : text,
      done,
      total
    });
  },

  ensurePosterProgressHud() {
    let hud = $('#posterProgressHud');
    if (hud) return hud;
    hud = document.createElement('div');
    hud.id = 'posterProgressHud';
    hud.className = 'poster-progress-hud';
    document.body.appendChild(hud);
    return hud;
  },

  resetPosterHudState() {
    this.posterHudMinimized = false;
    this.posterHudDismissed = false;
    this.posterHudDocked = false;
    this.posterHudPayload = null;
    this.posterHudRenderKey = '';
    this.posterHudRenderedDocked = false;
    this.posterHudRenderedMinimized = false;
    this.lastPosterHudUpdateAt = 0;
    this.hidePosterTopbarDock();
  },

  updatePosterProgressHud({ show = true, pct = 0, title = '海报生成进度', text = '', done = 0, total = 0 } = {}) {
    const hud = this.ensurePosterProgressHud();
    clearTimeout(this.posterHudHideTimer);
    if (!show) {
      this.hidePosterProgressHud();
      return;
    }
    this.posterHudPayload = { show, pct, title, text, done, total };
    if (this.posterHudDismissed) return;
    const safePct = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    const workers = this.posterStats.workers || clampConcurrency(this.settings.thumbnails?.concurrent || 4);
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const renderKey = [
      safePct,
      title,
      text,
      done || 0,
      total || 0,
      workers,
      this.posterStats.success || this.posterStats.screenshot || 0,
      this.posterStats.failed || 0,
      this.posterHudDocked ? 1 : 0,
      this.posterHudMinimized ? 1 : 0
    ].join('|');
    const forceRender = !this.posterHudRenderKey
      || done >= total && total > 0
      || safePct === 0
      || this.posterHudRenderedDocked !== this.posterHudDocked
      || this.posterHudRenderedMinimized !== this.posterHudMinimized;
    if (!forceRender && renderKey === this.posterHudRenderKey) return;
    if (!forceRender && now - this.lastPosterHudUpdateAt < 160) return;
    this.posterHudRenderKey = renderKey;
    this.posterHudRenderedDocked = this.posterHudDocked;
    this.posterHudRenderedMinimized = this.posterHudMinimized;
    this.lastPosterHudUpdateAt = now;
    if (this.posterHudDocked) {
      this.hidePosterProgressHud();
      this.updatePosterTopbarDock({ pct: safePct, title, text, done, total, workers });
      return;
    }
    this.hidePosterTopbarDock();
    const minimized = this.posterHudMinimized;
    hud.style.setProperty('--progress', `${safePct}%`);
    hud.classList.toggle('minimized', minimized);
    hud.innerHTML = `<div class="poster-progress-head">
      <span class="poster-progress-orb">${safePct}%</span>
      <div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(text || '准备中')}</small></div>
      <div class="poster-progress-controls">
        <button type="button" class="poster-progress-toggle" aria-label="${minimized ? '展开进度窗' : '缩小进度窗'}">${iconSvg(minimized ? 'expand' : 'minimize')}</button>
        <button type="button" class="poster-progress-close" aria-label="关闭进度窗">${iconSvg('close')}</button>
      </div>
    </div>
    <div class="poster-progress-detail">
      <div class="poster-progress-meter" aria-hidden="true"><i></i></div>
      <div class="poster-progress-stats">
        <span>${escapeHtml(String(done || 0))}/${escapeHtml(String(total || 0))}</span>
        <span>并发 ${workers}</span>
        <span>成功 ${this.posterStats.success || this.posterStats.screenshot || 0}</span>
        <span>失败 ${this.posterStats.failed || 0}</span>
      </div>
      <div class="poster-progress-actions"><button type="button" class="ghost" id="posterHudStop">停止</button></div>
    </div>`;
    hud.classList.add('show');
    $('#posterHudStop', hud)?.addEventListener('click', () => this.stopPosterGeneration('正在停止截图队列，并关闭临时截图窗口'));
    $('.poster-progress-toggle', hud)?.addEventListener('click', () => this.togglePosterProgressHudMinimized());
    $('.poster-progress-close', hud)?.addEventListener('click', () => this.dismissPosterProgressHud());
  },

  ensurePosterTopbarDock() {
    let dock = $('#posterProgressDock');
    if (dock) return dock;
    const toolbar = $('.toolbar-actions');
    if (!toolbar) return null;
    dock = document.createElement('div');
    dock.id = 'posterProgressDock';
    dock.className = 'poster-progress-dock';
    const refresh = $('#refreshBtn');
    if (refresh?.parentNode === toolbar) toolbar.insertBefore(dock, refresh);
    else toolbar.appendChild(dock);
    return dock;
  },

  updatePosterTopbarDock({ pct = 0, title = '海报生成中', text = '', done = 0, total = 0, workers = 0 } = {}) {
    const dock = this.ensurePosterTopbarDock();
    if (!dock) return;
    const safePct = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    dock.style.setProperty('--progress', `${safePct}%`);
    dock.innerHTML = `<button type="button" class="poster-dock-main" id="posterDockExpand" aria-label="展开海报进度窗">
      <span class="poster-dock-orb">${safePct}%</span>
      <span class="poster-dock-copy"><strong>${escapeHtml(shorten(title, 18))}</strong><small>${escapeHtml(done && total ? `${done}/${total} · 并发 ${workers || '-'}` : text || '准备中')}</small></span>
    </button>
    <button type="button" class="poster-dock-stop" id="posterDockStop" aria-label="停止海报生成">停止</button>`;
    dock.classList.add('show');
    $('#posterDockExpand', dock)?.addEventListener('click', () => this.expandPosterProgressHudFromDock());
    $('#posterDockStop', dock)?.addEventListener('click', () => this.stopPosterGeneration('正在停止截图队列，并关闭临时截图窗口'));
  },

  hidePosterTopbarDock() {
    const dock = $('#posterProgressDock');
    if (dock) dock.classList.remove('show');
  },

  expandPosterProgressHudFromDock() {
    this.posterHudDocked = false;
    this.posterHudDismissed = false;
    this.posterHudMinimized = false;
    this.hidePosterTopbarDock();
    this.updatePosterProgressHud(this.posterHudPayload || { show: true });
  },

  togglePosterProgressHudMinimized() {
    this.posterHudMinimized = !this.posterHudMinimized;
    this.updatePosterProgressHud(this.posterHudPayload || { show: true });
  },

  dismissPosterProgressHud() {
    if (this.posterQueueRunning) {
      this.posterHudDocked = true;
      this.posterHudDismissed = false;
      const payload = this.posterHudPayload || { show: true };
      const safePct = Math.max(0, Math.min(100, Math.round(Number(payload.pct) || 0)));
      this.updatePosterTopbarDock({
        ...payload,
        pct: safePct,
        workers: this.posterStats.workers || clampConcurrency(this.settings.thumbnails?.concurrent || 4)
      });
    } else {
      this.posterHudDismissed = true;
      this.hidePosterTopbarDock();
    }
    this.hidePosterProgressHud();
  },

  hidePosterProgressHud(delayMs = 0) {
    const hud = $('#posterProgressHud');
    if (!hud) {
      if (!this.posterQueueRunning) this.hidePosterTopbarDock();
      return;
    }
    clearTimeout(this.posterHudHideTimer);
    this.posterHudHideTimer = setTimeout(() => {
      hud.classList.remove('show');
      if (!this.posterQueueRunning) this.hidePosterTopbarDock();
    }, delayMs);
  },

  async fetchPosterForBookmark(bookmark) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8500);
    const designedFallback = async (reason = 'no-og-image') => this.savePosterRecord(bookmark, {
      source: 'fallback-card',
      status: 'ready',
      dataUrl: createDesignedFallbackPoster(bookmark, this.posterOptions()),
      fallbackReason: reason
    });
    if (!this.adapter?.isChrome) return await designedFallback('demo-mode-no-remote-fetch');
    try {
      const res = await fetch(bookmark.url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        credentials: 'omit',
        cache: 'force-cache'
      });
      const type = res.headers.get('content-type') || '';
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!/text\/html|application\/xhtml\+xml|text\//i.test(type)) {
        return await designedFallback('non-html');
      }
      const html = await res.text();
      const meta = BookmarkUtils.extractPosterMeta(html, res.url || bookmark.url);
      if (!meta.imageUrl) return await designedFallback('no-public-image');

      let dataUrl = '';
      try {
        dataUrl = await this.fetchImageAsDataUrl(meta.imageUrl);
      } catch (err) {
        console.warn('poster image download failed', meta.imageUrl, err);
      }
      if (!dataUrl) return await designedFallback('public-image-download-failed');

      const quality = await inspectPosterImageQuality(dataUrl);
      if (quality.stripLike) return await designedFallback('public-image-low-quality');

      return await this.savePosterRecord(bookmark, {
        source: 'og-image',
        status: 'ready',
        dataUrl,
        imageUrl: '',
        title: meta.title || bookmark.title,
        description: meta.description || '',
        siteName: meta.siteName || ''
      });
    } catch (err) {
      console.warn('metadata fallback failed, using local poster', bookmark.url, err);
      return await designedFallback(err?.message || 'metadata-fetch-failed');
    } finally {
      clearTimeout(timer);
    }
  },

  async fetchImageAsDataUrl(imageUrl, byteLimit = 2200000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(imageUrl, { credentials: 'omit', cache: 'force-cache', signal: controller.signal });
      if (!res.ok) throw new Error(`image HTTP ${res.status}`);
      const type = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim() || 'image/jpeg';
      if (!/^image\//i.test(type)) throw new Error('not an image');
      const length = Number(res.headers.get('content-length') || 0);
      if (length && length > byteLimit) return '';
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > byteLimit) return '';
      const dataUrl = `data:${type};base64,${arrayBufferToBase64(buffer)}`;
      if (/image\/(png|jpe?g|webp)/i.test(type)) return await downscaleImage(dataUrl, 900, 560, 0.78);
      return dataUrl;
    } finally {
      clearTimeout(timer);
    }
  },

  posterOptions() {
    const portrait = this.settings.thumbnails?.posterAspect === 'portrait';
    return {
      width: portrait ? 480 : 640,
      height: portrait ? 720 : 360,
      quality: Number(this.settings.thumbnails?.captureQuality || 82) / 100,
      cropMode: this.settings.thumbnails?.cropMode || 'smart',
      whitePageEnhance: this.settings.thumbnails?.whitePageEnhance !== false
    };
  },

  captureViewportProfile() {
    const portrait = this.settings.thumbnails?.posterAspect === 'portrait';
    if (portrait) {
      return {
        width: 390,
        height: 844,
        screenWidth: 390,
        screenHeight: 844,
        deviceScaleFactor: 2,
        mobile: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      };
    }
    const width = Number(this.settings.thumbnails?.captureWidth || 1365);
    const height = Number(this.settings.thumbnails?.captureHeight || 768);
    return {
      width,
      height,
      screenWidth: width,
      screenHeight: height,
      deviceScaleFactor: 1,
      mobile: false,
      userAgent: ''
    };
  },

  async openThumbnailConfirm(mode = 'selected-or-visible') {
    const visible = this.getVisibleBookmarks();
    const selected = [...this.selectedIds].map((id) => this.bookmarkById.get(String(id))).filter(Boolean);
    const targets = mode === 'visible' ? visible : (selected.length ? selected : visible);
    const configured = Number(this.settings.thumbnails?.visibleLimit || POSTER_VISIBLE_LIMIT);
    // Always include all targets; do not cap at a lower value than the number of
    // targets to ensure all selected/visible bookmarks are processed.
    const limit = Math.max(configured, targets.filter((b) => b.url).length);
    const batch = targets.filter((b) => b.url).slice(0, limit);
    if (!batch.length) { this.showToast('当前没有可截图的书签'); return; }
    this.openModal('#aiModal');
    $('#aiModal .modal-head h2').textContent = '生成真实网页截图';
    $('#aiModalBody').innerHTML = `<section class="send-box"><p>将为 <strong>${batch.length}</strong> 个书签生成真实网页截图海报。</p>
      <p>插件会优先使用增强 CDP 模式批量生成真实网页首屏截图，失败时降级为网页封面或本地海报，并在卡片标记“截图失败”。</p>
      <ul><li>优先保存真实网页画面</li><li>无法截图时自动降级为网页公开封面图或本地海报，并在卡片标记失败</li><li>截图缓存只保存在本机</li><li>可随时在设置里清除缓存</li></ul>
      <div class="modal-actions"><button class="ghost" id="cancelThumbBtn">取消</button><button class="primary" id="confirmThumbBtn">开始截图</button></div></section>`;
    $('#cancelThumbBtn').addEventListener('click', () => this.closeModal('#aiModal'));
    $('#confirmThumbBtn').addEventListener('click', () => {
      this.closeModal('#aiModal');
      this.generateScreenshotPosters(batch, { silent: false, reason: 'manual-confirm', forceScreenshot: true });
    });
  },

  async generateThumbnails(targets) {
    return this.generateScreenshotPosters((targets || []).filter((b) => b?.url), { silent: false, reason: 'legacy-manual', forceScreenshot: true });
  },

  canUseCaptureTabGroups() {
    return Boolean(globalThis.chrome?.tabs?.group && globalThis.chrome?.tabGroups?.update);
  },

  captureTabGroupIdNone() {
    return globalThis.chrome?.tabGroups?.TAB_GROUP_ID_NONE ?? -1;
  },

  getTabByIdSafe(tabId) {
    return new Promise((resolve) => {
      if (!globalThis.chrome?.tabs?.get || tabId == null) { resolve(null); return; }
      try {
        chrome.tabs.get(tabId, (tab) => {
          const err = chrome.runtime?.lastError;
          resolve(err ? null : tab || null);
        });
      } catch (_) { resolve(null); }
    });
  },

  getWindowByIdSafe(windowId) {
    return new Promise((resolve) => {
      if (!globalThis.chrome?.windows?.get || windowId == null) { resolve(null); return; }
      try {
        chrome.windows.get(windowId, (win) => {
          const err = chrome.runtime?.lastError;
          resolve(err ? null : win || null);
        });
      } catch (_) { resolve(null); }
    });
  },

  getCaptureTabGroupSafe(groupId) {
    return new Promise((resolve) => {
      if (!globalThis.chrome?.tabGroups?.get || groupId == null || groupId === this.captureTabGroupIdNone()) { resolve(null); return; }
      try {
        chrome.tabGroups.get(groupId, (group) => {
          const err = chrome.runtime?.lastError;
          resolve(err ? null : group || null);
        });
      } catch (_) { resolve(null); }
    });
  },

  groupTabsSafe(tabIds, groupId = null) {
    return new Promise((resolve) => {
      if (!this.canUseCaptureTabGroups() || !tabIds?.length) { resolve(null); return; }
      const options = { tabIds };
      if (groupId != null && groupId !== this.captureTabGroupIdNone()) options.groupId = Number(groupId);
      try {
        chrome.tabs.group(options, (nextGroupId) => {
          const err = chrome.runtime?.lastError;
          resolve(err ? null : nextGroupId);
        });
      } catch (_) { resolve(null); }
    });
  },

  updateCaptureTabGroup(groupId, options = {}) {
    return new Promise((resolve) => {
      if (!this.canUseCaptureTabGroups() || groupId == null || groupId === this.captureTabGroupIdNone()) { resolve(false); return; }
      try {
        chrome.tabGroups.update(groupId, {
          title: CAPTURE_TAB_GROUP_TITLE,
          color: CAPTURE_TAB_GROUP_COLOR,
          collapsed: options.collapsed !== false
        }, () => {
          const err = chrome.runtime?.lastError;
          resolve(!err);
        });
      } catch (_) { resolve(false); }
    });
  },

  async ensureCaptureTabWorkspace(tabId, options = {}) {
    if (!this.canUseCaptureTabGroups()) return null;
    const tab = await this.getTabByIdSafe(tabId);
    if (!tab?.id || tab.windowId == null) return null;
    const win = await this.getWindowByIdSafe(tab.windowId);
    if (win?.type && win.type !== 'normal') return null;

    const windowId = Number(tab.windowId);
    let groupId = this.captureTabGroupsByWindow.get(windowId);
    if (groupId != null && !(await this.getCaptureTabGroupSafe(groupId))) {
      this.captureTabGroupsByWindow.delete(windowId);
      this.activeCaptureTabGroups.delete(Number(groupId));
      groupId = null;
    }

    if (groupId != null && tab.groupId !== groupId) {
      const movedGroupId = await this.groupTabsSafe([tab.id], groupId);
      if (movedGroupId == null) {
        this.captureTabGroupsByWindow.delete(windowId);
        this.activeCaptureTabGroups.delete(Number(groupId));
        groupId = null;
      } else {
        groupId = movedGroupId;
      }
    }

    if (groupId == null || groupId === this.captureTabGroupIdNone()) {
      groupId = await this.groupTabsSafe([tab.id]);
      if (groupId == null || groupId === this.captureTabGroupIdNone()) return null;
    }

    groupId = Number(groupId);
    this.captureTabGroupsByWindow.set(windowId, groupId);
    this.activeCaptureTabGroups.add(groupId);
    await this.updateCaptureTabGroup(groupId, { collapsed: options.collapsed !== false });
    return groupId;
  },

  async createCaptureWindow() {
    if (!globalThis.chrome?.windows?.create) return null;
    const viewport = this.captureViewportProfile();
    const width = viewport.mobile ? viewport.width + 24 : viewport.width;
    const height = viewport.mobile ? viewport.height + 88 : viewport.height;
    const left = Math.max(0, Math.round((screen.availWidth || 1400) - width - 32));
    const top = Math.max(0, Math.round((screen.availHeight || 900) - height - 72));
    const win = await new Promise((resolve, reject) => {
      chrome.windows.create({ url: 'about:blank', type: 'popup', focused: false, width, height, left, top }, (created) => {
        const err = chrome.runtime?.lastError;
        if (err) reject(new Error(err.message)); else resolve(created);
      });
    });
    const tab = win?.tabs?.[0];
    if (!tab?.id) throw new Error('无法创建临时截图窗口');
    this.trackCaptureWindow(win.id);
    this.trackCaptureTab(tab.id);
    return { windowId: win.id, tabId: tab.id };
  },

  async captureBookmarkInWindow(windowId, tabId, url) {
    if (this.posterAbort) throw new Error('截图队列已停止');
    await this.updateTabUrl(tabId, url);
    await this.waitForTabComplete(tabId, Number(this.settings.thumbnails?.captureTimeout || 15000));
    if (this.posterAbort) throw new Error('截图队列已停止');
    await this.prepareTabForScreenshot(tabId);
    await delay(Number(this.settings.thumbnails?.captureDelay || 1500));
    if (this.posterAbort) throw new Error('截图队列已停止');
    const img = await this.captureWindowVisibleTab(windowId);
    return await posterizeScreenshot(img, this.posterOptions());
  },

  updateTabUrl(tabId, url) {
    return new Promise((resolve, reject) => {
      chrome.tabs.update(tabId, { url, active: true }, (tab) => {
        const err = chrome.runtime?.lastError;
        if (err) reject(new Error(err.message)); else resolve(tab);
      });
    });
  },

  captureWindowVisibleTab(windowId) {
    return new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: Number(this.settings.thumbnails?.captureQuality || 82) }, (img) => {
        const err = chrome.runtime?.lastError;
        if (err) reject(new Error(err.message)); else resolve(img);
      });
    });
  },

  async prepareTabForScreenshot(tabId) {
    if (!globalThis.chrome?.scripting?.executeScript) return;
    try {
      await new Promise((resolve) => {
        chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            try {
              window.scrollTo(0, 0);
              document.documentElement.style.scrollBehavior = 'auto';
              document.body && (document.body.style.scrollBehavior = 'auto');
            } catch (_) {}
          }
        }, () => resolve());
      });
    } catch (_) {}
  },

  async captureBookmarkPage(url) {
    const tab = await new Promise((resolve, reject) => {
      chrome.tabs.create({ url, active: true }, (created) => {
        const err = chrome.runtime?.lastError;
        if (err) reject(new Error(err.message)); else resolve(created);
      });
    });
    this.trackCaptureTab(tab.id);
    await this.ensureCaptureTabWorkspace(tab.id, { collapsed: false });
    try {
      if (this.posterAbort) throw new Error('截图队列已停止');
      await this.waitForTabComplete(tab.id, Number(this.settings.thumbnails?.captureTimeout || 15000));
      if (this.posterAbort) throw new Error('截图队列已停止');
      await this.prepareTabForScreenshot(tab.id);
      await delay(Number(this.settings.thumbnails?.captureDelay || 1500));
      if (this.posterAbort) throw new Error('截图队列已停止');
      const dataUrl = await this.captureWindowVisibleTab(tab.windowId);
      return await posterizeScreenshot(dataUrl, this.posterOptions());
    } finally {
      this.untrackCaptureTab(tab.id);
      await this.removeTabSafe(tab.id);
    }
  },

  waitForTabComplete(tabId, timeout = 15000) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        chrome.tabs.onRemoved?.removeListener?.(removedListener);
        resolve();
      };
      const timer = setTimeout(finish, timeout);
      const listener = (id, info) => { if (id === tabId && info.status === 'complete') finish(); };
      const removedListener = (id) => { if (id === tabId) finish(); };
      chrome.tabs.onUpdated.addListener(listener);
      chrome.tabs.onRemoved?.addListener?.(removedListener);
      try { chrome.tabs.get(tabId, (tab) => { if (tab?.status === 'complete') finish(); }); } catch (_) {}
    });
  },

  removeWindowSafe(windowId) {
    return new Promise((resolve) => {
      if (!globalThis.chrome?.windows?.remove || windowId == null) { this.untrackCaptureWindow(windowId); resolve(false); return; }
      try {
        chrome.windows.remove(windowId, () => {
          this.untrackCaptureWindow(windowId);
          const err = chrome.runtime?.lastError;
          resolve(!err);
        });
      } catch (_) {
        this.untrackCaptureWindow(windowId);
        resolve(false);
      }
    });
  },

  removeTabSafe(tabId) {
    return new Promise((resolve) => {
      if (!globalThis.chrome?.tabs?.remove || tabId == null) { this.untrackCaptureTab(tabId); resolve(false); return; }
      try {
        chrome.tabs.remove(tabId, () => {
          this.untrackCaptureTab(tabId);
          const err = chrome.runtime?.lastError;
          resolve(!err);
        });
      } catch (_) {
        this.untrackCaptureTab(tabId);
        resolve(false);
      }
    });
  },

  trackCaptureWindow(windowId) {
    if (windowId != null) this.activeCaptureWindows.add(Number(windowId));
  },

  trackCaptureTab(tabId) {
    if (tabId != null) this.activeCaptureTabs.add(Number(tabId));
  },

  untrackCaptureWindow(windowId) {
    if (windowId == null) return;
    const numericWindowId = Number(windowId);
    this.activeCaptureWindows.delete(numericWindowId);
    const groupId = this.captureTabGroupsByWindow.get(numericWindowId);
    if (groupId != null) this.activeCaptureTabGroups.delete(Number(groupId));
    this.captureTabGroupsByWindow.delete(numericWindowId);
  },

  untrackCaptureTab(tabId) {
    if (tabId != null) this.activeCaptureTabs.delete(Number(tabId));
  },

  async cleanupActiveCaptureSurfaces(options = {}) {
    const windows = [...this.activeCaptureWindows];
    const tabs = [...this.activeCaptureTabs];
    this.activeCaptureWindows.clear();
    this.activeCaptureTabs.clear();
    this.activeCaptureTabGroups.clear();
    this.captureTabGroupsByWindow.clear();
    const jobs = [
      ...windows.map((windowId) => this.removeWindowSafe(windowId)),
      ...tabs.map((tabId) => this.removeTabSafe(tabId))
    ];
    if (options.fireAndForget) {
      jobs.forEach((job) => job.catch?.(() => {}));
      return;
    }
    await Promise.all(jobs);
  },

  async stopPosterGeneration(message = '正在停止截图队列，并关闭临时截图窗口') {
    this.posterAbort = true;
    this.showToast(message);
    await this.cleanupActiveCaptureSurfaces();
  },

  getCurrentTabSafe() {
    return new Promise((resolve) => {
      try { chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs?.[0] || null)); }
      catch (_) { resolve(null); }
    });
  },

  hasRequiredHostAccess() {
    try {
      const manifest = chrome.runtime?.getManifest?.();
      const hosts = manifest?.host_permissions || [];
      return hosts.includes('<all_urls>') || hosts.includes('http://*/*') && hosts.includes('https://*/*');
    } catch (_) { return false; }
  },

  async ensureBatchPermissions(urls) {
    if (this.hasRequiredHostAccess()) return true;
    if (!globalThis.chrome?.permissions?.request) return true;
    const origins = [...new Set(urls.map(originPattern).filter(Boolean))].slice(0, 50);
    if (!origins.length) return true;
    return new Promise((resolve) => {
      chrome.permissions.request({ origins }, (granted) => resolve(Boolean(granted)));
    });
  },

  async ensureUrlPermission(url) {
    if (this.hasRequiredHostAccess()) return true;
    if (!globalThis.chrome?.permissions?.request) return true;
    const origin = originPattern(url);
    if (!origin) return true;
    return new Promise((resolve) => {
      chrome.permissions.request({ origins: [origin] }, (granted) => resolve(Boolean(granted)));
    });
  },

  async clearThumbnailCache() {
    if (!confirm('确认清除所有真实网页截图缓存？')) return;
    clearTimeout(this.thumbnailCacheSaveTimer);
    if (this.thumbnailCacheSavePromise) {
      try { await this.thumbnailCacheSavePromise; }
      catch (err) { console.warn('thumbnail cache save failed before clear', err); }
    }
    this.thumbnailCacheDirty = false;
    this.thumbnailCache = {};
    await StorageAdapter.set(THUMBNAIL_KEY, {});
    await this.loadBookmarks();
    this.render();
    this.showToast('已清除缩略图缓存');
  },

  renderEmptyState() {
    return `<div class="empty-state"><div class="empty-icon">□</div><h3>没有找到书签</h3><p>试试切换文件夹、搜索关键词或清除筛选条件。</p></div>`;
  },

  bindCardEvents() {
    this.bindGridEvents();
  },

  getVisibleBookmarks() {
    let list = this.bookmarks;
    if (this.currentFolderId === 'duplicates') {
      list = list.filter((b) => this.duplicateBookmarkIds.has(String(b.id)));
    } else if (this.currentFolderId === 'recent') {
      list = [...list].sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
      list = list.slice(0, 80);
    } else if (this.currentFolderId === 'unfiled') {
      list = list.filter((b) => this.unfiledBookmarkIds.has(String(b.id)));
    } else if (this.currentFolderId === 'ai-pending') {
      list = list.filter((b) => this.aiRecommendations[b.id]?.status === 'pending');
    } else if (this.currentFolderId !== 'all') {
      const ids = this.folderBookmarkIds.get(String(this.currentFolderId)) || new Set();
      list = list.filter((b) => ids.has(String(b.id)));
    }
    const q = this.query.toLowerCase();
    if (q) list = list.filter((b) => (b.searchText || `${b.title} ${b.url} ${b.domain} ${b.folderPath}`.toLowerCase()).includes(q));
    if (this.filter === 'with-ai') list = list.filter((b) => this.aiRecommendations[b.id]);
    if (this.filter === 'no-ai') list = list.filter((b) => !this.aiRecommendations[b.id]);
    if (this.filter === 'duplicates') {
      list = list.filter((b) => this.duplicateBookmarkIds.has(String(b.id)));
    }
    if (this.filter === 'domain-github') list = list.filter((b) => /github\.com$/.test(b.domain));
    return this.sortBookmarks(list);
  },

  sortBookmarks(list) {
    const sorted = [...list];
    if (this.sortBy === 'title') sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else if (this.sortBy === 'domain') sorted.sort((a, b) => (a.domain || '').localeCompare(b.domain || ''));
    else if (this.sortBy === 'folder') sorted.sort((a, b) => (a.folderPath || '').localeCompare(b.folderPath || ''));
    else if (this.sortBy === 'ai') sorted.sort((a, b) => (this.aiRecommendations[b.id]?.confidence || 0) - (this.aiRecommendations[a.id]?.confidence || 0));
    else sorted.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
    return sorted;
  },

  collectBookmarkIdsInFolder(folderId) {
    return [...(this.folderBookmarkIds.get(String(folderId)) || [])];
  },

  getCurrentTitle() {
    const smart = {
      all: { title: '全部书签' },
      duplicates: { title: '重复书签' },
      recent: { title: '最近添加' },
      unfiled: { title: '未分类书签' },
      'ai-pending': { title: 'AI 建议待确认' }
    };
    return smart[this.currentFolderId] || this.folderMap.get(String(this.currentFolderId)) || { title: '书签海报墙' };
  },

  toggleSelect(id) {
    const key = String(id);
    const selected = !this.selectedIds.has(key);
    if (selected) this.selectedIds.add(key);
    else this.selectedIds.delete(key);
    this.syncCardSelection(key, selected);
    this.renderBulkBar();
  },

  clearSelection() {
    const ids = [...this.selectedIds];
    this.selectedIds.clear();
    ids.forEach((id) => this.syncCardSelection(id, false));
    this.renderBulkBar();
  },

  syncCardSelection(id, selected) {
    const card = $$('.poster-card').find((item) => String(item.dataset.id) === String(id));
    if (!card) return;
    const dot = $('.select-dot', card);
    clearTimeout(this.cardMotionTimers.get(String(id)));
    card.classList.remove('just-selected', 'just-deselected');
    card.classList.toggle('selected', selected);
    card.classList.add(selected ? 'just-selected' : 'just-deselected');
    if (dot) {
      dot.classList.toggle('on', selected);
      dot.textContent = selected ? '✓' : '';
    }
    const timer = setTimeout(() => {
      card.classList.remove('just-selected', 'just-deselected');
      this.cardMotionTimers.delete(String(id));
    }, 420);
    this.cardMotionTimers.set(String(id), timer);
  },

  pressElement(el) {
    if (!el) return;
    el.classList.remove('is-pressing');
    void el.offsetWidth;
    el.classList.add('is-pressing');
    setTimeout(() => el.classList.remove('is-pressing'), 220);
  },

  renderBulkBar() {
    const has = this.selectedIds.size > 0;
    $('#bulkBar').classList.toggle('show', has);
    $('#selectedCount').textContent = this.t('selectedCount', { count: this.selectedIds.size });
    $('#bulkAiBtn').style.display = this.settings.ai.enabled ? '' : 'none';
  },

  renderAiVisibility() {
    $('#aiBtn').style.display = '';
    $('#aiBtn').classList.toggle('needs-setup', !this.settings.ai.enabled);
    $('#aiBtn').innerHTML = `${iconSvg('sparkle')} ${this.settings.ai.enabled ? this.t('aiRun') : this.t('aiSetup')}`;
    $('#aiStatusPill').style.display = '';
    $('#aiStatusPill').textContent = this.settings.ai.enabled ? this.t('aiReady', { model: this.settings.ai.model || 'AI' }) : this.t('aiDisabled');
    $('#aiStatusPill').classList.toggle('off', !this.settings.ai.enabled);
  },

  async moveBookmarks(ids, parentId) {
    const valid = ids.filter(Boolean);
    if (!valid.length || !parentId) return;
    if (!(await this.ensureSafetyBackupBeforeOrganize('移动书签'))) return;
    const before = valid.map((id) => this.bookmarkById.get(String(id))).filter(Boolean)
      .map((b) => ({ id: b.id, parentId: b.parentId, index: b.index }));
    for (const id of valid) await this.adapter.move(id, { parentId: String(parentId) });
    this.undoStack.push({ type: 'move', items: before });
    await this.loadBookmarks();
    this.selectedIds.clear();
    this.render();
    this.showUndo(`已移动 ${valid.length} 个书签`);
  },

  openMoveModal(ids) {
    this.moveTargetIds = ids;
    this.openModal('#moveModal');
    $('#folderSearch').value = '';
    this.renderMoveList();
  },

  renderMoveList() {
    const q = ($('#folderSearch').value || '').toLowerCase();
    const folders = this.folders.filter((f) => !q || `${f.title} ${f.path}`.toLowerCase().includes(q));
    $('#folderList').innerHTML = folders.map((f) => `<button class="folder-choice" data-id="${escapeHtml(f.id)}"><span>${iconSvg('folder')}</span><strong>${escapeHtml(f.title)}</strong><small>${escapeHtml(f.path)}</small></button>`).join('');
    $$('#folderList .folder-choice').forEach((btn) => btn.addEventListener('click', async () => {
      await this.moveBookmarks(this.moveTargetIds || [...this.selectedIds], btn.dataset.id);
      this.closeModal('#moveModal');
    }));
  },

  async createFolderAndMove() {
    if (!(await this.ensureSafetyBackupBeforeOrganize('新建文件夹并移动书签'))) return;
    const title = ($('#newFolderName').value || '').trim();
    if (!title) { this.showToast('请先输入新文件夹名称'); return; }
    const parentId = this.currentFolderId && this.currentFolderId !== 'all' && !['duplicates','recent','unfiled','ai-pending'].includes(this.currentFolderId) ? this.currentFolderId : (this.folders[0]?.id || '1');
    const folder = await this.adapter.create({ parentId: String(parentId), title });
    await this.moveBookmarks(this.moveTargetIds || [...this.selectedIds], folder.id);
    $('#newFolderName').value = '';
    this.closeModal('#moveModal');
  },

  async deleteSelected() {
    const ids = [...this.selectedIds];
    if (!ids.length) return;
    if (!(await this.ensureSafetyBackupBeforeOrganize('删除书签'))) return;
    if (!confirm(`确认删除 ${ids.length} 个书签？删除后可在本页面立即撤销。`)) return;
    const deleted = ids.map((id) => this.bookmarkById.get(String(id))).filter(Boolean);
    for (const id of ids) await this.adapter.remove(id);
    this.undoStack.push({ type: 'delete', items: deleted });
    this.selectedIds.clear();
    await this.loadBookmarks();
    this.render();
    this.showUndo(`已删除 ${ids.length} 个书签`);
  },

  async undo() {
    const action = this.undoStack.pop();
    if (!action) return;
    if (action.type === 'move') {
      for (const item of action.items) await this.adapter.move(item.id, { parentId: String(item.parentId), index: item.index });
    }
    if (action.type === 'delete') {
      for (const item of action.items) await this.adapter.create({ parentId: String(item.parentId), title: item.title, url: item.url });
    }
    if (action.type === 'update') {
      for (const item of action.items) await this.adapter.update(item.id, { title: item.title, url: item.url });
    }
    await this.loadBookmarks();
    this.render();
    this.showToast('已撤销上一步操作');
    $('#undoToast').classList.remove('show');
  },

  showUndo(message) {
    $('#undoMessage').textContent = message;
    $('#undoToast').classList.add('show');
    clearTimeout(this.undoTimer);
    this.undoTimer = setTimeout(() => $('#undoToast').classList.remove('show'), 8000);
  },

  openEdit(id) {
    const b = this.bookmarkById.get(String(id));
    if (!b) return;
    this.editingId = id;
    $('#editTitle').value = b.title || '';
    $('#editUrl').value = b.url || '';
    $('#editFolderPath').textContent = b.folderPath || '未分类';
    $('#editOpenBtn').href = b.url || '#';
    const rec = this.aiRecommendations[id];
    $('#editAiBox').innerHTML = rec && this.settings.ai.enabled ? `<div class="ai-detail"><strong>AI 建议</strong><p>移动到：${escapeHtml(rec.suggestedFolder || '—')}</p><p>置信度：${rec.confidence}%</p><p>${escapeHtml(rec.reason || '')}</p><button class="primary small" id="applyOneAiBtn">应用该建议</button></div>` : '<p class="muted">暂无 AI 建议。</p>';
    this.openModal('#editModal');
    $('#applyOneAiBtn')?.addEventListener('click', () => this.applyRecommendation(id));
  },

  async saveEdit() {
    const id = this.editingId;
    const old = this.bookmarkById.get(String(id));
    if (!id || !old) return;
    if (!(await this.ensureSafetyBackupBeforeOrganize('编辑书签'))) return;
    const title = $('#editTitle').value.trim() || old.title;
    const url = $('#editUrl').value.trim() || old.url;
    this.undoStack.push({ type: 'update', items: [{ id, title: old.title, url: old.url }] });
    await this.adapter.update(id, { title, url });
    await this.loadBookmarks();
    this.closeModal('#editModal');
    this.render();
    this.showUndo('已更新书签信息');
  },

  async deleteFromEdit() {
    if (!this.editingId) return;
    this.selectedIds = new Set([this.editingId]);
    this.closeModal('#editModal');
    await this.deleteSelected();
  },

  openSettings(options = {}) {
    const alreadyOpen = this.currentManagedModal() === 'settings';
    if (this.isKnownSettingsTab(options.tab)) this.activeSettingsTab = options.tab;
    this.openModal('#settingsModal');
    this.fillSettingsForm();
    this.renderSettingsTabs({ syncHistory: false });
    // 每次打开设置时重新绑定并刷新缩略图设置卡片状态
    this.bindThumbnailCustomControls();
    this.bindPosterPresetControls();
    if (options.syncHistory !== false) this.syncAppHistory({ modal: 'settings', settingsTab: this.activeSettingsTab }, { replace: Boolean(options.replaceHistory || alreadyOpen) });
  },

  closeSettings(options = {}) {
    this.closeModal('#settingsModal');
    if (options.syncHistory !== false) this.syncAppHistory({ modal: null }, { replace: true });
  },

  fillSettingsForm() {
    $('#aiEnabled').checked = this.settings.ai.enabled;
    $('#providerSelect').value = this.settings.ai.provider || 'local';
    $('#providerName').value = this.settings.ai.providerName || '';
    $('#baseUrl').value = this.settings.ai.baseUrl || '';
    $('#apiKey').value = this.settings.ai.apiKey || '';
    $('#modelName').value = this.settings.ai.model || '';
    $('#batchSize').value = this.settings.ai.batchSize || 30;
    if ($('#languageSelect')) $('#languageSelect').value = this.locale();
    if ($('#settingsLanguageSelect')) $('#settingsLanguageSelect').value = this.locale();
    if ($('#settingsCardSizeSelect')) $('#settingsCardSizeSelect').value = this.settings.cardSize || 'large';
    $('#minConfidence').value = this.settings.ai.minConfidence || 70;
    $('#sendMeta').checked = this.settings.ai.sendMeta;
    $('#sendBody').checked = this.settings.ai.sendBody;
    $('#allowRename').checked = this.settings.ai.allowRename;
    $('#allowCreateFolder').checked = this.settings.ai.allowCreateFolder;
    $('#showFolderTag').checked = this.settings.showFolderTag;
    $('#showDate').checked = this.settings.showDate;
    $('#autoGeneratePosters').checked = this.settings.thumbnails?.autoGenerate !== false;
    $('#useRealThumbs').checked = this.settings.thumbnails?.useReal !== false;
    $('#askThumbPermission').checked = this.settings.thumbnails?.askPermission !== false;
    // Populate posterLimit input with saved backgroundLimit, defaulting to 300 if unset
    $('#posterLimit').value = this.settings.thumbnails?.backgroundLimit || 300;
    // Populate posterVisibleLimit input with saved visibleLimit, defaulting to 300 if unset
    $('#posterVisibleLimit').value = this.settings.thumbnails?.visibleLimit || 300;
    $('#posterMode').value = this.settings.thumbnails?.generationMode || 'screenshot-first';
    $('#screenshotStrategy').value = this.settings.thumbnails?.screenshotStrategy || 'debugger-cdp';
    $('#captureDelay').value = this.settings.thumbnails?.captureDelay || 1500;
    $('#captureQuality').value = this.settings.thumbnails?.captureQuality || 82;
    $('#fallbackToOg').checked = this.settings.thumbnails?.fallbackToOg !== false;
    if ($('#posterConcurrent')) {
      const c = clampConcurrency(this.settings.thumbnails?.concurrent || 4);
      $('#posterConcurrent').value = c;
      if ($('#posterConcurrentNumber')) $('#posterConcurrentNumber').value = c;
      const cv = $('#posterConcurrentValue');
      if (cv) cv.textContent = String(c);
      this.syncConcurrencyInputs(c, 'settings');
    }
    $('#captureSize') && ($('#captureSize').value = `${this.settings.thumbnails?.captureWidth || 1440}x${this.settings.thumbnails?.captureHeight || 900}`);
    if ($('#posterAspectSelect')) $('#posterAspectSelect').value = this.settings.thumbnails?.posterAspect || 'landscape';
    if ($('#settingsPosterAspectSelect')) $('#settingsPosterAspectSelect').value = this.settings.thumbnails?.posterAspect || 'landscape';
    $('#cropMode') && ($('#cropMode').value = this.settings.thumbnails?.cropMode || 'smart');
    $('#whitePageEnhance') && ($('#whitePageEnhance').checked = this.settings.thumbnails?.whitePageEnhance !== false);
    if ($('#requireBackupBeforeOrganize')) $('#requireBackupBeforeOrganize').checked = this.settings.safety?.requireBackupBeforeOrganize !== false;
    $$('[data-setting-mirror="requireBackupBeforeOrganize"]').forEach((el) => { el.checked = this.settings.safety?.requireBackupBeforeOrganize !== false; });
    if ($('#lastBookmarkBackupText')) $('#lastBookmarkBackupText').textContent = this.getLastBackupText();
    if ($('#thumbnailBackupText')) $('#thumbnailBackupText').textContent = this.getLastBackupText();
    this.renderSettingsSummaries();
  },

  renderSettingsTabs(options = {}) {
    $$('.settings-nav button').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === this.activeSettingsTab));
    $$('.settings-flow-step').forEach((btn) => btn.classList.toggle('active', btn.dataset.jumpTab === this.activeSettingsTab));
    $$('.settings-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === this.activeSettingsTab));
    const activeButton = $('.settings-nav button.active');
    activeButton?.scrollIntoView({ block: 'nearest', inline: 'center' });
    this.renderSettingsHeader();
    this.renderSettingsSummaries();
    if (options.syncHistory !== false && $('#settingsModal')?.classList.contains('show')) {
      this.syncAppHistory({ modal: 'settings', settingsTab: this.activeSettingsTab }, { replace: true });
    }
  },

  renderSettingsHeader() {
    const copy = {
      basic: ['基础', '先把首页显示和常用入口整理清楚'],
      appearance: ['外观', '统一处理语言、卡片大小和海报比例'],
      thumbnail: ['海报', '先选预设，只有特殊页面再展开高级参数'],
      ai: ['AI', '连接服务商，并约束 AI 能看什么、能做什么'],
      data: ['数据', '先导出完整备份，再管理插件自己的数据'],
      privacy: ['隐私', '确认读取书签、访问网页和发送 AI 数据的边界'],
      about: ['关于', '查看版本定位、原则和迁移方式']
    };
    const [title, subtitle] = copy[this.activeSettingsTab] || copy.basic;
    if ($('#settingsPanelTitle')) $('#settingsPanelTitle').textContent = title;
    if ($('#settingsPanelSubtitle')) $('#settingsPanelSubtitle').textContent = subtitle;

    const dock = {
      basic: ['基础', '保存显示偏好后，首页会立刻变得更清爽', 'download', '导出备份', 'gear', '保存设置'],
      appearance: ['外观', '语言、卡片大小和比例会立即同步到首页', 'download', '导出备份', 'gear', '保存外观'],
      thumbnail: ['海报', '先保存预设，再决定是否立刻生成当前海报墙', 'gear', '仅保存', 'image', '保存并生成'],
      ai: ['AI', '保存配置后，开始处理当前可见书签', 'refresh', '测试连接', 'sparkle', '保存并开始'],
      data: ['数据', 'HTML 最适合恢复到浏览器书签管理器', 'download', '导出 JSON', 'download', '导出 HTML'],
      privacy: ['隐私', '隐私页主要负责说明，备份和导出在数据页', 'database', '数据与备份', 'gear', '保存设置'],
      about: ['关于', '设置可以导出，方便迁移或排查', 'download', '导出设置', 'close', '关闭']
    };
    const [dockTitle, dockHint, secondaryIcon, secondary, primaryIcon, primary] = dock[this.activeSettingsTab] || dock.basic;
    if ($('#settingsDockTitle')) $('#settingsDockTitle').textContent = dockTitle;
    if ($('#settingsDockHint')) $('#settingsDockHint').textContent = dockHint;
    if ($('#settingsDockSecondary span:last-child')) $('#settingsDockSecondary span:last-child').textContent = secondary;
    if ($('#settingsDockPrimary span:last-child')) $('#settingsDockPrimary span:last-child').textContent = primary;
    const secondaryIconSlot = $('#settingsDockSecondary span:first-child');
    const primaryIconSlot = $('#settingsDockPrimary span:first-child');
    if (secondaryIconSlot) {
      secondaryIconSlot.dataset.icon = secondaryIcon;
      secondaryIconSlot.dataset.iconInstalled = '1';
      secondaryIconSlot.innerHTML = iconSvg(secondaryIcon);
    }
    if (primaryIconSlot) {
      primaryIconSlot.dataset.icon = primaryIcon;
      primaryIconSlot.dataset.iconInstalled = '1';
      primaryIconSlot.innerHTML = iconSvg(primaryIcon);
    }
    installStaticIcons();
  },

  renderSettingsSummaries() {
    const strategy = $('#screenshotStrategy')?.value || this.settings.thumbnails?.screenshotStrategy || 'debugger-cdp';
    const strategyLabel = strategy === 'debugger-cdp' ? 'CDP 后台' : strategy === 'quiet-window' ? '临时窗口' : '当前标签页';
    const viewport = ($('#captureSize')?.value || `${this.settings.thumbnails?.captureWidth || 1440}x${this.settings.thumbnails?.captureHeight || 900}`).replace('x', ' × ');
    const concurrent = clampConcurrency($('#posterConcurrentNumber')?.value || $('#posterConcurrent')?.value || this.settings.thumbnails?.concurrent || 4);
    const effectiveConcurrent = strategy === 'active-tabs' ? '1（前台）' : String(concurrent);
    if ($('#shotSummaryEngine')) $('#shotSummaryEngine').textContent = strategyLabel;
    if ($('#shotSummaryConcurrent')) $('#shotSummaryConcurrent').textContent = effectiveConcurrent;
    if ($('#shotSummaryViewport')) $('#shotSummaryViewport').textContent = viewport;
    if ($('#shotSummaryBackup')) $('#shotSummaryBackup').textContent = ($('#requireBackupBeforeOrganize')?.checked ?? true) ? '备份提醒开启' : '未强制提醒';
    const failedPosters = this.getFailedPosterBookmarks('all').length;
    if ($('#failedPosterCount')) $('#failedPosterCount').textContent = failedPosters ? `${failedPosters} 个失败` : '暂无失败';
    if ($('#repairFailedPostersBtn')) $('#repairFailedPostersBtn').disabled = !failedPosters || this.posterQueueRunning;

    if ($('#aiSummaryProvider')) $('#aiSummaryProvider').textContent = $('#providerName')?.value || ProviderTemplates[$('#providerSelect')?.value || 'local']?.name || '本地模拟';
    if ($('#aiSummaryModel')) $('#aiSummaryModel').textContent = $('#modelName')?.value || 'local-demo';
    if ($('#aiSummaryBatch')) $('#aiSummaryBatch').textContent = String(Number($('#batchSize')?.value || 30));
    if ($('#aiSummaryPrivacy')) $('#aiSummaryPrivacy').textContent = $('#aiEnabled')?.checked ? '主动触发' : '默认关闭';
    this.syncPosterPresetCards?.();
  },

  async handleSettingsDockPrimary() {
    if (this.activeSettingsTab === 'thumbnail') {
      await this.collectAndSaveSettings({ silent: true });
      this.closeSettings();
      this.generatePostersForVisible(true);
      return;
    }
    if (this.activeSettingsTab === 'ai') {
      await this.collectAndSaveSettings({ silent: true });
      this.closeSettings();
      this.openAiConfirm('visible');
      return;
    }
    if (this.activeSettingsTab === 'data') {
      await this.exportAllBookmarks('html', { source: 'settings-dock' });
      return;
    }
    if (this.activeSettingsTab === 'about') {
      this.closeSettings();
      return;
    }
    await this.collectAndSaveSettings();
  },

  async handleSettingsDockSecondary() {
    if (this.activeSettingsTab === 'ai') {
      await this.testAiConnection();
      return;
    }
    if (this.activeSettingsTab === 'thumbnail') {
      await this.collectAndSaveSettings();
      return;
    }
    if (this.activeSettingsTab === 'data') {
      await this.exportAllBookmarks('json', { source: 'settings-dock' });
      return;
    }
    if (this.activeSettingsTab === 'privacy') {
      this.activeSettingsTab = 'data';
      this.renderSettingsTabs();
      return;
    }
    if (this.activeSettingsTab === 'about') {
      this.exportBackup();
      return;
    }
    await this.exportAllBookmarks('html', { source: 'settings-dock' });
  },

  applyProviderTemplate(providerKey) {
    const template = ProviderTemplates[providerKey] || ProviderTemplates.custom;
    $('#providerName').value = template.name;
    $('#baseUrl').value = template.baseUrl;
    $('#modelName').value = template.model;
    this.renderSettingsSummaries();
  },

  async collectAndSaveSettings(options = {}) {
    this.settings.language = $('#settingsLanguageSelect')?.value || $('#languageSelect')?.value || this.settings.language || 'zh-CN';
    this.settings.cardSize = $('#settingsCardSizeSelect')?.value || $('#sizeSelect')?.value || this.settings.cardSize || 'large';
    this.settings.showFolderTag = $('#showFolderTag').checked;
    this.settings.showDate = $('#showDate').checked;
    this.settings.thumbnails = this.settings.thumbnails || {};
    this.settings.thumbnails.autoGenerate = $('#autoGeneratePosters')?.checked !== false;
    this.settings.thumbnails.useReal = $('#useRealThumbs')?.checked !== false;
    this.settings.thumbnails.askPermission = $('#askThumbPermission')?.checked !== false;
    this.settings.thumbnails.backgroundLimit = clampNumber($('#posterLimit')?.value, 1, 5000, 300);
    this.settings.thumbnails.visibleLimit = clampNumber($('#posterVisibleLimit')?.value, 1, 5000, 300);
    this.settings.thumbnails.generationMode = $('#posterMode')?.value || 'screenshot-first';
    this.settings.thumbnails.screenshotStrategy = $('#screenshotStrategy')?.value || 'debugger-cdp';
    this.settings.thumbnails.captureDelay = clampNumber($('#captureDelay')?.value, 600, 8000, 1800);
    this.settings.thumbnails.captureQuality = clampNumber($('#captureQuality')?.value, 45, 95, 82);
    this.settings.thumbnails.fallbackToOg = $('#fallbackToOg')?.checked !== false;
    this.settings.thumbnails.concurrent = clampConcurrency($('#posterConcurrentNumber')?.value || $('#posterConcurrent')?.value || 4);
    const sizeValue = $('#captureSize')?.value || '1440x900';
    const [cw, ch] = sizeValue.split('x').map((n) => Number(n));
    this.settings.thumbnails.captureWidth = cw || 1440;
    this.settings.thumbnails.captureHeight = ch || 900;
    this.settings.thumbnails.posterAspect = $('#settingsPosterAspectSelect')?.value || $('#posterAspectSelect')?.value || this.settings.thumbnails.posterAspect || 'landscape';
    this.settings.thumbnails.cropMode = $('#cropMode')?.value || 'smart';
    this.settings.thumbnails.whitePageEnhance = $('#whitePageEnhance')?.checked !== false;
    this.settings.safety = this.settings.safety || {};
    if ($('#requireBackupBeforeOrganize')) this.settings.safety.requireBackupBeforeOrganize = $('#requireBackupBeforeOrganize').checked;
    this.settings.ai.enabled = $('#aiEnabled').checked;
    this.settings.ai.provider = $('#providerSelect').value;
    this.settings.ai.providerName = $('#providerName').value.trim() || ProviderTemplates[this.settings.ai.provider]?.name || '本地模拟';
    this.settings.ai.baseUrl = $('#baseUrl').value.trim().replace(/\/+$/, '');
    this.settings.ai.apiKey = $('#apiKey').value.trim();
    this.settings.ai.model = $('#modelName').value.trim() || ProviderTemplates[this.settings.ai.provider]?.model || 'local-demo';
    this.settings.ai.batchSize = clampNumber($('#batchSize').value, 1, 100, 30);
    this.settings.ai.minConfidence = clampNumber($('#minConfidence').value, 0, 100, 70);
    this.settings.ai.sendMeta = $('#sendMeta').checked;
    this.settings.ai.sendBody = false;
    this.settings.ai.allowRename = $('#allowRename').checked;
    this.settings.ai.allowCreateFolder = false;
    if ($('#languageSelect')) $('#languageSelect').value = this.settings.language;
    if ($('#sizeSelect')) $('#sizeSelect').value = this.settings.cardSize;
    if ($('#posterAspectSelect')) $('#posterAspectSelect').value = this.settings.thumbnails.posterAspect;
    await this.saveSettings();
    this.renderSettingsSummaries();
    this.syncToolbarSelects();
    this.render();
    if (!options.silent) this.showToast('设置已保存');
  },

  queueSettingsSave(delayMs = 260) {
    clearTimeout(this.settingsSaveTimer);
    this.settingsSaveTimer = setTimeout(() => this.saveSettings(), delayMs);
  },

  async saveSettings() { await StorageAdapter.set(STORAGE_KEY, this.settings); },

  async testAiConnection() {
    await this.collectAndSaveSettings();
    $('#testResult').textContent = '测试中...';
    try {
      if (this.settings.ai.provider === 'local' || !this.settings.ai.baseUrl) {
        $('#testResult').textContent = '本地模拟模式可用，无需网络连接';
        $('#testResult').className = 'test-result ok';
        return;
      }
      await this.ensureOriginPermission(this.settings.ai.baseUrl);
      const start = performance.now();
      const res = await fetch(`${this.settings.ai.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.aiHeaders(),
        body: JSON.stringify({
          model: this.settings.ai.model,
          messages: [{ role: 'user', content: 'Reply with OK.' }],
          max_tokens: 8,
          temperature: 0
        })
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      $('#testResult').textContent = `连接成功，响应时间 ${Math.round(performance.now() - start)} ms`;
      $('#testResult').className = 'test-result ok';
    } catch (err) {
      $('#testResult').textContent = `连接失败：${err.message}`;
      $('#testResult').className = 'test-result error';
    }
  },

  async ensureOriginPermission(baseUrl) {
    if (!globalThis.chrome?.permissions || !baseUrl) return true;
    const origin = `${new URL(baseUrl).origin}/*`;
    const granted = await chrome.permissions.contains({ origins: [origin] });
    if (granted) return true;
    return chrome.permissions.request({ origins: [origin] });
  },

  aiHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.settings.ai.apiKey) headers.Authorization = `Bearer ${this.settings.ai.apiKey}`;
    return headers;
  },

  openAiConfirm(mode) {
    if (!this.settings.ai.enabled) {
      this.openSettings({ tab: 'ai' });
      this.showToast(this.t('aiSettingsToast'));
      return;
    }
    const targets = mode === 'selected' ? [...this.selectedIds].map((id) => this.bookmarkById.get(String(id))).filter(Boolean) : this.getVisibleBookmarks();
    if (!targets.length) { this.showToast(this.t('empty')); return; }
    this.aiTargets = targets.slice(0, Number(this.settings.ai.batchSize || 30));
    this.openModal('#aiModal');
    this.renderAiConfirm();
  },

  renderAiConfirm() {
    $('#aiModalBody').innerHTML = `<section class="ai-confirm">
      <h3>AI 预整理</h3>
      <p>将处理 <strong>${this.aiTargets.length}</strong> 个书签，模型：<strong>${escapeHtml(this.settings.ai.model || 'local-demo')}</strong></p>
      <div class="send-box"><h4>将发送给 AI 的信息</h4>
        <ul><li>书签标题</li><li>域名</li><li>URL 路径</li><li>当前所在文件夹</li><li>已有文件夹列表</li>${this.settings.ai.sendMeta ? '<li>网页 meta description</li>' : ''}${this.settings.ai.sendBody ? '<li class="warn">网页正文摘要（你已开启）</li>' : ''}</ul>
      </div>
      <div class="send-box muted-box"><h4>不会发送</h4><p>浏览历史、访问次数、页面截图、Cookie、账号信息和完整书签库。</p></div>
      <div class="modal-actions"><button class="ghost" id="cancelRunAi">取消</button><button class="primary" id="confirmRunAi">开始预整理</button></div>
    </section>`;
    $('#cancelRunAi')?.addEventListener('click', () => this.closeModal('#aiModal'));
    $('#confirmRunAi').addEventListener('click', () => this.runAiPreprocess());
  },

  async runAiPreprocess() {
    const targets = this.aiTargets || [];
    if (!targets.length) return;
    $('#aiModalBody').innerHTML = `<section class="ai-progress"><h3>AI 预整理中</h3><div class="progress-ring"><span id="progressPct">0%</span></div><p id="progressText">准备处理...</p><button class="ghost" id="backgroundAiBtn">后台处理</button></section>`;
    $('#backgroundAiBtn')?.addEventListener('click', () => this.closeModal('#aiModal'));
    const results = [];
    const batches = BookmarkUtils.chunk(targets, Number(this.settings.ai.batchSize || 30));
    let done = 0;
    for (const batch of batches) {
      const recs = await this.classifyBatch(batch);
      results.push(...recs);
      done += batch.length;
      const pct = Math.round(done / targets.length * 100);
      $('#progressPct').textContent = `${pct}%`;
      $('#progressText').textContent = `已处理 ${done} / ${targets.length}`;
    }
    results.forEach((r) => { this.aiRecommendations[r.bookmarkId] = { ...r, status: 'pending' }; });
    await StorageAdapter.set(AI_KEY, this.aiRecommendations);
    this.renderAiResults(results);
    this.renderMain();
  },

  async classifyBatch(bookmarks) {
    if (this.settings.ai.provider === 'local' || !this.settings.ai.baseUrl || !this.settings.ai.apiKey) {
      return BookmarkUtils.localAiRecommendations(bookmarks, this.folders);
    }
    await this.ensureOriginPermission(this.settings.ai.baseUrl);
    const folderList = this.folders.map((f) => ({ id: f.id, title: f.title, path: f.path })).slice(0, 300);
    const payload = bookmarks.map((b) => ({ id: b.id, title: b.title, domain: b.domain, urlPath: pathFromUrl(b.url), currentFolder: b.folderPath }));
    const prompt = `你是一个浏览器书签整理助手。请根据书签标题、域名、URL路径、当前文件夹和已有文件夹列表，给出整理建议。优先使用已有文件夹，不要建议删除。只返回 JSON 数组，不要输出其他文字。数组元素格式：{"bookmarkId":"原id","suggestedFolder":"已有文件夹path","suggestedTitle":"清晰标题","confidence":0-100,"reason":"简短原因"}。\n已有文件夹：${JSON.stringify(folderList)}\n待整理书签：${JSON.stringify(payload)}`;
    const res = await fetch(`${this.settings.ai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.aiHeaders(),
      body: JSON.stringify({
        model: this.settings.ai.model,
        messages: [
          { role: 'system', content: 'You output valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1
      })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '[]';
    const json = parseJsonArray(content);
    return json.map((r) => {
      const folder = BookmarkUtils.findFolderByPath(this.folders, r.suggestedFolder);
      return {
        bookmarkId: String(r.bookmarkId),
        suggestedFolder: folder ? folder.path : r.suggestedFolder,
        suggestedFolderId: folder ? folder.id : '',
        suggestedTitle: r.suggestedTitle || '',
        confidence: Number(r.confidence || 0),
        reason: r.reason || 'AI 生成的整理建议',
        status: 'pending'
      };
    });
  },

  renderAiResults(results) {
    const high = results.filter((r) => r.confidence >= Number(this.settings.ai.applyThreshold || 85));
    const duplicateCount = this.duplicateGroupCount;
    $('#aiModal .modal-head h2').innerHTML = `${iconSvg('sparkle')} AI 预整理结果`;
    $('#aiModalBody').innerHTML = `<section class="ai-results design-ai-results">
      <div class="result-tabs"><span class="active">分类建议 ${results.length}</span><span>标题优化 ${results.filter((r) => r.suggestedTitle).length}</span><span>可能重复 ${duplicateCount}</span></div>
      <div class="ai-success-strip"><span class="success-check">✓</span><strong>分析完成，共 ${results.length} 项处理成功</strong><span>使用模型：${escapeHtml(this.settings.ai.model || 'local-demo')}</span></div>
      <div class="result-table-head"><span>书签信息</span><span>当前文件夹</span><span>建议文件夹</span><span>置信度</span><span>操作</span></div>
      <div class="result-list">${results.map((r) => this.renderAiResultRow(r)).join('')}</div>
      <div class="modal-actions result-actions"><button class="ghost" id="ignoreAllAiBtn2">全部忽略</button><button class="ghost primary-outline" id="applyHighConfidenceBtn2">应用高置信度（${high.length}）</button><button class="primary" id="applySelectedVisualBtn">应用所选建议</button></div>
    </section>`;
    $('#applyHighConfidenceBtn2').addEventListener('click', () => this.applyHighConfidence());
    $('#applySelectedVisualBtn').addEventListener('click', () => this.applyHighConfidence());
    $('#ignoreAllAiBtn2').addEventListener('click', () => this.ignoreAllAi());
    $$('#aiModal .apply-one').forEach((btn) => btn.addEventListener('click', () => this.applyRecommendation(btn.dataset.id)));
    $$('#aiModal .ignore-one').forEach((btn) => btn.addEventListener('click', async () => {
      this.aiRecommendations[btn.dataset.id].status = 'ignored';
      await StorageAdapter.set(AI_KEY, this.aiRecommendations);
      btn.closest('.result-row').remove();
      this.renderMain();
    }));
  },

  renderAiResultRow(r) {
    const b = this.bookmarkById.get(String(r.bookmarkId)) || {};
    const thumb = this.getThumbnailForBookmark(b);
    const img = thumb?.dataUrl || thumb?.imageUrl || faviconUrl(b.url);
    return `<div class="result-row design-result-row">
      <div class="result-bookmark"><img src="${escapeHtml(img)}" alt=""><div><strong>${escapeHtml(shorten(b.title || '未知书签', 36))}</strong><small>${escapeHtml(b.domain || '')}</small><em>${escapeHtml(shorten(r.reason || 'AI 生成的整理建议', 36))}</em></div></div>
      <div class="current-folder"><span>${iconSvg('folder')}</span>${escapeHtml(shorten(b.folderPath || '未分类', 16))}</div>
      <div class="suggest-folder"><span>${iconSvg('folder')}</span>${escapeHtml(shorten(r.suggestedFolder || '—', 18))}</div>
      <div class="confidence">${r.confidence}%</div>
      <div class="result-row-actions"><button class="tiny apply-one" data-id="${escapeHtml(r.bookmarkId)}">接受</button><button class="tiny ghost ignore-one" data-id="${escapeHtml(r.bookmarkId)}">忽略</button></div>
    </div>`;
  },

  async applyRecommendation(id) {
    const rec = this.aiRecommendations[id];
    if (!rec) return;
    let folderId = rec.suggestedFolderId;
    if (!folderId && rec.suggestedFolder) folderId = BookmarkUtils.findFolderByPath(this.folders, rec.suggestedFolder)?.id;
    if (!folderId) { this.showToast('未找到对应文件夹，请先修改建议或创建文件夹'); return; }
    await this.moveBookmarks([id], folderId);
    if (this.settings.ai.allowRename && rec.suggestedTitle) await this.adapter.update(id, { title: rec.suggestedTitle });
    rec.status = 'accepted';
    await StorageAdapter.set(AI_KEY, this.aiRecommendations);
    this.closeModal('#aiModal');
    await this.loadBookmarks();
    this.render();
  },

  async applyHighConfidence() {
    const threshold = Number(this.settings.ai.applyThreshold || 85);
    const recs = Object.values(this.aiRecommendations).filter((r) => r.status === 'pending' && r.confidence >= threshold);
    if (!recs.length) { this.showToast('暂无高置信度建议'); return; }
    if (!(await this.ensureSafetyBackupBeforeOrganize('应用 AI 移动建议'))) return;
    if (!confirm(`确认应用 ${recs.length} 条高置信度 AI 移动建议？应用后可撤销移动操作。`)) return;
    const before = [];
    for (const rec of recs) {
      let folderId = rec.suggestedFolderId || BookmarkUtils.findFolderByPath(this.folders, rec.suggestedFolder)?.id;
      const old = this.bookmarkById.get(String(rec.bookmarkId));
      if (folderId && old) {
        before.push({ id: old.id, parentId: old.parentId, index: old.index });
        await this.adapter.move(rec.bookmarkId, { parentId: String(folderId) });
        rec.status = 'accepted';
      }
    }
    this.undoStack.push({ type: 'move', items: before });
    await StorageAdapter.set(AI_KEY, this.aiRecommendations);
    await this.loadBookmarks();
    this.closeModal('#aiModal');
    this.render();
    this.showUndo(`已应用 ${before.length} 条 AI 建议`);
  },

  async ignoreAllAi() {
    Object.values(this.aiRecommendations).forEach((r) => { if (r.status === 'pending') r.status = 'ignored'; });
    await StorageAdapter.set(AI_KEY, this.aiRecommendations);
    this.closeModal('#aiModal');
    this.render();
    this.showToast('已忽略当前 AI 建议');
  },

  async clearAiRecommendations() {
    if (!confirm('确认清除所有 AI 推荐记录？')) return;
    this.aiRecommendations = {};
    await StorageAdapter.set(AI_KEY, {});
    this.render();
    this.showToast('已清除 AI 推荐记录');
  },

  exportBackup() {
    const data = {
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      type: 'plugin-settings',
      settings: this.settings,
      aiRecommendations: this.aiRecommendations,
      thumbnailCacheCount: Object.keys(this.thumbnailCache || {}).length,
      bookmarksCount: this.bookmarks.length
    };
    this.downloadTextFile(`bookmark-poster-wall-settings-${timestampForFile()}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
    this.showToast('已导出插件设置');
  },

  async exportAllBookmarks(format = 'html', options = {}) {
    const tree = await this.adapter.getTree();
    const flat = BookmarkUtils.flattenTree(tree);
    const stamp = timestampForFile();
    if (format === 'json') {
      const data = {
        exportedAt: new Date().toISOString(),
        appVersion: APP_VERSION,
        type: 'all-browser-bookmarks',
        restoreHint: '这是完整 JSON 备份，适合开发者审查；如需导回浏览器，优先使用同次导出的 HTML 文件。',
        bookmarksCount: flat.bookmarks.length,
        foldersCount: flat.folders.length,
        tree
      };
      this.downloadTextFile(`browser-bookmarks-backup-${stamp}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
      await this.markBookmarkBackup('json');
      if (!options.silent) this.showToast(`已导出全部书签 JSON 备份（${flat.bookmarks.length} 个书签）`);
      return;
    }
    const html = this.buildBookmarksHtml(tree);
    this.downloadTextFile(`browser-bookmarks-backup-${stamp}.html`, html, 'text/html;charset=utf-8');
    await this.markBookmarkBackup('html');
    if (!options.silent) this.showToast(`已导出可导回浏览器的 HTML 书签备份（${flat.bookmarks.length} 个书签）`);
  },

  buildBookmarksHtml(tree) {
    const created = Math.floor(Date.now() / 1000);
    const lines = [
      '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
      '<!-- This is an automatically generated file. It will be read and overwritten. DO NOT EDIT! -->',
      '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
      '<TITLE>Bookmarks</TITLE>',
      '<H1>Bookmarks</H1>',
      '<DL><p>'
    ];
    const walk = (nodes, depth = 1) => {
      const pad = '    '.repeat(depth);
      for (const node of nodes || []) {
        if (node.url) {
          const addDate = Math.floor((node.dateAdded || Date.now()) / 1000);
          lines.push(`${pad}<DT><A HREF="${escapeAttr(node.url)}" ADD_DATE="${addDate}">${escapeHtml(node.title || node.url)}</A>`);
        } else {
          const title = node.title || '未命名文件夹';
          const addDate = Math.floor((node.dateAdded || Date.now()) / 1000);
          lines.push(`${pad}<DT><H3 ADD_DATE="${addDate}" LAST_MODIFIED="${created}">${escapeHtml(title)}</H3>`);
          lines.push(`${pad}<DL><p>`);
          walk(node.children || [], depth + 1);
          lines.push(`${pad}</DL><p>`);
        }
      }
    };
    const rootChildren = tree?.[0]?.children || tree || [];
    walk(rootChildren, 1);
    lines.push('</DL><p>');
    return lines.join('\n');
  },

  downloadTextFile(filename, content, type = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  async markBookmarkBackup(format) {
    this.settings.safety = this.settings.safety || {};
    this.settings.safety.lastBookmarkExportAt = Date.now();
    this.settings.safety.lastBookmarkExportFormat = format;
    this.settings.onboarding = this.settings.onboarding || {};
    this.settings.onboarding.bookmarkBackupDone = true;
    await this.saveSettings();
    this.renderOnboardingBackupStatus();
    if ($('#lastBookmarkBackupText')) $('#lastBookmarkBackupText').textContent = this.getLastBackupText();
    if ($('#thumbnailBackupText')) $('#thumbnailBackupText').textContent = this.getLastBackupText();
  },

  renderOnboardingBackupStatus() {
    const el = $('#onboardingBackupStatus');
    if (!el) return;
    const last = this.settings.safety?.lastBookmarkExportAt;
    if (last) {
      el.classList.add('ok');
      el.innerHTML = `${iconSvg('shield')} 已完成书签备份：${new Date(last).toLocaleString()}（${this.settings.safety?.lastBookmarkExportFormat || 'html'}）`;
    } else {
      el.classList.remove('ok');
      el.innerHTML = `${iconSvg('shield')} 建议先导出全部书签，确认有备份后再开始移动或删除。`;
    }
  },

  getLastBackupText() {
    const last = this.settings.safety?.lastBookmarkExportAt;
    return last ? `${new Date(last).toLocaleString()}（${this.settings.safety?.lastBookmarkExportFormat || 'html'}）` : '尚未导出';
  },

  async ensureSafetyBackupBeforeOrganize(actionName = '整理书签') {
    if (this.settings.safety?.requireBackupBeforeOrganize === false) return true;
    if (this.settings.safety?.lastBookmarkExportAt) return true;
    const ok = confirm(`在${actionName}前，建议先导出全部书签备份，防止误操作导致书签丢失。\n\n点击“确定”会先导出 HTML 备份，然后继续本次操作；点击“取消”将停止本次操作。`);
    if (!ok) return false;
    await this.exportAllBookmarks('html', { source: 'safety-before-action', silent: true });
    return true;
  },

  openModal(selector, options = {}) {
    const modal = $(selector);
    if (!modal) return;
    clearTimeout(this.modalCloseTimers[selector]);
    modal.classList.remove('closing');
    modal.classList.add('show');
    if (options.immediate) modal.offsetHeight;
  },

  closeModal(selector, options = {}) {
    const modal = $(selector);
    if (!modal || !modal.classList.contains('show')) return;
    clearTimeout(this.modalCloseTimers[selector]);
    if (options.immediate) {
      modal.classList.remove('show', 'closing');
      return;
    }
    modal.classList.add('closing');
    this.modalCloseTimers[selector] = setTimeout(() => {
      modal.classList.remove('show', 'closing');
    }, 180);
  },
  showFatalError(err) {
    const grid = $('#grid');
    if (grid) grid.innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><h3>书签加载失败</h3><p>${escapeHtml(err?.message || err || '未知错误')}</p><p>请在扩展详情页确认已授予 bookmarks 权限，然后点击右上角刷新。</p></div>`;
    this.showToast(`书签加载失败：${err?.message || err}`);
  },
  showToast(message) {
    $('#toast').textContent = message;
    $('#toast').classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3000);
  }
};

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) target[key] = deepMerge(target[key] || {}, value);
    else target[key] = value;
  }
  return target;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function escapeAttr(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function timestampForFile(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
function shorten(value, max = 32) { const s = String(value || ''); return s.length > max ? `${s.slice(0, max - 1)}…` : s; }
function faviconUrl(url) { const d = BookmarkUtils.getDomain(url); return d ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64` : ''; }
function siteFaviconUrl(url) {
  return faviconUrl(url);
}
function hashCode(value) { return Math.abs(String(value || '').split('').reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0)); }
function findNode(nodes, id) {
  for (const node of nodes) {
    if (String(node.id) === String(id)) return node;
    const found = node.children ? findNode(node.children, id) : null;
    if (found) return found;
  }
  return null;
}
function pathFromUrl(url) { try { return new URL(url).pathname; } catch (_) { return ''; } }
function parseJsonArray(content) {
  const cleaned = content.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  return JSON.parse(cleaned.slice(start, end + 1));
}


function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function clampConcurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 4;
  return Math.max(1, Math.min(MAX_SCREENSHOT_CONCURRENCY, Math.round(n)));
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function iconSvg(name, extraClass = '') {
  const cls = `ui-icon ${extraClass}`.trim();
  const paths = {
    grid: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
    bookmark: '<path d="M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5V21l-6-3.2L6 21V4.5z"/><path d="M9 6h6M9 9h5"/>',
    search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="M15 15l4 4"/>',
    star: '<path d="M12 3.8l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L12 3.8z"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    copy: '<rect x="8" y="8" width="10" height="10" rx="2"/><path d="M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"/>',
    sparkle: '<path d="M12 3l1.2 5.1L18 10l-4.8 1.9L12 17l-1.2-5.1L6 10l4.8-1.9L12 3z"/><path d="M5 15l.6 2.4L8 18l-2.4.6L5 21l-.6-2.4L2 18l2.4-.6L5 15z"/>',
    folder: '<path d="M3.5 6.5A2.5 2.5 0 0 1 6 4h4l2 2h6a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5v-10z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    gear: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/><path d="M19 12a7.3 7.3 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7.7 7.7 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.3 7.3 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.7 7.7 0 0 0 1.7 1l.3 3.1h5l.3-3.1a7.7 7.7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 0 1 4.6 1.1c0 1.7-2.4 2.1-2.4 3.9"/><path d="M12 17h.01"/>',
    image: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M5 17l5-5 3 3 2-2 4 4"/>',
    window: '<rect x="4" y="5" width="16" height="14" rx="2.4"/><path d="M4 9h16"/><path d="M8 7h.01M11 7h.01M14 7h.01"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.2 2.4 3.2 5.2 3.2 8.5s-1 6.1-3.2 8.5c-2.2-2.4-3.2-5.2-3.2-8.5S9.8 5.9 12 3.5z"/>',
    warning: '<path d="M12 4l9 16H3L12 4z"/><path d="M12 9v5"/><path d="M12 17h.01"/>',
    crop: '<path d="M6 3v12a3 3 0 0 0 3 3h12"/><path d="M3 6h12a3 3 0 0 1 3 3v12"/><path d="M9 9h6v6H9z"/>',
    document: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/><path d="M9 12h6M9 16h6"/>',
    download: '<path d="M12 3v11"/><path d="M7 10l5 5 5-5"/><path d="M5 19h14"/>',
    database: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 10v6"/><path d="M12 7h.01"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/>',
    refresh: '<path d="M20 12a8 8 0 0 1-14.7 4.4"/><path d="M4 12A8 8 0 0 1 18.7 7.6"/><path d="M18 4v4h-4M6 20v-4h4"/>',
    move: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/><path d="M4 5h6M4 19h6"/>',
    edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M14 7l3 3"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    minimize: '<path d="M6 12h12"/>',
    expand: '<path d="M8 3H3v5"/><path d="M16 3h5v5"/><path d="M8 21H3v-5"/><path d="M16 21h5v-5"/><path d="M3 3l7 7"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/><path d="M21 21l-7-7"/>',
    shield: '<path d="M12 3l7 3v5c0 4.6-3 8.7-7 10-4-1.3-7-5.4-7-10V6l7-3z"/><path d="M9 12l2 2 4-5"/>',
    eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="3"/>',
    rocket: '<path d="M12 3c3.5 1 6 3.5 7 7l-4 4-5-5 2-6z"/><path d="M8 13l-3 3 3 1 1 3 3-3"/><circle cx="14" cy="8" r="1.5"/>',
  };
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.grid}</svg>`;
}

function installStaticIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (!el.dataset.iconInstalled) {
      el.innerHTML = iconSvg(el.dataset.icon);
      el.dataset.iconInstalled = '1';
    }
  });
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function originPattern(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return '';
    return `${u.origin}/*`;
  } catch (_) { return ''; }
}
function downscaleImage(dataUrl, maxWidth = 900, maxHeight = 560, quality = 0.76) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function posterizeScreenshot(dataUrl, options = {}) {
  const outW = Number(options.width || 640);
  const outH = Number(options.height || 360);
  const quality = Math.max(0.45, Math.min(0.92, Number(options.quality || 0.82)));
  const cropMode = options.cropMode || 'smart';
  const whitePageEnhance = options.whitePageEnhance !== false;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const crop = computePosterCrop(img, outW / outH, cropMode);
        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const stats = sampleImageStats(img, crop);
        if (whitePageEnhance && stats.whiteRatio > 0.62) {
          drawCover(ctx, img, crop, 0, 0, outW, outH);
          ctx.save();
          ctx.filter = 'blur(18px) saturate(1.18) brightness(0.94)';
          ctx.globalAlpha = 0.64;
          drawCover(ctx, img, crop, -34, -24, outW + 68, outH + 48);
          ctx.restore();
          ctx.fillStyle = 'rgba(248,250,252,.50)';
          ctx.fillRect(0, 0, outW, outH);
          const pad = 28;
          const innerW = outW - pad * 2;
          const innerH = outH - pad * 2;
          roundRect(ctx, pad, pad, innerW, innerH, 20);
          ctx.save();
          ctx.clip();
          ctx.fillStyle = '#fff';
          ctx.fillRect(pad, pad, innerW, innerH);
          drawContain(ctx, img, crop, pad, pad, innerW, innerH);
          ctx.restore();
          ctx.strokeStyle = 'rgba(226,232,240,.95)';
          ctx.lineWidth = 2;
          roundRect(ctx, pad, pad, innerW, innerH, 20);
          ctx.stroke();
        } else {
          drawCover(ctx, img, crop, 0, 0, outW, outH);
          ctx.fillStyle = 'rgba(15,23,42,.06)';
          ctx.fillRect(0, outH * .82, outW, outH * .18);
        }
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (err) {
        console.warn('posterize failed', err);
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function computePosterCrop(img, targetAspect, cropMode = 'smart') {
  const w = img.width;
  const h = img.height;
  let box = { x: 0, y: 0, w, h };
  if (cropMode === 'smart') {
    const detected = detectContentBox(img);
    // For webpage screenshots, many pages have a very white background with only
    // thin horizontal text / navigation lines.  The old smart-crop treated those
    // lines as the content box, producing ultra-thin strip posters.  Only trust
    // the detected content box when it is substantial enough to represent a real
    // visual region; otherwise use the top viewport crop.
    const canUseDetected = detected
      && detected.w >= w * 0.42
      && detected.h >= h * 0.42
      && (detected.w / Math.max(1, detected.h)) < 4.8;
    if (canUseDetected) {
      box = detected;
      const expandX = box.w * 0.08;
      const expandY = box.h * 0.10;
      box = {
        x: Math.max(0, box.x - expandX),
        y: Math.max(0, box.y - expandY),
        w: Math.min(w, box.w + expandX * 2),
        h: Math.min(h, box.h + expandY * 2)
      };
    } else {
      box = { x: 0, y: 0, w, h: Math.min(h, Math.round(w / targetAspect)) };
    }
  } else if (cropMode === 'top') {
    box = { x: 0, y: 0, w, h: Math.min(h, Math.round(w / targetAspect)) };
  } else {
    box = { x: 0, y: Math.max(0, Math.round((h - w / targetAspect) * .28)), w, h: Math.min(h, Math.round(w / targetAspect)) };
  }
  return fitAspectInside(box, w, h, targetAspect);
}

function detectContentBox(img) {
  const max = 420;
  const scale = Math.min(max / img.width, max / img.height, 1);
  const sw = Math.max(1, Math.round(img.width * scale));
  const sh = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, sw, sh);
  const data = ctx.getImageData(0, 0, sw, sh).data;
  let minX = sw, minY = sh, maxX = 0, maxY = 0, count = 0;
  for (let y = 0; y < sh; y += 2) {
    for (let x = 0; x < sw; x += 2) {
      const i = (y * sw + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      const white = r > 244 && g > 244 && b > 244;
      const nearBg = Math.max(r, g, b) - Math.min(r, g, b) < 6 && r > 236;
      if (a > 20 && !white && !nearBg) {
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); count += 1;
      }
    }
  }
  if (count < 80 || minX >= maxX || minY >= maxY) return null;
  return { x: minX / scale, y: minY / scale, w: (maxX - minX) / scale, h: (maxY - minY) / scale };
}

function fitAspectInside(box, imgW, imgH, aspect) {
  let { x, y, w, h } = box;
  const current = w / h;
  if (current > aspect) {
    const newW = h * aspect;
    x += (w - newW) / 2;
    w = newW;
  } else {
    const newH = w / aspect;
    y += (h - newH) * 0.30;
    h = newH;
  }
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + w > imgW) x = imgW - w;
  if (y + h > imgH) y = imgH - h;
  // Safety net: never return an extremely thin crop.  If the computed crop is
  // too short, use a normal top 16:9 viewport crop instead.
  if (h < imgH * 0.30 || w / Math.max(1, h) > aspect * 3) {
    return { x: 0, y: 0, w: imgW, h: Math.min(imgH, Math.round(imgW / aspect)) };
  }
  return { x: Math.max(0, x), y: Math.max(0, y), w: Math.min(imgW, w), h: Math.min(imgH, h) };
}

function sampleImageStats(img, crop) {
  const sw = 120;
  const sh = 68;
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, sw, sh);
  const data = ctx.getImageData(0, 0, sw, sh).data;
  let white = 0;
  const total = sw * sh;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 242 && data[i + 1] > 242 && data[i + 2] > 242) white += 1;
  }
  return { whiteRatio: white / total };
}

function drawCover(ctx, img, crop, x, y, w, h) {
  const srcAspect = crop.w / crop.h;
  const dstAspect = w / h;
  let sx = crop.x, sy = crop.y, sw = crop.w, sh = crop.h;
  if (srcAspect > dstAspect) {
    sw = crop.h * dstAspect;
    sx = crop.x + (crop.w - sw) / 2;
  } else {
    sh = crop.w / dstAspect;
    sy = crop.y + (crop.h - sh) * 0.28;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawContain(ctx, img, crop, x, y, w, h) {
  const scale = Math.min(w / crop.w, h / crop.h);
  const dw = crop.w * scale;
  const dh = crop.h * scale;
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function inspectPosterImageQuality(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl) {
      resolve({ stripLike: true, whiteRatio: 1, nonBgRatio: 0, contentHeightRatio: 0 });
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const sw = 160;
        const sh = 90;
        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, sw, sh);
        const data = ctx.getImageData(0, 0, sw, sh).data;
        let white = 0;
        let nonBg = 0;
        let colored = 0;
        let dark = 0;
        let minY = sh;
        let maxY = 0;
        const total = sw * sh;
        for (let y = 0; y < sh; y += 1) {
          for (let x = 0; x < sw; x += 1) {
            const i = (y * sw + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            if (a < 12) continue;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const isWhite = r > 244 && g > 244 && b > 244;
            const isNearBg = max - min < 8 && r > 232 && g > 232 && b > 232;
            if (isWhite) white += 1;
            if (!isWhite && !isNearBg) {
              nonBg += 1;
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
            }
            if (max - min > 32 && max > 80) colored += 1;
            if (r < 70 && g < 70 && b < 70) dark += 1;
          }
        }
        const whiteRatio = white / total;
        const nonBgRatio = nonBg / total;
        const coloredRatio = colored / total;
        const darkRatio = dark / total;
        const contentHeightRatio = nonBg ? (maxY - minY + 1) / sh : 0;
        // Bad captures are typically almost all white/gray and contain only a few
        // horizontal hairlines.  Reject those so the UI falls back to a designed card
        // instead of saving a strip-like screenshot.
        const stripLike =
          nonBgRatio < 0.022 ||
          (whiteRatio > 0.86 && nonBgRatio < 0.075 && coloredRatio < 0.020 && darkRatio < 0.035) ||
          (contentHeightRatio < 0.18 && nonBgRatio < 0.12);
        resolve({ stripLike, whiteRatio, nonBgRatio, coloredRatio, darkRatio, contentHeightRatio });
      } catch (err) {
        console.warn('poster quality inspect failed', err);
        resolve({ stripLike: false, whiteRatio: 0, nonBgRatio: 1, contentHeightRatio: 1 });
      }
    };
    img.onerror = () => resolve({ stripLike: true, whiteRatio: 1, nonBgRatio: 0, contentHeightRatio: 0 });
    img.src = dataUrl;
  });
}

function createDesignedFallbackPoster(bookmark, options = {}) {
  const outW = Number(options.width || 640);
  const outH = Number(options.height || 360);
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  const domain = normalizeDisplayDomain(bookmark?.domain || BookmarkUtils.getDomain(bookmark?.url || '') || 'website');
  const title = normalizePosterTitle(bookmark?.title || domain || '未命名书签', domain);
  const folder = shorten(bookmark?.folderPath || '未分类', 18);
  const theme = fallbackPosterTheme(domain, title);
  const scale = outW / 640;

  // v5 local fallback poster: designed as a true 16:9 cover area, not a full
  // card screenshot.  The real HTML card already supplies the body, checkbox,
  // menu and tags, so the generated image should be a polished cover only.
  // This avoids duplicate UI chrome and eliminates the old strip-like fallback.
  drawFallbackBackground(ctx, outW, outH, theme, scale);
  drawFallbackDecor(ctx, outW, outH, theme, scale);
  drawFallbackBrowserShell(ctx, outW, outH, domain, theme, scale);
  drawFallbackHero(ctx, outW, outH, domain, title, folder, theme, scale);
  drawFallbackStatusBand(ctx, outW, outH, domain, theme, scale);

  return canvas.toDataURL('image/jpeg', Math.max(0.80, Math.min(0.94, Number(options.quality || 0.88))));
}

function normalizeDisplayDomain(domain) {
  return String(domain || 'website')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
    .trim() || 'website';
}

function normalizePosterTitle(title, domain) {
  const cleaned = String(title || '')
    .replace(/\s+/g, ' ')
    .replace(/[｜|·•-]+\s*$/, '')
    .trim();
  return cleaned || domain || '未命名书签';
}

function fallbackPosterTheme(domain, title) {
  const seed = hashCode(`${domain}|${title}`);
  const palette = [
    { bg0: '#10243f', bg1: '#17395f', bg2: '#245edb', accent: '#6ca3ff', accent2: '#cfe0ff', chip: '#eaf2ff', text: '#f8fafc' },
    { bg0: '#20243a', bg1: '#323858', bg2: '#6b4fd8', accent: '#a493ff', accent2: '#ddd6ff', chip: '#f2edff', text: '#f8fafc' },
    { bg0: '#113b38', bg1: '#1d5852', bg2: '#148d74', accent: '#7ad8c9', accent2: '#cef6ee', chip: '#e7fff5', text: '#f8fafc' },
    { bg0: '#253044', bg1: '#38465f', bg2: '#5d6f89', accent: '#cbd5e1', accent2: '#e2e8f0', chip: '#f1f5f9', text: '#f8fafc' },
    { bg0: '#f7f9fc', bg1: '#e8eef7', bg2: '#cfdced', accent: '#245edb', accent2: '#172033', chip: '#ffffff', text: '#0f172a', light: true },
    { bg0: '#f6f8f5', bg1: '#e8eee6', bg2: '#cad8cd', accent: '#287b5f', accent2: '#14231d', chip: '#ffffff', text: '#14231d', light: true }
  ];
  return { ...palette[seed % palette.length], seed };
}

function drawFallbackBackground(ctx, outW, outH, theme, scale) {
  ctx.fillStyle = theme.bg0;
  ctx.fillRect(0, 0, outW, outH);
  ctx.save();
  ctx.globalAlpha = theme.light ? 0.78 : 0.55;
  ctx.fillStyle = theme.bg1;
  ctx.fillRect(outW * 0.62, 0, outW * 0.38, outH);
  ctx.fillStyle = theme.bg2;
  ctx.fillRect(0, outH * 0.76, outW, outH * 0.24);
  ctx.restore();
}

function drawFallbackDecor(ctx, outW, outH, theme, scale) {
  ctx.save();
  ctx.globalAlpha = theme.light ? 0.24 : 0.18;
  ctx.fillStyle = theme.accent;
  for (let i = 0; i < 5; i += 1) {
    const x = outW * (0.08 + i * 0.19);
    roundRect(ctx, x, 26 * scale, 46 * scale, 8 * scale, 4 * scale);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = theme.light ? 0.18 : 0.14;
  ctx.strokeStyle = theme.light ? '#2563eb' : '#ffffff';
  ctx.lineWidth = 1.6 * scale;
  for (let i = -3; i < 10; i += 1) {
    ctx.beginPath();
    ctx.moveTo(outW * (0.44 + i * 0.08), -8 * scale);
    ctx.bezierCurveTo(outW * (0.60 + i * 0.07), outH * 0.20, outW * (0.40 + i * 0.08), outH * 0.50, outW * (0.65 + i * 0.08), outH + 10 * scale);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFallbackBrowserShell(ctx, outW, outH, domain, theme, scale) {
  const x = 34 * scale;
  const y = 28 * scale;
  const w = outW - 68 * scale;
  const h = outH - 62 * scale;

  // Main glass browser-like card.
  ctx.save();
  ctx.shadowColor = theme.light ? 'rgba(37,99,235,.16)' : 'rgba(0,0,0,.26)';
  ctx.shadowBlur = 22 * scale;
  ctx.shadowOffsetY = 12 * scale;
  ctx.fillStyle = theme.light ? 'rgba(255,255,255,.64)' : 'rgba(255,255,255,.10)';
  roundRect(ctx, x, y, w, h, 24 * scale);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = theme.light ? 'rgba(37,99,235,.18)' : 'rgba(255,255,255,.18)';
  ctx.lineWidth = 1.2 * scale;
  roundRect(ctx, x, y, w, h, 24 * scale);
  ctx.stroke();
  ctx.restore();

  // Top URL bar.
  const topH = 42 * scale;
  ctx.save();
  ctx.fillStyle = theme.light ? 'rgba(255,255,255,.70)' : 'rgba(255,255,255,.12)';
  roundRect(ctx, x + 14 * scale, y + 12 * scale, w - 28 * scale, topH, 16 * scale);
  ctx.fill();
  ctx.fillStyle = theme.light ? '#94a3b8' : 'rgba(255,255,255,.62)';
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(x + (34 + i * 15) * scale, y + 33 * scale, 4.2 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.font = `700 ${Math.round(12 * scale)}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.light ? '#64748b' : 'rgba(255,255,255,.72)';
  ctx.fillText(shorten(domain, 46), outW / 2, y + 33 * scale);
  ctx.restore();
}

function drawFallbackHero(ctx, outW, outH, domain, title, folder, theme, scale) {
  const centerX = outW / 2;
  const initials = posterInitials(domain, title);
  const badgeSize = 72 * scale;
  const badgeX = centerX - badgeSize / 2;
  const badgeY = 106 * scale;

  ctx.save();
  ctx.shadowColor = theme.light ? 'rgba(37,99,235,.20)' : 'rgba(0,0,0,.30)';
  ctx.shadowBlur = 18 * scale;
  ctx.shadowOffsetY = 8 * scale;
  ctx.fillStyle = theme.light ? '#ffffff' : 'rgba(255,255,255,.88)';
  roundRect(ctx, badgeX, badgeY, badgeSize, badgeSize, 22 * scale);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = theme.accent;
  roundRect(ctx, badgeX + 14 * scale, badgeY + 14 * scale, badgeSize - 28 * scale, badgeSize - 28 * scale, 15 * scale);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${Math.round(24 * scale)}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, centerX, badgeY + badgeSize / 2 + 1 * scale);

  ctx.fillStyle = theme.text;
  ctx.font = `900 ${Math.round(27 * scale)}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = theme.light ? 'rgba(255,255,255,.50)' : 'rgba(0,0,0,.20)';
  ctx.shadowBlur = 8 * scale;
  wrapCanvasTextCentered(ctx, title, centerX, 218 * scale, outW - 120 * scale, 31 * scale, 2);
  ctx.shadowBlur = 0;

  // Small folder/domain chips make the cover look intentional, not like a placeholder.
  drawFallbackChip(ctx, centerX - 100 * scale, 282 * scale, `${shorten(domain, 22)}`, theme, scale, 0);
  drawFallbackChip(ctx, centerX + 4 * scale, 282 * scale, `${folder}`, theme, scale, 1);
}

function drawFallbackChip(ctx, x, y, text, theme, scale, variant = 0) {
  const chipText = shorten(text, 18);
  ctx.save();
  ctx.font = `800 ${Math.round(12 * scale)}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
  const w = Math.min(118 * scale, Math.max(66 * scale, ctx.measureText(chipText).width + 24 * scale));
  const h = 28 * scale;
  ctx.fillStyle = theme.light ? 'rgba(255,255,255,.70)' : 'rgba(255,255,255,.14)';
  roundRect(ctx, x, y, w, h, 10 * scale);
  ctx.fill();
  ctx.strokeStyle = theme.light ? 'rgba(37,99,235,.14)' : 'rgba(255,255,255,.16)';
  ctx.lineWidth = 1 * scale;
  roundRect(ctx, x, y, w, h, 10 * scale);
  ctx.stroke();
  ctx.fillStyle = theme.light ? (variant ? '#2563eb' : '#475569') : 'rgba(255,255,255,.82)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(chipText, x + 12 * scale, y + h / 2 + 0.5 * scale);
  ctx.restore();
}

function drawFallbackStatusBand(ctx, outW, outH, domain, theme, scale) {
  const bandH = 46 * scale;
  const bandY = outH - bandH - 18 * scale;
  const bandX = 52 * scale;
  const bandW = outW - 104 * scale;
  ctx.save();
  ctx.fillStyle = theme.light ? 'rgba(255,255,255,.70)' : 'rgba(255,255,255,.12)';
  roundRect(ctx, bandX, bandY, bandW, bandH, 16 * scale);
  ctx.fill();
  ctx.strokeStyle = theme.light ? 'rgba(37,99,235,.14)' : 'rgba(255,255,255,.14)';
  ctx.lineWidth = 1 * scale;
  roundRect(ctx, bandX, bandY, bandW, bandH, 16 * scale);
  ctx.stroke();

  ctx.fillStyle = theme.light ? '#334155' : 'rgba(255,255,255,.82)';
  ctx.font = `800 ${Math.round(13 * scale)}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(shorten(domain, 30), bandX + 18 * scale, bandY + bandH / 2);

  const pill = '本地封面';
  ctx.font = `900 ${Math.round(12 * scale)}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
  const pillW = 84 * scale;
  ctx.fillStyle = theme.light ? '#eaf2ff' : 'rgba(255,255,255,.18)';
  roundRect(ctx, bandX + bandW - pillW - 12 * scale, bandY + 10 * scale, pillW, 26 * scale, 10 * scale);
  ctx.fill();
  ctx.fillStyle = theme.light ? '#1f6bff' : '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(pill, bandX + bandW - pillW / 2 - 12 * scale, bandY + bandH / 2 + 0.5 * scale);
  ctx.restore();
}

function posterInitials(domain, title) {
  const base = (domain || title || 'W').replace(/\.[a-z]{2,}$/i, '').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, ' ').trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  const text = parts[0] || title || 'W';
  return String(text).slice(0, /[\u4e00-\u9fa5]/.test(text) ? 2 : 2).toUpperCase();
}

function wrapCanvasTextCentered(ctx, text, centerX, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const chars = String(text || '').split('');
  const useWords = words.length > 1;
  const tokens = useWords ? words : chars;
  let line = '';
  let lines = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const testLine = useWords ? `${line}${line ? ' ' : ''}${token}` : `${line}${token}`;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = token;
      if (lines.length >= maxLines) break;
    } else {
      line = testLine;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length > maxLines) lines = lines.slice(0, maxLines);
  if (lines.length === maxLines) lines[lines.length - 1] = shorten(lines[lines.length - 1], Math.max(6, lines[lines.length - 1].length));
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, idx) => ctx.fillText(l, centerX, startY + idx * lineHeight));
}

function localCoverTheme(domain, title) {
  const seed = hashCode(`${domain}|${title}`);
  const palette = [
    { bg0: '#f7f9fc', bg1: '#dfe8f6', bg2: '#c8d6ea', accent: '#245edb', soft: 'rgba(36,94,219,.12)', text: '#172033' },
    { bg0: '#f8f7fb', bg1: '#e7e3f4', bg2: '#d4cceb', accent: '#6b4fd8', soft: 'rgba(107,79,216,.12)', text: '#191827' },
    { bg0: '#f4faf8', bg1: '#dceee9', bg2: '#c2ded5', accent: '#287b5f', soft: 'rgba(40,123,95,.12)', text: '#14231d' },
    { bg0: '#f9f8f4', bg1: '#ebe6d7', bg2: '#d9d1bd', accent: '#8a623c', soft: 'rgba(138,98,60,.12)', text: '#221b14' },
    { bg0: '#f7f8fa', bg1: '#e4e9ef', bg2: '#cfd7e2', accent: '#4f657f', soft: 'rgba(79,101,127,.12)', text: '#172033' }
  ];
  return palette[Math.abs(seed) % palette.length];
}

function bundledPreviewForBookmark(bookmark) {
  const domain = BookmarkUtils.getDomain(bookmark?.url || '');
  const title = String(bookmark?.title || '').toLowerCase();
  const map = [
    { keys: ['github.com'], file: 'github.png' },
    { keys: ['developer.mozilla.org', 'mdn'], file: 'mdn.png' },
    { keys: ['react.dev', 'react'], file: 'react.png' },
    { keys: ['typescriptlang.org', 'typescript'], file: 'typescript.png' },
    { keys: ['cn.vitejs.dev', 'vitejs.dev', 'vite'], file: 'vite.png' },
    { keys: ['cn.vuejs.org', 'vuejs.org', 'vue'], file: 'vue.png' }
  ];
  const hit = map.find((item) => item.keys.some((key) => domain.includes(key) || title.includes(key)));
  return hit ? `assets/onboarding/${hit.file}` : '';
}

function domainInitials(text) {
  const clean = String(text || 'W')
    .replace(/^www\./i, '')
    .replace(/\.[a-z]{2,}$/i, '')
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, ' ')
    .trim();
  if (!clean) return 'W';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return clean.slice(0, /[\u4e00-\u9fa5]/.test(clean) ? 2 : 2).toUpperCase();
}

function localBookmarkIconDataUri(text) {
  const initials = domainInitials(text);
  const theme = localCoverTheme(text, initials);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="${theme.accent}"/><rect x="8" y="8" width="48" height="48" rx="14" fill="${theme.bg0}" opacity=".24"/><circle cx="52" cy="12" r="8" fill="#ffffff" opacity=".28"/><text x="32" y="38" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="22" font-weight="900" fill="#fff">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init().catch((err) => { console.error(err); App.showFatalError?.(err); }));
