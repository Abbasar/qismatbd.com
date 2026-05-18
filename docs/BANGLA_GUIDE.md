# Qismat Web — সম্পূর্ণ বাংলা গাইড (A থেকে Z)

এই ডকুমেন্ট Qismat ই-কমার্স প্রজেক্টের **সেটআপ, আর্কিটেকচার, ফিচার ও কোড নেভিগেশন** বাংলায় ব্যাখ্যা করে।  
কোডে বাংলা সেকশন কমেন্ট দেখতে `server/` ও `client/src/` এর মূল ফাইলগুলো খুলুন।

---

## সূচিপত্র

1. [প্রজেক্ট কী?](#১-প্রজেক্ট-কী)
2. [ফোল্ডার স্ট্রাকচার](#২-ফোল্ডার-স্ট্রাকচার)
3. [লোকাল সেটআপ (XAMPP)](#৩-লোকাল-সেটআপ-xampp)
4. [চালানোর কমান্ড](#৪-চালানোর-কমান্ড)
5. [ডাটাবেস](#৫-ডাটাবেস)
6. [আর্কিটেকচার](#৬-আর্কিটেকচার)
7. [ফ্রন্টএন্ড রাউট](#৭-ফ্রন্টএন্ড-রাউট)
8. [অর্ডার ফ্লো](#৮-অর্ডার-ফ্লো)
9. [Facebook Pixel ও CAPI](#৯-facebook-pixel-ও-capi)
10. [Facebook Ad Landing Page](#১০-facebook-ad-landing-page)
11. [Admin প্যানেল](#১১-admin-প্যানেল)
12. [Steadfast কুরিয়ার](#১২-steadfast-কুরিয়ার)
13. [পেমেন্ট](#১৩-পেমেন্ট)
14. [Production ডিপ্লয়](#১৪-production-ডিপ্লয়)
15. [সমস্যা সমাধান](#১৫-সমস্যা-সমাধান)
16. [API তালিকা](#১৬-api-তালিকা)

---

## ১. প্রজেক্ট কী?

**Qismat** একটি ফল/ই-কমার্স ওয়েবসাইট:

| দিক | বিবরণ |
|-----|--------|
| **গ্রাহক** | পণ্য দেখা, কার্ট, চেকআউট, অ্যাকাউন্ট, উইশলিস্ট, অর্ডার ট্র্যাক |
| **অ্যাডমিন** | পণ্য, অর্ডার, কুপন, কুরিয়ার, সেটিংস, বিজ্ঞাপন ল্যান্ডিং |
| **মার্কেটিং** | Meta Pixel (ব্রাউজার) + Conversions API (সার্ভার) |
| **ল্যান্ডিং** | `/lp/:id` — Facebook বিজ্ঞাপনের জন্য পণ্যভিত্তিক পেজ |

**টেক স্ট্যাক**

- Frontend: React 18 + Vite + Tailwind CSS + React Router
- Backend: Node.js + Express + MySQL (mysql2)
- Auth: JWT + Google OAuth (ঐচ্ছিক)
- ফাইল: Multer → `server/uploads/`

---

## ২. ফোল্ডার স্ট্রাকচার

```
Qismat-web/
├── client/                    # React (ব্রাউজার UI)
│   ├── src/
│   │   ├── pages/             # Home, Shop, Checkout, Admin…
│   │   ├── components/        # Header, LandingCheckout…
│   │   ├── utils/             # api, auth, cart, video…
│   │   ├── context/           # StorefrontContext
│   │   ├── App.jsx            # সব URL রাউট
│   │   └── main.jsx           # React শুরু
│   ├── dist/                  # npm run build এর আউটপুট
│   └── .env                   # VITE_API_URL ইত্যাদি
│
├── server/                    # Express API
│   ├── app.js                 # সার্ভার এন্ট্রি (cPanel startup)
│   ├── index.js               # app.js চালায় (পিছনের সামঞ্জস্য)
│   ├── db.js                  # MySQL pool
│   ├── routes/                # API রাউট ফাইল
│   ├── utils/                 # facebookCapi, steadfast, email…
│   ├── middleware/auth.js     # JWT
│   ├── structure.sql          # DB স্কিমা
│   ├── data.sql               # সিড ডেটা
│   └── uploads/               # ছবি/ভিডিও
│
├── docs/
│   ├── BANGLA_GUIDE.md       # এই ফাইল
│   └── API.md                 # সব API এন্ডপয়েন্ট
│
└── package.json               # root build স্ক্রিপ্ট
```

---

## ৩. লোকাল সেটআপ (XAMPP)

### ধাপ ১ — MySQL

1. XAMPP Control Panel → **MySQL Start**
2. phpMyAdmin → নতুন ডাটাবেস (যেমন `qismat`)
3. **Import** → `server/structure.sql`
4. (ঐচ্ছিক) `server/data.sql` — ডিফল্ট সেটিংস/ডেমো

### ধাপ ২ — Server environment

```bash
copy server\.env.example server\.env
```

`server/.env` এ সম্পাদনা করুন:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_DATABASE=qismat
PORT=4000
JWT_SECRET=এখানে_দীর্ঘ_র্যান্ডম_স্ট্রিং_দিন
BACKEND_URL=http://localhost:4000
FRONTEND_URL=http://localhost:5173
```

### ধাপ ৩ — Client environment

```bash
copy client\.env.example client\.env
```

```env
VITE_API_URL=http://localhost:4000
```

### ধাপ ৪ — Dependencies

```bash
cd server && npm install
cd ../client && npm install
```

---

## ৪. চালানোর কমান্ড

দুই টার্মিনাল:

```bash
# টার্মিনাল ১ — API (পোর্ট 4000)
cd server
npm start

# টার্মিনাল ২ — React dev (পোর্ট 5173)
cd client
npm run dev
```

**চেক:**

- সাইট: http://localhost:5173
- API health: http://localhost:4000/api/health → `"database": "connected"`

**Production build:**

```bash
cd client && npm run build    # → client/dist/
```

Root থেকে একসাথে:

```bash
npm run prepare:upload
```

---

## ৫. ডাটাবেস

### মূল টেবিল

| টেবিল | কাজ |
|--------|-----|
| `users` | admin / customer, পাসওয়ার্ড হ্যাশ |
| `products` | পণ্য, JSON: gallery, sizes, colors, pricing_options, landing_* |
| `orders` | অর্ডার, items JSON, Steadfast ফিল্ড |
| `settings` | key-value (Pixel, shipping, SMTP…) |
| `coupons` | ডিসকাউন্ট কোড |
| `couriers` | কুরিয়ার ও শিপিং রেট |
| `brands` | ব্র্যান্ড লোগো |
| `gallery_items` | গ্যালারি ছবি/ভিডিও |
| `wishlist` | ইউজার উইশলিস্ট |
| `reviews` | পণ্য রিভিউ |
| `payments` | অনলাইন পেমেন্ট রেকর্ড |

### গুরুত্বপূর্ণ `settings` কী

`structure.sql` ফাইলের উপরে সম্পূর্ণ তালিকা আছে। কিছু উদাহরণ:

| setting_key | ব্যবহার |
|-------------|---------|
| `facebook_pixel_id` | ব্রাউজার Pixel |
| `facebook_capi_access_token` | সার্ভার Purchase |
| `shipping_inside_dhaka` | ঢাকার ভিতর ডেলিভারি চার্জ |
| `theme_primary_color` | সাইট রঙ |
| `steadfast_api_key` | Steadfast API |
| `ssl_store_id` | SSLCommerz |

পাবলিক সেটিংস (লগইন ছাড়া): `server/routes/settings.js` → `PUBLIC_SETTING_KEYS`

---

## ৬. আর্কিটেকচার

```
[ব্রাউজার React :5173]
        │ fetch /api/*
        ▼
[Express :4000] ──► [MySQL]
        │
        ├──► /uploads (স্ট্যাটিক ফাইল)
        ├──► Facebook Graph API (CAPI)
        ├──► SSLCommerz (পেমেন্ট)
        └──► Steadfast (কুরিয়ার)
```

**Dev:** Vite প্রক্সি করে `/api` → `localhost:4000`  
**Prod:** Apache/nginx `dist/` সার্ভ করে + `/api` reverse proxy

---

## ৭. ফ্রন্টএন্ড রাউট

`client/src/App.jsx` এ সংজ্ঞায়িত:

| URL | কম্পোনেন্ট | নোট |
|-----|------------|------|
| `/` | Home | হিরো, প্রমো |
| `/shop` | Shop | পণ্য তালিকা |
| `/product/:id` | ProductPage | সাধারণ পণ্য পেজ |
| `/lp/:id` | ProductLanding | Facebook ad ল্যান্ডিং |
| `/cart` | Cart | localStorage কার্ট |
| `/checkout` | Checkout | পূর্ণ চেকআউট |
| `/order-success` | OrderSuccess | Pixel Purchase |
| `/account` | MyAccount | লগইন লাগে |
| `/wishlist` | Wishlist | লগইন লাগে |
| `/admin` | Admin | admin রোল |
| `/login`, `/register` | Auth | |

**সব পেজে (admin ছাড়া):** Header, Footer, ContactFloat  
**গ্লোবাল:** ThemeBootstrap, FacebookPixelBootstrap

---

## ৮. অর্ডার ফ্লো

### সাধারণ চেকআউট (`Checkout.jsx`)

1. কার্ট → `/checkout`
2. `POST /api/orders` — গ্রাহক তথ্য, আইটেম, কুপন, `_fbp`/`_fbc` কুকি
3. **পেমেন্ট অনুযায়ী:**
   - **COD / ম্যানুয়াল bKash-Nagad** → সাথে সাথে success → `sendFacebookPurchaseEvent` (server)
   - **Online / API bKash-Nagad** → SSLCommerz URL → পেমেন্ট OK → `payment.js` → redirect `/order-success`
4. **OrderSuccess** → `fbq('track', 'Purchase')` ব্রাউজারে

### ল্যান্ডিং চেকআউট (`LandingCheckout.jsx`)

- `/lp/:id` পেজে এমবেড
- এক পণ্য, সরল ফর্ম
- একই `POST /api/orders` API

### event_id (ডুপ্লিকেট এড়ানো)

ক্লায়েন্ট ও সার্ভার দুটোই `purchase-order-{orderId}` ব্যবহার করে।

---

## ৯. Facebook Pixel ও CAPI

### ব্রাউজার (Pixel)

- ফাইল: `client/src/components/FacebookPixelBootstrap.jsx`
- Admin → `facebook_pixel_id` সেভ করলে লোড হয়
- ইভেন্ট: `PageView` (সব পেজ), `Purchase` (OrderSuccess)

### সার্ভার (Conversions API)

- ফাইল: `server/utils/facebookCapi.js`
- লাগে: **Pixel ID + CAPI access token** (দুটোই)
- Token: Events Manager → Pixel Settings → Generate access token
- ট্রিগার: COD অর্ডার তৈরি / অনলাইন পেমেন্ট সফল

### টেস্ট

1. Admin-এ Pixel ID + token সেভ
2. MySQL-এ `settings` টেবিল চেক
3. COD টেস্ট অর্ডার
4. Events Manager → Test events (test code দিলে)
5. Server log: `Facebook CAPI Purchase error` খুঁজুন

---

## ১০. Facebook Ad Landing Page

### Admin

পণ্য এডিট → **Facebook ad landing page** চালু  
ফিল্ড: `landing_slides` (JSON), `landing_video_url`

### পাবলিক URL

`https://yoursite.com/lp/123` (123 = product id)

### ফাইল

| ফাইল | কাজ |
|------|-----|
| `ProductLanding.jsx` | পেজ লেআউট, API `GET /api/products/landing/:id` |
| `LandingHero.jsx` | স্লাইড + ভিডিও |
| `LandingCheckout.jsx` | ইন-পেজ অর্ডার ফর্ম |
| `utils/video.js` | YouTube/Vimeo vs লোকাল ভিডিও |

API শুধু `landing_enabled = 1` পণ্য দেয়।

---

## ১১. Admin প্যানেল

ফাইল: `client/src/pages/Admin.jsx` (বড় এক ফাইল)

| ট্যাব/এরিয়া | কাজ |
|--------------|-----|
| Products | CRUD, ল্যান্ডিং, ছবি |
| Orders | স্ট্যাটাস, Steadfast, ট্র্যাকিং |
| Coupons | ডিসকাউন্ট |
| Settings | শিপিং, Meta, SMTP, পেমেন্ট |
| Couriers | কুরিয়ার রেট |
| Brands / Categories | ক্যাটালগ |
| Gallery / Hero | মার্কেটিং কন্টেন্ট |

সেটিং সেভ: `PUT /api/settings/:key` — `updateSetting()` ফাংশন

---

## ১২. Steadfast কুরিয়ার

- সেটিংস: Admin → Steadfast (API key, secret, auto dispatch)
- ম্যানুয়াল: Admin → Orders → Dispatch
- বাল্ক: `POST /api/orders/steadfast/bulk-dispatch`
- Webhook: `POST /api/webhooks/steadfast` (Bearer token)

অর্ডার ফিল্ড: `tracking_number`, `steadfast_consignment_id`, `steadfast_invoice`

---

## ১৩. পেমেন্ট

| ধরন | ফ্লো |
|------|------|
| COD | সরাসরি অর্ডার confirm |
| bKash/Nagad manual | নম্বর দেখিয়ে অর্ডার |
| bKash/Nagad API | SSLCommerz gateway |
| Online (card) | SSLCommerz |

কলব্যাক: `server/routes/payment.js` — success/fail/cancel/ipn

---

## ১৪. Production ডিপ্লয়

1. `server/.env` — production DB, `JWT_SECRET`, `CORS_ORIGIN`, `NODE_ENV=production`
2. `client/.env.production` — `VITE_API_URL` বা খালি (same-origin)
3. `npm run build` in client
4. `client/dist` → public_html
5. Node app চালু (server folder)
6. `structure.sql` + `data.sql` production DB-তে

**সুরক্ষা:** production-এ দুর্বল `JWT_SECRET` দিলে সার্ভার বন্ধ হয়ে যায় (`server/index.js` চেক)।

---

## ১৫. সমস্যা সমাধান

| সমস্যা | সমাধান |
|--------|---------|
| API 503 / database disconnected | XAMPP MySQL চালু করুন, `.env` DB নাম মিলান |
| সেটিংস সেভ হয় না | MySQL চালু? Admin লগইন? Network tab-এ PUT response দেখুন |
| Facebook ইভেন্ট নেই | Pixel ID + token + টেস্ট অর্ডার; server log চেক |
| `/lp/id` 404 | Admin-এ landing_enabled চালু? |
| ছবি দেখা যায় না | `server/uploads` আছে? `BACKEND_URL` ঠিক? |
| CORS error | `CORS_ORIGIN` এ আপনার ডোমেইন যোগ করুন |

---

## ১৬. API তালিকা

সম্পূর্ণ এন্ডপয়েন্ট: **[API.md](./API.md)**

---

## কোডে বাংলা কমেন্ট — কোথায়?

| এলাকা | ফাইল |
|--------|------|
| সার্ভার শুরু | `server/app.js` |
| DB | `server/db.js` |
| Auth | `server/middleware/auth.js` |
| Facebook CAPI | `server/utils/facebookCapi.js` |
| অর্ডার | `server/routes/orders.js` (শীর্ষ) |
| সেটিংস | `server/routes/settings.js` (শীর্ষ) |
| রাউট | `client/src/App.jsx` |
| API ইউটিল | `client/src/utils/api.js`, `auth.js`, `cart.js`, `video.js` |
| Pixel | `FacebookPixelBootstrap.jsx`, `OrderSuccess.jsx` |
| ল্যান্ডিং | `ProductLanding.jsx`, `LandingCheckout.jsx` |
| Admin | `Admin.jsx` (শীর্ষে ওভারভিউ কমেন্ট) |

---

*সর্বশেষ আপডেট: প্রজেক্ট সোর্স অনুযায়ী তৈরি। নতুন ফিচার যোগ হলে এই ফাইল আপডেট করুন।*
