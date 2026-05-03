import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';

function IconLink({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  );
}

function IconShare({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 5.314l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186z" />
    </svg>
  );
}

/** Product page — share actions only */
export function ProductShareAndTrust({ product, productId }) {
  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/product/${encodeURIComponent(productId)}`;
  }, [productId]);

  const shareTitle = product?.name || 'Product';

  const encodedUrl = encodeURIComponent(shareUrl);

  const whatsappHref = useMemo(
    () => `https://wa.me/?text=${encodeURIComponent(`${shareTitle}\n${shareUrl}`)}`,
    [shareTitle, shareUrl]
  );

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Product link copied');
    } catch {
      toast.error('Could not copy link');
    }
  }, [shareUrl]);

  const tryNativeShare = useCallback(async () => {
    if (!navigator.share) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({ title: shareTitle, text: shareTitle, url: shareUrl });
    } catch (e) {
      if (e?.name !== 'AbortError') copyLink();
    }
  }, [copyLink, shareTitle, shareUrl]);

  return (
    <div className="mt-5 border-t border-stone-100 pt-5">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-700">
        <IconShare className="h-4 w-4 text-brand-500" />
        Share this product
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {'share' in navigator && typeof navigator.share === 'function' ? (
          <button
            type="button"
            onClick={tryNativeShare}
            className="inline-flex items-center gap-1.5 rounded-sm border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:border-brand-300 hover:bg-brand-50/50"
          >
            Share…
          </button>
        ) : null}
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex items-center gap-1.5 rounded-sm border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:border-brand-300 hover:bg-brand-50/50"
        >
          <IconLink className="h-3.5 w-3.5" />
          Copy link
        </button>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-sm border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-sage-700 hover:border-sage-300 hover:bg-sage-50"
        >
          WhatsApp
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-sm border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-[#0866FF] hover:border-[#0866FF]/40 hover:bg-[#0866FF]/5"
        >
          Facebook
        </a>
      </div>
    </div>
  );
}
