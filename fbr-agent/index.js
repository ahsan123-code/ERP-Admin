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
// Must come before cors(): cors() answers the preflight and ends the response, so a
// handler registered after it never sees the OPTIONS request.
//
// The ERP is served over HTTPS from alliedsteel.store while this agent answers on plain
// http://localhost. Chrome treats that as a private-network request and asks the target
// to opt in first, via a preflight carrying Access-Control-Request-Private-Network.
// cors() knows nothing about that header; without this reply Chrome blocks every call and
// the Invoicing page reads the fiscal service as offline however healthy it is.
app.use((req, res, next) => {
  if (req.headers['access-control-request-private-network']) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  next();
});

app.use(cors({ origin: ALLOWED_ORIGINS }));

app.use(express.json());

app.use('/api/fbr', fbrRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`FBR agent listening on http://localhost:${PORT}`);
  console.log(`FBR env: ${process.env.FBR_ENV || 'sandbox'}`);
  console.log(`POS ID:  ${require('./config/fbr').POS_ID}`);
});
