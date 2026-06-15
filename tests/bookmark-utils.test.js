const assert = require('assert');
const utils = require('../src/bookmark-utils.js');

function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (err) { console.error(`✗ ${name}`); throw err; }
}

test('extracts normalized domain', () => {
  assert.strictEqual(utils.getDomain('https://www.github.com/user/repo'), 'github.com');
});

test('normalizes URL by removing tracking params and hash', () => {
  assert.strictEqual(
    utils.normalizeUrl('https://www.example.com/a/?utm_source=x&b=2#section'),
    'example.com/a?b=2'
  );
});

test('detects duplicate URLs after normalization', () => {
  const dups = utils.detectDuplicates([
    { id: '1', url: 'https://github.com/?utm_source=a' },
    { id: '2', url: 'http://www.github.com/' },
    { id: '3', url: 'https://example.com/' }
  ]);
  assert.strictEqual(dups.length, 1);
  assert.strictEqual(dups[0].length, 2);
});

test('flattens bookmark tree into folders and bookmarks with parentId/index', () => {
  const tree = [{ id: '0', title: '', children: [{ id: '1', title: '书签栏', children: [{ id: '2', title: 'GitHub', url: 'https://github.com' }] }] }];
  const flat = utils.flattenTree(tree);
  assert.strictEqual(flat.folders.length, 1);
  assert.strictEqual(flat.folders[0].parentId, '0');
  assert.strictEqual(flat.bookmarks.length, 1);
  assert.strictEqual(flat.bookmarks[0].parentId, '1');
  assert.strictEqual(flat.bookmarks[0].index, 0);
  assert.strictEqual(flat.bookmarks[0].folderPath, '书签栏');
});

test('counts bookmarks under nested folders', () => {
  const tree = [{ id: '0', title: '', children: [{ id: '1', title: 'A', children: [{ id: '2', title: 'B', children: [{ id: '3', title: 'x', url: 'https://x.com' }] }] }] }];
  const counts = utils.folderCounts(tree);
  assert.strictEqual(counts['0'], 1);
  assert.strictEqual(counts['1'], 1);
  assert.strictEqual(counts['2'], 1);
});

test('computes domain statistics sorted by count', () => {
  const stats = utils.domainStats([
    { url: 'https://github.com/a', domain: 'github.com' },
    { url: 'https://github.com/b', domain: 'github.com' },
    { url: 'https://react.dev', domain: 'react.dev' }
  ]);
  assert.deepStrictEqual(stats[0], { domain: 'github.com', count: 2 });
});

test('finds folder by exact, suffix, or title', () => {
  const folders = [{ id: 'f1', title: '前端', path: '开发 / 前端' }];
  assert.strictEqual(utils.findFolderByPath(folders, '开发 / 前端').id, 'f1');
  assert.strictEqual(utils.findFolderByPath(folders, '前端').id, 'f1');
});

test('creates local AI recommendations against existing folders', () => {
  const recs = utils.localAiRecommendations(
    [{ id: 'b1', title: 'React 官方文档', url: 'https://react.dev', domain: 'react.dev' }],
    [{ id: 'f1', title: '前端', path: '开发 / 前端' }]
  );
  assert.strictEqual(recs.length, 1);
  assert.strictEqual(recs[0].suggestedFolderId, 'f1');
  assert.ok(recs[0].confidence >= 70);
});



test('extracts poster metadata from og tags and resolves relative URLs', () => {
  const html = `<html><head>
    <title>Fallback Title</title>
    <meta property="og:title" content="Vue.js 官方文档">
    <meta name="description" content="渐进式 JavaScript 框架">
    <meta property="og:image" content="/images/social.png">
  </head></html>`;
  const meta = utils.extractPosterMeta(html, 'https://cn.vuejs.org/guide/');
  assert.strictEqual(meta.title, 'Vue.js 官方文档');
  assert.strictEqual(meta.description, '渐进式 JavaScript 框架');
  assert.strictEqual(meta.imageUrl, 'https://cn.vuejs.org/images/social.png');
});

test('chunks arrays for batch AI preprocessing', () => {
  assert.deepStrictEqual(utils.chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

console.log('All utility tests passed.');
