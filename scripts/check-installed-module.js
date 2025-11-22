#!/usr/bin/env node
// Usage: node check-installed-module.js <path-to-installed-module-folder>

const fs = require('fs');
const path = require('path');

const moduleFolder = process.argv[2] || '.';
const absModulePath = path.resolve(process.cwd(), moduleFolder);

function exitErr(msg) {
  console.error('Error:', msg);
  process.exit(2);
}

if (!fs.existsSync(absModulePath)) exitErr(`Module folder not found: ${absModulePath}`);

const moduleJsonPath = path.join(absModulePath, 'module.json');
if (!fs.existsSync(moduleJsonPath)) exitErr('module.json not found in module folder');

const moduleJSON = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf8'));

console.log(`Checking installed module: ${path.basename(absModulePath)} (id: ${moduleJSON.id || '(none)'})`);

const entriesToCheck = [];

if (Array.isArray(moduleJSON.esmodules)) entriesToCheck.push(...moduleJSON.esmodules);
if (Array.isArray(moduleJSON.styles)) entriesToCheck.push(...moduleJSON.styles);
if (Array.isArray(moduleJSON.templates)) entriesToCheck.push(...moduleJSON.templates);
if (Array.isArray(moduleJSON.packs)) entriesToCheck.push(...moduleJSON.packs);
if (Array.isArray(moduleJSON.languages)) moduleJSON.languages.forEach(l => { if (l.path) entriesToCheck.push(l.path); });

['readme', 'changelog'].forEach(k => { if (moduleJSON[k] && typeof moduleJSON[k] === 'string') entriesToCheck.push(moduleJSON[k]); });

// Also check a few common asset paths often referenced in code
['rnk-runar.css', 'global-theme.css', 'styles/sidebar-button.css', 'sounds/notify.wav', 'templates/gm-mod.hbs'].forEach(p => entriesToCheck.push(p));

let missing = [];
entriesToCheck.forEach(rel => {
  if (!rel) return;
  // If the entry is a URL, skip
  if (/^https?:\/\//i.test(rel)) return;
  // If entry is absolute, check as-is, otherwise relative to module folder
  const abs = path.resolve(absModulePath, rel);
  if (!fs.existsSync(abs)) {
    missing.push({ path: rel, tested: abs });
  }
});

if (missing.length === 0) {
  console.log('\nOK â€” No missing referenced files were found in the installed module folder.');
} else {
  console.error(`\nMissing references detected: ${missing.length}`);
  missing.forEach(m => console.error(`- ${m.path} (checked: ${m.tested})`));
  process.exit(1);
}

