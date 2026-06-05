const express = require('express');
const cors = require('cors');
const path = require('path');
const dataRouter = require('./routes/data');

const app = express();
const PORT = process.env.API_PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api', dataRouter);

// Serve static health dashboard at /health
app.get('/health', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'health.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`GFM API server listening on port ${PORT}`);
});
