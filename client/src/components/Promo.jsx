import { Link } from 'react-router-dom';

const Promo = () => {
    return (
        <section className="py-6 sm:py-8">
            <div className="grid gap-4 sm:gap-5 md:grid-cols-3">
                {/* Box 1: New Arrivals */}
                <div className="group relative overflow-hidden rounded-sm bg-gradient-to-br from-brand-800 to-brand-900 p-6 text-white shadow-lg transition hover:shadow-brand-500/25 sm:p-7">
                    <div className="relative z-10">
                        <span className="mb-4 inline-block rounded-sm bg-peach-500/25 px-3 py-1 text-xs font-bold text-peach-300 uppercase tracking-widest">
                            New Collection
                        </span>
                        <h3 className="text-2xl font-bold">New Arrivals</h3>
                        <p className="mt-2 text-stone-400">Check out our latest premium outfits and accessories.</p>
                        <Link to="/shop" className="mt-6 inline-flex items-center text-sm font-semibold text-peach-300 hover:underline">
                            Browse Now →
                        </Link>
                    </div>
                    {/* Background Decorative Circle */}
                    <div className="absolute -right-10 -top-10 h-32 w-32 rounded-sm bg-brand-500/15 transition-transform group-hover:scale-150"></div>
                </div>

                {/* Box 2: Special Offer */}
                <div className="group relative overflow-hidden rounded-sm bg-gradient-to-br from-brand-500 to-peach-500 p-6 text-white shadow-lg sm:p-7">
                    <div className="relative z-10">
                        <span className="mb-4 inline-block rounded-sm bg-white/20 px-3 py-1 text-xs font-bold text-white uppercase tracking-widest">
                            Limited Time
                        </span>
                        <h3 className="text-2xl font-bold">Flash Sale!</h3>
                        <p className="mt-2 text-white/95">Get up to 40% off on selected items this weekend only.</p>
                        <Link to="/shop" className="mt-6 inline-flex items-center rounded-sm bg-white px-5 py-2 text-sm font-bold text-brand-600 transition hover:bg-stone-100">
                            Grab Deal
                        </Link>
                    </div>
                    {/* Background Decorative Pattern */}
                    <div className="absolute -bottom-6 -right-6 text-white/10">
                        <svg width="120" height="120" fill="currentColor" viewBox="0 0 24 24"><path d="M11 15h2v2h-2zm0-8h2v6h-2zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" /></svg>
                    </div>
                </div>

                {/* Box 3: Fast Delivery/Support */}
                <div className="group relative overflow-hidden rounded-sm border border-stone-200 bg-white p-6 text-stone-900 shadow-sm transition hover:border-sage-500 hover:shadow-sage-glow sm:p-7">
                    <div className="relative z-10">
                        <span className="mb-4 inline-block rounded-sm bg-stone-100 px-3 py-1 text-xs font-bold text-stone-500 uppercase tracking-widest">
                            Customer Service
                        </span>
                        <h3 className="text-2xl font-bold">Fast Delivery</h3>
                        <p className="mt-2 text-stone-600">Enjoy reliable Cash on Delivery and Bkash payments all over BD.</p>
                        <Link to="/shop" className="mt-6 inline-flex items-center text-sm font-semibold text-stone-900 hover:underline">
                            Shop now →
                        </Link>
                    </div>
                </div>
            </div>
        </section>

    )
};

export default Promo;