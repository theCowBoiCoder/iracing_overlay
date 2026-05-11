import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { IRacingClient } from './src/iracing-client.js';
import { buildOverlayState, emptyState, resetBaseline } from './src/rating-state.js';
import { PredictionStore } from './src/prediction-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = Number(process.env.PORT || 3333);
const pollMs = Math.max(Number(process.env.POLL_SECONDS || 60), 15) * 1000;
const stateFile = path.resolve(__dirname, process.env.STATE_FILE || './data/irating-state.json');
const predictionFile = path.resolve(__dirname, process.env.PREDICTION_FILE || './data/prediction-state.json');
const obsToken = process.env.OBS_TOKEN || '';

const app = express();
const iracing = new IRacingClient({
  authMode: process.env.IRACING_AUTH_MODE || 'password_limited',
  clientId: process.env.IRACING_CLIENT_ID || '',
  clientSecret: process.env.IRACING_CLIENT_SECRET || '',
  username: process.env.IRACING_USERNAME || '',
  password: process.env.IRACING_PASSWORD || '',
  accessToken: process.env.IRACING_ACCESS_TOKEN || '',
  refreshToken: process.env.IRACING_REFRESH_TOKEN || ''
});
const predictions = new PredictionStore(predictionFile);

let overlayState = emptyState(process.env.DEFAULT_CATEGORY || 'sports_car');
let polling = false;

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html']
}));

app.get('/api/state', (_req, res) => {
  res.json(overlayState);
});

app.get('/api/prediction', (_req, res) => {
  res.json(predictions.getPublicState());
});

app.get('/api/prediction/events', (req, res) => {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no'
  });
  predictions.addClient(res);
});

app.post('/api/prediction/open', async (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  await sendPrediction(res, () => predictions.open(req.body));
});

app.post('/api/prediction/vote', async (req, res) => {
  await sendPrediction(res, () => predictions.vote(req.body));
});

app.post('/api/prediction/lock', async (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  await sendPrediction(res, () => predictions.lock());
});

app.post('/api/prediction/resolve', async (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  await sendPrediction(res, () => predictions.resolve(req.body?.choice || req.body?.winner));
});

app.post('/api/prediction/clear', async (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  await sendPrediction(res, () => predictions.clear());
});

app.all('/api/streamerbot/:action', async (req, res) => {
  if (['open', 'lock', 'resolve', 'clear'].includes(req.params.action) && !isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const input = { ...req.query, ...req.body };
  const actions = {
    open: () => predictions.open({
      question: input.question || input.q,
      options: input.options || [input.option1, input.option2, input.option3, input.option4].filter(Boolean),
      durationSeconds: input.duration || input.seconds,
      source: input.source || 'streamerbot'
    }),
    vote: () => predictions.vote({
      voterId: input.userId || input.user || input.username,
      displayName: input.displayName || input.user || input.username,
      platform: input.platform || input.source || 'stream',
      choice: input.choice || input.option || input.vote
    }),
    lock: () => predictions.lock(),
    resolve: () => predictions.resolve(input.choice || input.option || input.winner),
    clear: () => predictions.clear()
  };

  const action = actions[req.params.action];
  if (!action) return res.status(404).json({ error: 'Unknown Streamer.bot action' });
  await sendPrediction(res, action);
});

app.post('/api/refresh', async (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  await pollNow();
  res.json(overlayState);
});

app.post('/api/reset-baseline', async (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  overlayState = resetBaseline(overlayState);
  await saveState();
  res.json(overlayState);
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, lastUpdatedAt: overlayState.lastUpdatedAt });
});

await loadState();
await predictions.load();
await pollNow().catch((error) => {
  overlayState = {
    ...overlayState,
    status: 'error',
    error: cleanError(error),
    lastCheckedAt: new Date().toISOString()
  };
});
setInterval(() => {
  pollNow().catch((error) => {
    overlayState = {
      ...overlayState,
      status: 'error',
      error: cleanError(error),
      lastCheckedAt: new Date().toISOString()
    };
  });
}, pollMs);

app.listen(port, () => {
  console.log(`iRacing OBS overlay listening on http://localhost:${port}`);
});

async function pollNow() {
  if (polling) return;
  polling = true;
  try {
    const profile = await iracing.getMemberProfile();
    overlayState = buildOverlayState({
      previous: overlayState,
      profile,
      defaultCategory: process.env.DEFAULT_CATEGORY || overlayState.selectedCategory || 'sports_car'
    });
    await saveState();
  } catch (error) {
    overlayState = {
      ...overlayState,
      status: 'error',
      error: cleanError(error),
      lastCheckedAt: new Date().toISOString()
    };
    throw error;
  } finally {
    polling = false;
  }
}

async function loadState() {
  if (!existsSync(stateFile)) return;
  const raw = await readFile(stateFile, 'utf8');
  overlayState = { ...overlayState, ...JSON.parse(raw) };
}

async function saveState() {
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, JSON.stringify(overlayState, null, 2));
}

function isAuthorized(req) {
  if (!obsToken) return true;
  const header = req.get('authorization') || '';
  return header === `Bearer ${obsToken}` || req.query.token === obsToken;
}

function cleanError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function sendPrediction(res, action) {
  try {
    res.json(await action());
  } catch (error) {
    res.status(400).json({ error: cleanError(error) });
  }
}
