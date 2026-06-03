require('dotenv').config();
const {Pool} = require('pg');
const pool = new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
(async()=>{
  const {rows}=await pool.query(`SELECT dm.full_id FROM super_models sm JOIN datapoint_models dm ON dm.super_model_id=sm.id WHERE sm.author IS NULL GROUP BY sm.id,dm.full_id ORDER BY dm.full_id`);
  const byPrefix={};
  for(const r of rows){
    const parts = r.full_id.split('/').filter(Boolean);
    const key = parts.length >= 2 ? parts.slice(0, Math.min(3, parts.length)).join('/') : parts[0];
    byPrefix[key] = (byPrefix[key]||0)+1;
  }
  const sorted = Object.entries(byPrefix).sort((a,b)=>b[1]-a[1]);
  for(const [p,c] of sorted){
    console.log(String(c).padStart(3), p);
  }
  await pool.end();
})();
