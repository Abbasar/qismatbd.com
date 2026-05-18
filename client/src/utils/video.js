/**
 * ল্যান্ডিং/গ্যালারি ভিডিও — YouTube/Vimeo URL embed ফরম্যাটে রূপান্তর
 * লোকাল ফাইল (/uploads/…) resolveVideoPlaybackSource() দিয়ে চেনে
 */
/** Normalize YouTube/Vimeo/watch URLs to embed-friendly URLs. */
export function normalizeEmbedVideoUrl(rawUrl) {
  const s = String(rawUrl || '').trim();
  if (!s) return '';
  const iframeMatch = s.match(/src=["']([^"']+)["']/i);
  const candidate = iframeMatch?.[1] ? String(iframeMatch[1]).trim() : s;
  try {
    const u = new URL(candidate);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.pathname.startsWith('/embed/')) return candidate;
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.split('/').filter(Boolean)[1];
        return id ? `https://www.youtube.com/embed/${id}` : candidate;
      }
      const id = u.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : candidate;
    }
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\/+/, '').split('/')[0];
      return id ? `https://www.youtube.com/embed/${id}` : candidate;
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.replace(/^\/+/, '').split('/')[0];
      return id ? `https://player.vimeo.com/video/${id}` : candidate;
    }
    return candidate;
  } catch {
    return candidate;
  }
}

export function isEmbedVideoUrl(url) {
  const s = String(url || '').trim();
  return s.includes('youtube.com/embed/') || s.includes('player.vimeo.com/video/');
}

export function isDirectVideoUrl(url) {
  const s = String(url || '').trim().toLowerCase();
  return /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(s) || s.includes('/uploads/');
}

/** Uploaded path, direct file URL, or YouTube/Vimeo embed URL for landing promo video. */
export function resolveLandingVideoSrc(rawUrl, resolveUploadUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return { kind: 'none', src: '' };
  const embed = normalizeEmbedVideoUrl(raw);
  if (isEmbedVideoUrl(embed)) return { kind: 'embed', src: embed };
  if (raw.startsWith('/uploads/') || /^uploads[/\\]/i.test(raw) || isDirectVideoUrl(raw)) {
    const fileSrc = typeof resolveUploadUrl === 'function' ? resolveUploadUrl(raw) : raw;
    return { kind: 'file', src: fileSrc };
  }
  if (/^https?:\/\//i.test(raw) && isDirectVideoUrl(raw)) return { kind: 'file', src: raw };
  return { kind: 'embed', src: embed || raw };
}

/** Autoplay + mute for landing hero embeds (browser policy). */
export function embedAutoplayUrl(src) {
  const s = String(src || '').trim();
  if (!s) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      u.searchParams.set('autoplay', '1');
      u.searchParams.set('mute', '1');
      u.searchParams.set('playsinline', '1');
      u.searchParams.set('rel', '0');
      u.searchParams.set('modestbranding', '1');
      const id = u.pathname.match(/\/embed\/([^/?]+)/)?.[1];
      if (id) {
        u.searchParams.set('loop', '1');
        u.searchParams.set('playlist', id);
      }
    } else if (host === 'player.vimeo.com') {
      u.searchParams.set('autoplay', '1');
      u.searchParams.set('muted', '1');
      u.searchParams.set('loop', '1');
      u.searchParams.set('background', '0');
    }
    return u.toString();
  } catch {
    return s;
  }
}
