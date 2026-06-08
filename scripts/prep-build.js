// Prepares vue-model-manager/public/available-models.json before Vite build.
// Uses the real data file if available, otherwise writes an empty stub.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'available-models.json');
const dest = path.join(__dirname, '..', 'vue-model-manager', 'public', 'available-models.json');

const stub = { creators: [], free_models: [], providers: [], rankings: [], families: [] };

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dest);
  console.log('Copied available-models.json to public/');
} else {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(stub));
  console.log('Wrote stub available-models.json to public/');
}
