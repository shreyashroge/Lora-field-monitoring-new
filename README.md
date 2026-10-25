# Field Monitor: Solar-Powered LoRa Agriculture Dashboard

Field node → LoRa P2P → gateway → **backend API** → **dashboard**

```
lora-field-monitor/
├── server.js              Backend (Node.js + Express): REST API, live stream, CSV export
├── simulator.js           Sends test packets to the API (no hardware needed)
├── package.json
├── .gitignore
├── docs/                  Frontend (the dashboard page)
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── config.js          Backend URL setting
└── gateway/
    └── serial_bridge.py   Reads the LoRa receiver over USB and POSTs packets to the API
```

The folder is called `docs/` so GitHub Pages can publish it directly. The backend serves the same folder.

## How the dashboard behaves

| Where it runs | What you see |
|---|---|
| GitHub Pages only (no backend) | **Demo mode**: values are generated in the browser and clearly labelled "DEMO DATA" |
| With the backend (local or Render) | **Live mode**: real API data, live updates, packet log, CSV download |

The page decides automatically: if the backend answers, it is live; otherwise it falls back to demo.

---

## Deployment A: put the dashboard on GitHub Pages (about 5 minutes)

This gives you a public link and QR code for your report. It runs in demo mode.

1. Sign in at github.com → **New repository** → name it `lora-field-monitor` → **Public** → Create.
2. Click **uploading an existing file**, drag in everything from the unzipped folder (`docs`, `gateway`, `server.js`, `simulator.js`, `package.json`, `README.md`). Do not upload a `node_modules` folder. Click **Commit changes**.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, set Source to **Deploy from a branch**. Choose branch **main** and folder **/docs**. Click **Save**.
5. Wait 1 to 2 minutes and refresh. The page shows your link:
   `https://YOUR-USERNAME.github.io/lora-field-monitor/`
6. Open it and press **Generate reading**.

## Deployment B: real live dashboard with the backend (Render)

GitHub cannot run a backend, so the backend goes on Render (free). Do Deployment A first, then:

1. Go to render.com and sign in with GitHub.
2. **New → Web Service** → pick your `lora-field-monitor` repository.
3. Settings: Runtime **Node**, Build command `npm install`, Start command `npm start`, Instance type **Free**.
4. Under **Environment Variables** add `API_KEY` with a long secret value of your own. Click **Create Web Service**.
5. When it finishes you get a URL like `https://lora-field-monitor.onrender.com`. Open it: this is the full live dashboard, and **Generate reading** now goes through the backend.

**Make the GitHub Pages link live too (optional):**
1. In your repository open `docs/config.js` → pencil icon (Edit).
2. Change the line to: `window.API_BASE = 'https://lora-field-monitor.onrender.com';` (use your own Render URL).
3. Commit. After a minute, your GitHub Pages link shows live data from the backend.

Notes about Render's free plan: the app sleeps when idle (the first load can take about 30 seconds), and stored readings may be lost when it restarts. Download the CSV from the dashboard if you need the data for your report.

---

## Run on your own computer

Needs Node.js 18 or newer.

```bash
npm install
npm start                # http://localhost:3000
node simulator.js 5      # optional, second terminal: one test packet every 5 seconds
```

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/readings` | `x-api-key` header | Gateway submits a packet (stored as source "hardware") |
| POST | `/api/simulate` | none | Server generates a demo reading (stored as source "simulated") |
| GET | `/api/readings?limit=50&node_id=` | none | History, oldest to newest |
| GET | `/api/readings/latest?node_id=` | none | Newest reading |
| GET | `/api/readings.csv?node_id=` | none | CSV download |
| GET | `/api/stats` | none | Per node: packets received, missing (from sequence gaps), delivery ratio, online status |
| GET | `/api/stream` | none | Server-Sent Events: new readings as they arrive |
| GET | `/api/health` | none | Health check |
| DELETE | `/api/readings` | `x-api-key` header | Clear stored data |

Packet JSON (the seven sensor values are required, `rssi_dBm` and `snr_dB` optional):

```json
{
  "node_id": "FIELD_NODE_01",
  "sequence": 12,
  "soil_moisture_percent": 41.2,
  "soil_temperature_C": 26.4,
  "air_temperature_C": 31.0,
  "relative_humidity_percent": 55.5,
  "atmospheric_pressure_hPa": 1006.3,
  "light_intensity_lux": 18400,
  "battery_voltage_V": 3.92,
  "rssi_dBm": -92,
  "snr_dB": 6.5
}
```

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | Server port (Render sets this itself) |
| `API_KEY` | change-me | **Change before going public** |
| `ALLOW_SIMULATION` | true | Set `false` to disable the Generate button's backend endpoint once real hardware is connected |
| `REPORT_INTERVAL_MIN` | 15 | A node shows as offline after 2x this interval with no packet |

## Connect real hardware (Phase II)

1. The field node sends one packet every 15 minutes, with `sequence` increasing by 1 each time.
2. The gateway receiver prints each packet over USB serial as a JSON line or a CSV line (formats are documented at the top of `gateway/serial_bridge.py`).
3. On the PC or Raspberry Pi connected to it:

```bash
pip install pyserial requests
python gateway/serial_bridge.py --port COM3 --url https://YOUR-APP.onrender.com --key YOUR_API_KEY
```

An ESP32 gateway with Wi-Fi can also POST the same JSON straight to `/api/readings` with the `x-api-key` header.

## Honest labelling

- Readings from **Generate reading** are labelled SIMULATED (or DEMO) everywhere on the page.
- `simulator.js` posts with the hardware API key, so its packets look like hardware data. Use it only for testing, and say so in your report.
- Packet delivery % is computed from gaps in the sequence numbers, so it only means something with real hardware running over time.
