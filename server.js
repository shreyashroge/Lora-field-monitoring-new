/**
 * LoRa Agriculture Monitoring - Backend
 * Node.js + Express. No database server needed: readings are kept in memory
 * and persisted to data/readings.json.
 *
 * Environment variables:
 *   PORT                 default 3000
 *   API_KEY              key required by hardware gateway to POST readings (default "change-me")
 *   ALLOW_SIMULATION     "false" disables the /api/simulate demo endpoint (default enabled)
 *   REPORT_INTERVAL_MIN  expected node reporting interval, minutes (default 15)
 */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'change-me';
const ALLOW_SIM = process.env.ALLOW_SIMULATION !== 'false';
const REPORT_INTERVAL_MIN = Number(process.env.REPORT_INTERVAL_MIN || 15);
const DATA_FILE = path.join(__dirname, 'data', 'readings.json');
const MAX_READINGS = 1000;

if (API_KEY === 'change-me') {
  console.warn('[warn] API_KEY is the default. Set API_KEY before exposing the server publicly.');
}

// ---------- storage ----------
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
let readings = [];
try {
  readings = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch (e) {
  readings = [];
}
let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DATA_FILE, JSON.stringify(readings), (err) => {
      if (err) console.error('Save failed:', err.message);
    });
  }, 500);
}

// ---------- validation ----------
const SPEC = {
  soil_moisture_percent: [0, 100],
  soil_temperature_C: [-20, 80],
  air_temperature_C: [-40, 85],
  relative_humidity_percent: [0, 100],
  atmospheric_pressure_hPa: [300, 1100],
  light_intensity_lux: [0, 200000],
  battery_voltage_V: [2, 5],
};

function buildReading(body, source) {
  if (!body || typeof body !== 'object') return { error: 'Body must be a JSON object' };
  const node_id = String(body.node_id || 'FIELD_NODE_01').slice(0, 40);
  const sequence = Number(body.sequence);
  if (!Number.isInteger(sequence) || sequence < 0) return { error: 'sequence must be a non-negative integer' };

  const r = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    node_id,
    sequence,
    source,
    timestamp: body.timestamp && !isNaN(Date.parse(body.timestamp)) ? new Date(body.timestamp).toISOString() : new Date().toISOString(),
    received_at: new Date().toISOString(),
  };
  for (const [key, [min, max]] of Object.entries(SPEC)) {
    const v = Number(body[key]);
    if (body[key] === undefined || body[key] === null || Number.isNaN(v)) return { error: `${key} is required and must be a number` };
    if (v < min || v > max) return { error: `${key} out of range (${min} to ${max})` };
    r[key] = v;
  }
  if (body.rssi_dBm !== undefined && !Number.isNaN(Number(body.rssi_dBm))) r.rssi_dBm = Number(body.rssi_dBm);
  if (body.snr_dB !== undefined && !Number.isNaN(Number(body.snr_dB))) r.snr_dB = Number(body.snr_dB);
  return { reading: r };
}

// ---------- live stream (Server-Sent Events) ----------
const clients = new Set();
function broadcast(reading) {
  const msg = `data: ${JSON.stringify(reading)}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 25000);

function store(reading) {
  readings.push(reading);
  if (readings.length > MAX_READINGS) readings = readings.slice(-MAX_READINGS);
  saveSoon();
  broadcast(reading);
}

// ---------- stats ----------
function nodeStats() {
  const nodes = {};
  for (const r of readings) {
    const n = nodes[r.node_id] || (nodes[r.node_id] = {
      node_id: r.node_id, source: r.source, received: 0, lost: 0, last_seq: null, last_seen: null,
    });
    if (n.last_seq !== null && r.sequence > n.last_seq + 1) n.lost += r.sequence - n.last_seq - 1;
    n.received += 1;
    n.last_seq = r.sequence;
    n.last_seen = r.received_at;
    n.source = r.source;
  }
  return Object.values(nodes).map((n) => ({
    ...n,
    delivery_ratio_percent: +(100 * n.received / (n.received + n.lost)).toFixed(1),
    online: Date.now() - Date.parse(n.last_seen) < REPORT_INTERVAL_MIN * 2 * 60000,
  }));
}

// ---------- app ----------
const app = express();
app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'docs')));

function requireKey(req, res, next) {
  if (req.get('x-api-key') !== API_KEY) return res.status(401).json({ error: 'Invalid or missing x-api-key' });
  next();
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, readings: readings.length, simulation_enabled: ALLOW_SIM, report_interval_min: REPORT_INTERVAL_MIN });
});

// Hardware gateway posts here
app.post('/api/readings', requireKey, (req, res) => {
  const { reading, error } = buildReading(req.body, 'hardware');
  if (error) return res.status(400).json({ error });
  store(reading);
  res.status(201).json(reading);
});

// Demo: generate a simulated reading (clearly labelled source = "simulated")
const rnd = (a, b, d = 1) => +(a + Math.random() * (b - a)).toFixed(d);
app.post('/api/simulate', (req, res) => {
  if (!ALLOW_SIM) return res.status(403).json({ error: 'Simulation disabled on this server' });
  const last = [...readings].reverse().find((r) => r.node_id === 'SIM_NODE_01');
  const { reading, error } = buildReading({
    node_id: 'SIM_NODE_01',
    sequence: last ? last.sequence + 1 : 1,
    soil_moisture_percent: rnd(28, 68),
    soil_temperature_C: rnd(22, 31),
    air_temperature_C: rnd(25, 36),
    relative_humidity_percent: rnd(35, 78),
    atmospheric_pressure_hPa: rnd(998, 1015),
    light_intensity_lux: Math.round(rnd(2500, 32000)),
    battery_voltage_V: rnd(3.65, 4.15, 2),
  }, 'simulated');
  if (error) return res.status(500).json({ error });
  store(reading);
  res.status(201).json(reading);
});

app.get('/api/readings', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, MAX_READINGS);
  let list = readings;
  if (req.query.node_id) list = list.filter((r) => r.node_id === req.query.node_id);
  res.json({ count: list.length, readings: list.slice(-limit) });
});

app.get('/api/readings/latest', (req, res) => {
  let list = readings;
  if (req.query.node_id) list = list.filter((r) => r.node_id === req.query.node_id);
  if (!list.length) return res.status(404).json({ error: 'No readings yet' });
  res.json(list[list.length - 1]);
});

app.get('/api/readings.csv', (req, res) => {
  let list = readings;
  if (req.query.node_id) list = list.filter((r) => r.node_id === req.query.node_id);
  const cols = ['received_at', 'node_id', 'sequence', 'source', ...Object.keys(SPEC), 'rssi_dBm', 'snr_dB'];
  const lines = [cols.join(',')];
  for (const r of list) lines.push(cols.map((c) => (r[c] === undefined ? '' : r[c])).join(','));
  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', 'attachment; filename="lora_readings.csv"');
  res.send(lines.join('\n'));
});

app.get('/api/stats', (req, res) => {
  res.json({ report_interval_min: REPORT_INTERVAL_MIN, nodes: nodeStats() });
});

app.get('/api/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  res.write(': connected\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

app.delete('/api/readings', requireKey, (req, res) => {
  readings = [];
  saveSoon();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`LoRa Agriculture dashboard running on http://localhost:${PORT}`);
});
