/**
 * Sends simulated readings to the backend, like a gateway would.
 * Usage:  node simulator.js [seconds-between-packets] [base-url]
 *   e.g.  node simulator.js 5 http://localhost:3000
 * Uses env API_KEY (default "change-me"). Packets are stored with source "hardware",
 * so use a clearly different node_id and say "simulated" in your report.
 */
const interval = Number(process.argv[2] || 5) * 1000;
const base = process.argv[3] || 'http://localhost:3000';
const key = process.env.API_KEY || 'change-me';
const rnd = (a, b, d = 1) => +(a + Math.random() * (b - a)).toFixed(d);

let seq = 0;
async function send() {
  seq += 1;
  const body = {
    node_id: 'TEST_NODE_SCRIPT',
    sequence: seq,
    soil_moisture_percent: rnd(28, 68),
    soil_temperature_C: rnd(22, 31),
    air_temperature_C: rnd(25, 36),
    relative_humidity_percent: rnd(35, 78),
    atmospheric_pressure_hPa: rnd(998, 1015),
    light_intensity_lux: Math.round(rnd(2500, 32000)),
    battery_voltage_V: rnd(3.65, 4.15, 2),
    rssi_dBm: Math.round(rnd(-110, -70, 0)),
    snr_dB: rnd(-5, 10),
  };
  try {
    const res = await fetch(base + '/api/readings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify(body),
    });
    console.log(`#${seq}`, res.status, res.ok ? 'sent' : await res.text());
  } catch (e) {
    console.error('Send failed:', e.message);
  }
}
console.log(`Sending a packet every ${interval / 1000}s to ${base} (Ctrl+C to stop)`);
send();
setInterval(send, interval);
