require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const fbrRoutes = require('./routes/fbr');

const app  = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/fbr', fbrRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`ERP server running on http://localhost:${PORT}`);
  console.log(`FBR env: ${process.env.FBR_ENV || 'sandbox'}`);
});
