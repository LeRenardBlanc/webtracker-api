// Method: GET /api/export?from=ms&to=ms&format=gpx|json — requires Firebase Auth
import { handleCors, jsonErr } from '../utils/response.js';
import { verifyFirebaseIdToken } from '../utils/auth.js';
import { DB } from '../utils/db.js';

function gpxFromPoints(points) {
  const header = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="webtracker">\n<trk><name>Export</name><trkseg>`;
  const body = points.map(p => {
    const iso = new Date(p.ts_ms).toISOString();
    return `<trkpt lat="${p.lat}" lon="${p.lon}"><time>${iso}</time></trkpt>`;
  }).join('\n');
  const footer = `</trkseg></trk>\n</gpx>`;
  return [header, body, footer].join('\n');
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await verifyFirebaseIdToken(req);
  if (!user) return jsonErr(res, 'Unauthorized', 401);

  const url = new URL(req.url, 'http://localhost');
  const from = parseInt(url.searchParams.get('from') || '0', 10);
  const to = parseInt(url.searchParams.get('to') || '0', 10);
  const format = (url.searchParams.get('format') || 'gpx').toLowerCase();
  if (!from || !to) return jsonErr(res, 'from & to required (ms epoch)');

  const { data: points, error } = await DB.listLocations(user.uid, from, to);
  if (error) return jsonErr(res, 'DB error', 500);

  if (format === 'json') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ points }));
    return;
  }

  // default GPX
  const gpx = gpxFromPoints(points || []);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/gpx+xml');
  res.setHeader('Content-Disposition', 'attachment; filename="export.gpx"');
  res.end(gpx);
}
