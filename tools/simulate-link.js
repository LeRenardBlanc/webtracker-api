#!/usr/bin/env node
// Simulate frontend redeeming a device code. Requires a Firebase idToken for an authenticated user.
// Usage: ID_TOKEN=<firebase_id_token> node tools/simulate-link.js <code> [label]

const BACKEND = process.env.BACKEND_URL || 'http://localhost:4001';
const idToken = process.env.ID_TOKEN;
const code = process.argv[2];
const label = process.argv[3] || 'Simulated device';

if (!code) {
  console.error('Usage: ID_TOKEN=<firebase_id_token> node tools/simulate-link.js <code> [label]');
  process.exit(2);
}
if (!idToken) {
  console.error('This script requires a Firebase ID token in the ID_TOKEN env var. Obtain it from the client after login.');
  process.exit(2);
}

async function main() {
  const res = await fetch(`${BACKEND}/api/link-device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ code, label })
  });
  const data = await res.json();
  console.log('redeem response:', data);
}

main().catch(err => { console.error(err); process.exit(1); });
