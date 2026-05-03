import { Link } from 'react-router-dom';

function About() {
  return (
    <div className="mx-auto max-w-6xl py-6 sm:py-8">
      {/* Header */}
      <div className="text-center mb-16">
        <p className="text-sm uppercase tracking-[0.25em] text-sage-600">About Us</p>
        <h1 className="text-4xl font-bold mt-2">Our Story</h1>
        <p className="text-stone-600 mt-4 text-lg">Qismat is your destination for quality products and exceptional service.</p>
      </div>

      {/* Who We Are */}
      <section className="mb-16">
        <div className="grid items-center gap-8 md:grid-cols-2 lg:gap-10">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-sm border border-stone-200/80 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.35)]">
            <img
              src="https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=1200&q=80"
              alt="Qismat — thoughtful commerce and teamwork"
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-brand-900/25 via-transparent to-sage-600/15" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-stone-900 mb-4">Who We Are</h2>
            <p className="text-stone-600 mb-4">
              Qismat is an e-commerce platform dedicated to bringing quality products to customers across Bangladesh. 
              We started with a simple mission: to make online shopping convenient, affordable, and accessible to everyone.
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
              <div className="text-4xl font-bold mb-2">10K+</div>
              <p className="text-stone-400">Happy Customers</p>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">500+</div>
              <p className="text-stone-400">Products</p>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">50+</div>
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
        <p className="text-stone-600 mb-8">Explore our collection of premium products today.</p>
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