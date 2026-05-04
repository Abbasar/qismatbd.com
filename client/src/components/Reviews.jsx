import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getAuthHeader, getAuthToken, getCurrentUser } from '../utils/auth';
import { apiUrl, fetchWithTimeout } from '../utils/api';

function Reviews({ productId }) {
  const [reviews, setReviews] = useState([]);
  const [newReview, setNewReview] = useState({ rating: 5, title: '', comment: '' });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const user = getCurrentUser();

  useEffect(() => {
    if (Number.isFinite(Number(productId)) && Number(productId) > 0) {
      fetchReviews();
    } else {
      setLoading(false);
      setReviews([]);
    }
  }, [productId]);

  const fetchReviews = async () => {
    const pid = Number(productId);
    if (!Number.isFinite(pid) || pid <= 0) return;
    try {
      const response = await fetchWithTimeout(apiUrl(`/api/reviews/product/${pid}`));
      if (!response.ok) throw new Error('Unable to load reviews');
      setReviews(await response.json());
    } catch (error) {
      console.error('Error fetching reviews:', error);
      setMessage('Could not load reviews right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();

    if (!user) {
      toast.error('Please log in to submit a review');
      return;
    }
    if (!getAuthToken()) {
      toast.error('Session token missing — please log out and log in again, then try.');
      return;
    }
    const pid = Number(productId);
    if (!Number.isFinite(pid) || pid <= 0) {
      toast.error('Invalid product — refresh the page and try again.');
      return;
    }
    const comment = String(newReview.comment || '').trim();
    if (!comment) {
      toast.error('Please write a review comment.');
      return;
    }

    try {
      const response = await fetch(apiUrl('/api/reviews'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          product_id: pid,
          rating: Number(newReview.rating),
          title: newReview.title,
          comment,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setNewReview({ rating: 5, title: '', comment: '' });
        setMessage('Review submitted successfully.');
        toast.success('Thank you — your review was saved.');
        fetchReviews();
        return;
      }
      const msg = data.message || 'Unable to submit review right now.';
      setMessage(msg);
      if (response.status === 401) {
        toast.error('Session expired — please log in again.');
      } else {
        toast.error(msg);
      }
    } catch (error) {
      console.error('Error submitting review:', error);
      setMessage('Unable to submit review right now.');
      toast.error('Network error — could not reach the server.');
    }
  };

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : 0;

  const pidOk = Number.isFinite(Number(productId)) && Number(productId) > 0;

  if (!pidOk) {
    return (
      <div className="rounded-sm border border-stone-200 bg-stone-50 p-5 text-sm text-stone-600">
        Product reviews are unavailable.
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Reviews Summary */}
      <div className="rounded-sm border border-stone-200 bg-stone-50 p-5 sm:p-6">
        <h3 className="mb-3 text-2xl font-semibold text-stone-900">Customer Reviews</h3>
        
        <div className="mb-5 flex items-center gap-5 sm:gap-6">
          <div className="text-center">
            <p className="text-4xl font-bold text-stone-900">{avgRating}</p>
            <div className="flex gap-1 justify-center mt-2">
              {[...Array(5)].map((_, i) => (
                <span key={i} className={i < Math.round(avgRating) ? '⭐' : '☆'}>
                  {i < Math.round(avgRating) ? '⭐' : '☆'}
                </span>
              ))}
            </div>
            <p className="text-sm text-stone-600 mt-2">{reviews.length} reviews</p>
          </div>
        </div>

        {/* Reviews List */}
        {message && <p className="mb-4 rounded-sm bg-white p-3 text-sm text-stone-700">{message}</p>}
        {loading ? (
          <p className="text-stone-600">Loading reviews...</p>
        ) : reviews.length === 0 ? (
          <p className="text-stone-600">No reviews yet. Be the first to review!</p>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => (
              <div key={review.id} className="rounded-sm border border-stone-200 bg-white p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-semibold text-stone-900">{review.user_name}</p>
                    <div className="flex gap-1">
                      {[...Array(5)].map((_, i) => (
                        <span key={i}>
                          {i < review.rating ? '⭐' : '☆'}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-stone-500">
                    {new Date(review.created_at).toLocaleDateString()}
                  </p>
                </div>
                
                {review.title && (
                  <p className="font-semibold text-stone-900 mb-1">{review.title}</p>
                )}
                <p className="text-stone-600 text-sm">{review.comment}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review Form */}
      {user ? (
        <form onSubmit={handleSubmitReview} className="rounded-sm border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="mb-3 text-xl font-semibold text-stone-900">Share Your Review</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-stone-900 mb-2">Rating</label>
              <select
                value={newReview.rating}
                onChange={(e) => setNewReview({ ...newReview, rating: e.target.value })}
                className="w-full rounded-sm border border-stone-200 px-4 py-3"
              >
                <option value="5">⭐⭐⭐⭐⭐ Excellent</option>
                <option value="4">⭐⭐⭐⭐ Good</option>
                <option value="3">⭐⭐⭐ Average</option>
                <option value="2">⭐⭐ Poor</option>
                <option value="1">⭐ Very Poor</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-stone-900 mb-2">Title</label>
              <input
                type="text"
                value={newReview.title}
                onChange={(e) => setNewReview({ ...newReview, title: e.target.value })}
                placeholder="Summary of your review"
                className="w-full rounded-sm border border-stone-200 px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-stone-900 mb-2">Your Review</label>
              <textarea
                value={newReview.comment}
                onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })}
                placeholder="Share your experience with this product"
                required
                className="w-full rounded-sm border border-stone-200 px-4 py-3"
                rows="4"
              />
            </div>

            <button
              type="submit"
              className="rounded-sm bg-brand-600 px-6 py-3 font-semibold text-white transition hover:bg-brand-700"
            >
              Submit Review
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-sm border border-stone-200 bg-blue-50 p-5 text-center sm:p-6">
          <p className="mb-3 text-stone-600">Please login to share your review</p>
          <a href="/login" className="inline-block rounded-sm bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700">
            Login Now
          </a>
        </div>
      )}
    </div>
  );
}

export default Reviews;