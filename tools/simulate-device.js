#!/usr/bin/env node
// Simulate a device requesting a link code from the backend
// Usage: node tools/simulate-device.js [device_id]

const BACKEND = process.env.BACKEND_URL || 'http://localhost:4001';
const deviceId = process.argv[2] || `simdev_${Date.now()}`;

async function main() {
  const res = await fetch(`${BACKEND}/api/generate-device-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId })
  });
  const data = await res.json();
  console.log('deviceId:', deviceId);
  console.log('response:', data);
}

main().catch(err => { console.error(err); process.exit(1); });
