const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const background = fs.readFileSync('background.js', 'utf8');
function assert(condition, message) { if (!condition) { console.error(`✗ ${message}`); process.exit(1); } console.log(`✓ ${message}`); }
assert(manifest.manifest_version === 3, 'uses Manifest V3');
assert(manifest.permissions.includes('bookmarks'), 'declares bookmarks permission');
assert(manifest.permissions.includes('debugger'), 'declares debugger permission for enhanced real webpage screenshots');
assert(manifest.permissions.includes('tabs'), 'declares tabs permission for screenshot tabs and manual recapture windows');
assert(manifest.permissions.includes('tabGroups'), 'declares tabGroups permission for the screenshot workspace group');
assert((manifest.host_permissions || []).includes('https://*/*'), 'declares https host permission for bookmark page loading');
assert(fs.existsSync('assets/icon.svg'), 'ships a maintainable extension icon SVG source');
assert(fs.existsSync(manifest.icons['16']), 'ships 16px extension icon');
assert(fs.existsSync(manifest.icons['32']), 'ships 32px extension icon');
assert(fs.existsSync(manifest.icons['128']), 'ships 128px extension icon');
assert(background.includes('chrome.tabs.query') && background.includes('chrome.tabs.update'), 'extension action reuses an existing BookmarkWall tab when possible');
assert(manifest.version === '0.7.10', 'manifest version is 0.7.10');
