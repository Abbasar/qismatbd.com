import { useCallback, useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination } from "swiper/modules";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { addToCart, buyNow } from "../utils/cart";
import { resolveImageUrl } from "../utils/image";
import {
  canPurchaseProduct,
  customerFacingStockLabel,
  displayPriceRange,
  isPreorderProduct,
  withDefaultUnitSelection,
} from "../utils/productAvailability";

// Swiper styles
import "swiper/css";
import "swiper/css/pagination";
import "./ProductCarousel.css";

/** Outline chevron paths matching PrevPromo hero swiper (Heroicons-style 24×24) */
function ChevronLeftIcon({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      className={className}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}

function ChevronRightIcon({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      className={className}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}

const ProductCarousel = ({ title, subtitle, badge, products = [] }) => {
  const [addedId, setAddedId] = useState(null);
  const swiperRef = useRef(null);
  const [nav, setNav] = useState({ atStart: true, atEnd: false });
  const navigate = useNavigate();

  const loop = products.length > 4;

  const syncNav = useCallback((s) => {
    if (!s) return;
    if (loop) {
      setNav({ atStart: false, atEnd: false });
      return;
    }
    setNav({ atStart: s.isBeginning, atEnd: s.isEnd });
  }, [loop]);

  if (!products.length) return null;

  return (
    <section className="space-y-3 rounded-sm border border-stone-200 bg-white p-3 shadow-sm sm:space-y-4 sm:p-5 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.28em] text-sage-600">{badge}</p>
          <h2 className="mt-2 text-xl font-semibold text-stone-900 sm:text-2xl md:text-3xl">{title}</h2>
          <p className="mt-1 text-sm text-stone-600">{subtitle}</p>
        </div>
        <Link
          to="/shop"
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center self-start rounded-sm border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100 sm:self-auto"
        >
          View all
        </Link>
      </div>

      <div className="relative">
        <button
          type="button"
          className="product-carousel-nav product-carousel-nav-prev"
          aria-label="Previous products"
          disabled={!loop && nav.atStart}
          onClick={() => swiperRef.current?.slidePrev()}
        >
          <ChevronLeftIcon className="h-5 w-5 shrink-0" />
        </button>
        <button
          type="button"
          className="product-carousel-nav product-carousel-nav-next"
          aria-label="Next products"
          disabled={!loop && nav.atEnd}
          onClick={() => swiperRef.current?.slideNext()}
        >
          <ChevronRightIcon className="h-5 w-5 shrink-0" />
        </button>

        <Swiper
          modules={[Autoplay, Pagination]}
          spaceBetween={8}
          slidesPerView={2}
          loop={loop}
          autoplay={{ delay: 3200, disableOnInteraction: false }}
          pagination={{ clickable: true }}
          onSwiper={(s) => {
            swiperRef.current = s;
            syncNav(s);
          }}
          onSlideChange={syncNav}
          onReachBeginning={syncNav}
          onReachEnd={syncNav}
          breakpoints={{
            640: { spaceBetween: 12, slidesPerView: 2.2 },
            1024: { spaceBetween: 16, slidesPerView: 3.2 },
            1280: { spaceBetween: 16, slidesPerView: 4.2 },
          }}
          className="mySwiper"
        >
        {products.map((product) => (
          <SwiperSlide key={product.id}>
            <article className="group flex h-full flex-col overflow-hidden rounded-sm border border-stone-200 bg-stone-50 transition duration-300 hover:-translate-y-1 hover:shadow-md">
              <Link to={`/product/${product.id}`} className="image-container">
                <img
                  src={resolveImageUrl(product.image)}
                  alt={product.name}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  onError={(e) => { e.target.src = 'https://via.placeholder.com/400x300'; }}
                />
              </Link>
              <div className="flex flex-1 flex-col space-y-2 p-2 sm:space-y-3 sm:p-4">
                <Link to={`/product/${product.id}`} className="line-clamp-2 text-xs font-semibold leading-snug text-stone-900 hover:text-sage-600 sm:line-clamp-none sm:text-base sm:leading-normal">
                  {product.name}
                </Link>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-sage-600 sm:text-lg">
                    {(() => {
                      const pr = displayPriceRange(product);
                      const main = pr.single ? `৳${pr.min.toFixed(0)}` : `From ৳${pr.min.toFixed(0)}`;
                      const showStrike =
                        product.regular_price != null && Number(product.regular_price) > pr.min;
                      return showStrike ? (
                        <>
                          <span className="mr-1 text-sm font-normal text-stone-400 line-through">
                            ৳{Number(product.regular_price).toFixed(0)}
                          </span>
                          {main}
                        </>
                      ) : (
                        <>{main}</>
                      );
                    })()}
                  </p>
                  <span className="max-w-none text-[10px] leading-tight text-stone-500 sm:max-w-[10rem] sm:text-right sm:text-[11px]">
                    {customerFacingStockLabel(product)}
                  </span>
                </div>
                <div className="mt-auto flex flex-col gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    className="min-h-[40px] w-full rounded-sm border-2 border-stone-900 bg-white px-2 py-2 text-[11px] font-semibold text-stone-900 transition hover:bg-stone-50 disabled:border-stone-300 disabled:text-stone-400 sm:min-h-[44px] sm:px-4 sm:py-2.5 sm:text-sm"
                    disabled={!canPurchaseProduct(product)}
                    onClick={() => {
                      buyNow(withDefaultUnitSelection(product));
                      navigate('/checkout');
                    }}
                  >
                    {isPreorderProduct(product) && Number(product.stock) <= 0 ? "Pre-order" : "Buy now"}
                  </button>
                  <button
                    type="button"
                    className="min-h-[40px] w-full rounded-sm bg-brand-600 px-2 py-2 text-[11px] font-semibold text-white transition hover:bg-brand-700 disabled:bg-stone-300 sm:min-h-[44px] sm:px-4 sm:py-2.5 sm:text-sm"
                    disabled={!canPurchaseProduct(product)}
                    onClick={() => {
                      addToCart(withDefaultUnitSelection(product));
                      setAddedId(product.id);
                      toast.success(`${product.name} added to cart`);
                      window.setTimeout(() => setAddedId(null), 1100);
                    }}
                  >
                    {addedId === product.id ? 'Added' : 'Add to Cart'}
                  </button>
                </div>
              </div>
            </article>
          </SwiperSlide>
        ))}
        </Swiper>
      </div>
    </section>
  );
};

export default ProductCarousel;