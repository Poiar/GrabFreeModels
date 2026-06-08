// Prepares vue-model-manager/public/available-models*.json before Vite build.
// Uses the real data file if available, otherwise writes an empty stub.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dest = path.join(root, 'vue-model-manager', 'public');

const files = ['available-models.json', 'available-models-paid.json'];
const stub = { creators: [], free_models: [], providers: [], rankings: [], families: [] };

fs.mkdirSync(dest, { recursive: true });

for (const f of files) {
  const src = path.join(root, f);
  const dst = path.join(dest, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`Copied ${f} to public/`);
  } else {
    fs.writeFileSync(dst, JSON.stringify(stub));
    console.log(`Wrote stub ${f} to public/`);
  }
}
