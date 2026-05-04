import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiUrl, fetchWithTimeout } from '../utils/api';
import { resolveImageUrl } from '../utils/image';

function isIframeVideo(src) {
  const s = String(src || '');
  return s.includes('youtube.com/embed/') || s.includes('player.vimeo.com/video/');
}

function GalleryMedia({ item }) {
  const { kind, src, caption } = item;
  const cap = String(caption || '').trim();

  if (kind === 'image') {
    return (
      <figure className="group overflow-hidden rounded-sm border border-slate-200/90 bg-white shadow-sm">
        <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100">
          <img
            src={resolveImageUrl(src)}
            alt={cap || 'Gallery photo'}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            loading="lazy"
            decoding="async"
          />
        </div>
        {cap ? (
          <figcaption className="border-t border-slate-100 px-3 py-2 text-sm text-slate-600">{cap}</figcaption>
        ) : null}
      </figure>
    );
  }

  const s = String(src || '');
  const useIframe = /^https?:\/\//i.test(s) && isIframeVideo(s);

  return (
    <figure className="overflow-hidden rounded-sm border border-slate-200/90 bg-white shadow-sm">
      <div className="aspect-video w-full bg-slate-950">
        {useIframe ? (
          <iframe title={cap || 'Video'} src={s} className="h-full w-full" allowFullScreen loading="lazy" />
        ) : (
          <video
            src={s.startsWith('/uploads/') ? resolveImageUrl(s) : s}
            controls
            playsInline
            className="h-full w-full object-contain"
          />
        )}
      </div>
      {cap ? (
        <figcaption className="border-t border-slate-100 px-3 py-2 text-sm text-slate-600">{cap}</figcaption>
      ) : null}
    </figure>
  );
}

function Gallery() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetchWithTimeout(apiUrl('/api/gallery'));
        const data = await res.json();
        if (!cancelled) {
          setItems(Array.isArray(data) ? data : []);
          if (!res.ok) setError(true);
        }
      } catch {
        if (!cancelled) {
          setItems([]);
          setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl py-6 sm:py-10">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.25em] text-sage-600">Moments</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900">Gallery</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          Photos and videos from our brand, products, and community — updated by our team.
        </p>
        <p className="mt-5 text-sm text-slate-500">
          <Link to="/shop" className="font-semibold text-brand-600 hover:text-brand-700">
            Shop the collection
          </Link>
        </p>
      </div>

      {loading ? (
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[4/3] animate-pulse rounded-sm border border-slate-200/80 bg-slate-200/60"
            />
          ))}
        </div>
      ) : error ? (
        <p className="mt-12 text-center text-slate-600">We could not load the gallery. Please try again later.</p>
      ) : items.length === 0 ? (
        <p className="mt-12 text-center text-slate-600">No media yet — check back soon.</p>
      ) : (
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <GalleryMedia key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

export default Gallery;
