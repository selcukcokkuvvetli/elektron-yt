const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pngToIco = require('png-to-ico');

const rootDir = path.resolve(__dirname, '..');
const buildDir = path.join(rootDir, 'build');
const tempDir = path.join(buildDir, '.icon-temp');
const sizes = [16, 24, 32, 48, 64, 128, 256];

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function removeDir(target) {
  if (!fs.existsSync(target)) {
    return;
  }

  fs.readdirSync(target).forEach(function each(entry) {
    const fullPath = path.join(target, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      removeDir(fullPath);
    } else {
      fs.unlinkSync(fullPath);
    }
  });

  fs.rmdirSync(target);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fillPixel(png, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) {
    return;
  }

  const offset = (png.width * y + x) << 2;
  png.data[offset] = r;
  png.data[offset + 1] = g;
  png.data[offset + 2] = b;
  png.data[offset + 3] = a;
}

function paintCircle(png, cx, cy, radius, color) {
  const minX = Math.floor(cx - radius);
  const maxX = Math.ceil(cx + radius);
  const minY = Math.floor(cy - radius);
  const maxY = Math.ceil(cy + radius);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if ((dx * dx) + (dy * dy) <= radius * radius) {
        fillPixel(png, x, y, color[0], color[1], color[2], color[3]);
      }
    }
  }
}

function paintRoundedRect(png, x, y, width, height, radius, color) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const left = x + radius;
      const right = x + width - radius - 1;
      const top = y + radius;
      const bottom = y + height - radius - 1;

      if ((px >= left && px <= right) || (py >= top && py <= bottom)) {
        fillPixel(png, px, py, color[0], color[1], color[2], color[3]);
        continue;
      }

      const cx = px < left ? left : right;
      const cy = py < top ? top : bottom;
      const dx = px - cx;
      const dy = py - cy;
      if ((dx * dx) + (dy * dy) <= radius * radius) {
        fillPixel(png, px, py, color[0], color[1], color[2], color[3]);
      }
    }
  }
}

function paintTriangle(png, points, color) {
  const xs = points.map(function map(point) { return point[0]; });
  const ys = points.map(function map(point) { return point[1]; });
  const minX = Math.floor(Math.min.apply(Math, xs));
  const maxX = Math.ceil(Math.max.apply(Math, xs));
  const minY = Math.floor(Math.min.apply(Math, ys));
  const maxY = Math.ceil(Math.max.apply(Math, ys));

  function area(a, b, c) {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  }

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const point = [x + 0.5, y + 0.5];
      const a1 = area(points[0], points[1], point);
      const a2 = area(points[1], points[2], point);
      const a3 = area(points[2], points[0], point);
      const hasNeg = a1 < 0 || a2 < 0 || a3 < 0;
      const hasPos = a1 > 0 || a2 > 0 || a3 > 0;
      if (!(hasNeg && hasPos)) {
        fillPixel(png, x, y, color[0], color[1], color[2], color[3]);
      }
    }
  }
}

function paintMusicStem(png, scale, color) {
  const stemX = Math.round(scale * 0.66);
  const stemTop = Math.round(scale * 0.26);
  const stemWidth = Math.max(2, Math.round(scale * 0.06));
  const stemHeight = Math.round(scale * 0.33);
  paintRoundedRect(
    png,
    stemX,
    stemTop,
    stemWidth,
    stemHeight,
    Math.max(2, Math.round(scale * 0.02)),
    color
  );

  paintRoundedRect(
    png,
    stemX - Math.round(scale * 0.14),
    stemTop,
    Math.round(scale * 0.16),
    Math.max(3, Math.round(scale * 0.05)),
    Math.max(2, Math.round(scale * 0.02)),
    color
  );

  paintCircle(
    png,
    stemX - Math.round(scale * 0.05),
    stemTop + stemHeight,
    Math.round(scale * 0.09),
    color
  );
}

function createPng(size) {
  const png = new PNG({ width: size, height: size });
  const center = size / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const tX = x / Math.max(1, size - 1);
      const tY = y / Math.max(1, size - 1);
      const glow = clamp(1 - Math.sqrt(Math.pow(tX - 0.22, 2) + Math.pow(tY - 0.18, 2)) * 1.8, 0, 1);
      const r = Math.round(5 + (18 * (1 - tY)) + glow * 16);
      const g = Math.round(16 + (38 * (1 - tX)) + glow * 42);
      const b = Math.round(22 + (62 * tY) + glow * 28);
      fillPixel(png, x, y, r, g, b, 255);
    }
  }

  paintRoundedRect(
    png,
    Math.round(size * 0.12),
    Math.round(size * 0.12),
    Math.round(size * 0.76),
    Math.round(size * 0.76),
    Math.round(size * 0.18),
    [11, 31, 42, 255]
  );

  paintRoundedRect(
    png,
    Math.round(size * 0.15),
    Math.round(size * 0.15),
    Math.round(size * 0.70),
    Math.round(size * 0.70),
    Math.round(size * 0.16),
    [18, 54, 66, 255]
  );

  paintTriangle(
    png,
    [
      [Math.round(size * 0.32), Math.round(size * 0.28)],
      [Math.round(size * 0.32), Math.round(size * 0.72)],
      [Math.round(size * 0.58), Math.round(size * 0.50)]
    ],
    [40, 212, 180, 255]
  );

  paintMusicStem(png, size, [242, 166, 90, 255]);
  paintCircle(png, center * 1.6, center * 0.44, Math.round(size * 0.06), [255, 255, 255, 52]);

  return png;
}

async function main() {
  ensureDir(buildDir);
  removeDir(tempDir);
  ensureDir(tempDir);

  const pngFiles = sizes.map(function map(size) {
    const target = path.join(tempDir, 'icon-' + size + '.png');
    const png = createPng(size);
    fs.writeFileSync(target, PNG.sync.write(png));
    return target;
  });

  fs.copyFileSync(pngFiles[pngFiles.length - 1], path.join(buildDir, 'icon.png'));
  const icoBuffer = await pngToIco(pngFiles);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);
  removeDir(tempDir);
  console.log('Generated build/icon.ico and build/icon.png');
}

main().catch(function onError(error) {
  console.error(error.message);
  process.exit(1);
});
