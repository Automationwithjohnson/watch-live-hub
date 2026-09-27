const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { customAlphabet } = require('nanoid');

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory + JSON file backup store for short card links
const DB_FILE = path.join(__dirname, 'cards_db.json');
let cardsMap = new Map();

// Load stored cards on startup
try {
    if (fs.existsSync(DB_FILE)) {
        const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        cardsMap = new Map(Object.entries(raw));
    }
} catch (e) {
    console.error('Failed to load cards DB:', e.message);
}

function saveCardsDb() {
    try {
        const obj = Object.fromEntries(cardsMap);
        fs.writeFileSync(DB_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to save cards DB:', e.message);
    }
}

// Uploads directory for hosting local images
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        const name = `${Date.now()}_${nanoid(6)}${ext}`;
        cb(null, name);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Escape HTML strings to prevent syntax or injection errors
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Helper: Auto-convert Imgur / host URLs to direct image links
function resolveDirectImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    let trimmed = url.trim();

    // Imgur URL normalizer (handles https://imgur.com/pR026NC, /a/xyz, /gallery/xyz, etc.)
    if (/imgur\.com/i.test(trimmed)) {
        const match = trimmed.match(/imgur\.com\/(?:a\/|gallery\/)?([a-zA-Z0-9]+)(?:\.[a-zA-Z]{3,4})?/i);
        if (match && match[1]) {
            const id = match[1];
            if (trimmed.includes('i.imgur.com') && /\.(jpg|jpeg|png|gif|webp)$/i.test(trimmed)) {
                return trimmed;
            }
            return `https://i.imgur.com/${id}.jpg`;
        }
    }
    return trimmed;
}

// Helper: Detect whether the incoming request is a Social Crawler (Twitterbot, Discord, etc.)
function isSocialBot(userAgent = '') {
    const ua = userAgent.toLowerCase();
    return /twitterbot|facebookexternalhit|meta-externalagent|discordbot|telegrambot|whatsapp|slackbot|linkedinbot|pinterest|embedly|quora link preview|rogerbot|showyoubot|outbrain|vkshare|w3c_validator|duckduckbot/i.test(ua);
}

// Helper: Build the OpenGraph / Twitter Card HTML
function renderCardHtml({ title, description, image, targetUrl, domain }) {
    const safeTitle = escapeHtml(title || 'Exclusive Preview');
    const safeDesc = escapeHtml(description || 'Click to watch live content');
    const directImage = resolveDirectImageUrl(image);
    const safeImage = escapeHtml(directImage || '');
    const safeTarget = targetUrl || 'https://x.com';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>

  <!-- OpenGraph / Facebook / WhatsApp Meta Tags -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDesc}">
  <meta property="og:image" content="${safeImage}">
  <meta property="og:image:secure_url" content="${safeImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${escapeHtml(safeTarget)}">

  <!-- Twitter Card Meta Tags -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDesc}">
  <meta name="twitter:image" content="${safeImage}">
  <meta name="twitter:image:src" content="${safeImage}">
  ${domain ? `<meta name="twitter:domain" content="${escapeHtml(domain)}">` : ''}

  <!-- Instant Browser Redirection for Real Visitors -->
  <script>
    (function() {
      var target = ${JSON.stringify(safeTarget)};
      if (target) {
        window.location.replace(target);
      }
    })();
  </script>
  <noscript>
    <meta http-equiv="refresh" content="0;url=${escapeHtml(safeTarget)}">
  </noscript>
  <style>
    body {
      background: #0b0e14;
      color: #94a3b8;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      text-align: center;
      padding: 20px;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255,255,255,0.1);
      border-radius: 50%;
      border-top-color: #38bdf8;
      animation: spin 0.8s ease-in-out infinite;
      margin-bottom: 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    a { color: #38bdf8; text-decoration: none; margin-top: 10px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <p>Connecting to preview...</p>
  <a href="${escapeHtml(safeTarget)}">Click here if not redirected automatically</a>
</body>
</html>`;
}

// ── 1. Dynamic Card Route via Query Parameters ──────────────────────────────
// Example: https://service.onrender.com/c?title=My+Card&img=https://...&target=https://...
app.get('/c', (req, res) => {
    const title = req.query.title || 'Exclusive Preview';
    const description = req.query.desc || req.query.description || 'Click to view full preview';
    let image = req.query.img || req.query.image || '';
    let target = req.query.target || req.query.url || 'https://x.com';
    const domain = req.query.domain || '';

    // Append extra tracking parameter if provided (e.g. ?t=spam1)
    if (req.query.t && target) {
        const sep = target.includes('?') ? '&' : '?';
        target = `${target}${sep}t=${encodeURIComponent(req.query.t)}`;
    }

    // Resolve relative image URLs to this server's host
    if (image.startsWith('/')) {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        image = `${protocol}://${req.get('host')}${image}`;
    }

    const ua = req.headers['user-agent'] || '';
    const isBot = isSocialBot(ua);

    // If human directly loads in a desktop browser and no query says force-preview, redirect
    if (!isBot && target && !req.query.preview) {
        return res.redirect(302, target);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 mins
    return res.send(renderCardHtml({ title, description, image, targetUrl: target, domain }));
});

// ── 2. Short Slug Route ─────────────────────────────────────────────────────
// Example: https://service.onrender.com/s/live9
app.get('/s/:slug', (req, res) => {
    const slug = req.params.slug;
    const cardData = cardsMap.get(slug);

    if (!cardData) {
        return res.status(404).send(`<h3>Link Card not found or expired</h3><p><a href="/">Create one here</a></p>`);
    }

    let { title, description, image, target, domain } = cardData;

    // Append tracking tag if passed to short slug (e.g. /s/live9?t=spam1)
    if (req.query.t && target) {
        const sep = target.includes('?') ? '&' : '?';
        target = `${target}${sep}t=${encodeURIComponent(req.query.t)}`;
    }

    if (image && image.startsWith('/')) {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        image = `${protocol}://${req.get('host')}${image}`;
    }

    const ua = req.headers['user-agent'] || '';
    const isBot = isSocialBot(ua);

    if (!isBot && target && !req.query.preview) {
        return res.redirect(302, target);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(renderCardHtml({ title, description, image, targetUrl: target, domain }));
});

// ── 3. API: Upload Image from Desktop ───────────────────────────────────────
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No image uploaded' });
    }
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const imageUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

    res.json({
        success: true,
        filename: req.file.filename,
        imageUrl,
        path: `/uploads/${req.file.filename}`
    });
});

// ── 4. API: Create Short Card Link ──────────────────────────────────────────
app.post('/api/create', (req, res) => {
    const { title, description, image, target, customSlug, domain } = req.body;

    if (!target) {
        return res.status(400).json({ success: false, error: 'Target URL is required' });
    }

    const slug = (customSlug && customSlug.trim()) ? customSlug.trim() : nanoid(7);
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');

    const cardRecord = {
        slug,
        title: title || 'Exclusive Preview',
        description: description || 'Click to watch live content',
        image: image || '',
        target: target.trim(),
        domain: domain || '',
        createdAt: new Date().toISOString()
    };

    cardsMap.set(slug, cardRecord);
    saveCardsDb();

    const shortUrl = `${protocol}://${host}/s/${slug}`;
    const directUrl = `${protocol}://${host}/c?title=${encodeURIComponent(cardRecord.title)}&img=${encodeURIComponent(cardRecord.image)}&target=${encodeURIComponent(cardRecord.target)}`;

    res.json({
        success: true,
        slug,
        shortUrl,
        directUrl,
        card: cardRecord
    });
});

// ── 5. API: List All Created Cards ──────────────────────────────────────────
app.get('/api/cards', (req, res) => {
    const list = Array.from(cardsMap.values()).reverse();
    res.json({ success: true, count: list.length, cards: list });
});

// ── 6. Health Check / Keep-Alive ────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`🚀 Clickable Card Server running on port ${PORT}`);
});
