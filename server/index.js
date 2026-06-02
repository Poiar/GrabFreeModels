const express = require('express');
const cors = require('cors');
const dataRouter = require('./routes/data');

const app = express();
const PORT = process.env.API_PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api', dataRouter);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`GFM API server listening on port ${PORT}`);
});
