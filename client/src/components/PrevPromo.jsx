import { useEffect, useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper/modules';

import 'swiper/css';
import 'swiper/css/pagination';
import './PrevPromo.css';

import { apiUrl, fetchWithTimeout } from '../utils/api';
import { resolveImageUrl } from '../utils/image';

const DEFAULT_SLIDES = [
  {
    image:
      'https://images.unsplash.com/photo-1441986300917-64667bd8cfe?auto=format&fit=crop&w=1800&q=80',
    alt: 'বিক্রয় বুথ — নতুন সংগ্রহ',
  },
  {
    image:
      'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1800&q=80',
    alt: 'বাজার থেকে সংগৃহীত',
  },
  {
    image:
      'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1800&q=80',
    alt: 'অফার ও ডিলস',
  },
];

function normalizeSlides(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const cleaned = raw
    .map((s) => ({
      image: String(s?.image || '').trim(),
      alt: String(s?.alt || 'ছবি').trim() || 'ছবি',
    }))
    .filter((s) => s.image);
  return cleaned.length ? cleaned : null;
}

const PrevPromo = () => {
  const [slides, setSlides] = useState(DEFAULT_SLIDES);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout(apiUrl('/api/settings'));
        const rows = await res.json();
        if (!Array.isArray(rows) || cancelled) return;
        const row = rows.find((r) => r.setting_key === 'hero_slides');
        if (!row?.setting_value) return;
        try {
          const parsed = JSON.parse(row.setting_value);
          const n = normalizeSlides(
            Array.isArray(parsed)
              ? parsed.map((p) => ({ image: p.image, alt: p.alt || p.title || 'Hero' }))
              : []
          );
          if (n && !cancelled) setSlides(n);
        } catch {
          /* keep default */
        }
      } catch {
        /* keep default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 px-3 sm:px-4"
      aria-label="মূল ছবি"
    >
      {/* ঘরের বাজার স্টাইল: সাদা কান্তা, পাতলা কাঠের রিং, ভেতরে শুধু ছবি */}
      <div className="mx-auto max-w-7xl">
        <div className="hero-bazaar-frame rounded-sm border-2 border-stone-300/90 bg-gradient-to-b from-amber-50/80 to-stone-100/90 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] sm:p-2">
          <div className="overflow-hidden rounded-[2px] border border-stone-600/20 bg-stone-200/60 ring-1 ring-black/5">
            <Swiper
              modules={[Autoplay, Pagination]}
              loop
              speed={700}
              slidesPerView={1}
              spaceBetween={0}
              autoplay={{
                delay: 5000,
                disableOnInteraction: false,
                pauseOnMouseEnter: true,
              }}
              pagination={{ clickable: true }}
              className="hero-swiper hero-swiper--bazaar w-full"
            >
              {slides.map((slide, idx) => (
                <SwiperSlide key={`${slide.image}-${idx}`} className="!h-auto">
                  <div className="relative aspect-[5/3] w-full sm:aspect-[21/9] md:aspect-[2.35/1]">
                    <img
                      src={resolveImageUrl(slide.image)}
                      alt={slide.alt}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading={idx === 0 ? 'eager' : 'lazy'}
                    />
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PrevPromo;
