const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
function assert(condition, message) { if (!condition) { console.error(`✗ ${message}`); process.exit(1); } console.log(`✓ ${message}`); }
assert(manifest.manifest_version === 3, 'uses Manifest V3');
assert(manifest.permissions.includes('bookmarks'), 'declares bookmarks permission');
assert(manifest.permissions.includes('debugger'), 'declares debugger permission for enhanced real webpage screenshots');
assert(manifest.permissions.includes('tabs'), 'declares tabs permission for fallback screenshot windows');
assert((manifest.host_permissions || []).includes('https://*/*'), 'declares https host permission for bookmark page loading');
assert(manifest.version === '0.7.10', 'manifest version is 0.7.10');
