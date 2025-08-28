import express from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load local .env (gitignored) so modules can read process.env when imported
dotenv.config({ path: path.join(process.cwd(), '.env') });

// Basic validation to help developer quickly spot missing vars
if (!process.env.SUPABASE_URL) {
  console.warn('Warning: SUPABASE_URL is not set. Create backend/.env from backend/.env.example');
}

const app = express();

// <-- replace the simple json parser with one that saves the raw body -->
app.use(express.json({
  verify: (req, res, buf) => {
    // stash the raw text buffer so our signature code can re-hash the exact same bytes
    req.rawBody = buf;
  }
}));

// simple loader for files in ./api/*.js export default handler(req,res)
const apiDir = path.join(process.cwd(), 'api');
const files = fs.readdirSync(apiDir).filter(f => f.endsWith('.js'));
for (const file of files) {
  const route = '/api/' + file.replace(/\.js$/, '');
  const modPath = `./api/${file}`;
  try {
    const mod = await import(modPath);
    const handler = mod.default;
    if (typeof handler === 'function') {
      app.all(route, handler);
      console.log('Mounted', route);
    }
  } catch (e) {
    console.error('Failed to load', modPath, e);
  }
}

const port = process.env.PORT || 4001;
app.listen(port, () => console.log('Backend dev server listening on', port));
