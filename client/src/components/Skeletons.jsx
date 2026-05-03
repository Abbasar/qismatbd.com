import { motion } from 'framer-motion';

const pulse = 'animate-pulse rounded-sm bg-stone-200/80';

export function ProductCardSkeleton({ count = 4, gridClassName }) {
  const grid =
    gridClassName ||
    'grid grid-cols-2 gap-2.5 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6';
  return (
    <div className={grid}>
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: i * 0.05 }}
          className="space-y-2 rounded-sm border border-stone-100 bg-white p-2 sm:space-y-3 sm:p-4"
        >
          <div className={`aspect-[4/5] w-full ${pulse}`} />
          <div className={`h-3 w-2/3 sm:h-4 ${pulse}`} />
          <div className={`h-2.5 w-1/3 sm:h-3 ${pulse}`} />
        </motion.div>
      ))}
    </div>
  );
}

export function ProductPageSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_1fr] lg:gap-8">
      <div className={`aspect-square w-full max-w-md ${pulse}`} />
      <div className="space-y-4">
        <div className={`h-6 w-24 ${pulse}`} />
        <div className={`h-10 w-4/5 max-w-lg ${pulse}`} />
        <div className={`h-8 w-32 ${pulse}`} />
        <div className={`h-24 w-full ${pulse}`} />
        <div className={`h-12 w-full max-w-sm ${pulse}`} />
      </div>
    </div>
  );
}

export function CheckoutSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px] lg:gap-6">
      <div className="space-y-4 rounded-sm border border-stone-100 bg-white p-8">
        <div className={`h-8 w-48 ${pulse}`} />
        <div className={`h-12 w-full ${pulse}`} />
        <div className={`h-12 w-full ${pulse}`} />
        <div className={`h-28 w-full ${pulse}`} />
      </div>
      <div className={`h-64 rounded-sm ${pulse}`} />
    </div>
  );
}

export function AdminTableSkeleton({ rows = 6 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`h-12 w-full ${pulse}`} />
      ))}
    </div>
  );
}