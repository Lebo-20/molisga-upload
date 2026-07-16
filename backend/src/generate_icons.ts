import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const publicDir = path.join(__dirname, '../../frontend/public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Neon green circle with an "M" in the center
const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="120" fill="#09090b" />
  <circle cx="256" cy="256" r="200" fill="none" stroke="#10b981" stroke-width="24" />
  <text x="256" y="325" font-family="system-ui, sans-serif" font-size="210" font-weight="900" fill="#10b981" text-anchor="middle">M</text>
</svg>
`;

async function main() {
  try {
    await sharp(Buffer.from(svg))
      .resize(512, 512)
      .png()
      .toFile(path.join(publicDir, 'pwa-512x512.png'));

    await sharp(Buffer.from(svg))
      .resize(192, 192)
      .png()
      .toFile(path.join(publicDir, 'pwa-192x192.png'));

    console.log('[Icons] PWA manifest icons generated successfully in frontend/public/');
  } catch (err: any) {
    console.error('[Icons] Generation failed:', err.message);
  }
}

main();
