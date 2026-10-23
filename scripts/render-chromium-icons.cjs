// Renders build/icon.svg (and a monochrome glyph) at every size Chromium's
// branding needs, into chromium/branding/. Run with: electron scripts/render-chromium-icons.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '../chromium/branding/png');
const svg = fs.readFileSync(path.join(__dirname, '../build/icon.svg'), 'utf8');
// The bare mark for monochrome UI spots (e.g. the 22px mono logo).
const mono = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M8 19.5V11.4c0-2.9 2.1-5 4.8-5.2" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"/><ellipse cx="16.9" cy="6.9" rx="2.9" ry="1.85" transform="rotate(-28 16.9 6.9)" fill="#000"/></svg>`;

// Small sizes: a full-bleed tile with a larger, bolder glyph so it stays legible.
const small = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="120" fill="#3d5672"/><g transform="translate(24 40) scale(19.5)"><path d="M8 19.5V11.4c0-2.9 2.1-5 4.8-5.2" fill="none" stroke="#f4efe7" stroke-width="3.7" stroke-linecap="round"/><ellipse cx="16.9" cy="6.9" rx="3.2" ry="2.1" transform="rotate(-28 16.9 6.9)" fill="#e9c98f"/></g></svg>`;

const jobs = [
  ...[16, 22, 24, 32, 48, 64, 70, 128, 150, 256].map((s) => ({ name: `logo_${s}.png`, size: s, src: s <= 32 ? small : svg })),
  { name: 'mono_22.png', size: 22, src: mono },
];

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ width: 256, height: 256, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  for (const j of jobs) {
    const sized = j.src.replace('<svg ', `<svg width="${j.size}" height="${j.size}" `);
    await win.loadURL(`data:text/html,<html><body style="margin:0;background:transparent">${encodeURIComponent(sized)}</body></html>`);
    await new Promise((r) => setTimeout(r, 250));
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: j.size, height: j.size });
    fs.writeFileSync(path.join(OUT, j.name), img.resize({ width: j.size, height: j.size, quality: 'best' }).toPNG());
  }
  app.quit();
});
