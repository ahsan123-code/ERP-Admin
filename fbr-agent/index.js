require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const fbrRoutes = require('./routes/fbr');

const app  = express();
const PORT = process.env.PORT || 4000;

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://erp-admin-pearl.vercel.app',
  'https://www.alliedsteel.store',
  'https://alliedsteel.store',
];
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

app.use('/api/fbr', fbrRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`ERP server running on http://localhost:${PORT}`);
  console.log(`FBR env: ${process.env.FBR_ENV || 'sandbox'}`);
});
