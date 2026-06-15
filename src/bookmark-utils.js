/* Bookmark Poster Wall shared utilities. Works in browser and Node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BookmarkUtils = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function safeUrl(url) {
    try { return new URL(url); } catch (_) { return null; }
  }

  function getDomain(url) {
    const u = safeUrl(url);
    if (!u) return '';
    return u.hostname.replace(/^www\./, '').toLowerCase();
  }

  function stripTrackingParams(url) {
    const u = safeUrl(url);
    if (!u) return url || '';
    const tracking = [
      'utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id',
      'fbclid','gclid','yclid','mc_cid','mc_eid','igshid','spm','from','share_source'
    ];
    tracking.forEach((key) => u.searchParams.delete(key));
    // Keep params sorted for stable comparison.
    const entries = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    u.search = '';
    entries.forEach(([k, v]) => u.searchParams.append(k, v));
    u.hash = '';
    let normalized = `${u.hostname.replace(/^www\./, '').toLowerCase()}${u.pathname.replace(/\/+$/, '') || '/'}`;
    const params = u.searchParams.toString();
    if (params) normalized += `?${params}`;
    return normalized;
  }

  function normalizeUrl(url) {
    if (!url) return '';
    return stripTrackingParams(url.trim());
  }

  function flattenTree(nodes, parentPath = []) {
    const folders = [];
    const bookmarks = [];
    const walk = (node, path, parentId = undefined, index = 0) => {
      const isFolder = !node.url;
      const title = node.title || '未命名';
      const effectiveParentId = node.parentId ?? parentId;
      const effectiveIndex = node.index ?? index;
      const currentPath = node.id === '0' ? [] : [...path, title];
      if (isFolder && node.id !== '0') {
        folders.push({
          id: String(node.id),
          parentId: effectiveParentId == null ? undefined : String(effectiveParentId),
          title,
          path: currentPath.join(' / '),
          children: node.children || [],
          dateAdded: node.dateAdded || 0,
          index: effectiveIndex
        });
      }
      if (!isFolder) {
        bookmarks.push({
          id: String(node.id),
          parentId: effectiveParentId == null ? undefined : String(effectiveParentId),
          title,
          url: node.url,
          domain: getDomain(node.url),
          folderPath: path.join(' / ') || '根目录',
          dateAdded: node.dateAdded || 0,
          index: effectiveIndex
        });
      }
      (node.children || []).forEach((child, childIndex) => walk(child, currentPath, node.id, childIndex));
    };
    (Array.isArray(nodes) ? nodes : [nodes]).forEach((n, i) => walk(n, parentPath, undefined, i));
    return { folders, bookmarks };
  }

  function countBookmarks(node) {
    if (!node) return 0;
    if (node.url) return 1;
    return (node.children || []).reduce((sum, child) => sum + countBookmarks(child), 0);
  }

  function folderCounts(nodes) {
    const map = {};
    const walk = (node) => {
      if (!node.url) {
        map[node.id] = countBookmarks(node);
        (node.children || []).forEach(walk);
      }
    };
    (Array.isArray(nodes) ? nodes : [nodes]).forEach(walk);
    return map;
  }

  function detectDuplicates(bookmarks) {
    const groups = new Map();
    bookmarks.forEach((b) => {
      if (!b.url) return;
      const key = normalizeUrl(b.url);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(b);
    });
    return [...groups.values()].filter((group) => group.length > 1);
  }

  function domainStats(bookmarks) {
    const map = new Map();
    bookmarks.forEach((b) => {
      const d = b.domain || getDomain(b.url);
      if (!d) return;
      map.set(d, (map.get(d) || 0) + 1);
    });
    return [...map.entries()].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count);
  }

  function findFolderByPath(folders, path) {
    if (!path) return null;
    const normalized = path.replace(/\\/g, '/').replace(/\s*\/\s*/g, ' / ').trim().toLowerCase();
    return folders.find((f) => (f.path || '').toLowerCase() === normalized)
      || folders.find((f) => (f.path || '').toLowerCase().endsWith(normalized))
      || folders.find((f) => (f.title || '').toLowerCase() === normalized.split('/').pop().trim());
  }

  function keywordCategory(bookmark, folders) {
    const text = `${bookmark.title || ''} ${bookmark.url || ''} ${bookmark.domain || ''}`.toLowerCase();
    const candidates = [
      { keys: ['github.com', 'gitlab', 'repo', 'repository', '开源'], names: ['开源项目', '开发', '工具'] },
      { keys: ['developer.mozilla', 'react', 'vue', 'vite', 'typescript', 'eslint', 'prettier', 'mdn', 'frontend', '前端'], names: ['前端', '开发'] },
      { keys: ['docker', 'linux', 'nginx', 'kubernetes', '运维'], names: ['运维', '开发'] },
      { keys: ['postgres', 'mysql', 'database', 'redis', '数据库'], names: ['数据库', '开发'] },
      { keys: ['arxiv', 'ieee', 'acm', 'paper', '论文'], names: ['论文', '学习资料'] },
      { keys: ['bilibili', 'youtube', 'video', '视频'], names: ['视频', '稍后阅读'] },
      { keys: ['figma', 'dribbble', 'behance', 'design', '设计'], names: ['设计', '设计灵感'] },
      { keys: ['tool', 'converter', 'generator', '工具'], names: ['工具', '工具链'] },
      { keys: ['read', 'article', 'blog', '知乎', '掘金', 'juejin', 'medium'], names: ['稍后阅读', '学习资料'] }
    ];
    for (const c of candidates) {
      if (c.keys.some((k) => text.includes(k))) {
        for (const name of c.names) {
          const folder = folders.find((f) => (f.title || '').includes(name) || (f.path || '').includes(name));
          if (folder) return { folder, reason: `根据标题、域名和关键词判断更接近「${folder.path || folder.title}」。` };
        }
      }
    }
    const fallback = folders.find((f) => /稍后|未分类|其他/.test(f.title || f.path)) || folders[0];
    return { folder: fallback, reason: fallback ? `未匹配到明确类型，建议先放入「${fallback.path || fallback.title}」。` : '暂无可推荐文件夹。' };
  }

  function localAiRecommendations(bookmarks, folders) {
    return bookmarks.map((b) => {
      const { folder, reason } = keywordCategory(b, folders);
      return {
        bookmarkId: b.id,
        suggestedFolderId: folder ? folder.id : '',
        suggestedFolder: folder ? (folder.path || folder.title) : '',
        suggestedTitle: cleanTitle(b.title, b.domain),
        confidence: folder ? Math.min(96, 72 + Math.floor(Math.random() * 23)) : 50,
        reason,
        status: 'pending'
      };
    });
  }

  function cleanTitle(title, domain) {
    let t = (title || '').replace(/\s+-\s+Google Search$/i, '').replace(/\s+\|\s+.*$/, '').trim();
    if (!t || /^home$|^index$|^untitled$/i.test(t)) t = domain ? `${domain} 书签` : '未命名书签';
    return t.length > 56 ? `${t.slice(0, 54)}…` : t;
  }



  function absoluteUrl(value, baseUrl) {
    if (!value) return '';
    const cleaned = String(value).trim().replace(/^['"]|['"]$/g, '');
    if (!cleaned || cleaned.startsWith('data:')) return cleaned;
    try { return new URL(cleaned, baseUrl).href; } catch (_) { return cleaned; }
  }

  function decodeHtmlEntities(value) {
    const s = String(value || '');
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, token) => {
      if (token[0] === '#') {
        const hex = token[1]?.toLowerCase() === 'x';
        const num = parseInt(token.slice(hex ? 2 : 1), hex ? 16 : 10);
        return Number.isFinite(num) ? String.fromCodePoint(num) : _;
      }
      return named[token] || _;
    });
  }

  function parseAttributes(tag) {
    const attrs = {};
    String(tag || '').replace(/([:\w-]+)\s*=\s*(["'])(.*?)\2/g, (_, key, _quote, value) => {
      attrs[key.toLowerCase()] = decodeHtmlEntities(value.trim());
      return '';
    });
    return attrs;
  }

  function extractPosterMeta(html, baseUrl) {
    const source = String(html || '').slice(0, 350000);
    const meta = { title: '', description: '', imageUrl: '', siteName: '', url: baseUrl || '' };
    const metas = [...source.matchAll(/<meta\b[^>]*>/gi)].map((m) => parseAttributes(m[0]));
    const links = [...source.matchAll(/<link\b[^>]*>/gi)].map((m) => parseAttributes(m[0]));
    const findMeta = (...names) => {
      const wanted = names.map((x) => x.toLowerCase());
      const found = metas.find((a) => wanted.includes((a.property || '').toLowerCase()) || wanted.includes((a.name || '').toLowerCase()));
      return found?.content || '';
    };
    const titleMatch = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    meta.title = findMeta('og:title', 'twitter:title') || (titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '');
    meta.description = findMeta('og:description', 'twitter:description', 'description');
    meta.siteName = findMeta('og:site_name', 'application-name');
    meta.imageUrl = absoluteUrl(findMeta('og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'), baseUrl);
    if (!meta.imageUrl) {
      const icon = links.find((a) => /icon|apple-touch-icon/i.test(a.rel || '') && a.href);
      meta.imageUrl = icon ? absoluteUrl(icon.href, baseUrl) : '';
    }
    meta.title = decodeHtmlEntities(meta.title).replace(/\s+/g, ' ').trim();
    meta.description = decodeHtmlEntities(meta.description).replace(/\s+/g, ' ').trim();
    meta.siteName = decodeHtmlEntities(meta.siteName).replace(/\s+/g, ' ').trim();
    return meta;
  }

  function chunk(array, size) {
    const out = [];
    for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
    return out;
  }

  return {
    safeUrl,
    getDomain,
    normalizeUrl,
    stripTrackingParams,
    flattenTree,
    countBookmarks,
    folderCounts,
    detectDuplicates,
    domainStats,
    findFolderByPath,
    localAiRecommendations,
    cleanTitle,
    absoluteUrl,
    decodeHtmlEntities,
    extractPosterMeta,
    chunk
  };
});
