const fs = require('fs');

// Fix SuperModel.vue
let c = fs.readFileSync('vue-model-manager/src/views/SuperModel.vue', 'utf8');
c = c.replace('const roleRankings = computed(() => {', '// roleRankings computed removed - unused');
c = c.replace(
  "if (!super_.value) return \[\];\n  const ROLES = \['model', 'build', 'general', 'small_model', 'explore', 'stable'\];\n  const result: { role: string; label: string; rank: number }\[\] = \[\];\n  for (const role of ROLES) {\n    const arr = store.roleRankings\[role\] ?? \[\];",
  'const _roleRankings = {}; // placeholder',
);
// Remove the rest of the roleRankings computed
c = c.replace(
  'let bestRank = Infinity;\n    for (const dp of super_.value.datapoints) {\n      const idx = arr.indexOf(dp.id)\n      if (idx !== -1 && idx + 1 < bestRank) bestRank = idx + 1\n    }\n    if (bestRank < Infinity) result.push({ role, label: role.slice(0, 3).toUpperCase(), rank: bestRank })\n  }\n  return result\n}, ?',
  'return _roleRankings;\n}',
);
fs.writeFileSync('vue-model-manager/src/views/SuperModel.vue', c);
console.log('Fixed SuperModel.vue');
