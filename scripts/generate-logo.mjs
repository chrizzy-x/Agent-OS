import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// SVG recreating the watercolor brain/head silhouette with rainbow thought waves
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
  <rect width="600" height="600" fill="white"/>

  <!-- Colorful thought waves - left side (entering head) -->
  <!-- Pink/magenta wave top -->
  <path d="M0,220 Q60,200 120,220 Q180,240 240,215 Q270,202 285,210" fill="none" stroke="#e879a0" stroke-width="22" stroke-linecap="round" opacity="0.85"/>
  <!-- Yellow wave -->
  <path d="M0,255 Q60,235 120,255 Q180,275 240,250 Q270,237 285,245" fill="none" stroke="#f5c842" stroke-width="20" stroke-linecap="round" opacity="0.85"/>
  <!-- Orange wave -->
  <path d="M0,285 Q60,265 120,285 Q180,305 240,278 Q270,265 285,272" fill="none" stroke="#f08030" stroke-width="18" stroke-linecap="round" opacity="0.8"/>

  <!-- Colorful thought waves - right side (exiting head) -->
  <!-- Teal/cyan wave top -->
  <path d="M315,215 Q340,202 380,220 Q440,245 500,218 Q550,200 600,215" fill="none" stroke="#30c4c0" stroke-width="22" stroke-linecap="round" opacity="0.85"/>
  <!-- Blue wave -->
  <path d="M315,248 Q340,235 380,252 Q440,272 500,248 Q550,232 600,248" fill="none" stroke="#4a9fd4" stroke-width="20" stroke-linecap="round" opacity="0.85"/>
  <!-- Purple wave -->
  <path d="M315,278 Q340,265 380,280 Q440,298 500,275 Q550,258 600,275" fill="none" stroke="#8b5cf6" stroke-width="18" stroke-linecap="round" opacity="0.8"/>

  <!-- Human head/neck silhouette - profile facing left -->
  <path d="
    M 340,480
    L 340,420
    Q 340,400 320,395
    Q 290,388 280,370
    Q 268,350 270,325
    Q 265,305 258,295
    Q 248,280 250,260
    Q 242,235 248,215
    Q 255,185 270,168
    Q 290,145 315,135
    Q 340,125 368,128
    Q 400,132 422,150
    Q 448,172 455,200
    Q 462,228 455,255
    Q 448,278 438,292
    Q 428,308 430,330
    Q 432,355 418,375
    Q 405,395 385,400
    Q 365,405 360,420
    L 360,480
    Z
  " fill="#1a3a6b" opacity="0.92"/>

  <!-- Neck/shoulder base -->
  <path d="M 280,480 Q 300,460 340,458 L 360,458 Q 400,460 420,480 L 440,540 L 260,540 Z" fill="#1a3a6b" opacity="0.85"/>

  <!-- Subtle face features - eye area highlight -->
  <ellipse cx="290" cy="235" rx="12" ry="8" fill="#0f2a55" opacity="0.5"/>

  <!-- Rainbow color inside head (thought waves passing through) -->
  <!-- Red/orange inside -->
  <path d="M 258,255 Q 270,245 290,252 Q 310,258 330,250 Q 350,242 368,250 Q 390,258 420,248" fill="none" stroke="#e8402a" stroke-width="18" stroke-linecap="round" opacity="0.55"/>
  <!-- Yellow inside -->
  <path d="M 260,278 Q 275,268 298,275 Q 320,282 345,272 Q 370,263 400,272 Q 418,278 435,270" fill="none" stroke="#f5c030" stroke-width="16" stroke-linecap="round" opacity="0.5"/>
  <!-- Teal inside -->
  <path d="M 265,300 Q 282,290 305,297 Q 328,305 355,294 Q 380,283 415,294" fill="none" stroke="#1bc8b8" stroke-width="15" stroke-linecap="round" opacity="0.5"/>

  <!-- Watercolor texture overlay on head (subtle) -->
  <path d="
    M 340,480
    L 340,420
    Q 340,400 320,395
    Q 290,388 280,370
    Q 268,350 270,325
    Q 265,305 258,295
    Q 248,280 250,260
    Q 242,235 248,215
    Q 255,185 270,168
    Q 290,145 315,135
    Q 340,125 368,128
    Q 400,132 422,150
    Q 448,172 455,200
    Q 462,228 455,255
    Q 448,278 438,292
    Q 428,308 430,330
    Q 432,355 418,375
    Q 405,395 385,400
    Q 365,405 360,420
    L 360,480
    Z
  " fill="url(#headGrad)" opacity="0.4"/>

  <defs>
    <linearGradient id="headGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb" stop-opacity="0.3"/>
      <stop offset="50%" stop-color="#0891b2" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#1e40af" stop-opacity="0.3"/>
    </linearGradient>
  </defs>
</svg>`;

// Write the SVG
writeFileSync(resolve(__dirname, '../public/logo.svg'), svg);
console.log('SVG written');

// Convert to PNG at 512x512
await sharp(Buffer.from(svg))
  .resize(512, 512)
  .png()
  .toFile(resolve(__dirname, '../public/logo.png'));

console.log('logo.png (512x512) written');

// Also create a 192x192 version
await sharp(Buffer.from(svg))
  .resize(192, 192)
  .png()
  .toFile(resolve(__dirname, '../public/logo-192.png'));

console.log('logo-192.png (192x192) written');

// Apple touch icon 180x180
await sharp(Buffer.from(svg))
  .resize(180, 180)
  .png()
  .toFile(resolve(__dirname, '../public/apple-touch-icon.png'));

console.log('apple-touch-icon.png (180x180) written');
