function validateUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) throw new Error('Gecersiz URL.');
  let parsed;
  try { parsed = new URL(value); } catch (_) { throw new Error('Gecersiz URL: ' + value.slice(0, 120)); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Yalnizca kullanici bilgisi icermeyen HTTP/HTTPS linkleri desteklenir.');
  }
  return parsed;
}

function canonicalUrl(value) {
  const url = validateUrl(value);
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  let id;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  if (host === 'youtube.com' || host === 'music.youtube.com') {
    id = url.searchParams.get('v');
    if (!id) {
      const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/);
      if (match) id = match[1];
    }
  }
  if (id && /^[\w-]+$/.test(id)) return 'https://www.youtube.com/watch?v=' + id;
  url.hash = '';
  return url.href;
}

function isYouTubePlaylist(value) {
  const url = validateUrl(value);
  return ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(url.hostname.toLowerCase())
    && Boolean(url.searchParams.get('list'));
}

module.exports = { validateUrl, canonicalUrl, isYouTubePlaylist };
