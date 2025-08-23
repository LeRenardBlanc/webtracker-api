import { handleCors, jsonOk } from '../utils/response.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  return jsonOk(res, { status: 'ok', ts: Date.now() });
}
