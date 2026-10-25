"""
LoRa gateway -> backend bridge (Phase II, real hardware).

The LoRa receiver board (e.g. ESP32 / Arduino + SX1278 module) prints one line per
received packet over USB serial. This script reads those lines and POSTs them to
the backend.

Accepted line formats
  1) JSON:  {"node_id":"FIELD_NODE_01","sequence":12,"soil_moisture_percent":41.2,...}
  2) CSV (11 fields, in this order):
     node_id,sequence,soil_moisture,soil_temp,air_temp,humidity,pressure,lux,battery_v,rssi,snr

Install:  pip install pyserial requests
Run:      python serial_bridge.py --port COM3 --url https://your-app.onrender.com --key YOUR_API_KEY
          (Linux/Mac port example: /dev/ttyUSB0)
"""
import argparse
import json
import sys

import requests
import serial

CSV_FIELDS = [
    "node_id", "sequence", "soil_moisture_percent", "soil_temperature_C",
    "air_temperature_C", "relative_humidity_percent", "atmospheric_pressure_hPa",
    "light_intensity_lux", "battery_voltage_V", "rssi_dBm", "snr_dB",
]


def parse_line(line: str):
    line = line.strip()
    if not line:
        return None
    if line.startswith("{"):
        return json.loads(line)
    parts = [p.strip() for p in line.split(",")]
    if len(parts) != len(CSV_FIELDS):
        raise ValueError(f"expected {len(CSV_FIELDS)} CSV fields, got {len(parts)}")
    data = dict(zip(CSV_FIELDS, parts))
    for k in CSV_FIELDS[1:]:
        data[k] = float(data[k])
    data["sequence"] = int(data["sequence"])
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", required=True, help="serial port, e.g. COM3 or /dev/ttyUSB0")
    ap.add_argument("--baud", type=int, default=115200)
    ap.add_argument("--url", default="http://localhost:3000", help="backend base URL")
    ap.add_argument("--key", default="change-me", help="API key (same as server API_KEY)")
    args = ap.parse_args()

    endpoint = args.url.rstrip("/") + "/api/readings"
    print(f"Reading {args.port} @ {args.baud}, posting to {endpoint}")
    with serial.Serial(args.port, args.baud, timeout=2) as ser:
        while True:
            raw = ser.readline().decode("utf-8", errors="ignore")
            try:
                payload = parse_line(raw)
                if payload is None:
                    continue
                r = requests.post(endpoint, json=payload, headers={"x-api-key": args.key}, timeout=10)
                print(r.status_code, r.text[:120])
            except Exception as e:  # keep running on bad lines or network errors
                print("skip:", raw.strip()[:80], "->", e, file=sys.stderr)


if __name__ == "__main__":
    main()
