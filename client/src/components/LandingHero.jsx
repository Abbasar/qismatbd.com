import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import '../components/PrevPromo.css';
import './LandingHero.css';
import { resolveImageUrl } from '../utils/image';

/**
 * Homepage-style bazaar hero; images from product landing_slides (admin), not site hero_slides.
 */
export default function LandingHero({ productName, promoSlides, heroSrc }) {
  const slides = promoSlides.length > 0 ? promoSlides : heroSrc ? [heroSrc] : [];

  if (!slides.length) return null;

  return (
    <section
      className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 px-3 sm:px-4"
      aria-label="প্রোমো ছবি"
    >
      <div className="mx-auto max-w-7xl pb-2 sm:pb-3">
        <div className="hero-bazaar-frame rounded-sm border-2 border-stone-300/90 bg-gradient-to-b from-amber-50/80 to-stone-100/90 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] sm:p-2">
          <div className="relative rounded-[2px] border border-stone-600/20 bg-stone-200/60 ring-1 ring-black/5">
            <div className="overflow-hidden rounded-[2px]">
              <Swiper
                modules={[Autoplay, Pagination]}
                loop={slides.length > 1}
                speed={700}
                slidesPerView={1}
                spaceBetween={0}
                autoplay={
                  slides.length > 1
                    ? {
                        delay: 5000,
                        disableOnInteraction: false,
                        pauseOnMouseEnter: true,
                      }
                    : false
                }
                pagination={slides.length > 1 ? { clickable: true } : false}
                className="hero-swiper hero-swiper--bazaar hero-swiper--landing w-full"
              >
                {slides.map((src, idx) => (
                  <SwiperSlide key={`${src}-${idx}`} className="!h-auto">
                    <div className="relative aspect-[5/3] w-full sm:aspect-[21/9] md:aspect-[2.35/1]">
                      <img
                        src={resolveImageUrl(src)}
                        alt={`${productName} ${idx + 1}`}
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
      </div>
    </section>
  );
}
