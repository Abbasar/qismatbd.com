# Shared hosting এ Qismat আপলোড (সংক্ষেপ)

হোস্টে **PHP static site + MySQL** সাধারণ; **Node.js API** চালাতে হোস্টে **Node.js** সাপোর্ট লাগবে (অনেক cPanel এ “Setup Node.js App” আছে)। না থাকলে API আলাদা VPS/সার্ভিসে চালাতে হবে।

---

## ১) MySQL (cPanel)

1. **MySQL® Databases** এ ডাটাবেজ `qismyirz_qismat` ও ইউজার বানিয়ে অল প্রিভিলেজ দিন।
2. **phpMyAdmin** → ওই ডাটাবেস সিলেক্ট → **Import** → `server/structure.sql` তারপর `server/data.sql`।

---

## ২) Backend (Node API)

1. পিসিতে: `server` ফোল্ডারে `.env` তৈরি — `server/.env.example` কপি করে ভরুন  
   (`DB_*`, `JWT_SECRET`, `NODE_ENV=production`, `BACKEND_URL`, `FRONTEND_URL`, `CORS_ORIGIN`, ইত্যাদি)।
2. লাইভে আপলোড করুন: পুরো **`server/`** (কোড + `package.json`; **`node_modules` আপলোড করবেন না**, সার্ভারে `npm install --production` চালাবেন)।
3. cPanel **Node.js** অ্যাপ: application root = যে ফোল্ডারে `index.js`, startup file `index.js`, `npm install` → Restart।
4. টেস্ট: ব্রাউজারে `https://আপনার-api-ডোমেইন/api/health`।

---

## ৩) Frontend (React build → static files)

1. পিসিতে `client` ফোল্ডারে **`.env.production`** বানান (`client/.env.production.example` দেখুন):  
   `VITE_API_URL=https://আপনার-api-ডোমেইন` (শেষে `/` নয়)।
2. রিপো **রুট** থেকে:

   ```bash
   npm run build:client
   ```

   অথবা শুধু ক্লায়েন্ট:

   ```bash
   cd client && npm install && npm run build
   ```

3. **`client/dist/`** এর **ভেতরের সব ফাইল** (সহ `.htaccess`) cPanel **File Manager** দিয়ে **`public_html`** বা সাবডোমেইন ডকুমেন্ট রুটে আপলোড করুন।  
   `client/public/.htaccess` বিল্ডে **`dist/`** তে কপি হয় — SPA রাউটের জন্য দরকার।

---

## ৪) একই ডোমেইনে `/api` (ঐচ্ছিক)

ফ্রন্ট `https://shop.com`, API `https://shop.com/api` চাইলে সার্ভারে **রিভার্স প্রক্সি** লাগে — হোস্ট ডকুমেন্টেশন বা সাপোর্ট। সহজ বিকল্প: API সাবডোমেইন `api.shop.com`।

---

## ৫) চেকলিস্ট

- [ ] API `.env` এ `CORS_ORIGIN` = শপের পূর্ণ HTTPS URL (কমা দিয়ে একাধিক)।
- [ ] ক্লায়েন্ট বিল্ড আগে সঠিক `VITE_API_URL`।
- [ ] লাইভে `JWT_SECRET` শক্তিশালী; ডেভ সিক্রেট ব্যবহার করবেন না।
- [ ] `server/uploads` ইমেজ আপলোডের জন্য রাইট পারমিশন।

রুট থেকে একসাথে ডিপেন্ডেন্সি + ক্লায়েন্ট বিল্ড (লোকাল প্রস্তুতি):

```bash
npm install
npm run prepare:upload
```

(`prepare:upload` = `server`-এ `npm install --production`, `client`-এ `npm install`, তারপর `vite build`। বিল্ডের আগে **`client/.env.production`** সেট করুন।)
