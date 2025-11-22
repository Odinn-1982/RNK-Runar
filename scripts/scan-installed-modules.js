#!/usr/bin/env node
// Usage: node scan-installed-modules.js <foundry-data-modules-folder>
// Example: node scan-installed-modules.js "C:\\FoundryVTT\\Data\\modules"

const fs = require('fs');
const path = require('path');

const modulesPath = process.argv[2] || '.';
const absModulesPath = path.resolve(process.cwd(), modulesPath);

function exitErr(msg) {
  console.error('Error:', msg);
  process.exit(2);
}

if (!fs.existsSync(absModulesPath)) exitErr(`Modules folder not found: ${absModulesPath}`);

const dirItems = fs.readdirSync(absModulesPath, { withFileTypes: true });

let mismatches = [];

dirItems.forEach(dirent => {
  if (!dirent.isDirectory()) return;
  const folderName = dirent.name;
  const folderPath = path.join(absModulesPath, folderName);
  const moduleJson = path.join(folderPath, 'module.json');
  if (!fs.existsSync(moduleJson)) return; // skip non-modules
  try {
    const moduleJSON = JSON.parse(fs.readFileSync(moduleJson, 'utf8'));
    const id = moduleJSON.id || '(no id)';
    if (id !== folderName) {
      mismatches.push({ folderName, id });
    }
  } catch (err) {
    console.error('Failed to parse module.json for', folderName, err.message);
  }
});

if (mismatches.length === 0) {
  console.log('No folder name <> module.id mismatches found in installed modules.');
} else {
  console.log('Folder name <> module.id mismatches:');
  mismatches.forEach(m => console.log(`- Folder: "${m.folderName}"  vs module.id: "${m.id}"`));
  console.log('\nTo fix: either rename the folder to match module.id or rename module.id to match the installed folder (not recommended).');
}
