const fs = require('fs');
const path = require('path');

const moduleJsonPath = path.resolve(__dirname, '..', 'module.json');
const moduleRoot = path.dirname(moduleJsonPath);

function fileExists(relativePath) {
  const abs = path.resolve(moduleRoot, relativePath);
  return fs.existsSync(abs);
}

const moduleJSON = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf8'));

const checkList = [];

['esmodules', 'styles', 'templates', 'languages'].forEach(key => {
  if (Array.isArray(moduleJSON[key])) {
        moduleJSON[key].forEach(item => {
          if (typeof item === 'string') checkList.push({type: key, path: item});
          else if (typeof item === 'object' && item !== null) {
            if (item.path) checkList.push({type: key, path: item.path});
            else if (item.url) checkList.push({type: key, path: item.url});
          }
        });
  }
});

['readme', 'changelog', 'license'].forEach(key => {
  if (moduleJSON[key]) {
    const val = moduleJSON[key];
    // Only check as file if it looks like a path (contains '.' or '/').
    if (typeof val === 'string' && (val.includes('/') || val.includes('.'))) checkList.push({type: key, path: val});
  }
});

if (Array.isArray(moduleJSON.packs)) {
  moduleJSON.packs.forEach(p => checkList.push({type: 'pack', path: p}));
}

if (moduleJSON.media) {
  moduleJSON.media.forEach(m => {
    if (m.url && m.url.startsWith('https://raw.githubusercontent.com')) {
      // remote ok
    } else if (m.url) {
      checkList.push({type: 'media', path: m.url});
    }
  });
}

console.log(`Verifying ${checkList.length} module paths listed in module.json...\n`);
let missing = 0;
checkList.forEach(entry => {
  if (!fileExists(entry.path)) {
    console.log(`Missing: [${entry.type}] ${entry.path}`);
    missing++;
  }
});

if (missing === 0) {
  console.log('\nAll module paths verified — no missing files found in module.json.');
} else {
  console.log(`\nFound ${missing} missing files in module.json. Please inspect above list.`);
}
