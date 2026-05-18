# Qismat API — সম্পূর্ণ এন্ডপয়েন্ট তালিকা

Base URL (dev): `http://localhost:4000`  
Client dev-এ Vite প্রক্সি: same-origin `/api/...`

**Auth:** বেশিরভাগ admin রাউটে `Authorization: Bearer <JWT>` লাগে।  
**Admin:** `role: admin` প্রয়োজন।

---

## Health & Admin overview

| Method | Path | Auth | বিবরণ |
|--------|------|------|--------|
| GET | `/api/health` | না | DB সংযোগ চেক |
| GET | `/api/admin/overview` | Admin | পণ্য/ইউজার/অর্ডার কাউন্ট |

---

## Auth — `/api/auth`

| Method | Path | Auth | বিবরণ |
|--------|------|------|--------|
| POST | `/login` | না | ইমেইল+পাসওয়ার্ড → JWT |
| POST | `/register` | না | নতুন অ্যাকাউন্ট |
| POST | `/verify-email` | না | ইমেইল ভেরিফিকেশন কোড |
| POST | `/resend-verification-code` | না | কোড পুনরায় |
| POST | `/google` | না | Google OAuth টোকেন |
| GET | `/me` | Bearer (ঐচ্ছিক) | বর্তমান ইউজার |
| POST | `/forgot-password` | না | রিসেট লিংক/কোড |
| POST | `/reset-password` | না | নতুন পাসওয়ার্ড |

---

## Products — `/api/products`

| Method | Path | Auth | বিবরণ |
|--------|------|------|--------|
| GET | `/` | না | সক্রিয় পণ্য তালিকা |
| GET | `/highlights` | না | হোম হাইলাইট |
| GET | `/landing/:id` | না | ল্যান্ডিং পেজ (landing_enabled) |
| GET | `/:id` | না | এক পণ্য |
| POST | `/` | Admin | নতুন পণ্য (+ multipart) |
| PUT | `/:id` | Admin | আপডেট |
| DELETE | `/:id` | Admin | মুছুন |

### Categories meta

| Method | Path | Auth | বিবরণ |
|--------|------|------|--------|
| GET | `/meta/categories` | না | ক্যাটাগরি + ছবি |
| POST | `/meta/categories` | Admin | ক্যাটাগরি যোগ |
| DELETE | `/meta/categories` | Admin | ক্যাটাগরি মুছুন |
| POST | `/meta/categories/image` | Admin | ক্যাটাগরি ছবি |
| DELETE | `/meta/categories/image` | Admin | ছবি মুছুন |

---

## Orders — `/api/orders`

| Method | Path | Auth | বিবরণ |
|--------|------|------|--------|
| GET | `/` | Admin | সব অর্ডার |
| GET | `/user/:userId` | User/Admin | ইউজারের অর্ডার |
| GET | `/track/:tracking_number` | না | ট্র্যাকিং |
| GET | `/:id` | না/Auth | এক অর্ডার |
| POST | `/` | না* | নতুন অর্ডার তৈরি |
| PUT | `/:id/status` | Admin | স্ট্যাটাস আপডেট |
| POST | `/:id/dispatch` | Admin | কুরিয়ার ডিসপ্যাচ |
| POST | `/:id/sync-steadfast` | Admin | Steadfast সিঙ্ক |
| POST | `/steadfast/bulk-dispatch` | Admin | বাল্ক ডিসপ্যাচ |
| DELETE | `/admin/all` | Admin | সব অর্ডার মুছুন (বিপজ্জনক) |

\* অতিথি চেকআউট সমর্থিত; লগইন থাকলে `user_id` বাঁধা যায়।

**POST body (সংক্ষেপ):** `customerName`, `customerPhone`, `customerAddress`, `paymentType`, `items[]`, `deliveryArea`, `deliveryMethod`, `couponCode`, `facebook_fbp`, `facebook_fbc`

---

## Payment (SSLCommerz) — `/api/payment`

| Method | Path | Auth | বিবরণ |
|--------|------|------|--------|
| POST | `/success/:orderId` | না | পেমেন্ট সফল কলব্যাক |
| POST | `/fail/:orderId` | না | ব্যর্থ |
| POST | `/cancel/:orderId` | না | বাতিল |
| POST | `/ipn` | না | IPN নোটিফিকেশন |

---

## Settings — `/api/settings`

| Method | Path | Auth | বিবরণ |
|--------|------|------|--------|
| GET | `/` | না** | সেটিংস (admin সব, গেস্ট পাবলিক কী) |
| PUT | `/:key` | Admin | এক কী আপডেট `{ value }` |
| PUT | `/steadfast` | Admin | Steadfast বাল্ক সেভ |
| POST | `/steadfast-test` | Admin | API কানেকশন টেস্ট |
| POST | `/steadfast-balance` | Admin | ওয়ালেট ব্যালেন্স |

\*\* `PUBLIC_SETTING_KEYS` — `server/routes/settings.js`

---

## Coupons — `/api/coupons`

| Method | Path | Auth | বিবরণ |
|--------|------|------|--------|
| POST | `/validate` | না | কুপন যাচাই |
| GET | `/` | Admin | তালিকা |
| POST | `/` | Admin | তৈরি |
| PUT | `/:id` | Admin | আপডেট |
| DELETE | `/:id` | Admin | মুছুন |

---

## Couriers — `/api/couriers`

| Method | Path | Auth | বিবরণ |
|--------|------|------|--------|
| GET | `/delivery-options` | না | চেকআউট ডেলিভারি অপশন |
| GET | `/` | Admin | তালিকা |
| GET | `/:id` | Admin | এক কুরিয়ার |
| POST | `/` | Admin | তৈরি |
| PUT | `/:id` | Admin | আপডেট |
| DELETE | `/:id` | Admin | মুছুন |

---

## Users — `/api/users`

| Method | Path | Auth | বিবরণ |
|--------|------|------|--------|
| GET | `/` | Admin | ইউজার তালিকা |
| PUT | `/:id/role` | Admin | রোল পরিবর্তন |
| DELETE | `/:id` | Admin | মুছুন |

---

## Brands — `/api/brands`

| Method | Path | Auth | বিবরণ |
|--------|------|------|--------|
| GET | `/` | না | ব্র্যান্ড তালিকা |
| POST | `/` | Admin | তৈরি |
| POST | `/:id/logo` | Admin | লোগো আপলোড |
| DELETE | `/:id/logo` | Admin | লোগো মুছুন |
| DELETE | `/:id` | Admin | ব্র্যান্ড মুছুন |

---

## Reviews — `/api/reviews`

| Method | Path | Auth | বিবরণ |
|--------|------|------|--------|
| GET | `/product/:productId` | না | পণ্য রিভিউ |
| GET | `/storefront` | না | হোম রিভিউ |
| GET | `/admin/all` | Admin | সব রিভিউ |
| POST | `/admin` | Admin | অ্যাডমিন রিভিউ যোগ |
| GET | `/:id` | না | এক রিভিউ |
| POST | `/` | Auth | গ্রাহক রিভিউ |
| PUT | `/:id` | Auth | এডিট |
| DELETE | `/:id` | Auth | মুছুন |

---

## Wishlist — `/api/wishlist`

| Method | Path | Auth | বিবরণ |
|--------|------|------|--------|
| POST | `/add` | Auth | যোগ |
| GET | `/:userId` | Auth | তালিকা |
| DELETE | `/:userId/:productId` | Auth | সরান |

---

## Gallery — `/api/gallery`

| Method | Path | Auth | বিবরণ |
|--------|------|------|--------|
| GET | `/` | না | গ্যালারি আইটেম |
| POST | `/` | Admin | যোগ (multipart) |
| DELETE | `/:id` | Admin | মুছুন |

---

## Locations — `/api/locations`

| Method | Path | Auth | বিবরণ |
|--------|------|------|--------|
| GET | `/districts` | না | জেলা তালিকা |
| GET | `/upazilas` | না | উপজেলা (`?district=`) |
| POST | `/reverse-geo` | না | জিও থেকে জেলা অনুমান |

---

## Upload — `/api/upload`

| Method | Path | Auth | বিবরণ |
|--------|------|------|--------|
| POST | `/hero` | Admin | হিরো ছবি |
| POST | `/logo` | Admin | স্টোর লোগো |
| POST | `/advertise/*` | Admin | বিজ্ঞাপন মিডিয়া |

---

## Newsletter — `/api/newsletter`

| Method | Path | Auth | বিবরণ |
|--------|------|------|--------|
| POST | `/subscribe` | না | ইমেইল সাবস্ক্রাইব |

---

## Notifications — `/api/admin/notifications`

| Method | Path | Auth | বিবরণ |
|--------|------|------|--------|
| GET | `/` | Admin | নোটিফিকেশন |
| GET | `/unread-count` | Admin | অপঠিত সংখ্যা |
| PUT | `/:id/read` | Admin | পড়া হিসেবে |
| PUT | `/read-all` | Admin | সব পড়া |
| DELETE | `/:id` | Admin | মুছুন |
| DELETE | `/` | Admin | সব মুছুন |

---

## Webhooks — `/api/webhooks`

| Method | Path | Auth | বিবরণ |
|--------|------|------|--------|
| POST | `/steadfast` | Bearer | Steadfast স্ট্যাটাস আপডেট |

---

## Static files

| Path | বিবরণ |
|------|--------|
| GET `/uploads/*` | আপলোড ছবি/ভিডিও |

---

*বিস্তারিত request/response body দেখতে সংশ্লিষ্ট `server/routes/*.js` ফাইল খুলুন।*
