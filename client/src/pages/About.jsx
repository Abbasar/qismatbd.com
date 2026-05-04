import { Link } from 'react-router-dom';

function About() {
  return (
    <div className="mx-auto max-w-6xl py-6 sm:py-8">
      {/* Header */}
      <div className="text-center mb-16">
        <p className="text-sm uppercase tracking-[0.25em] text-sage-600">About Us</p>
        <h1 className="text-4xl font-bold mt-2">Our Story</h1>
        <p className="text-stone-600 mt-4 text-lg">Qismat is your destination for quality products.</p>
      </div>

      {/* Who We Are — image on top, copy below */}
      <section className="mb-16">
        <div className="flex flex-col gap-8 lg:gap-10">
          <div className="relative aspect-[4/3] w-full max-w-4xl shrink-0 overflow-hidden rounded-sm border border-stone-200/80 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.35)] sm:mx-auto">
            <img
              src="images/promo-1.webp"
              alt="Qismat — thoughtful commerce and teamwork"
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-brand-900/25 via-transparent to-sage-600/15" />
          </div>
          <div className="max-w-3xl sm:mx-auto">
            <h2 className="text-3xl font-bold text-stone-900 mb-4">Who We Are</h2>
            <p className="text-stone-600 mb-4">
            QISMAT is the signature fruit brand of Hossain Ali Food & Beverage Ltd., representing a commitment to natural purity, premium quality, and trust. The brand was created to deliver fresh, healthy, and carefully cultivated fruits directly to consumers under a unified and reliable identity. All QISMAT fruits are produced in company-owned orchards located in the Chittagong Hill Tracts. Grown on fertile hill land and nurtured under controlled agricultural practices, the fruits benefit from a favorable climate and rich soil conditions. This ensures superior taste, freshness, and nutritional value. Under the QISMAT brand, Hossain Ali Food & Beverage Ltd. markets and sells a wide range of fruits, with a strong focus on quality assurance at every stage—from cultivation and harvesting to sorting, packaging, and distribution. The company maintains strict standards to ensure that only the best produce reaches customers. QISMAT stands for: Naturally grown and carefully selected fruits Consistent quality and freshness Hygienic handling and packaging A trustworthy source backed by professional agro-management By combining modern agricultural techniques with a deep respect for nature, QISMAT aims to become a recognized and trusted fruit brand in both local and international markets.
            </p>
            <p className="text-stone-600 mb-4">
              Our team is passionate about customer satisfaction and committed to providing the best shopping experience. 
              Whether you're looking for trendy fashion, premium accessories, or everyday essentials, Qismat has you covered.
            </p>
            <p className="text-stone-600">
              We believe in transparency, quality, and building long-term relationships with our customers.
            </p>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-stone-900 mb-8 text-center">Why Choose Qismat?</h2>
        <div className="grid gap-6 md:grid-cols-3 md:gap-8">
          {[
            {
              title: 'Quality Products',
              description: 'We carefully curate every product to ensure quality and value for money.',
              icon: '✓'
            },
            {
              title: 'Fast Delivery',
              description: 'Quick delivery across Bangladesh with COD and Bkash payment options.',
              icon: '🚚'
            },
            {
              title: 'Customer Support',
              description: 'Dedicated customer service team ready to help you with any queries.',
              icon: '💬'
            },
            {
              title: 'Secure Payments',
              description: 'Safe and secure payment methods to protect your transactions.',
              icon: '🔒'
            },
            {
              title: 'Easy Returns',
              description: 'Hassle-free returns and refunds within 7 days of purchase.',
              icon: '↩️'
            },
            {
              title: 'Best Prices',
              description: 'Competitive pricing and regular discounts on premium products.',
              icon: '💰'
            }
          ].map((item, index) => (
            <div key={index} className="rounded-sm border border-stone-200 bg-white p-6 text-center shadow-sm sm:p-7">
              <div className="text-4xl mb-4">{item.icon}</div>
              <h3 className="text-xl font-bold text-stone-900 mb-2">{item.title}</h3>
              <p className="text-stone-600 text-sm">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="mb-16">
        <div className="rounded-sm bg-gradient-to-br from-stone-900 to-stone-800 p-12 text-white">
          <div className="grid gap-6 text-center md:grid-cols-4 md:gap-8">
            <div>
              <div className="text-4xl font-bold mb-2">1K+</div>
              <p className="text-stone-400">Happy Customers</p>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">100+</div>
              <p className="text-stone-400">Products</p>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">10+</div>
              <p className="text-stone-400">Brands</p>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">24/7</div>
              <p className="text-stone-400">Support</p>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="text-center">
        <h2 className="text-3xl font-bold text-stone-900 mb-4">Ready to Shop?</h2>
        <p className="text-stone-600 mb-8">Explore our premium products today.</p>
        <Link
          to="/shop"
          className="inline-block rounded-sm bg-brand-600 px-8 py-4 font-semibold text-white transition hover:bg-brand-700"
        >
          Start Shopping
        </Link>
      </section>
    </div>
  );
}

export default About;