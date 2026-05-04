import { Fragment, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { resolveImageUrl } from '../utils/image';
import { apiUrl, API_BASE, fetchWithTimeout } from '../utils/api';
import { getAuthHeader } from '../utils/auth';
import {
  THEME_SETTING_KEYS,
  DEFAULT_THEME,
  persistThemeCache,
} from '../utils/theme';
import { AdminTableSkeleton } from '../components/Skeletons';
import AdminAnalyticsPanel from '../components/AdminAnalyticsPanel';
import { displayPriceRange, formatPreorderDateLabel } from '../utils/productAvailability';
import { parseCategoriesApiResponse } from '../utils/categories';
import {
  ADMIN_ANALYTICS_PREFS_LS_KEY,
  loadAdminAnalyticsPrefs,
  filterOrdersForAnalytics,
  computeAdjustedRevenue,
  analyticsPrefsAffectsRevenueDisplay,
} from '../utils/adminAnalytics';
import { downloadOrderPdf, printOrderSheet } from '../utils/orderPdf';

const parseGalleryUrlLines = (raw) =>
  String(raw || '')
    .split(/[\r\n]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s));

/** Matches server IN_STOCK_SENTINEL — binary "in stock" for DB `stock` column. */
const IN_STOCK_SENTINEL = 9999;

/** Only General is protected server-side; any other name can be removed after clearing products that use it. */
const BUILTIN_CATEGORY_KEYS = new Set(['general']);

/** Detects masked Steadfast API key/secret from GET /api/settings (last 4 visible; prefix * or •). */
const STEADFAST_SECRET_MASK_RE = /^[*•]{6,}[A-Za-z0-9_-]{4}$/;

const STEADFAST_SECRET_INPUT_KEYS = ['steadfast_api_key', 'steadfast_secret_key', 'steadfast_webhook_bearer_token'];

const formatPreorderInput = (v) => (v && String(v).trim() ? String(v).trim().slice(0, 10) : '');

const stockToAvailability = (stock, preorderDate) => {
  if (Number(stock) > 0) return 'in';
  if (preorderDate && String(preorderDate).trim()) return 'preorder';
  return 'out';
};

const availabilityToStockPayload = (availability, preorderDateRaw) => {
  const dateStr = formatPreorderInput(preorderDateRaw);
  if (availability === 'preorder') {
    return { stock: 0, preorder_available_date: dateStr || null };
  }
  if (availability === 'out') {
    return { stock: 0, preorder_available_date: null };
  }
  return { stock: IN_STOCK_SENTINEL, preorder_available_date: null };
};

const parseOrderItems = (order) => {
  let raw = order?.items;
  if (raw == null) return [];
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? raw : [];
};

/** Shown next to image file inputs so admins export the right size */
const IMAGE_HINT_HERO =
  'Recommended: 1920×720px or wider (landscape, ~2.5:1). WebP or JPG, under 2MB. Full-width hero — wide photos look best.';
const IMAGE_HINT_PRODUCT_MAIN =
  'Recommended: at least 800×800px (1000×1000–1200×1200 ideal). Square or 4:5 portrait works well in the grid.';
const IMAGE_HINT_PRODUCT_GALLERY =
  'Same as main image or up to 1200px wide. You can add several; keep file size reasonable.';
const IMAGE_HINT_SITE_LOGO =
  'PNG, WebP, or SVG with transparent background works well. ~200–400px wide; under 2MB. Shown in header, footer, and login.';
const IMAGE_HINT_CATEGORY =
  'Square ~400–800px looks best (shown as a circle on the homepage hero). JPG or WebP, max 5MB.';
const IMAGE_HINT_BRAND_LOGO =
  'Wide or square logo, transparent PNG/WebP ideal. Max 5MB — used on home and shop filters.';

const emptyHeroSlide = () => ({
  image: '',
  alt: '',
  kicker: '',
  title: '',
  description: '',
  cta: 'Shop the edit',
  to: '/shop',
});

const serializePricingOptionRows = (rows) => {
  const cleaned = (rows || [])
    .map((r) => ({
      label: String(r.label || '').trim(),
      price: r.price !== '' && r.price != null ? Number(r.price) : NaN,
    }))
    .filter((r) => r.label && Number.isFinite(r.price));
  return cleaned.length ? JSON.stringify(cleaned) : '';
};

function Admin() {
  const [activeTab, setActiveTab] = useState('analytics');
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [overview, setOverview] = useState(null);
  const [query, setQuery] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [productSort, setProductSort] = useState('latest');
  const [savingId, setSavingId] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [expandedProductId, setExpandedProductId] = useState(null);
  const [categoriesList, setCategoriesList] = useState([]);
  const [categoryImages, setCategoryImages] = useState({});
  const [categoryImageUploading, setCategoryImageUploading] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [brandsList, setBrandsList] = useState([]);
  const [newBrandNameInput, setNewBrandNameInput] = useState('');
  const [brandLogoUploading, setBrandLogoUploading] = useState(null);
  const [galleryItems, setGalleryItems] = useState([]);
  const [galleryKind, setGalleryKind] = useState('image');
  const [galleryCaption, setGalleryCaption] = useState('');
  const [galleryEmbedUrl, setGalleryEmbedUrl] = useState('');
  const [galleryFile, setGalleryFile] = useState(null);
  const [galleryFileInputKey, setGalleryFileInputKey] = useState(0);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: '',
    price: '',
    regular_price: '',
    description: '',
    availability: 'in',
    preorder_available_date: '',
    category: 'General',
    brand_id: '',
    sizes: '',
    colors: '',
  });
  const [newPricingOptionRows, setNewPricingOptionRows] = useState([{ label: '', price: '' }]);
  const [editingPricingOptionRows, setEditingPricingOptionRows] = useState([{ label: '', price: '' }]);
  const [newProductImage, setNewProductImage] = useState(null);
  const [newGalleryFiles, setNewGalleryFiles] = useState([]);
  const [newGalleryPreviewUrls, setNewGalleryPreviewUrls] = useState([]);
  const [newGalleryUrlLines, setNewGalleryUrlLines] = useState('');
  const [editingGalleryUrlLines, setEditingGalleryUrlLines] = useState('');
  const [editingGalleryFiles, setEditingGalleryFiles] = useState([]);
  const [editingProductImage, setEditingProductImage] = useState(null);
  const [newCourier, setNewCourier] = useState({
    name: '',
    phone: '',
    email: '',
    base_rate: '',
    shipping_inside_dhaka: '',
    shipping_outside_dhaka: '',
  });
  const [coupons, setCoupons] = useState([]);
  const [reviewsList, setReviewsList] = useState([]);
  const [reviewForm, setReviewForm] = useState({
    product_id: '',
    user_id: '',
    rating: 5,
    title: '',
    comment: '',
  });
  const [couponForm, setCouponForm] = useState({
    code: '',
    discount_type: 'percent',
    discount_value: '',
    min_subtotal: '0',
    max_uses: '',
    expires_at: '',
    is_active: true,
    restrict_product_ids: '',
    restrict_categories: '',
  });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderUpdate, setOrderUpdate] = useState({
    status: '',
    courier_name: '',
    tracking_number: '',
    amount_paid: '',
    return_status: 'none',
    return_notes: '',
    cancellation_reason: '',
  });
  const [settings, setSettings] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [adminBooting, setAdminBooting] = useState(true);
  const [analyticsPrefs, setAnalyticsPrefs] = useState(loadAdminAnalyticsPrefs);
  const [themePrimary, setThemePrimary] = useState(DEFAULT_THEME.primary);
  const [themeSidebar, setThemeSidebar] = useState(DEFAULT_THEME.sidebar);
  const [heroEditor, setHeroEditor] = useState(() => [emptyHeroSlide(), emptyHeroSlide(), emptyHeroSlide()]);
  const authHeaders = getAuthHeader();
  const formatDate = (value) => {
    if (!value) return '-';
    return new Date(value).toLocaleString();
  };

  const fetchAdminData = async () => {
    try {
      const [
        productsRes,
        categoriesRes,
        brandsRes,
        usersRes,
        overviewRes,
        ordersRes,
        couriersRes,
        settingsRes,
        notificationsRes,
        unreadRes,
        couponsRes,
        reviewsAdminRes,
      ] = await Promise.all([
        fetchWithTimeout(apiUrl('/api/products')),
        fetchWithTimeout(apiUrl('/api/products/meta/categories')),
        fetchWithTimeout(apiUrl('/api/brands')),
        fetchWithTimeout(apiUrl('/api/users'), { headers: authHeaders }),
        fetchWithTimeout(apiUrl('/api/admin/overview'), { headers: authHeaders }),
        fetchWithTimeout(apiUrl('/api/orders'), { headers: authHeaders }),
        fetchWithTimeout(apiUrl('/api/couriers'), { headers: authHeaders }),
        fetchWithTimeout(apiUrl('/api/settings'), { headers: authHeaders }),
        fetchWithTimeout(apiUrl('/api/admin/notifications?limit=50'), { headers: authHeaders }),
        fetchWithTimeout(apiUrl('/api/admin/notifications/unread-count'), { headers: authHeaders }),
        fetchWithTimeout(apiUrl('/api/coupons'), { headers: authHeaders }),
        fetchWithTimeout(apiUrl('/api/reviews/admin/all'), { headers: authHeaders }),
      ]);
      
      setProducts(await productsRes.json());
      if (categoriesRes.ok) {
        const cats = await categoriesRes.json();
        const { categories, images } = parseCategoriesApiResponse(cats);
        setCategoriesList(categories);
        setCategoryImages(images);
      }
      if (brandsRes.ok) {
        const bl = await brandsRes.json();
        setBrandsList(Array.isArray(bl) ? bl : []);
      }
      setUsers(await usersRes.json());
      setOverview(await overviewRes.json());
      setOrders(await ordersRes.json());
      setCouriers(await couriersRes.json());
      
      const settingsData = await settingsRes.json();
      const settingsObj = {};
      settingsData.forEach((s) => {
        let v = s.setting_value;
        if (STEADFAST_SECRET_INPUT_KEYS.includes(s.setting_key) && STEADFAST_SECRET_MASK_RE.test(String(v ?? '').trim())) {
          v = '';
        }
        settingsObj[s.setting_key] = v;
      });
      setSettings(settingsObj);
      const tp = settingsObj[THEME_SETTING_KEYS.primary];
      const ts = settingsObj[THEME_SETTING_KEYS.sidebar];
      if (tp && /^#[0-9A-Fa-f]{6}$/.test(tp)) setThemePrimary(tp);
      if (ts && /^#[0-9A-Fa-f]{6}$/.test(ts)) setThemeSidebar(ts);

      if (notificationsRes.ok) {
        const notiData = await notificationsRes.json();
        setNotifications(Array.isArray(notiData) ? notiData : []);
      } else {
        setNotifications([]);
      }
      if (unreadRes.ok) {
        const unreadData = await unreadRes.json();
        setUnreadNotifications(Number(unreadData.unreadCount || 0));
      } else {
        setUnreadNotifications(0);
      }
      if (couponsRes.ok) {
        const cdata = await couponsRes.json();
        setCoupons(Array.isArray(cdata) ? cdata : []);
      } else {
        setCoupons([]);
      }
      if (reviewsAdminRes.ok) {
        const rdata = await reviewsAdminRes.json();
        setReviewsList(Array.isArray(rdata) ? rdata : []);
      } else {
        setReviewsList([]);
      }
    } catch (error) {
      console.error('Error fetching admin data:', error);
      toast.error('Failed to refresh admin data');
    } finally {
      setAdminBooting(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ADMIN_ANALYTICS_PREFS_LS_KEY, JSON.stringify(analyticsPrefs));
    } catch {
      /* ignore quota / private mode */
    }
  }, [analyticsPrefs]);

  useEffect(() => {
    const urls = newGalleryFiles.map((f) => URL.createObjectURL(f));
    setNewGalleryPreviewUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [newGalleryFiles]);

  useEffect(() => {
    if (activeTab !== 'gallery') return undefined;
    let cancelled = false;
    (async () => {
      setGalleryLoading(true);
      try {
        const res = await fetchWithTimeout(apiUrl('/api/gallery'));
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setGalleryItems(data);
      } catch {
        if (!cancelled) toast.error('Could not load gallery');
      } finally {
        if (!cancelled) setGalleryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  // Product Management
  const createProduct = async (event) => {
    event.preventDefault();
    if (newProduct.availability === 'preorder' && !formatPreorderInput(newProduct.preorder_available_date)) {
      toast.error('Pre-order requires an “available from” date');
      return;
    }
    try {
      const payload = new FormData();
      const sp = availabilityToStockPayload(newProduct.availability, newProduct.preorder_available_date);
      payload.append('name', newProduct.name);
      payload.append('price', String(Number(newProduct.price)));
      if (newProduct.regular_price !== '' && newProduct.regular_price != null) {
        payload.append('regular_price', String(Number(newProduct.regular_price)));
      }
      payload.append('stock', String(sp.stock));
      payload.append('preorder_available_date', sp.preorder_available_date || '');
      payload.append('description', newProduct.description);
      payload.append('category', newProduct.category || 'General');
      if (newProduct.brand_id) payload.append('brand_id', String(newProduct.brand_id));
      else payload.append('brand_id', '');
      payload.append('sizes', newProduct.sizes || '');
      payload.append('colors', newProduct.colors || '');
      const poJson = serializePricingOptionRows(newPricingOptionRows);
      if (poJson) payload.append('pricing_options_json', poJson);
      const urlExtras = parseGalleryUrlLines(newGalleryUrlLines);
      payload.append('gallery_json', JSON.stringify(urlExtras));
      newGalleryFiles.forEach((file) => payload.append('gallery', file));
      if (newProductImage) payload.append('image', newProductImage);

      await fetch(apiUrl('/api/products'), {
        method: 'POST',
        headers: authHeaders,
        body: payload,
      });
      toast.success('Product created');
      setNewProduct({
        name: '',
        price: '',
        regular_price: '',
        description: '',
        availability: 'in',
        preorder_available_date: '',
        category: 'General',
        brand_id: '',
        sizes: '',
        colors: '',
      });
      setNewPricingOptionRows([{ label: '', price: '' }]);
      setNewProductImage(null);
      setNewGalleryFiles([]);
      setNewGalleryUrlLines('');
      fetchAdminData();
    } catch (error) {
      console.error('Error creating product:', error);
      toast.error('Could not create product');
    }
  };

  const addCatalogCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      toast.error('Enter a category name');
      return;
    }
    try {
      const res = await fetch(apiUrl('/api/products/meta/categories'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to add category');
      setCategoriesList(Array.isArray(data.categories) ? data.categories : []);
      if (data.images && typeof data.images === 'object') setCategoryImages(data.images);
      setNewCategoryName('');
      setNewProduct((prev) => ({ ...prev, category: name }));
      if (editingProduct) {
        setEditingProduct((prev) => (prev ? { ...prev, category: name } : prev));
      }
      if (data.message && String(data.message).toLowerCase().includes('already')) {
        toast.message(data.message);
      } else {
        toast.success('Category added');
      }
    } catch (e) {
      toast.error(e.message || 'Could not add category');
    }
  };

  const deleteCatalogCategory = async (name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;
    if (BUILTIN_CATEGORY_KEYS.has(trimmed.toLowerCase())) {
      toast.message('General cannot be deleted.');
      return;
    }
    if (
      !window.confirm(
        `Delete category "${trimmed}"?\n\nProducts using it will be moved to General. This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(apiUrl('/api/products/meta/categories'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to delete category');
      setCategoriesList(Array.isArray(data.categories) ? data.categories : []);
      if (data.images && typeof data.images === 'object') setCategoryImages(data.images);
      setNewProduct((prev) => (prev.category === trimmed ? { ...prev, category: 'General' } : prev));
      setEditingProduct((prev) =>
        prev && prev.category === trimmed ? { ...prev, category: 'General' } : prev
      );
      const n = Number(data.reassigned) || 0;
      toast.success(n > 0 ? `Category removed · ${n} product(s) set to General` : 'Category removed');
      await fetchAdminData();
    } catch (e) {
      toast.error(e.message || 'Could not delete category');
    }
  };

  const uploadCatalogCategoryImage = async (categoryName, file) => {
    if (!file || !categoryName) return;
    setCategoryImageUploading(categoryName);
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('name', categoryName);
      const res = await fetch(apiUrl('/api/products/meta/categories/image'), {
        method: 'POST',
        headers: { ...authHeaders },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Upload failed');
      setCategoriesList(Array.isArray(data.categories) ? data.categories : []);
      if (data.images && typeof data.images === 'object') setCategoryImages(data.images);
      toast.success('Category image saved');
    } catch (e) {
      toast.error(e.message || 'Could not upload category image');
    } finally {
      setCategoryImageUploading(null);
    }
  };

  const clearCatalogCategoryImage = async (categoryName) => {
    const name = String(categoryName || '').trim();
    if (!name) return;
    try {
      const res = await fetch(apiUrl('/api/products/meta/categories/image'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Remove failed');
      setCategoriesList(Array.isArray(data.categories) ? data.categories : []);
      if (data.images && typeof data.images === 'object') setCategoryImages(data.images);
      toast.success('Category image removed');
    } catch (e) {
      toast.error(e.message || 'Could not remove category image');
    }
  };

  const addCatalogBrand = async () => {
    const name = newBrandNameInput.trim();
    if (!name) {
      toast.error('Enter a brand name');
      return;
    }
    try {
      const res = await fetch(apiUrl('/api/brands'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to add brand');
      setBrandsList((prev) => [...prev.filter((b) => b.id !== data.id), data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewBrandNameInput('');
      setNewProduct((prev) => ({ ...prev, brand_id: String(data.id) }));
      toast.success('Brand added — upload a logo below');
    } catch (e) {
      toast.error(e.message || 'Could not add brand');
    }
  };

  const deleteCatalogBrand = async (id) => {
    const bid = Number(id);
    if (!Number.isFinite(bid)) return;
    if (!window.confirm('Delete this brand? Products using it will have no brand assigned.')) return;
    try {
      const res = await fetch(apiUrl(`/api/brands/${bid}`), { method: 'DELETE', headers: authHeaders });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Delete failed');
      setBrandsList((prev) => prev.filter((b) => b.id !== bid));
      setNewProduct((prev) => (String(prev.brand_id) === String(bid) ? { ...prev, brand_id: '' } : prev));
      setEditingProduct((prev) =>
        prev && String(prev.brand_id) === String(bid) ? { ...prev, brand_id: '' } : prev
      );
      toast.success('Brand removed');
      fetchAdminData();
    } catch (e) {
      toast.error(e.message || 'Could not delete brand');
    }
  };

  const uploadBrandLogo = async (brandId, file) => {
    if (!file || !brandId) return;
    setBrandLogoUploading(brandId);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await fetch(apiUrl(`/api/brands/${brandId}/logo`), {
        method: 'POST',
        headers: { ...authHeaders },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Upload failed');
      setBrandsList((prev) => prev.map((b) => (b.id === brandId ? { ...b, ...data } : b)));
      toast.success('Brand logo saved');
    } catch (e) {
      toast.error(e.message || 'Could not upload logo');
    } finally {
      setBrandLogoUploading(null);
    }
  };

  const clearBrandLogo = async (brandId) => {
    const bid = Number(brandId);
    if (!Number.isFinite(bid)) return;
    try {
      const res = await fetch(apiUrl(`/api/brands/${bid}/logo`), {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Remove failed');
      setBrandsList((prev) => prev.map((b) => (b.id === bid ? { ...b, logo_url: '' } : b)));
      toast.success('Brand logo removed');
    } catch (e) {
      toast.error(e.message || 'Could not remove logo');
    }
  };

  const addGalleryAdminItem = async (event) => {
    event.preventDefault();
    if (galleryKind === 'image' && !galleryFile) {
      toast.error('Select an image file to upload');
      return;
    }
    if (galleryKind === 'video' && !galleryFile && !galleryEmbedUrl.trim()) {
      toast.error('Upload a video file or paste a YouTube / Vimeo / direct video URL');
      return;
    }
    try {
      setSavingId('gallery-add');
      const fd = new FormData();
      fd.append('kind', galleryKind);
      fd.append('caption', galleryCaption);
      if (galleryKind === 'video' && galleryEmbedUrl.trim()) {
        fd.append('embed_url', galleryEmbedUrl.trim());
      }
      if (galleryFile) fd.append('file', galleryFile);
      const res = await fetch(apiUrl('/api/gallery'), { method: 'POST', headers: authHeaders, body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || 'Could not add gallery item');
        return;
      }
      setGalleryItems((prev) => [data, ...prev]);
      setGalleryCaption('');
      setGalleryEmbedUrl('');
      setGalleryFile(null);
      setGalleryFileInputKey((k) => k + 1);
      toast.success('Gallery item added');
    } catch {
      toast.error('Could not add gallery item');
    } finally {
      setSavingId(null);
    }
  };

  const deleteGalleryAdminItem = async (id) => {
    const gid = Number(id);
    if (!Number.isFinite(gid)) return;
    if (!window.confirm('Remove this gallery item?')) return;
    try {
      setSavingId(`gallery-del-${gid}`);
      const res = await fetch(apiUrl(`/api/gallery/${gid}`), { method: 'DELETE', headers: authHeaders });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || 'Delete failed');
        return;
      }
      setGalleryItems((prev) => prev.filter((g) => g.id !== gid));
      toast.success('Removed from gallery');
    } finally {
      setSavingId(null);
    }
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    if (!editingProduct) return;
    if (editingProduct.availability === 'preorder' && !formatPreorderInput(editingProduct.preorder_available_date)) {
      toast.error('Pre-order requires an “available from” date');
      return;
    }
    try {
      setSavingId(editingProduct.id);
      const sp = availabilityToStockPayload(editingProduct.availability, editingProduct.preorder_available_date);
      const payload = new FormData();
      payload.append('name', editingProduct.name);
      payload.append('price', String(Number(editingProduct.price)));
      if (editingProduct.regular_price !== '' && editingProduct.regular_price != null) {
        payload.append('regular_price', String(Number(editingProduct.regular_price)));
      }
      payload.append('stock', String(sp.stock));
      payload.append('preorder_available_date', sp.preorder_available_date || '');
      payload.append('description', editingProduct.description || '');
      payload.append('category', editingProduct.category || 'General');
      if (editingProduct.brand_id) payload.append('brand_id', String(editingProduct.brand_id));
      else payload.append('brand_id', '');
      const sizesStr = Array.isArray(editingProduct.sizes)
        ? editingProduct.sizes.join(',')
        : editingProduct.sizes || '';
      const colorsStr = Array.isArray(editingProduct.colors)
        ? editingProduct.colors.join(',')
        : editingProduct.colors || '';
      payload.append('sizes', sizesStr);
      payload.append('colors', colorsStr);
      const poJson = serializePricingOptionRows(editingPricingOptionRows);
      payload.append('pricing_options_json', poJson || '[]');
      const urlExtras = parseGalleryUrlLines(editingGalleryUrlLines);
      const galBase = Array.isArray(editingProduct.gallery) ? editingProduct.gallery : [];
      const gal = [...galBase, ...urlExtras];
      payload.append('gallery_json', JSON.stringify(gal));
      editingGalleryFiles.forEach((file) => payload.append('gallery', file));
      payload.append('image', editingProduct.image || '');
      if (editingProductImage) payload.append('image', editingProductImage);

      await fetch(apiUrl(`/api/products/${editingProduct.id}`), {
        method: 'PUT',
        headers: authHeaders,
        body: payload,
      });
      setEditingProduct(null);
      setExpandedProductId(null);
      setEditingProductImage(null);
      setEditingGalleryFiles([]);
      setEditingGalleryUrlLines('');
      fetchAdminData();
      toast.success('Product updated');
    } catch (error) {
      console.error('Error updating product:', error);
    } finally {
      setSavingId(null);
    }
  };

  const deleteProduct = async (id) => {
    if (!window.confirm('Are you sure?')) return;
    try {
      await fetch(apiUrl(`/api/products/${id}`), { method: 'DELETE', headers: authHeaders });
      if (expandedProductId === id) {
        setExpandedProductId(null);
        setEditingProduct(null);
        setEditingProductImage(null);
        setEditingGalleryFiles([]);
        setEditingGalleryUrlLines('');
      }
      fetchAdminData();
    } catch (error) {
      console.error('Error deleting product:', error);
    }
  };

  // Courier Management
  const createCourier = async (event) => {
    event.preventDefault();
    try {
      await fetch(apiUrl('/api/couriers'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          ...newCourier,
          base_rate: Number(newCourier.base_rate),
          shipping_inside_dhaka:
            newCourier.shipping_inside_dhaka === '' ? null : Number(newCourier.shipping_inside_dhaka),
          shipping_outside_dhaka:
            newCourier.shipping_outside_dhaka === '' ? null : Number(newCourier.shipping_outside_dhaka),
        }),
      });
      setNewCourier({
        name: '',
        phone: '',
        email: '',
        base_rate: '',
        shipping_inside_dhaka: '',
        shipping_outside_dhaka: '',
      });
      fetchAdminData();
    } catch (error) {
      console.error('Error creating courier:', error);
    }
  };

  const deleteCourier = async (id) => {
    if (!window.confirm('Are you sure?')) return;
    try {
      await fetch(apiUrl(`/api/couriers/${id}`), { method: 'DELETE', headers: authHeaders });
      fetchAdminData();
    } catch (error) {
      console.error('Error deleting courier:', error);
    }
  };

  // Settings Management
  const updateSetting = async (key, value) => {
    try {
      setSavingId(key);
      await fetch(apiUrl(`/api/settings/${key}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ value }),
      });
      fetchAdminData();
    } catch (error) {
      console.error('Error updating setting:', error);
    } finally {
      setSavingId(null);
    }
  };

  useEffect(() => {
    const raw = settings.hero_slides;
    if (raw == null || String(raw).trim() === '') return;
    try {
      const p = JSON.parse(raw);
      if (!Array.isArray(p) || p.length === 0) return;
      const padded = [...p];
      while (padded.length < 3) padded.push(emptyHeroSlide());
      setHeroEditor(
        padded.slice(0, 6).map((s) => ({
          image: String(s?.image ?? ''),
          alt: String(s?.alt ?? ''),
          kicker: String(s?.kicker ?? ''),
          title: String(s?.title ?? ''),
          description: String(s?.description ?? ''),
          cta: String(s?.cta ?? 'Shop'),
          to: String(s?.to ?? '/shop'),
        }))
      );
    } catch {
      /* ignore invalid JSON */
    }
  }, [settings.hero_slides]);

  const saveHeroSlides = async () => {
    try {
      setSavingId('hero_slides');
      const valid = heroEditor.filter((s) => String(s.image).trim());
      const json = JSON.stringify(valid);
      await fetch(apiUrl('/api/settings/hero_slides'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ value: json }),
      });
      toast.success('Homepage hero saved');
      fetchAdminData();
    } catch (e) {
      console.error(e);
      toast.error('Could not save homepage hero');
    } finally {
      setSavingId(null);
    }
  };

  const uploadHeroImage = async (file, index) => {
    if (!file) return;
    try {
      setSavingId(`hero_img_${index}`);
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch(apiUrl('/api/upload/hero'), { method: 'POST', headers: authHeaders, body: fd });
      if (!res.ok) throw new Error('fail');
      const data = await res.json();
      setHeroEditor((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], image: data.url };
        return next;
      });
      toast.success('Image uploaded');
    } catch (e) {
      console.error(e);
      toast.error('Hero image upload failed');
    } finally {
      setSavingId(null);
    }
  };

  const saveStorefrontSettings = async () => {
    try {
      setSavingId('storefront');
      const pairs = [
        ['store_logo_url', settings.store_logo_url ?? ''],
        ['store_business_address', settings.store_business_address ?? ''],
        ['store_phone_tel', settings.store_phone_tel ?? ''],
        ['store_whatsapp_tel', settings.store_whatsapp_tel ?? ''],
        ['store_facebook_url', settings.store_facebook_url ?? ''],
        ['store_messenger_url', settings.store_messenger_url ?? ''],
      ];
      const results = await Promise.all(
        pairs.map(([key, value]) =>
          fetch(apiUrl(`/api/settings/${key}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({ value: String(value) }),
          })
        )
      );
      if (!results.every((r) => r.ok)) throw new Error('Save failed');
      toast.success('Storefront contact saved');
      fetchAdminData();
    } catch (e) {
      console.error(e);
      toast.error('Could not save storefront settings');
    } finally {
      setSavingId(null);
    }
  };

  const uploadSiteLogo = async (file) => {
    if (!file) return;
    try {
      setSavingId('site_logo');
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch(apiUrl('/api/upload/logo'), { method: 'POST', headers: authHeaders, body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Upload failed');
      await fetch(apiUrl('/api/settings/store_logo_url'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ value: data.url }),
      });
      setSettings((prev) => ({ ...prev, store_logo_url: data.url }));
      toast.success('Site logo saved');
      fetchAdminData();
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Logo upload failed');
    } finally {
      setSavingId(null);
    }
  };

  const clearSiteLogo = async () => {
    try {
      setSavingId('site_logo');
      await fetch(apiUrl('/api/settings/store_logo_url'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ value: '' }),
      });
      setSettings((prev) => ({ ...prev, store_logo_url: '' }));
      toast.success('Site logo cleared — default mark shows on storefront');
      fetchAdminData();
    } catch (e) {
      console.error(e);
      toast.error('Could not clear logo');
    } finally {
      setSavingId(null);
    }
  };

  const uploadAdvertiseImage = async (settingKey, file) => {
    if (!file) return;
    try {
      setSavingId(`adv_${settingKey}`);
      const fd = new FormData();
      fd.append('image', file);
      const q = new URLSearchParams({ key: settingKey });
      const res = await fetch(apiUrl(`/api/upload/advertise?${q.toString()}`), {
        method: 'POST',
        headers: authHeaders,
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || data.error || `Upload failed (${res.status})`);
      }
      setSettings((prev) => ({ ...prev, [settingKey]: data.url }));
      toast.success('Advertise image saved');
      fetchAdminData();
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Upload failed');
    } finally {
      setSavingId(null);
    }
  };

  const clearAdvertiseImage = async (settingKey) => {
    try {
      setSavingId(`adv_${settingKey}`);
      await fetch(apiUrl(`/api/settings/${settingKey}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ value: '' }),
      });
      setSettings((prev) => ({ ...prev, [settingKey]: '' }));
      toast.success('Image cleared — storefront uses default photo');
      fetchAdminData();
    } catch (e) {
      toast.error(e.message || 'Could not clear');
    } finally {
      setSavingId(null);
    }
  };

  const submitAdminReview = async (e) => {
    e.preventDefault();
    const pid = Number(reviewForm.product_id);
    const uid = Number(reviewForm.user_id);
    if (!pid || !uid) {
      toast.error('Choose product and customer');
      return;
    }
    if (!String(reviewForm.comment).trim()) {
      toast.error('Comment is required');
      return;
    }
    try {
      setSavingId('review-add');
      const res = await fetch(apiUrl('/api/reviews/admin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          product_id: pid,
          user_id: uid,
          rating: Number(reviewForm.rating) || 5,
          title: reviewForm.title || '',
          comment: reviewForm.comment.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed');
      toast.success('Review added');
      setReviewForm({ product_id: '', user_id: '', rating: 5, title: '', comment: '' });
      fetchAdminData();
    } catch (err) {
      toast.error(err.message || 'Could not add review');
    } finally {
      setSavingId(null);
    }
  };

  const deleteAdminReview = async (id) => {
    if (!window.confirm('Delete this review?')) return;
    try {
      setSavingId(`review-del-${id}`);
      const res = await fetch(apiUrl(`/api/reviews/${id}`), { method: 'DELETE', headers: authHeaders });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Delete failed');
      }
      toast.success('Review deleted');
      fetchAdminData();
    } catch (err) {
      toast.error(err.message || 'Could not delete');
    } finally {
      setSavingId(null);
    }
  };

  // Order Management
  const dispatchToSteadfast = async (orderId) => {
    try {
      setSavingId(orderId);
      const res = await fetch(apiUrl(`/api/orders/${orderId}/dispatch`), {
        method: 'POST',
        headers: authHeaders,
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Dispatched · ${data.tracking_number || data.tracking_code || 'OK'}`);
        fetchAdminData();
      } else {
        toast.error(data.details?.message || data.message || data.details || 'Dispatch failed');
      }
    } catch (error) {
      console.error('Error dispatching to Steadfast:', error);
      toast.error(error?.message || 'Network error — could not reach the server');
    } finally {
      setSavingId(null);
    }
  };

  const syncSteadfastOrder = async (orderId) => {
    try {
      setSavingId(`sync-${orderId}`);
      const res = await fetch(apiUrl(`/api/orders/${orderId}/sync-steadfast`), {
        method: 'POST',
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details?.message || data.message || 'Sync failed');
      toast.success(data.message || 'Synced with Steadfast');
      fetchAdminData();
    } catch (e) {
      toast.error(e.message || 'Could not sync');
    } finally {
      setSavingId(null);
    }
  };

  const testSteadfastConnection = async () => {
    try {
      setSavingId('steadfast-test');
      const res = await fetch(apiUrl('/api/settings/steadfast-test'), {
        method: 'POST',
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Connection check failed');
      toast.success(data.message || 'Steadfast responded OK');
    } catch (e) {
      toast.error(e.message || 'Connection check failed');
    } finally {
      setSavingId(null);
    }
  };

  const fetchSteadfastBalance = async () => {
    try {
      setSavingId('steadfast-balance');
      const res = await fetch(apiUrl('/api/settings/steadfast-balance'), {
        method: 'POST',
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Balance fetch failed');
      if (data.balance != null || data.currency) {
        toast.success(`Wallet: ${data.balance ?? '—'}${data.currency ? ` ${data.currency}` : ''}`);
      } else {
        toast.success('Balance response loaded (see browser network tab for detail)');
      }
    } catch (e) {
      toast.error(e.message || 'Balance fetch failed');
    } finally {
      setSavingId(null);
    }
  };

  const saveSteadfastSettings = async () => {
    try {
      setSavingId('steadfast-save');
      const res = await fetch(apiUrl('/api/settings/steadfast'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          steadfast_api_base_url: settings.steadfast_api_base_url ?? '',
          steadfast_default_note: settings.steadfast_default_note ?? '',
          steadfast_alternative_phone: settings.steadfast_alternative_phone ?? '',
          steadfast_item_description_template: settings.steadfast_item_description_template ?? '',
          steadfast_total_lot_default: settings.steadfast_total_lot_default ?? '',
          steadfast_send_delivery_type: settings.steadfast_send_delivery_type ?? 'true',
          steadfast_auto_dispatch_on_confirm: settings.steadfast_auto_dispatch_on_confirm ?? 'false',
          steadfast_api_key: settings.steadfast_api_key ?? '',
          steadfast_secret_key: settings.steadfast_secret_key ?? '',
          steadfast_webhook_bearer_token: settings.steadfast_webhook_bearer_token ?? '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'Could not save Steadfast settings');
      }
      toast.success(data.message || 'Steadfast settings saved');
      fetchAdminData();
    } catch (e) {
      toast.error(e.message || 'Could not save settings');
    } finally {
      setSavingId(null);
    }
  };

  const updateOrder = async (orderId) => {
    try {
      setSavingId(orderId);
      const res = await fetch(apiUrl(`/api/orders/${orderId}/status`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(orderUpdate),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || 'Could not update order');
        return;
      }
      setSelectedOrder(null);
      setOrderUpdate({
        status: '',
        courier_name: '',
        tracking_number: '',
        amount_paid: '',
        return_status: 'none',
        return_notes: '',
        cancellation_reason: '',
      });
      fetchAdminData();
      const auto = data.steadfast_auto_dispatch;
      if (orderUpdate.status === 'Processing' && auto && !auto.skipped && auto.ok === false) {
        toast.warning(auto.message || 'Steadfast auto-dispatch failed — see order error text');
      } else if (orderUpdate.status === 'Processing' && auto?.ok === true) {
        toast.success('Order updated · dispatched to Steadfast');
      } else {
        toast.success('Order updated');
      }
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error('Could not update order');
    } finally {
      setSavingId(null);
    }
  };

  const quickStatusUpdate = async (order, status) => {
    try {
      setSavingId(order.id);
      const res = await fetch(apiUrl(`/api/orders/${order.id}/status`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          status,
          courier_name: order.courier_name || '',
          tracking_number: order.tracking_number || '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || 'Could not update status');
        return;
      }
      fetchAdminData();
      const auto = data.steadfast_auto_dispatch;
      if (status === 'Processing' && auto && !auto.skipped && auto.ok === false) {
        toast.warning(auto.message || 'Steadfast auto-dispatch failed — see order details');
      } else if (status === 'Processing' && auto?.ok === true) {
        toast.success(`Order status: ${status} · dispatched to Steadfast`);
      } else {
        toast.success(`Order status: ${status}`);
      }
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Could not update status');
    } finally {
      setSavingId(null);
    }
  };

  const updateUserRole = async (id, role) => {
    try {
      setSavingId(id);
      await fetch(apiUrl(`/api/users/${id}/role`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ role }),
      });
      fetchAdminData();
    } catch (error) {
      console.error('Error updating user role:', error);
    } finally {
      setSavingId(null);
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      await fetch(apiUrl('/api/admin/notifications/read-all'), {
        method: 'PUT',
        headers: authHeaders,
      });
      setUnreadNotifications(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    } catch (error) {
      console.error('Could not mark notifications:', error);
    }
  };

  const deleteNotification = async (id) => {
    const nid = Number(id);
    if (!Number.isFinite(nid)) return;
    try {
      const wasUnread = notifications.some((n) => Number(n.id) === nid && !n.is_read);
      const res = await fetch(apiUrl(`/api/admin/notifications/${nid}`), {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not delete notification');
      setNotifications((prev) => prev.filter((n) => Number(n.id) !== nid));
      if (wasUnread) setUnreadNotifications((u) => Math.max(0, u - 1));
      toast.success('Notification removed');
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Could not delete notification');
    }
  };

  const deleteAllNotifications = async () => {
    if (!window.confirm('Delete all notifications? This cannot be undone.')) return;
    try {
      const res = await fetch(apiUrl('/api/admin/notifications'), { method: 'DELETE', headers: authHeaders });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not clear notifications');
      setNotifications([]);
      setUnreadNotifications(0);
      toast.success('All notifications cleared');
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Could not clear notifications');
    }
  };

  const saveCoupon = async (e) => {
    e.preventDefault();
    try {
      setSavingId('coupon');
      const body = {
        code: couponForm.code.trim(),
        discount_type: couponForm.discount_type,
        discount_value: Number(couponForm.discount_value),
        min_subtotal: Number(couponForm.min_subtotal || 0),
        max_uses: couponForm.max_uses === '' ? null : Number(couponForm.max_uses),
        expires_at: couponForm.expires_at || null,
        is_active: couponForm.is_active,
        restrict_product_ids: couponForm.restrict_product_ids,
        restrict_categories: couponForm.restrict_categories,
      };
      const res = await fetch(apiUrl('/api/coupons'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Save failed');
      toast.success('Coupon created');
      setCouponForm({
        code: '',
        discount_type: 'percent',
        discount_value: '',
        min_subtotal: '0',
        max_uses: '',
        expires_at: '',
        is_active: true,
        restrict_product_ids: '',
        restrict_categories: '',
      });
      fetchAdminData();
    } catch (err) {
      toast.error(err.message || 'Coupon save failed');
    } finally {
      setSavingId(null);
    }
  };

  const removeCoupon = async (id) => {
    if (!window.confirm('Delete this coupon?')) return;
    try {
      await fetch(apiUrl(`/api/coupons/${id}`), { method: 'DELETE', headers: authHeaders });
      toast.success('Coupon deleted');
      fetchAdminData();
    } catch (error) {
      console.error(error);
      toast.error('Could not delete coupon');
    }
  };

  const deleteUser = async (id) => {
    if (!window.confirm('Are you sure?')) return;
    try {
      setSavingId(id);
      await fetch(apiUrl(`/api/users/${id}`), { method: 'DELETE', headers: authHeaders });
      fetchAdminData();
    } catch (error) {
      console.error('Error deleting user:', error);
    } finally {
      setSavingId(null);
    }
  };

  const overviewFilteredOrders = useMemo(
    () => filterOrdersForAnalytics(orders, analyticsPrefs),
    [orders, analyticsPrefs]
  );
  const { rawRevenue: overviewRawRevenue, adjustedRevenue: overviewAdjustedRevenue } = useMemo(
    () => computeAdjustedRevenue(overviewFilteredOrders, analyticsPrefs),
    [overviewFilteredOrders, analyticsPrefs]
  );

  const visibleProducts = useMemo(() => {
    const q = query.toLowerCase();
    const list = products.filter(
      (product) =>
        product.name.toLowerCase().includes(q) ||
        product.description?.toLowerCase().includes(q)
    );

    if (productSort === 'price-low') return [...list].sort((a, b) => Number(a.price) - Number(b.price));
    if (productSort === 'price-high') return [...list].sort((a, b) => Number(b.price) - Number(a.price));
    if (productSort === 'stock-low') return [...list].sort((a, b) => Number(a.stock) - Number(b.stock));
    return list;
  }, [products, query, productSort]);

  const visibleUsers = useMemo(() => {
    const q = query.toLowerCase();
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.role.toLowerCase().includes(q)
    );
  }, [users, query]);

  const visibleOrders = useMemo(() => {
    const q = query.toLowerCase();
    return orders.filter((order) => {
      const matchesQuery =
        String(order.id).includes(q) ||
        order.customer_name?.toLowerCase().includes(q) ||
        order.customer_phone?.toLowerCase().includes(q) ||
        order.courier_name?.toLowerCase().includes(q) ||
        String(order.return_status || '').toLowerCase().includes(q);
      const matchesStatus = orderStatusFilter === 'all' || order.status === orderStatusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [orders, query, orderStatusFilter]);

  const exportToCsv = (filename, rows) => {
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleThemePrimaryChange = (hex) => {
    setThemePrimary(hex);
    persistThemeCache({ primary: hex, sidebar: themeSidebar });
  };

  const handleThemeSidebarChange = (hex) => {
    setThemeSidebar(hex);
    persistThemeCache({ primary: themePrimary, sidebar: hex });
  };

  const saveThemeToServer = async () => {
    try {
      setSavingId('theme-save');
      const res = await Promise.all([
        fetch(apiUrl(`/api/settings/${THEME_SETTING_KEYS.primary}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ value: themePrimary }),
        }),
        fetch(apiUrl(`/api/settings/${THEME_SETTING_KEYS.sidebar}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ value: themeSidebar }),
        }),
      ]);
      if (!res[0].ok || !res[1].ok) throw new Error('save failed');
      persistThemeCache({ primary: themePrimary, sidebar: themeSidebar });
      toast.success('Theme saved — all visitors get these colors on next load');
      fetchAdminData();
    } catch (e) {
      console.error(e);
      toast.error('Could not save theme');
    } finally {
      setSavingId(null);
    }
  };

  const resetThemeDefaults = async () => {
    setThemePrimary(DEFAULT_THEME.primary);
    setThemeSidebar(DEFAULT_THEME.sidebar);
    persistThemeCache(DEFAULT_THEME);
    try {
      setSavingId('theme-save');
      await Promise.all([
        fetch(apiUrl(`/api/settings/${THEME_SETTING_KEYS.primary}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ value: DEFAULT_THEME.primary }),
        }),
        fetch(apiUrl(`/api/settings/${THEME_SETTING_KEYS.sidebar}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ value: DEFAULT_THEME.sidebar }),
        }),
      ]);
      toast.success('Theme reset to defaults');
      fetchAdminData();
    } catch (e) {
      toast.error('Could not reset theme on server');
    } finally {
      setSavingId(null);
    }
  };

  const navItems = [
    'analytics',
    'products',
    'users',
    'orders',
    'couriers',
    'coupons',
    'advertise',
    'reviews',
    'gallery',
    'settings',
  ];

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-slate-200/80 bg-theme-sidebar py-5 pl-6 pr-4 lg:flex xl:w-60">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Console</p>
        <p className="mt-1 text-lg font-semibold text-slate-900">Admin</p>
        <nav className="mt-8 flex flex-col gap-1">
          {navItems.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-sm px-3 py-2.5 text-left text-sm font-semibold capitalize transition ${
                activeTab === tab
                  ? 'bg-slate-900 text-white shadow-sm ring-1 ring-slate-900/10'
                  : 'text-slate-700 hover:bg-slate-100/90'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1 space-y-5 px-4 py-5 sm:px-6 lg:pl-10">
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={markAllNotificationsRead}
            className="relative rounded-sm border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Notifications
            {unreadNotifications > 0 ? (
              <span className="ml-2 rounded-sm bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                {unreadNotifications}
              </span>
            ) : null}
          </button>
        </div>
        <div className="lg:hidden">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
            className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm font-semibold capitalize"
          >
            {navItems.map((tab) => (
              <option key={tab} value={tab}>
                {tab}
              </option>
            ))}
          </select>
        </div>

        {adminBooting ? (
          <AdminTableSkeleton rows={14} />
        ) : (
          <>
    <div className="space-y-6">
      <details className="group rounded-sm border border-slate-200 bg-gradient-to-br from-white via-sage-50/40 to-white shadow-sm open:shadow-md" open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-left sm:px-8 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Admin Control Center</h1>
            <p className="mt-2 text-slate-600">Track revenue, manage inventory, and fulfill customer orders from one place.</p>
          </div>
          <span className="shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180">▼</span>
        </summary>
        <div className="border-t border-sage-100/60 px-6 pb-8 pt-2 sm:px-8">
        <div className="mt-4 grid gap-6 sm:grid-cols-4">
          <div className="rounded-sm border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:shadow-md">
            <p className="text-sm text-slate-500">Products</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900">{overview?.totalProducts ?? '-'}</p>
          </div>
          <div className="rounded-sm border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:shadow-md">
            <p className="text-sm text-slate-500">Users</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900">{overview?.totalUsers ?? '-'}</p>
          </div>
          <div className="rounded-sm border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:shadow-md">
            <p className="text-sm text-slate-500">Orders</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900">{overview?.totalOrders ?? '-'}</p>
          </div>
          <div className="rounded-sm border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:shadow-md">
            <p className="text-sm text-slate-500">Revenue</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900">৳{overviewAdjustedRevenue.toFixed(2)}</p>
            {analyticsPrefsAffectsRevenueDisplay(analyticsPrefs) ? (
              <p className="mt-1 text-xs text-slate-500">
                Same as Analytics tab · raw ৳{overviewRawRevenue.toFixed(2)}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-6 rounded-sm border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">Notifications</p>
              <p className="text-xs text-slate-500">New orders / users / products · max 50 shown</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={markAllNotificationsRead}
                className="rounded-sm border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Mark all read
              </button>
              <button
                type="button"
                onClick={deleteAllNotifications}
                className="rounded-sm border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100"
              >
                Delete all
              </button>
            </div>
          </div>
          {notifications.length === 0 ? (
            <p className="text-sm text-slate-500">No notifications yet.</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {notifications.map((n) => (
                <div key={`noti-${n.id}`} className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                      <p className="mt-1 text-xs text-slate-600">{n.message}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <p className="text-[11px] text-slate-500">{formatDate(n.created_at)}</p>
                      <button
                        type="button"
                        onClick={() => deleteNotification(n.id)}
                        className="text-[11px] font-semibold text-brand-700 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </details>

      <div className="rounded-sm border border-slate-200 bg-white shadow-sm">
        <div className="p-8">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products, users, orders..."
              className="min-w-[240px] flex-1 rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
            />
            <button
              onClick={() => {
                setQuery('');
                setOrderStatusFilter('all');
                setProductSort('latest');
              }}
              className="rounded-sm border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Reset filters
            </button>
          </div>

          {activeTab === 'analytics' && (
            <AdminAnalyticsPanel
              orders={orders}
              products={products}
              users={users}
              authHeaders={authHeaders}
              onRefresh={fetchAdminData}
              exportToCsv={exportToCsv}
              analyticsPrefs={analyticsPrefs}
              setAnalyticsPrefs={setAnalyticsPrefs}
            />
          )}

          {activeTab === 'products' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-slate-900">Products Management</h2>

              <div className="flex flex-wrap items-end gap-3 rounded-sm border border-slate-200 bg-slate-50 p-4">
                <div className="min-w-[200px] flex-1">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Add category</label>
                  <input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCatalogCategory())}
                    placeholder="e.g. Home & Living"
                    className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-4 py-2.5 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={addCatalogCategory}
                  className="rounded-sm bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Add category
                </button>
                <p className="w-full text-xs text-slate-500">
                  Add category names here; they appear in product dropdowns and on the home hero (except General, which always stays). Delete category with × moves products to General. Upload a circle-friendly image per category for the storefront hero.
                </p>
                <p className="w-full text-[11px] text-slate-400">{IMAGE_HINT_CATEGORY}</p>
                <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {(categoriesList.length ? categoriesList : ['General']).map((c, idx) => {
                    const canDel = !BUILTIN_CATEGORY_KEYS.has(String(c).trim().toLowerCase());
                    const img = String(categoryImages[c] || '').trim();
                    const uploadId = `category-image-upload-${idx}`;
                    const busy = categoryImageUploading === c;
                    return (
                      <div
                        key={`${c}-${idx}`}
                        className="flex flex-col gap-2 rounded-sm border border-slate-200 bg-white p-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 text-sm font-semibold text-slate-900" title={c}>
                            {c}
                          </p>
                          {canDel ? (
                            <button
                              type="button"
                              onClick={() => deleteCatalogCategory(c)}
                              className="shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                              title={`Delete category ${c}`}
                              aria-label={`Delete category ${c}`}
                            >
                              ×
                            </button>
                          ) : null}
                        </div>
                        <div className="relative mx-auto aspect-square w-full max-w-[140px] overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                          {img ? (
                            <img
                              src={resolveImageUrl(img)}
                              alt=""
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] text-slate-400">
                              No image
                            </div>
                          )}
                          {busy ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs font-semibold text-slate-700">
                              Uploading…
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label
                            htmlFor={uploadId}
                            className="cursor-pointer rounded-sm border border-slate-200 bg-slate-50 py-2 text-center text-xs font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-white"
                          >
                            {img ? 'Replace image' : 'Upload image'}
                          </label>
                          <input
                            id={uploadId}
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            disabled={busy}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadCatalogCategoryImage(c, f);
                              e.target.value = '';
                            }}
                          />
                          {img ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => clearCatalogCategoryImage(c)}
                              className="rounded-sm border border-red-100 bg-red-50/80 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                            >
                              Remove image
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3 rounded-sm border border-slate-200 bg-white p-4 shadow-sm">
                <div className="min-w-[200px] flex-1">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Add brand</label>
                  <input
                    value={newBrandNameInput}
                    onChange={(e) => setNewBrandNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCatalogBrand())}
                    placeholder="e.g. Farm Fresh Co."
                    className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-4 py-2.5 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={addCatalogBrand}
                  className="rounded-sm bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Add brand
                </button>
                <p className="w-full text-xs text-slate-500">
                  Brands appear on the homepage, shop filter, and product assignment. Upload a logo for each brand (optional but recommended).
                </p>
                <p className="w-full text-[11px] text-slate-400">{IMAGE_HINT_BRAND_LOGO}</p>
                <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {brandsList.map((b) => {
                    const img = String(b.logo_url || '').trim();
                    const uploadBid = `brand-logo-upload-${b.id}`;
                    const busy = brandLogoUploading === b.id;
                    return (
                      <div
                        key={b.id}
                        className="flex flex-col gap-2 rounded-sm border border-slate-200 bg-slate-50/80 p-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{b.name}</p>
                          <button
                            type="button"
                            onClick={() => deleteCatalogBrand(b.id)}
                            className="shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                            title={`Delete ${b.name}`}
                          >
                            ×
                          </button>
                        </div>
                        <div className="relative flex h-20 w-full items-center justify-center rounded-sm border border-slate-200 bg-white px-2">
                          {img ? (
                            <img src={resolveImageUrl(img)} alt="" className="max-h-16 max-w-full object-contain" />
                          ) : (
                            <span className="text-[10px] text-slate-400">No logo</span>
                          )}
                          {busy ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-xs font-semibold text-slate-700">
                              Uploading…
                            </div>
                          ) : null}
                        </div>
                        <label
                          htmlFor={uploadBid}
                          className="cursor-pointer rounded-sm border border-slate-200 bg-white py-2 text-center text-xs font-semibold text-slate-800 transition hover:border-slate-300"
                        >
                          {img ? 'Replace logo' : 'Upload logo'}
                        </label>
                        <input
                          id={uploadBid}
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          disabled={busy}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadBrandLogo(b.id, f);
                            e.target.value = '';
                          }}
                        />
                        {img ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => clearBrandLogo(b.id)}
                            className="rounded-sm border border-red-100 bg-red-50/80 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                          >
                            Remove logo
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <details
                className="group rounded-sm border border-slate-200 bg-white shadow-sm"
                onToggle={(e) => {
                  if (e.currentTarget.open) {
                    setExpandedProductId(null);
                    setEditingProduct(null);
                    setEditingProductImage(null);
                    setEditingGalleryFiles([]);
                  }
                }}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  <span>Add new product</span>
                  <span className="text-slate-400 transition-transform duration-200 group-open:rotate-180">▼</span>
                </summary>
                <div className="border-t border-slate-200 bg-slate-50 p-4">
              <form onSubmit={createProduct} className="space-y-4">
                <h3 className="text-base font-semibold text-slate-900">New product details</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <input
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                    placeholder="Product Name"
                    required
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3"
                  />
                  <input
                    value={newProduct.price}
                    onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                    placeholder="Selling price"
                    type="number"
                    step="0.01"
                    required
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3"
                  />
                  <input
                    value={newProduct.regular_price}
                    onChange={(e) => setNewProduct({ ...newProduct, regular_price: e.target.value })}
                    placeholder="Regular / MRP (optional)"
                    type="number"
                    step="0.01"
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3"
                  />
                  <div className="rounded-sm border border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold text-slate-600">Availability</p>
                    <div className="mt-2 flex flex-wrap gap-4">
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="newProductAvailability"
                          checked={newProduct.availability === 'in'}
                          onChange={() => setNewProduct({ ...newProduct, availability: 'in', preorder_available_date: '' })}
                        />
                        In stock
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="newProductAvailability"
                          checked={newProduct.availability === 'out'}
                          onChange={() => setNewProduct({ ...newProduct, availability: 'out', preorder_available_date: '' })}
                        />
                        Out of stock
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="newProductAvailability"
                          checked={newProduct.availability === 'preorder'}
                          onChange={() => setNewProduct({ ...newProduct, availability: 'preorder' })}
                        />
                        Pre-order
                      </label>
                    </div>
                    {newProduct.availability === 'preorder' && (
                      <div className="mt-3">
                        <label className="text-xs font-semibold text-slate-600">Stock available from (date)</label>
                        <input
                          type="date"
                          value={newProduct.preorder_available_date || ''}
                          onChange={(e) => setNewProduct({ ...newProduct, preorder_available_date: e.target.value })}
                          className="mt-1 w-full max-w-xs rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                      </div>
                    )}
                  </div>
                  <select
                    value={newProduct.category}
                    onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3"
                  >
                    {(categoriesList.length ? categoriesList : ['General']).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newProduct.brand_id || ''}
                    onChange={(e) => setNewProduct({ ...newProduct, brand_id: e.target.value })}
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3"
                  >
                    <option value="">No brand</option>
                    {brandsList.map((b) => (
                      <option key={b.id} value={String(b.id)}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={newProduct.sizes}
                    onChange={(e) => setNewProduct({ ...newProduct, sizes: e.target.value })}
                    placeholder="Sizes — legacy comma list (optional if units below)"
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3 md:col-span-2"
                  />
                  <input
                    value={newProduct.colors}
                    onChange={(e) => setNewProduct({ ...newProduct, colors: e.target.value })}
                    placeholder="Colors (comma-separated)"
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3 md:col-span-2"
                  />
                  <div className="md:col-span-2 rounded-sm border border-dashed border-slate-200 bg-slate-50/80 p-4">
                    <p className="text-sm font-semibold text-slate-800">Unit / weight options</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Each row: label (e.g. 5kg) and price in ৳. Shown on the product page; selling price above is the fallback.
                    </p>
                    <div className="mt-3 space-y-2">
                      {newPricingOptionRows.map((row, i) => (
                        <div key={i} className="flex flex-wrap items-end gap-2">
                          <input
                            value={row.label}
                            onChange={(e) => {
                              const next = [...newPricingOptionRows];
                              next[i] = { ...next[i], label: e.target.value };
                              setNewPricingOptionRows(next);
                            }}
                            placeholder="e.g. 5kg"
                            className="min-w-[120px] flex-1 rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                          <input
                            type="number"
                            step="0.01"
                            value={row.price}
                            onChange={(e) => {
                              const next = [...newPricingOptionRows];
                              next[i] = { ...next[i], price: e.target.value };
                              setNewPricingOptionRows(next);
                            }}
                            placeholder="Price ৳"
                            className="w-28 rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                          {newPricingOptionRows.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => setNewPricingOptionRows(newPricingOptionRows.filter((_, j) => j !== i))}
                              className="rounded-sm border border-brand-200 px-2 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setNewPricingOptionRows([...newPricingOptionRows, { label: '', price: '' }])}
                        className="text-xs font-semibold text-brand-700 hover:underline"
                      >
                        + Add unit
                      </button>
                    </div>
                  </div>
                </div>
                <div className="rounded-sm border border-slate-200 bg-white p-4">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Extra photos (gallery)</label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setNewGalleryFiles(Array.from(e.target.files || []))}
                    className="w-full text-sm text-slate-600"
                  />
                  {newGalleryPreviewUrls.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {newGalleryPreviewUrls.map((u, idx) => (
                        <img
                          key={u}
                          src={u}
                          alt=""
                          className="h-16 w-16 rounded-sm border border-slate-200 object-cover"
                        />
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-xs font-semibold text-slate-600">Or image URLs (one per line)</p>
                  <textarea
                    value={newGalleryUrlLines}
                    onChange={(e) => setNewGalleryUrlLines(e.target.value)}
                    placeholder="https://..."
                    rows={3}
                    className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{IMAGE_HINT_PRODUCT_GALLERY}</p>
                </div>
                <div className="rounded-sm border border-slate-200 bg-white p-4">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Product Image Attachment</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setNewProductImage(e.target.files?.[0] || null)}
                    required
                    className="w-full text-sm text-slate-600"
                  />
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{IMAGE_HINT_PRODUCT_MAIN}</p>
                </div>
                <textarea
                  value={newProduct.description}
                  onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                  placeholder="Product Description"
                  required
                  className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3"
                  rows="4"
                />
                <button className="rounded-sm bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">
                  Add Product
                </button>
              </form>
                </div>
              </details>

              <div className="flex flex-wrap gap-3">
                <select
                  value={productSort}
                  onChange={(event) => setProductSort(event.target.value)}
                  className="rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                >
                  <option value="latest">Sort: Latest</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="stock-low">Availability: Out first</option>
                </select>
              </div>

              <div className="overflow-x-auto rounded-sm border border-slate-200">
                <table className="min-w-[720px] w-full table-fixed divide-y divide-slate-200 text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-left text-slate-600">
                      <th className="w-10 whitespace-nowrap px-2 py-2">#</th>
                      <th className="min-w-0 px-2 py-2">Product</th>
                      <th className="w-28 whitespace-nowrap px-2 py-2">Price</th>
                      <th className="w-28 whitespace-nowrap px-2 py-2">Status</th>
                      <th className="w-36 whitespace-nowrap px-2 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {visibleProducts.map((product) => (
                      <Fragment key={product.id}>
                        <tr className="align-middle">
                          <td className="whitespace-nowrap px-2 py-1.5 text-slate-500">{product.id}</td>
                          <td className="min-w-0 px-2 py-1.5">
                            <div className="flex max-w-md items-center gap-2">
                              <img
                                src={resolveImageUrl(product.image)}
                                alt=""
                                className="h-8 w-8 shrink-0 rounded-sm border border-slate-200 object-cover"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium leading-tight text-slate-900">{product.name}</p>
                                <p className="truncate text-[11px] leading-tight text-slate-500">{product.category || 'General'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5">
                            {(() => {
                              const pr = displayPriceRange(product);
                              const main = pr.single ? `৳${pr.min.toFixed(0)}` : `From ৳${pr.min.toFixed(0)}`;
                              const showStrike =
                                product.regular_price != null && Number(product.regular_price) > pr.min;
                              return showStrike ? (
                                <span>
                                  <span className="text-slate-400 line-through">
                                    ৳{Number(product.regular_price).toFixed(0)}
                                  </span>{' '}
                                  <span className="font-semibold text-slate-900">{main}</span>
                                </span>
                              ) : (
                                <span className="font-semibold">{main}</span>
                              );
                            })()}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5">
                            <span
                              className={`inline-flex max-w-[11rem] flex-wrap rounded-sm px-2 py-0.5 text-[11px] font-semibold ${
                                Number(product.stock) > 0
                                  ? 'bg-sage-100 text-sage-800'
                                  : product.preorder_available_date
                                    ? 'bg-peach-100 text-peach-900'
                                    : 'bg-brand-100 text-brand-800'
                              }`}
                            >
                              {Number(product.stock) > 0
                                ? 'In stock'
                                : product.preorder_available_date
                                  ? `Pre-order · ${formatPreorderDateLabel(product.preorder_available_date)}`
                                  : 'Out of stock'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right">
                            <span className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  if (expandedProductId === product.id) {
                                    setExpandedProductId(null);
                                    setEditingProduct(null);
                                    setEditingProductImage(null);
                                    setEditingGalleryFiles([]);
                                    setEditingGalleryUrlLines('');
                                    return;
                                  }
                                  const p = { ...product };
                                  if (Array.isArray(p.sizes)) p.sizes = p.sizes.join(', ');
                                  if (Array.isArray(p.colors)) p.colors = p.colors.join(', ');
                                  if (!Array.isArray(p.gallery)) p.gallery = [];
                                  const mainKey = String(p.image || '').trim();
                                  if (mainKey)
                                    p.gallery = p.gallery.map(String).filter(Boolean).filter((g) => g !== mainKey);
                                  if (p.regular_price == null) p.regular_price = '';
                                  const pd = p.preorder_available_date ? formatPreorderInput(p.preorder_available_date) : '';
                                  p.preorder_available_date = pd;
                                  p.availability = stockToAvailability(p.stock, pd);
                                  p.brand_id = product.brand?.id != null ? String(product.brand.id) : '';
                                  setEditingPricingOptionRows(
                                    Array.isArray(product.pricing_options) && product.pricing_options.length
                                      ? product.pricing_options.map((o) => ({
                                          label: String(o.label || ''),
                                          price: o.price != null && o.price !== '' ? String(o.price) : '',
                                        }))
                                      : [{ label: '', price: '' }]
                                  );
                                  setEditingProduct(p);
                                  setExpandedProductId(product.id);
                                  setEditingProductImage(null);
                                  setEditingGalleryFiles([]);
                                  setEditingGalleryUrlLines('');
                                }}
                                className={`rounded-sm px-2.5 py-1 text-[11px] font-semibold shadow-sm ${
                                  expandedProductId === product.id
                                    ? 'border border-slate-300 bg-slate-100 text-slate-800'
                                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                {expandedProductId === product.id ? 'Close' : 'Edit'}
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteProduct(product.id)}
                                className="rounded-sm bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-500"
                              >
                                Delete
                              </button>
                            </span>
                          </td>
                        </tr>
                        {expandedProductId === product.id && editingProduct?.id === product.id && (
                          <tr className="bg-sage-50/60">
                            <td colSpan={5} className="border-t border-sage-100 p-4">
                              <form onSubmit={saveProduct} className="space-y-4">
                                <h3 className="text-base font-semibold text-slate-900">Edit product #{editingProduct.id}</h3>
                                <div className="grid gap-4 md:grid-cols-2">
                                  <input
                                    value={editingProduct.name}
                                    onChange={(event) => setEditingProduct({ ...editingProduct, name: event.target.value })}
                                    className="rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm"
                                    required
                                  />
                                  <select
                                    value={editingProduct.category || 'General'}
                                    onChange={(event) => setEditingProduct({ ...editingProduct, category: event.target.value })}
                                    className="rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm"
                                  >
                                    {(categoriesList.length ? categoriesList : ['General']).map((c) => (
                                      <option key={c} value={c}>
                                        {c}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    value={editingProduct.brand_id || ''}
                                    onChange={(event) =>
                                      setEditingProduct({ ...editingProduct, brand_id: event.target.value })
                                    }
                                    className="rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm"
                                  >
                                    <option value="">No brand</option>
                                    {brandsList.map((br) => (
                                      <option key={br.id} value={String(br.id)}>
                                        {br.name}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    value={editingProduct.price}
                                    type="number"
                                    step="0.01"
                                    onChange={(event) => setEditingProduct({ ...editingProduct, price: event.target.value })}
                                    placeholder="Selling price"
                                    className="rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm"
                                    required
                                  />
                                  <input
                                    value={editingProduct.regular_price ?? ''}
                                    type="number"
                                    step="0.01"
                                    onChange={(event) => setEditingProduct({ ...editingProduct, regular_price: event.target.value })}
                                    placeholder="Regular / MRP (optional)"
                                    className="rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm"
                                  />
                                  <div className="rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm">
                                    <p className="text-xs font-semibold text-slate-600">Availability</p>
                                    <div className="mt-2 flex flex-wrap gap-4">
                                      <label className="flex cursor-pointer items-center gap-2">
                                        <input
                                          type="radio"
                                          name={`editAvailability-${editingProduct.id}`}
                                          checked={editingProduct.availability === 'in'}
                                          onChange={() =>
                                            setEditingProduct({
                                              ...editingProduct,
                                              availability: 'in',
                                              preorder_available_date: '',
                                            })
                                          }
                                        />
                                        In stock
                                      </label>
                                      <label className="flex cursor-pointer items-center gap-2">
                                        <input
                                          type="radio"
                                          name={`editAvailability-${editingProduct.id}`}
                                          checked={editingProduct.availability === 'out'}
                                          onChange={() =>
                                            setEditingProduct({
                                              ...editingProduct,
                                              availability: 'out',
                                              preorder_available_date: '',
                                            })
                                          }
                                        />
                                        Out of stock
                                      </label>
                                      <label className="flex cursor-pointer items-center gap-2">
                                        <input
                                          type="radio"
                                          name={`editAvailability-${editingProduct.id}`}
                                          checked={editingProduct.availability === 'preorder'}
                                          onChange={() => setEditingProduct({ ...editingProduct, availability: 'preorder' })}
                                        />
                                        Pre-order
                                      </label>
                                    </div>
                                    {editingProduct.availability === 'preorder' && (
                                      <div className="mt-3">
                                        <label className="text-xs font-semibold text-slate-600">Stock available from (date)</label>
                                        <input
                                          type="date"
                                          value={editingProduct.preorder_available_date || ''}
                                          onChange={(e) =>
                                            setEditingProduct({ ...editingProduct, preorder_available_date: e.target.value })
                                          }
                                          className="mt-1 w-full max-w-xs rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                                        />
                                      </div>
                                    )}
                                  </div>
                                  <input
                                    value={typeof editingProduct.sizes === 'string' ? editingProduct.sizes : ''}
                                    onChange={(event) => setEditingProduct({ ...editingProduct, sizes: event.target.value })}
                                    placeholder="Sizes — legacy comma list (optional if units below)"
                                    className="rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm md:col-span-2"
                                  />
                                  <input
                                    value={typeof editingProduct.colors === 'string' ? editingProduct.colors : ''}
                                    onChange={(event) => setEditingProduct({ ...editingProduct, colors: event.target.value })}
                                    placeholder="Colors (comma-separated)"
                                    className="rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm md:col-span-2"
                                  />
                                  <div className="md:col-span-2 rounded-sm border border-dashed border-slate-200 bg-slate-50/80 p-4">
                                    <p className="text-sm font-semibold text-slate-800">Unit / weight options</p>
                                    <p className="mt-1 text-xs text-slate-500">Label + price per unit (e.g. 10kg — ৳200).</p>
                                    <div className="mt-3 space-y-2">
                                      {editingPricingOptionRows.map((row, i) => (
                                        <div key={i} className="flex flex-wrap items-end gap-2">
                                          <input
                                            value={row.label}
                                            onChange={(e) => {
                                              const next = [...editingPricingOptionRows];
                                              next[i] = { ...next[i], label: e.target.value };
                                              setEditingPricingOptionRows(next);
                                            }}
                                            placeholder="e.g. 5kg"
                                            className="min-w-[120px] flex-1 rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                                          />
                                          <input
                                            type="number"
                                            step="0.01"
                                            value={row.price}
                                            onChange={(e) => {
                                              const next = [...editingPricingOptionRows];
                                              next[i] = { ...next[i], price: e.target.value };
                                              setEditingPricingOptionRows(next);
                                            }}
                                            placeholder="Price ৳"
                                            className="w-28 rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                                          />
                                          {editingPricingOptionRows.length > 1 ? (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setEditingPricingOptionRows(editingPricingOptionRows.filter((_, j) => j !== i))
                                              }
                                              className="rounded-sm border border-brand-200 px-2 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                                            >
                                              Remove
                                            </button>
                                          ) : null}
                                        </div>
                                      ))}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEditingPricingOptionRows([...editingPricingOptionRows, { label: '', price: '' }])
                                        }
                                        className="text-xs font-semibold text-brand-700 hover:underline"
                                      >
                                        + Add unit
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                <div className="rounded-sm border border-slate-200 bg-white p-4 space-y-3">
                                  <div>
                                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                                      Extra photos after main cover
                                    </label>
                                    {(Array.isArray(editingProduct.gallery) ? editingProduct.gallery : []).length > 0 ? (
                                      <div className="flex flex-wrap gap-2">
                                        {(editingProduct.gallery || []).map((g, idx) => (
                                          <div key={`${g}-${idx}`} className="relative shrink-0">
                                            <img
                                              src={resolveImageUrl(g)}
                                              alt=""
                                              className="h-20 w-20 rounded-sm border border-slate-200 object-cover"
                                            />
                                            <div className="mt-1 flex gap-1">
                                              <button
                                                type="button"
                                                aria-label="Move earlier"
                                                disabled={idx === 0}
                                                onClick={() => {
                                                  const list = [...(editingProduct.gallery || [])];
                                                  if (idx < 1) return;
                                                  ;[list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
                                                  setEditingProduct({ ...editingProduct, gallery: list });
                                                }}
                                                className="rounded-sm border border-slate-200 px-2 py-0.5 text-[10px] font-semibold disabled:opacity-40"
                                              >
                                                ↑
                                              </button>
                                              <button
                                                type="button"
                                                aria-label="Move later"
                                                disabled={idx >= (editingProduct.gallery?.length ?? 0) - 1}
                                                onClick={() => {
                                                  const list = [...(editingProduct.gallery || [])];
                                                  if (idx >= list.length - 1) return;
                                                  ;[list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
                                                  setEditingProduct({ ...editingProduct, gallery: list });
                                                }}
                                                className="rounded-sm border border-slate-200 px-2 py-0.5 text-[10px] font-semibold disabled:opacity-40"
                                              >
                                                ↓
                                              </button>
                                              <button
                                                type="button"
                                                aria-label="Remove"
                                                onClick={() => {
                                                  const next = [...(editingProduct.gallery || [])];
                                                  next.splice(idx, 1);
                                                  setEditingProduct({ ...editingProduct, gallery: next });
                                                }}
                                                className="rounded-sm border border-brand-200 px-2 py-0.5 text-[10px] font-semibold text-brand-700"
                                              >
                                                ×
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-slate-500">No extra photos yet.</p>
                                    )}
                                  </div>
                                  <div>
                                    <label className="mb-2 block text-sm font-semibold text-slate-700">Upload more photos</label>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      multiple
                                      onChange={(e) => setEditingGalleryFiles(Array.from(e.target.files || []))}
                                      className="w-full text-sm text-slate-600"
                                    />
                                    {editingGalleryFiles.length > 0 ? (
                                      <p className="mt-2 text-[11px] text-sage-800">
                                        {editingGalleryFiles.length} file(s) will append on Save
                                      </p>
                                    ) : null}
                                  </div>
                                  <div>
                                    <label className="mb-2 block text-sm font-semibold text-slate-700">Add URLs (one per line)</label>
                                    <textarea
                                      value={editingGalleryUrlLines}
                                      onChange={(e) => setEditingGalleryUrlLines(e.target.value)}
                                      placeholder="https://..."
                                      rows={3}
                                      className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                                    />
                                  </div>
                                  <p className="text-xs leading-relaxed text-slate-500">{IMAGE_HINT_PRODUCT_GALLERY}</p>
                                </div>
                                <div className="rounded-sm border border-slate-200 bg-white p-4">
                                  <div className="mb-3 flex items-center gap-3">
                                    <img
                                      src={resolveImageUrl(editingProduct.image)}
                                      alt={editingProduct.name}
                                      className="h-14 w-14 rounded-sm border border-slate-200 object-cover"
                                    />
                                    <p className="text-xs text-slate-500">Current image: {editingProduct.image}</p>
                                  </div>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(event) => setEditingProductImage(event.target.files?.[0] || null)}
                                    className="w-full text-sm text-slate-600"
                                  />
                                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{IMAGE_HINT_PRODUCT_MAIN}</p>
                                </div>
                                <textarea
                                  value={editingProduct.description}
                                  onChange={(event) => setEditingProduct({ ...editingProduct, description: event.target.value })}
                                  rows="4"
                                  className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm"
                                  required
                                />
                                <div className="flex flex-wrap gap-3">
                                  <button
                                    type="submit"
                                    disabled={savingId === editingProduct.id}
                                    className="rounded-sm bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-400"
                                  >
                                    {savingId === editingProduct.id ? 'Saving...' : 'Save changes'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingProduct(null);
                                      setExpandedProductId(null);
                                      setEditingProductImage(null);
                                      setEditingGalleryFiles([]);
                                      setEditingGalleryUrlLines('');
                                    }}
                                    className="rounded-sm border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-slate-900">User Management</h2>
              <div className="grid gap-4">
                {visibleUsers.map((user) => (
                  <div key={user.id} className="flex flex-col gap-3 rounded-sm border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-[220px]">
                      <p className="font-semibold text-slate-900">{user.name}</p>
                      <p className="text-sm text-slate-600">{user.email}</p>
                      <p className="text-xs text-slate-500">Joined: {formatDate(user.created_at)}</p>
                      <span className="mt-2 inline-block rounded-sm bg-sage-100 px-3 py-1 text-xs font-semibold text-sage-700 capitalize">
                        {user.role}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={user.role}
                        onChange={(event) => updateUserRole(user.id, event.target.value)}
                        className="rounded-sm border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"
                      >
                        <option value="customer">Customer</option>
                        <option value="admin">Admin</option>
                      </select>
                      {user.role !== 'admin' && (
                        <button
                          disabled={savingId === user.id}
                          onClick={() => deleteUser(user.id)}
                          className="rounded-sm bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-500 disabled:bg-brand-300"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-slate-900">Order Management</h2>
              <div>
                <select
                  value={orderStatusFilter}
                  onChange={(event) => setOrderStatusFilter(event.target.value)}
                  className="rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="Processing">Processing</option>
                  <option value="Shipped">Shipped</option>
                  <option value="Delivered">Delivered</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
              <div className="grid gap-4">
                {visibleOrders.map((order) => {
                  const orderTotal = Number(order.total_price || 0);
                  const paid = Number(order.amount_paid != null ? order.amount_paid : 0);
                  const due = Math.max(0, orderTotal - (Number.isFinite(paid) ? paid : 0));
                  const ret = String(order.return_status || 'none').toLowerCase();
                  return (
                  <div key={order.id} className="rounded-sm border border-slate-200 bg-slate-50 p-4 transition hover:shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                      <div>
                        <p className="font-semibold text-slate-900">Order #{order.id}</p>
                        <p className="text-sm text-slate-600">{order.customer_name} - {order.customer_phone}</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {ret !== 'none' ? (
                          <span className="rounded-sm bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                            Return: {ret}
                          </span>
                        ) : null}
                      <span className={`rounded-sm px-3 py-1 text-xs font-semibold capitalize ${
                        order.status === 'Delivered' ? 'bg-sage-100 text-sage-700' :
                        order.status === 'Pending' ? 'bg-peach-100 text-peach-800' :
                        order.status === 'Cancelled' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {order.status}
                      </span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 mb-1">
                      Total: ৳{Number(order.total_price).toFixed(2)} | Method: {order.payment_type}
                    </p>
                    <p className="mb-3 text-xs font-medium text-slate-700">
                      Paid: ৳{paid.toFixed(2)} · Due: ৳{due.toFixed(2)}
                    </p>
                    <p className="mb-2 text-xs font-medium text-slate-700">
                      Delivery:{' '}
                      {order.delivery_method === 'point'
                        ? 'Inside Dhaka · Point delivery'
                        : order.delivery_method === 'home'
                          ? 'Inside Dhaka · Home delivery'
                          : String(order.customer_address || '').includes('(Outside Dhaka)')
                            ? 'Outside Dhaka'
                            : String(order.customer_address || '').includes('(Inside Dhaka)')
                              ? 'Inside Dhaka'
                              : '—'}
                    </p>
                    <div className="mb-3 rounded-sm border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Delivery address</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-700">{order.customer_address || 'No address provided'}</p>
                    </div>
                    {(() => {
                      const lineItems = parseOrderItems(order);
                      if (!lineItems.length) return null;
                      return (
                        <div className="mb-3 rounded-sm border border-slate-200 bg-white px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Line items</p>
                          <ul className="mt-2 space-y-2 text-sm">
                            {lineItems.map((it, idx) => (
                              <li
                                key={idx}
                                className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-2 text-slate-800 last:border-0 last:pb-0"
                              >
                                <span>
                                  {it.name}
                                  {(it.selectedSize || it.selectedColor) && (
                                    <span className="text-xs text-slate-500">
                                      {' '}
                                      ({[it.selectedSize, it.selectedColor].filter(Boolean).join(' · ')})
                                    </span>
                                  )}
                                </span>
                                <span className="text-slate-600">
                                  {it.quantity} × ৳{Number(it.price).toFixed(2)} = ৳
                                  {(Number(it.price) * Number(it.quantity)).toFixed(2)}
                                </span>
                              </li>
                            ))}
                          </ul>
                          <dl className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
                            <div className="flex justify-between">
                              <dt>Subtotal</dt>
                              <dd>৳{Number(order.subtotal ?? 0).toFixed(2)}</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt>Shipping</dt>
                              <dd>৳{Number(order.shipping_fee ?? 0).toFixed(2)}</dd>
                            </div>
                            {Number(order.discount_amount) > 0 ? (
                              <div className="flex justify-between text-sage-800">
                                <dt>Discount</dt>
                                <dd>−৳{Number(order.discount_amount).toFixed(2)}</dd>
                              </div>
                            ) : null}
                            <div className="flex justify-between font-semibold text-slate-900">
                              <dt>Order total</dt>
                              <dd>৳{Number(order.total_price).toFixed(2)}</dd>
                            </div>
                          </dl>
                        </div>
                      );
                    })()}
                    <div className="mb-3 space-y-1 text-sm text-slate-700">
                      {order.customer_email ? (
                        <p>
                          <span className="text-slate-500">Email:</span> {order.customer_email}
                        </p>
                      ) : null}
                      {order.coupon_code ? (
                        <p>
                          <span className="text-slate-500">Coupon:</span> {order.coupon_code}
                        </p>
                      ) : null}
                      {order.bkash_number ? (
                        <p>
                          <span className="text-slate-500">bKash / payment note:</span> {order.bkash_number}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-500 mb-3">Placed: {formatDate(order.created_at)}</p>
                    {order.status === 'Cancelled' && order.cancellation_reason ? (
                      <p className="mb-3 rounded-sm border border-red-100 bg-red-50/80 px-3 py-2 text-xs text-red-900">
                        <span className="font-semibold">Cancellation: </span>
                        {order.cancellation_reason}
                      </p>
                    ) : null}
                    {ret !== 'none' && order.return_notes ? (
                      <p className="mb-3 rounded-sm border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
                        <span className="font-semibold">Return notes: </span>
                        {order.return_notes}
                      </p>
                    ) : null}
                    {order.tracking_number ? (
                      <p className="mb-2 text-xs text-slate-700">
                        Tracking / consignment:{' '}
                        <span className="font-mono font-semibold text-slate-900">{order.tracking_number}</span>
                        {order.courier_name ? (
                          <span className="text-slate-500"> · {order.courier_name}</span>
                        ) : null}
                      </p>
                    ) : null}
                    {order.steadfast_invoice ? (
                      <p className="mb-2 text-xs text-slate-600">
                        Steadfast invoice ref:{' '}
                        <span className="font-mono text-slate-800">{order.steadfast_invoice}</span>
                      </p>
                    ) : null}
                    {order.courier_dispatch_error ? (
                      <p className="mb-2 rounded-sm border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
                        Courier / Steadfast error: {order.courier_dispatch_error}
                      </p>
                    ) : null}
                    <div className="mb-3 flex flex-wrap gap-2">
                      {['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'].map((status) => (
                        <button
                          key={status}
                          onClick={() => quickStatusUpdate(order, status)}
                          className={`rounded-sm px-3 py-1 text-xs font-semibold transition ${
                            order.status === status
                              ? 'bg-slate-900 text-white'
                              : status === 'Cancelled'
                                ? 'border border-red-200 text-red-800 hover:bg-red-50'
                                : 'border border-slate-300 text-slate-700 hover:bg-white'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => printOrderSheet(order)}
                        className="rounded-sm border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                      >
                        Print
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadOrderPdf(order)}
                        className="rounded-sm border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                      >
                        Download PDF
                      </button>
                      {(order.status === 'Pending' || order.status === 'Processing') && (
                        <button
                          disabled={savingId === order.id}
                          onClick={() => dispatchToSteadfast(order.id)}
                          className="rounded-sm bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500 disabled:text-white"
                        >
                          Dispatch to Steadfast
                        </button>
                      )}
                      {(order.tracking_number ||
                        order.steadfast_invoice ||
                        order.steadfast_consignment_id) &&
                        order.status !== 'Delivered' &&
                        order.status !== 'Cancelled' && (
                        <button
                          type="button"
                          disabled={savingId === `sync-${order.id}`}
                          onClick={() => syncSteadfastOrder(order.id)}
                          className="rounded-sm border border-sage-200 bg-sage-50 px-4 py-2 text-xs font-semibold text-sage-900 hover:bg-sage-100 disabled:opacity-50"
                        >
                          Sync Steadfast status
                        </button>
                      )}
                      
                      {selectedOrder === order.id ? (
                        <div className="flex-1 min-w-[min(100%,18rem)] space-y-3 rounded-sm border border-slate-200 bg-white p-4 shadow-sm">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Paid / due</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="block text-xs text-slate-600">
                              Amount paid (৳)
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={orderUpdate.amount_paid}
                                onChange={(e) => setOrderUpdate({ ...orderUpdate, amount_paid: e.target.value })}
                                className="mt-1 w-full rounded-sm border border-slate-200 px-3 py-2 text-sm"
                              />
                            </label>
                            <div className="flex flex-col justify-end rounded-sm border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                              <span className="text-[11px] font-semibold uppercase text-slate-500">Due</span>
                              <span className="font-semibold text-slate-900">
                                ৳
                                {Math.max(
                                  0,
                                  Number(order.total_price || 0) -
                                    (Number.isFinite(Number(orderUpdate.amount_paid))
                                      ? Number(orderUpdate.amount_paid)
                                      : 0)
                                ).toFixed(2)}
                              </span>
                            </div>
                          </div>

                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Return</p>
                          <select
                            value={orderUpdate.return_status}
                            onChange={(e) => setOrderUpdate({ ...orderUpdate, return_status: e.target.value })}
                            className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm"
                          >
                            <option value="none">None</option>
                            <option value="requested">Requested</option>
                            <option value="approved">Approved</option>
                            <option value="received">Received back</option>
                            <option value="closed">Closed</option>
                          </select>
                          <textarea
                            value={orderUpdate.return_notes}
                            onChange={(e) => setOrderUpdate({ ...orderUpdate, return_notes: e.target.value })}
                            placeholder="Return notes (reason, SKU, condition…)"
                            rows={2}
                            className="w-full resize-y rounded-sm border border-slate-200 px-3 py-2 text-sm"
                          />

                          <select
                            value={orderUpdate.status}
                            onChange={(e) => setOrderUpdate({ ...orderUpdate, status: e.target.value })}
                            className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm"
                          >
                            <option value="">Select Status</option>
                            <option value="Pending">Pending</option>
                            <option value="Processing">Processing</option>
                            <option value="Shipped">Shipped</option>
                            <option value="Delivered">Delivered</option>
                            <option value="Cancelled">Cancelled</option>
                          </select>
                          {orderUpdate.status === 'Cancelled' ? (
                            <textarea
                              value={orderUpdate.cancellation_reason}
                              onChange={(e) => setOrderUpdate({ ...orderUpdate, cancellation_reason: e.target.value })}
                              placeholder="Cancellation reason (visible on this order)"
                              rows={2}
                              className="w-full resize-y rounded-sm border border-red-100 bg-red-50/40 px-3 py-2 text-sm text-red-950"
                            />
                          ) : null}

                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Courier &amp; tracking</p>
                          <select
                            value={orderUpdate.courier_name}
                            onChange={(e) => setOrderUpdate({ ...orderUpdate, courier_name: e.target.value })}
                            className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm"
                          >
                            <option value="">Select Courier</option>
                            {couriers.map((c) => (
                              <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                          </select>

                          <input
                            value={orderUpdate.tracking_number}
                            onChange={(e) => setOrderUpdate({ ...orderUpdate, tracking_number: e.target.value })}
                            placeholder="Tracking Number"
                            className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm"
                          />

                          <div className="flex gap-2">
                            <button
                              disabled={savingId === order.id}
                              onClick={() => updateOrder(order.id)}
                              className="flex-1 rounded-sm bg-sage-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-sage-500 disabled:bg-sage-300"
                            >
                              {savingId === order.id ? 'Updating...' : 'Update'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOrder(null);
                                setOrderUpdate({
                                  status: '',
                                  courier_name: '',
                                  tracking_number: '',
                                  amount_paid: '',
                                  return_status: 'none',
                                  return_notes: '',
                                  cancellation_reason: '',
                                });
                              }}
                              className="flex-1 rounded-sm border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedOrder(order.id);
                            const ap = order.amount_paid != null && Number.isFinite(Number(order.amount_paid)) ? Number(order.amount_paid) : 0;
                            setOrderUpdate({
                              status: order.status,
                              courier_name: order.courier_name || '',
                              tracking_number: order.tracking_number || '',
                              amount_paid: String(ap),
                              return_status: String(order.return_status || 'none').toLowerCase(),
                              return_notes: order.return_notes || '',
                              cancellation_reason: order.cancellation_reason || '',
                            });
                          }}
                          className="rounded-sm bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          Update Details
                        </button>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'couriers' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-slate-900">Courier Management</h2>
              <p className="text-sm text-slate-600">
                Checkout does not ask customers to pick a courier. Use Settings → Delivery &amp; shipping for charges. Couriers here are for dispatch (e.g. Steadfast) and assigning tracking on orders.
              </p>
              <div className="overflow-x-auto rounded-sm border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-slate-600">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Base Rate</th>
                      <th className="px-4 py-3">Inside Dhaka</th>
                      <th className="px-4 py-3">Outside Dhaka</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {couriers.map((courier) => (
                      <tr key={courier.id}>
                        <td className="px-4 py-3 font-medium">{courier.name}</td>
                        <td className="px-4 py-3">{courier.phone}</td>
                        <td className="px-4 py-3">{courier.email}</td>
                        <td className="px-4 py-3">৳{courier.base_rate}</td>
                        <td className="px-4 py-3 text-xs">
                          {courier.shipping_inside_dhaka != null ? `৳${courier.shipping_inside_dhaka}` : '— default'}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {courier.shipping_outside_dhaka != null ? `৳${courier.shipping_outside_dhaka}` : '— default'}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => deleteCourier(courier.id)}
                            className="rounded-sm bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-500"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <form onSubmit={createCourier} className="space-y-4 rounded-sm border border-slate-200 bg-slate-50 p-6">
                <h3 className="text-lg font-semibold text-slate-900">Add New Courier</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <input
                    value={newCourier.name}
                    onChange={(e) => setNewCourier({ ...newCourier, name: e.target.value })}
                    placeholder="Courier Name"
                    required
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3"
                  />
                  <input
                    value={newCourier.phone}
                    onChange={(e) => setNewCourier({ ...newCourier, phone: e.target.value })}
                    placeholder="Phone"
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3"
                  />
                  <input
                    value={newCourier.email}
                    onChange={(e) => setNewCourier({ ...newCourier, email: e.target.value })}
                    placeholder="Email"
                    type="email"
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3"
                  />
                  <input
                    value={newCourier.base_rate}
                    onChange={(e) => setNewCourier({ ...newCourier, base_rate: e.target.value })}
                    placeholder="Base Rate"
                    type="number"
                    step="0.01"
                    required
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3"
                  />
                  <input
                    value={newCourier.shipping_inside_dhaka}
                    onChange={(e) => setNewCourier({ ...newCourier, shipping_inside_dhaka: e.target.value })}
                    placeholder="Delivery inside Dhaka (৳, optional)"
                    type="number"
                    step="0.01"
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3"
                  />
                  <input
                    value={newCourier.shipping_outside_dhaka}
                    onChange={(e) => setNewCourier({ ...newCourier, shipping_outside_dhaka: e.target.value })}
                    placeholder="Delivery outside Dhaka (৳, optional)"
                    type="number"
                    step="0.01"
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3"
                  />
                </div>
                <p className="text-xs text-slate-600">
                  Leave delivery fields empty to use global shipping rates from Settings (fallback).
                </p>
                <button className="rounded-sm bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">
                  Add Courier
                </button>
              </form>
            </div>
          )}

          {activeTab === 'coupons' && (
            <div className="space-y-5">
              <h2 className="text-2xl font-semibold text-slate-900">Coupons</h2>
              <p className="text-sm text-slate-600">
                Restrict by product IDs (e.g. <code className="text-xs">1, 2, 5</code>) and/or categories (e.g.{' '}
                <code className="text-xs">Fashion, Electronics</code>). Leave both empty for store-wide coupons.
              </p>

              <form onSubmit={saveCoupon} className="space-y-4 rounded-sm border border-slate-200 bg-slate-50 p-6">
                <h3 className="text-lg font-semibold text-slate-900">Create coupon</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <input
                    value={couponForm.code}
                    onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value })}
                    placeholder="CODE"
                    required
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3 uppercase"
                  />
                  <select
                    value={couponForm.discount_type}
                    onChange={(e) => setCouponForm({ ...couponForm, discount_type: e.target.value })}
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3"
                  >
                    <option value="percent">Percent off</option>
                    <option value="fixed">Fixed amount (৳)</option>
                  </select>
                  <input
                    value={couponForm.discount_value}
                    onChange={(e) => setCouponForm({ ...couponForm, discount_value: e.target.value })}
                    placeholder={couponForm.discount_type === 'percent' ? 'Percent (e.g. 10)' : 'Amount (৳)'}
                    type="number"
                    step="0.01"
                    required
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3"
                  />
                  <input
                    value={couponForm.min_subtotal}
                    onChange={(e) => setCouponForm({ ...couponForm, min_subtotal: e.target.value })}
                    placeholder="Minimum eligible subtotal (৳)"
                    type="number"
                    step="0.01"
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3"
                  />
                  <input
                    value={couponForm.max_uses}
                    onChange={(e) => setCouponForm({ ...couponForm, max_uses: e.target.value })}
                    placeholder="Max uses (blank = unlimited)"
                    type="number"
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3"
                  />
                  <input
                    value={couponForm.expires_at}
                    onChange={(e) => setCouponForm({ ...couponForm, expires_at: e.target.value })}
                    type="datetime-local"
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3"
                  />
                  <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2">
                    <input
                      type="checkbox"
                      checked={couponForm.is_active}
                      onChange={(e) => setCouponForm({ ...couponForm, is_active: e.target.checked })}
                    />
                    Active
                  </label>
                  <input
                    value={couponForm.restrict_product_ids}
                    onChange={(e) => setCouponForm({ ...couponForm, restrict_product_ids: e.target.value })}
                    placeholder="Product IDs (comma-separated, optional)"
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3 md:col-span-2"
                  />
                  <input
                    value={couponForm.restrict_categories}
                    onChange={(e) => setCouponForm({ ...couponForm, restrict_categories: e.target.value })}
                    placeholder="Categories (comma-separated, optional)"
                    className="rounded-sm border border-slate-200 bg-white px-4 py-3 md:col-span-2"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingId === 'coupon'}
                  className="rounded-sm bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {savingId === 'coupon' ? 'Saving…' : 'Create coupon'}
                </button>
              </form>

              <div className="overflow-x-auto rounded-sm border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-slate-600">
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Value</th>
                      <th className="px-4 py-3">Min</th>
                      <th className="px-4 py-3">Uses</th>
                      <th className="px-4 py-3">Scope</th>
                      <th className="px-4 py-3">Expires</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {coupons.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-3 font-mono font-semibold">{c.code}</td>
                        <td className="px-4 py-3">{c.discount_type}</td>
                        <td className="px-4 py-3">{c.discount_value}</td>
                        <td className="px-4 py-3">{c.min_subtotal}</td>
                        <td className="px-4 py-3">
                          {c.used_count}
                          {c.max_uses != null ? ` / ${c.max_uses}` : ''}
                        </td>
                        <td className="max-w-[200px] px-4 py-3 text-xs text-slate-600">
                          {c.restrict_product_ids || c.restrict_categories ? (
                            <>
                              {c.restrict_product_ids ? (
                                <span className="block">IDs: {typeof c.restrict_product_ids === 'string' ? c.restrict_product_ids : JSON.stringify(c.restrict_product_ids)}</span>
                              ) : null}
                              {c.restrict_categories ? (
                                <span className="block">Cat: {typeof c.restrict_categories === 'string' ? c.restrict_categories : JSON.stringify(c.restrict_categories)}</span>
                              ) : null}
                            </>
                          ) : (
                            'All products'
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">{c.expires_at ? formatDate(c.expires_at) : '—'}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => removeCoupon(c.id)}
                            className="rounded-sm bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'advertise' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Advertise</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Homepage images that are not product photos — “Designed to feel…” panel and newsletter strip background.
                </p>
              </div>

              <div className="rounded-sm border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Unboxing hero (large image beside headline)</p>
                <p className="mt-1 text-xs text-slate-500">Only one media is used here: either one image or one video URL.</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Section title</label>
                    <input
                      type="text"
                      value={settings.advertise_unboxing_title || ''}
                      onChange={(e) => setSettings({ ...settings, advertise_unboxing_title: e.target.value })}
                      className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                      placeholder="Designed to feel as good as unboxing."
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Section subtitle</label>
                    <textarea
                      rows={3}
                      value={settings.advertise_unboxing_subtitle || ''}
                      onChange={(e) => setSettings({ ...settings, advertise_unboxing_subtitle: e.target.value })}
                      className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                      placeholder="A quieter kind of commerce..."
                    />
                  </div>
                  <div className="md:col-span-2">
                    <button
                      type="button"
                      disabled={savingId === 'advertise-unboxing-copy'}
                      onClick={async () => {
                        try {
                          setSavingId('advertise-unboxing-copy');
                          await Promise.all([
                            fetch(apiUrl('/api/settings/advertise_unboxing_title'), {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json', ...authHeaders },
                              body: JSON.stringify({ value: settings.advertise_unboxing_title || '' }),
                            }),
                            fetch(apiUrl('/api/settings/advertise_unboxing_subtitle'), {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json', ...authHeaders },
                              body: JSON.stringify({ value: settings.advertise_unboxing_subtitle || '' }),
                            }),
                          ]);
                          toast.success('Section title/subtitle saved');
                          fetchAdminData();
                        } catch {
                          toast.error('Could not save section text');
                        } finally {
                          setSavingId(null);
                        }
                      }}
                      className="rounded-sm bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {savingId === 'advertise-unboxing-copy' ? 'Saving…' : 'Save title & subtitle'}
                    </button>
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Media type</label>
                    <select
                      value={settings.advertise_unboxing_media_type || 'image'}
                      onChange={(e) => setSettings({ ...settings, advertise_unboxing_media_type: e.target.value })}
                      className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={savingId === 'advertise-unboxing-media-type'}
                      onClick={async () => {
                        try {
                          setSavingId('advertise-unboxing-media-type');
                          await fetch(apiUrl('/api/settings/advertise_unboxing_media_type'), {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', ...authHeaders },
                            body: JSON.stringify({
                              value:
                                String(settings.advertise_unboxing_media_type || 'image').trim() === 'video'
                                  ? 'video'
                                  : 'image',
                            }),
                          });
                          toast.success('Media type updated');
                          fetchAdminData();
                        } catch {
                          toast.error('Could not save media type');
                        } finally {
                          setSavingId(null);
                        }
                      }}
                      className="rounded-sm bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {savingId === 'advertise-unboxing-media-type' ? 'Saving…' : 'Save media type'}
                    </button>
                  </div>
                </div>
                {(settings.advertise_unboxing_media_type || 'image') === 'video' ? (
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Video URL (YouTube/Vimeo embed or direct MP4/WebM URL)
                      </label>
                      <input
                        type="text"
                        value={settings.advertise_unboxing_video_url || ''}
                        onChange={(e) => setSettings({ ...settings, advertise_unboxing_video_url: e.target.value })}
                        className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="https://www.youtube.com/embed/..."
                      />
                    </div>
                    <button
                      type="button"
                      disabled={savingId === 'advertise_unboxing_video_url'}
                      onClick={() => updateSetting('advertise_unboxing_video_url', settings.advertise_unboxing_video_url || '')}
                      className="rounded-sm bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {savingId === 'advertise_unboxing_video_url' ? 'Saving…' : 'Save video URL'}
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={savingId === 'adv_advertise_unboxing_hero_image'}
                      onChange={(e) => uploadAdvertiseImage('advertise_unboxing_hero_image', e.target.files?.[0])}
                      className="mt-3 w-full max-w-md text-sm text-slate-600"
                    />
                    {String(settings.advertise_unboxing_hero_image || '').trim() ? (
                      <div className="mt-4 flex flex-wrap items-end gap-4">
                        <img
                          src={resolveImageUrl(settings.advertise_unboxing_hero_image)}
                          alt=""
                          className="h-40 max-w-xs rounded-sm border border-slate-200 object-cover"
                        />
                        <button
                          type="button"
                          disabled={savingId === 'adv_advertise_unboxing_hero_image'}
                          onClick={() => clearAdvertiseImage('advertise_unboxing_hero_image')}
                          className="rounded-sm border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Clear — use default
                        </button>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-slate-500">No custom image — default Unsplash is shown.</p>
                    )}
                  </>
                )}
              </div>

              <div className="rounded-sm border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Newsletter section background</p>
                <p className="mt-1 text-xs text-slate-500">Very subtle (low opacity) behind the newsletter block.</p>
                <input
                  type="file"
                  accept="image/*"
                  disabled={savingId === 'adv_advertise_newsletter_bg_image'}
                  onChange={(e) => uploadAdvertiseImage('advertise_newsletter_bg_image', e.target.files?.[0])}
                  className="mt-3 w-full max-w-md text-sm text-slate-600"
                />
                {String(settings.advertise_newsletter_bg_image || '').trim() ? (
                  <div className="mt-4 flex flex-wrap items-end gap-4">
                    <img
                      src={resolveImageUrl(settings.advertise_newsletter_bg_image)}
                      alt=""
                      className="h-32 max-w-xs rounded-sm border border-slate-200 object-cover"
                    />
                    <button
                      type="button"
                      disabled={savingId === 'adv_advertise_newsletter_bg_image'}
                      onClick={() => clearAdvertiseImage('advertise_newsletter_bg_image')}
                      className="rounded-sm border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Clear — use default
                    </button>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">No custom image — default background is used.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'reviews' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Reviews</h2>
                <p className="mt-1 text-sm text-slate-600">View all product reviews, add on behalf of a customer, or remove spam.</p>
              </div>

              <div className="rounded-sm border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Add review</p>
                <form onSubmit={submitAdminReview} className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Product</label>
                    <select
                      required
                      value={reviewForm.product_id}
                      onChange={(e) => setReviewForm((f) => ({ ...f, product_id: e.target.value }))}
                      className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Select product</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer (user)</label>
                    <select
                      required
                      value={reviewForm.user_id}
                      onChange={(e) => setReviewForm((f) => ({ ...f, user_id: e.target.value }))}
                      className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Select user</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rating</label>
                    <select
                      value={reviewForm.rating}
                      onChange={(e) => setReviewForm((f) => ({ ...f, rating: Number(e.target.value) }))}
                      className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      {[5, 4, 3, 2, 1].map((n) => (
                        <option key={n} value={n}>
                          {n} stars
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Title (optional)</label>
                    <input
                      value={reviewForm.title}
                      onChange={(e) => setReviewForm((f) => ({ ...f, title: e.target.value }))}
                      className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Comment</label>
                    <textarea
                      required
                      rows={3}
                      value={reviewForm.comment}
                      onChange={(e) => setReviewForm((f) => ({ ...f, comment: e.target.value }))}
                      className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <button
                      type="submit"
                      disabled={savingId === 'review-add'}
                      className="rounded-sm bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {savingId === 'review-add' ? 'Saving…' : 'Add review'}
                    </button>
                  </div>
                </form>
                <p className="mt-3 text-xs text-slate-500">Each user can only leave one review per product.</p>
              </div>

              <div className="overflow-x-auto rounded-sm border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Product</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Rating</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Comment</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {reviewsList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                          No reviews yet.
                        </td>
                      </tr>
                    ) : (
                      reviewsList.map((r) => (
                        <tr key={r.id}>
                          <td className="max-w-[180px] px-4 py-3 font-medium text-slate-900">{r.product_name}</td>
                          <td className="px-4 py-3 text-xs text-slate-700">
                            <div>{r.user_name}</div>
                            <div className="text-slate-500">{r.user_email}</div>
                          </td>
                          <td className="px-4 py-3">{r.rating}</td>
                          <td className="max-w-[280px] px-4 py-3 text-xs text-slate-600">
                            {r.title ? <span className="font-semibold text-slate-800">{r.title}: </span> : null}
                            {r.comment}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatDate(r.created_at)}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => deleteAdminReview(r.id)}
                              disabled={savingId === `review-del-${r.id}`}
                              className="rounded-sm bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'gallery' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Site gallery</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Images and videos shown on the public <span className="font-semibold text-slate-800">/gallery</span> page. Upload
                  files here, or paste a YouTube / Vimeo link for embedded video.
                </p>
              </div>

              <div className="rounded-sm border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Add item</p>
                <form onSubmit={addGalleryAdminItem} className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type</label>
                    <select
                      value={galleryKind}
                      onChange={(e) => {
                        setGalleryKind(e.target.value);
                        setGalleryFile(null);
                        setGalleryFileInputKey((k) => k + 1);
                      }}
                      className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="image">Photo</option>
                      <option value="video">Video</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Caption (optional)</label>
                    <input
                      value={galleryCaption}
                      onChange={(e) => setGalleryCaption(e.target.value)}
                      className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                      maxLength={255}
                      placeholder="Short description"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {galleryKind === 'image' ? 'Image file' : 'Video file (optional if using URL below)'}
                    </label>
                    <input
                      key={galleryFileInputKey}
                      type="file"
                      accept={galleryKind === 'image' ? 'image/*' : 'video/*'}
                      onChange={(e) => setGalleryFile(e.target.files?.[0] || null)}
                      className="mt-1 w-full text-sm text-slate-600"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      {galleryKind === 'image'
                        ? 'JPG, PNG, WebP — shown on the gallery grid.'
                        : 'MP4 or WebM upload — or use the embed URL field instead.'}
                    </p>
                  </div>
                  {galleryKind === 'video' ? (
                    <div className="md:col-span-2">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Video URL (YouTube, Vimeo, or direct .mp4 link)
                      </label>
                      <input
                        value={galleryEmbedUrl}
                        onChange={(e) => setGalleryEmbedUrl(e.target.value)}
                        className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="https://www.youtube.com/watch?v=…"
                      />
                    </div>
                  ) : null}
                  <div className="md:col-span-2">
                    <button
                      type="submit"
                      disabled={savingId === 'gallery-add'}
                      className="rounded-sm bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {savingId === 'gallery-add' ? 'Saving…' : 'Add to gallery'}
                    </button>
                  </div>
                </form>
              </div>

              <div className="overflow-x-auto rounded-sm border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Preview</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Source</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Caption</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {galleryLoading ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                          Loading gallery…
                        </td>
                      </tr>
                    ) : galleryItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                          No gallery items yet. Add a photo or video above.
                        </td>
                      </tr>
                    ) : (
                      galleryItems.map((g) => (
                        <tr key={g.id}>
                          <td className="px-4 py-3">
                            {g.kind === 'image' ? (
                              <img
                                src={resolveImageUrl(g.src)}
                                alt=""
                                className="h-14 w-20 rounded-sm border border-slate-200 object-cover"
                              />
                            ) : String(g.src).includes('youtube.com/embed') || String(g.src).includes('player.vimeo.com') ? (
                              <span className="text-xs text-slate-500">Embed</span>
                            ) : (
                              <span className="text-xs text-slate-500">Video file</span>
                            )}
                          </td>
                          <td className="px-4 py-3 capitalize">{g.kind}</td>
                          <td className="max-w-[220px] break-all px-4 py-3 text-xs text-slate-600">{g.src}</td>
                          <td className="max-w-[180px] px-4 py-3 text-xs text-slate-600">{g.caption || '—'}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => deleteGalleryAdminItem(g.id)}
                              disabled={savingId === `gallery-del-${g.id}`}
                              className="rounded-sm bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-5">
              <h2 className="text-2xl font-semibold text-slate-900">System Settings</h2>

              <details className="group rounded-sm border border-slate-200 bg-white shadow-sm" open>
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  <span>Homepage hero (slider)</span>
                  <span className="text-slate-400 transition-transform duration-200 group-open:rotate-180">▼</span>
                </summary>
                <div className="space-y-4 border-t border-slate-200 p-4">
                  <p className="text-sm text-slate-600">
                    These slides appear at the top of the public homepage. Upload a wide image per slide, then add text and button link.
                  </p>
                  <p className="rounded-sm border border-peach-200 bg-peach-50 px-3 py-2 text-xs text-peach-900">{IMAGE_HINT_HERO}</p>
                  <div className="space-y-6">
                    {heroEditor.slice(0, 3).map((slide, idx) => (
                      <div key={idx} className="rounded-sm border border-slate-200 bg-slate-50/80 p-4">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Slide {idx + 1}</p>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Background image</label>
                            <input
                              type="file"
                              accept="image/*"
                              disabled={savingId === `hero_img_${idx}`}
                              onChange={(e) => uploadHeroImage(e.target.files?.[0], idx)}
                              className="w-full text-sm text-slate-600"
                            />
                            {slide.image ? (
                              <div className="mt-2 flex items-start gap-3">
                                <img
                                  src={resolveImageUrl(slide.image)}
                                  alt=""
                                  className="h-20 max-w-[200px] rounded-sm border border-slate-200 object-cover"
                                />
                                <p className="break-all text-[11px] text-slate-500">{slide.image}</p>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500">No image yet — defaults on the site until you save uploaded slides.</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Alt text (accessibility)</label>
                            <input
                              value={slide.alt}
                              onChange={(e) => {
                                const next = [...heroEditor];
                                next[idx] = { ...next[idx], alt: e.target.value };
                                setHeroEditor(next);
                              }}
                              className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                            <label className="text-sm font-medium text-slate-700">Eyebrow / kicker</label>
                            <input
                              value={slide.kicker}
                              onChange={(e) => {
                                const next = [...heroEditor];
                                next[idx] = { ...next[idx], kicker: e.target.value };
                                setHeroEditor(next);
                              }}
                              className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                            <label className="text-sm font-medium text-slate-700">Title</label>
                            <input
                              value={slide.title}
                              onChange={(e) => {
                                const next = [...heroEditor];
                                next[idx] = { ...next[idx], title: e.target.value };
                                setHeroEditor(next);
                              }}
                              className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                            <label className="text-sm font-medium text-slate-700">Description</label>
                            <textarea
                              value={slide.description}
                              onChange={(e) => {
                                const next = [...heroEditor];
                                next[idx] = { ...next[idx], description: e.target.value };
                                setHeroEditor(next);
                              }}
                              rows={2}
                              className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-sm font-medium text-slate-700">Button label</label>
                                <input
                                  value={slide.cta}
                                  onChange={(e) => {
                                    const next = [...heroEditor];
                                    next[idx] = { ...next[idx], cta: e.target.value };
                                    setHeroEditor(next);
                                  }}
                                  className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                              </div>
                              <div>
                                <label className="text-sm font-medium text-slate-700">Link (path)</label>
                                <input
                                  value={slide.to}
                                  onChange={(e) => {
                                    const next = [...heroEditor];
                                    next[idx] = { ...next[idx], to: e.target.value };
                                    setHeroEditor(next);
                                  }}
                                  placeholder="/shop"
                                  className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={saveHeroSlides}
                    disabled={savingId === 'hero_slides'}
                    className="rounded-sm bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {savingId === 'hero_slides' ? 'Saving…' : 'Save homepage hero'}
                  </button>
                </div>
              </details>

              <details className="group rounded-sm border border-slate-200 bg-white shadow-sm" open>
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  <span>Storefront — address &amp; social (footer &amp; floating buttons)</span>
                  <span className="text-slate-400 transition-transform duration-200 group-open:rotate-180">▼</span>
                </summary>
                <div className="space-y-4 border-t border-slate-200 bg-slate-50/80 p-4">
                  <div className="rounded-sm border border-slate-200 bg-white p-4">
                    <label className="text-sm font-semibold text-slate-800">Site logo</label>
                    <p className="mt-1 text-xs text-slate-600">
                      Header, footer, login &amp; register. Leave empty to use the built-in default mark.
                    </p>
                    <p className="mt-2 rounded-sm border border-peach-200 bg-peach-50 px-3 py-2 text-xs text-peach-900">{IMAGE_HINT_SITE_LOGO}</p>
                    <div className="mt-3 flex flex-wrap items-end gap-4">
                      <div className="flex min-h-[72px] min-w-[120px] items-center justify-center rounded-sm border border-dashed border-slate-300 bg-slate-50 p-2">
                        <img
                          src={
                            String(settings.store_logo_url || '').trim()
                              ? resolveImageUrl(settings.store_logo_url)
                              : '/images/logo.svg'
                          }
                          alt="Logo preview"
                          className="max-h-14 max-w-[180px] object-contain"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-slate-600">Upload file</label>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={savingId === 'site_logo'}
                          onChange={(e) => uploadSiteLogo(e.target.files?.[0])}
                          className="w-full max-w-xs text-sm text-slate-600"
                        />
                        <button
                          type="button"
                          disabled={savingId === 'site_logo' || !String(settings.store_logo_url || '').trim()}
                          onClick={clearSiteLogo}
                          className="w-fit rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Use default logo
                        </button>
                      </div>
                    </div>
                    <label className="mt-4 block text-xs font-medium text-slate-600">Or paste image URL</label>
                    <input
                      value={settings.store_logo_url || ''}
                      onChange={(e) => setSettings({ ...settings, store_logo_url: e.target.value })}
                      placeholder="https://… or /uploads/…"
                      className="mt-1 w-full max-w-xl rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">Save storefront contact below to apply URL changes.</p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">Business address</label>
                    <textarea
                      value={settings.store_business_address || ''}
                      onChange={(e) => setSettings({ ...settings, store_business_address: e.target.value })}
                      rows={3}
                      className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm"
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-slate-700">Phone (tel)</label>
                      <input
                        value={settings.store_phone_tel || ''}
                        onChange={(e) => setSettings({ ...settings, store_phone_tel: e.target.value })}
                        placeholder="+8801755579869"
                        className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">WhatsApp (tel)</label>
                      <input
                        value={settings.store_whatsapp_tel || ''}
                        onChange={(e) => setSettings({ ...settings, store_whatsapp_tel: e.target.value })}
                        placeholder="+8801755579864"
                        className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Facebook URL</label>
                    <input
                      value={settings.store_facebook_url || ''}
                      onChange={(e) => setSettings({ ...settings, store_facebook_url: e.target.value })}
                      className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Messenger URL</label>
                    <input
                      value={settings.store_messenger_url || ''}
                      onChange={(e) => setSettings({ ...settings, store_messenger_url: e.target.value })}
                      className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={saveStorefrontSettings}
                    disabled={savingId === 'storefront'}
                    className="rounded-sm bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {savingId === 'storefront' ? 'Saving…' : 'Save storefront contact'}
                  </button>
                </div>
              </details>

              <details className="group rounded-sm border border-slate-200 bg-gradient-to-br from-white to-slate-50/80 shadow-sm" open>
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  <span>Theme customization</span>
                  <span className="text-slate-400 transition-transform duration-200 group-open:rotate-180">▼</span>
                </summary>
                <div className="border-t border-slate-200 p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Theme customization</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Primary color drives buttons, links, and accents site-wide (Tailwind <code className="text-xs">brand-*</code> scale). Sidebar color applies to this admin sidebar. Changes preview instantly; save to store in the database for all sessions.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={saveThemeToServer}
                      disabled={savingId === 'theme-save'}
                      className="rounded-sm bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
                    >
                      {savingId === 'theme-save' ? 'Saving…' : 'Save theme'}
                    </button>
                    <button
                      type="button"
                      onClick={resetThemeDefaults}
                      disabled={savingId === 'theme-save'}
                      className="rounded-sm border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Reset to defaults
                    </button>
                  </div>
                </div>
                <div className="mt-6 grid gap-6 sm:grid-cols-2">
                  <div className="rounded-sm border border-slate-100 bg-white p-4">
                    <label className="text-sm font-medium text-slate-800">Primary color</label>
                    <p className="text-xs text-slate-500">Storefront brand / accents</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <input
                        type="color"
                        value={themePrimary}
                        onChange={(e) => handleThemePrimaryChange(e.target.value)}
                        className="h-12 w-14 cursor-pointer overflow-hidden rounded-sm border border-slate-200 bg-white p-0 shadow-inner"
                        aria-label="Primary color"
                      />
                      <input
                        type="text"
                        value={themePrimary}
                        onChange={(e) => setThemePrimary(e.target.value)}
                        onBlur={() => {
                          const v = themePrimary.trim();
                          if (/^#[0-9A-Fa-f]{6}$/.test(v)) handleThemePrimaryChange(v);
                          else {
                            const fallback = settings[THEME_SETTING_KEYS.primary] || DEFAULT_THEME.primary;
                            setThemePrimary(fallback);
                            persistThemeCache({ primary: fallback, sidebar: themeSidebar });
                          }
                        }}
                        className="min-w-[7rem] flex-1 rounded-sm border border-slate-200 px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-brand-400"
                        spellCheck={false}
                      />
                    </div>
                  </div>
                  <div className="rounded-sm border border-slate-100 bg-white p-4">
                    <label className="text-sm font-medium text-slate-800">Sidebar color</label>
                    <p className="text-xs text-slate-500">Admin panel sidebar background</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <input
                        type="color"
                        value={themeSidebar}
                        onChange={(e) => handleThemeSidebarChange(e.target.value)}
                        className="h-12 w-14 cursor-pointer overflow-hidden rounded-sm border border-slate-200 bg-white p-0 shadow-inner"
                        aria-label="Sidebar color"
                      />
                      <input
                        type="text"
                        value={themeSidebar}
                        onChange={(e) => setThemeSidebar(e.target.value)}
                        onBlur={() => {
                          const v = themeSidebar.trim();
                          if (/^#[0-9A-Fa-f]{6}$/.test(v)) handleThemeSidebarChange(v);
                          else {
                            const fallback = settings[THEME_SETTING_KEYS.sidebar] || DEFAULT_THEME.sidebar;
                            setThemeSidebar(fallback);
                            persistThemeCache({ primary: themePrimary, sidebar: fallback });
                          }
                        }}
                        className="min-w-[7rem] flex-1 rounded-sm border border-slate-200 px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-brand-400"
                        spellCheck={false}
                      />
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  Keys: <code className="rounded bg-slate-100 px-1">{THEME_SETTING_KEYS.primary}</code>,{' '}
                  <code className="rounded bg-slate-100 px-1">{THEME_SETTING_KEYS.sidebar}</code>. Local cache keeps the UI snappy before the API responds.
                </p>
                </div>
              </details>

              <details className="group rounded-sm border border-slate-200 bg-white shadow-sm" open>
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  <span>Payments, couriers &amp; email</span>
                  <span className="text-slate-400 transition-transform duration-200 group-open:rotate-180">▼</span>
                </summary>
                <div className="space-y-5 border-t border-slate-200 p-4">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-4 rounded-sm border border-slate-300 bg-white p-6 shadow-sm">
                  <h3 className="text-xl font-semibold tracking-tight text-slate-950">
                    SSLCommerz (Payment Gateway)
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-800">Store ID</label>
                      <input
                        value={settings.ssl_store_id || ''}
                        onChange={(e) => setSettings({ ...settings, ssl_store_id: e.target.value })}
                        className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-800">Store Password</label>
                      <input
                        type="password"
                        value={settings.ssl_store_password || ''}
                        onChange={(e) => setSettings({ ...settings, ssl_store_password: e.target.value })}
                        className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={settings.ssl_is_live === 'true'}
                        onChange={(e) => updateSetting('ssl_is_live', e.target.checked ? 'true' : 'false')}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <label className="text-sm font-semibold text-slate-800">Is Live (Production Mode)</label>
                    </div>
                    <button
                      onClick={() => {
                        updateSetting('ssl_store_id', settings.ssl_store_id);
                        updateSetting('ssl_store_password', settings.ssl_store_password);
                      }}
                      className="rounded-sm bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                    >
                      Save SSL Settings
                    </button>
                  </div>
                </div>

                <div className="space-y-4 rounded-sm border border-slate-300 bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold tracking-tight text-slate-950">Steadfast (Courier API)</h3>
                      <p className="mt-1 max-w-3xl text-sm text-slate-700">
                        Edit everything below, then use <strong>one Save</strong>. Keys stay on the server; leave a secret
                        field empty to keep the current value (changing only note / URL will not wipe keys).
                      </p>
                    </div>
                  </div>
                  <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-relaxed text-slate-800">
                    <p className="font-sans font-semibold text-slate-700">Webhook URL (paste in Steadfast merchant panel)</p>
                    <code className="mt-0.5 block break-all font-mono text-slate-900">
                      {API_BASE.replace(/\/$/, '')}/api/webhooks/steadfast
                    </code>
                    <p className="mt-2 font-sans text-[10px] text-slate-600">
                      Use the same bearer token here as in the panel. Bulk create:{' '}
                      <code className="rounded bg-white px-1">POST /api/orders/steadfast/bulk-dispatch</code> with{' '}
                      <code className="rounded bg-white px-1">{'{ "orderIds": [1,2,3] }'}</code>.
                    </p>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">API base URL</label>
                      <input
                        value={settings.steadfast_api_base_url || ''}
                        onChange={(e) => setSettings({ ...settings, steadfast_api_base_url: e.target.value })}
                        placeholder="Leave blank for default: https://portal.packzy.com/api/v1"
                        className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3"
                      />
                      <p className="text-xs text-slate-500">Steadfast merchant API host (not your webhook URL). Blank = Packzy default.</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-sm font-medium text-slate-700">API Key</label>
                        {settings.steadfast_api_key_set === 'true' ? (
                          <span className="rounded-sm bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                            Saved
                          </span>
                        ) : null}
                      </div>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={settings.steadfast_api_key || ''}
                        onChange={(e) => setSettings({ ...settings, steadfast_api_key: e.target.value })}
                        placeholder="Paste full key only when adding or rotating"
                        className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3"
                      />
                      <p className="text-xs text-slate-500">Empty = keep existing. Fill only when setting a new key.</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-sm font-medium text-slate-700">Secret Key</label>
                        {settings.steadfast_secret_key_set === 'true' ? (
                          <span className="rounded-sm bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                            Saved
                          </span>
                        ) : null}
                      </div>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={settings.steadfast_secret_key || ''}
                        onChange={(e) => setSettings({ ...settings, steadfast_secret_key: e.target.value })}
                        placeholder="Paste full secret only when adding or rotating"
                        className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3"
                      />
                      <p className="text-xs text-slate-500">Empty = keep existing.</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-sm font-medium text-slate-700">Webhook Bearer token</label>
                        {settings.steadfast_webhook_bearer_token_set === 'true' ? (
                          <span className="rounded-sm bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                            Saved
                          </span>
                        ) : null}
                      </div>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={settings.steadfast_webhook_bearer_token || ''}
                        onChange={(e) => setSettings({ ...settings, steadfast_webhook_bearer_token: e.target.value })}
                        placeholder="Same token as Steadfast panel webhook auth"
                        className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3"
                      />
                      <p className="text-xs text-slate-500">Empty = keep existing. Must match Steadfast callback auth.</p>
                    </div>
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={settings.steadfast_auto_dispatch_on_confirm === 'true'}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            steadfast_auto_dispatch_on_confirm: e.target.checked ? 'true' : 'false',
                          })
                        }
                        className="mt-0.5 h-4 w-4 rounded border-slate-300"
                      />
                      <span>
                        <span className="font-medium">Auto-send to Steadfast</span> when an order is confirmed as{' '}
                        <strong>Processing</strong> (online payment success and when you set status to Processing).
                        Manual &quot;Dispatch to Steadfast&quot; still works when this is off.
                      </span>
                    </label>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Default delivery note</label>
                      <input
                        value={settings.steadfast_default_note || ''}
                        onChange={(e) => setSettings({ ...settings, steadfast_default_note: e.target.value })}
                        placeholder="Handle with care"
                        className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Alternative phone (11 digits, optional)</label>
                      <input
                        value={settings.steadfast_alternative_phone || ''}
                        onChange={(e) => setSettings({ ...settings, steadfast_alternative_phone: e.target.value })}
                        className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Item description template</label>
                      <textarea
                        rows={2}
                        value={settings.steadfast_item_description_template || ''}
                        onChange={(e) => setSettings({ ...settings, steadfast_item_description_template: e.target.value })}
                        placeholder="Use {items} and {order_id} — if empty, a summary is built from cart lines."
                        className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Total lot override (optional)</label>
                        <input
                          type="number"
                          min={1}
                          value={settings.steadfast_total_lot_default || ''}
                          onChange={(e) => setSettings({ ...settings, steadfast_total_lot_default: e.target.value })}
                          placeholder="Auto = sum of quantities"
                          className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3"
                        />
                      </div>
                      <div className="flex items-end pb-2">
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={settings.steadfast_send_delivery_type !== 'false'}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                steadfast_send_delivery_type: e.target.checked ? 'true' : 'false',
                              })
                            }
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          Send delivery_type to API (0=home, 1=point/hub)
                        </label>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={savingId === 'steadfast-save'}
                        onClick={() => saveSteadfastSettings()}
                        className="rounded-sm bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {savingId === 'steadfast-save' ? 'Saving…' : 'Save all Steadfast settings'}
                      </button>
                      <button
                        type="button"
                        disabled={savingId === 'steadfast-test'}
                        onClick={() => testSteadfastConnection()}
                        className="rounded-sm border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {savingId === 'steadfast-test' ? 'Testing…' : 'Test API connection'}
                      </button>
                      <button
                        type="button"
                        disabled={savingId === 'steadfast-balance'}
                        onClick={() => fetchSteadfastBalance()}
                        className="rounded-sm border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {savingId === 'steadfast-balance' ? 'Loading…' : 'Wallet balance'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 rounded-sm border border-slate-200 bg-slate-50 p-6">
                  <h3 className="text-lg font-semibold text-slate-900">Meta (Facebook) ads — Pixel &amp; Conversions API</h3>
                  <p className="text-xs text-slate-600">
                    Pixel ID loads the browser pixel for PageView / Purchase. Add a Conversions API access token to send
                    the same Purchase from the server (better attribution). Use the same Pixel ID in Events Manager.
                  </p>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Pixel ID (dataset)</label>
                      <input
                        value={settings.facebook_pixel_id || ''}
                        onChange={(e) => setSettings({ ...settings, facebook_pixel_id: e.target.value })}
                        className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Conversions API access token</label>
                      <input
                        type="password"
                        value={settings.facebook_capi_access_token || ''}
                        onChange={(e) => setSettings({ ...settings, facebook_capi_access_token: e.target.value })}
                        className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Test event code (optional, Events Manager)</label>
                      <input
                        value={settings.facebook_test_event_code || ''}
                        onChange={(e) => setSettings({ ...settings, facebook_test_event_code: e.target.value })}
                        className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3"
                      />
                    </div>
                    <button
                      onClick={() => {
                        updateSetting('facebook_pixel_id', settings.facebook_pixel_id);
                        updateSetting('facebook_capi_access_token', settings.facebook_capi_access_token);
                        updateSetting('facebook_test_event_code', settings.facebook_test_event_code);
                      }}
                      className="rounded-sm bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                    >
                      Save Meta settings
                    </button>
                  </div>
                </div>

                <div className="space-y-4 rounded-sm border border-slate-200 bg-slate-50 p-6">
                  <h3 className="text-lg font-semibold text-slate-900">Email Configuration (SMTP)</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Admin Notification Email</label>
                      <input
                        value={settings.admin_email || ''}
                        onChange={(e) => setSettings({ ...settings, admin_email: e.target.value })}
                        className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">SMTP Username (Gmail)</label>
                      <input
                        value={settings.smtp_user || ''}
                        onChange={(e) => setSettings({ ...settings, smtp_user: e.target.value })}
                        className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">SMTP App Password</label>
                      <input
                        type="password"
                        value={settings.smtp_pass || ''}
                        onChange={(e) => setSettings({ ...settings, smtp_pass: e.target.value })}
                        className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3"
                      />
                    </div>
                    <button
                      onClick={() => {
                        updateSetting('admin_email', settings.admin_email);
                        updateSetting('smtp_user', settings.smtp_user);
                        updateSetting('smtp_pass', settings.smtp_pass);
                      }}
                      className="rounded-sm bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                    >
                      Save Email Settings
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid gap-8 md:grid-cols-2">
                <div className="space-y-4 rounded-sm border border-slate-200 bg-slate-50 p-6">
                  <h3 className="text-lg font-semibold text-slate-900">bKash Management</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">bKash Mode</label>
                      <select
                        value={settings.bkash_mode || 'manual'}
                        onChange={(e) => updateSetting('bkash_mode', e.target.value)}
                        className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3"
                      >
                        <option value="manual">Manual (Send Money)</option>
                        <option value="api">Automated (API Gateway)</option>
                      </select>
                    </div>
                    {settings.bkash_mode === 'manual' && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">bKash Number</label>
                        <input
                          value={settings.bkash_number || ''}
                          onChange={(e) => setSettings({ ...settings, bkash_number: e.target.value })}
                          className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3"
                        />
                        <button
                          onClick={() => updateSetting('bkash_number', settings.bkash_number)}
                          className="mt-2 rounded-sm bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                        >
                          Save bKash Number
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4 rounded-sm border border-slate-200 bg-slate-50 p-6">
                  <h3 className="text-lg font-semibold text-slate-900">Nagad Management</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Nagad Mode</label>
                      <select
                        value={settings.nagad_mode || 'manual'}
                        onChange={(e) => updateSetting('nagad_mode', e.target.value)}
                        className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3"
                      >
                        <option value="manual">Manual (Send Money)</option>
                        <option value="api">Automated (API Gateway)</option>
                      </select>
                    </div>
                    {settings.nagad_mode === 'manual' && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Nagad Number</label>
                        <input
                          value={settings.nagad_number || ''}
                          onChange={(e) => setSettings({ ...settings, nagad_number: e.target.value })}
                          className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3"
                        />
                        <button
                          onClick={() => updateSetting('nagad_number', settings.nagad_number)}
                          className="mt-2 rounded-sm bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                        >
                          Save Nagad Number
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
                </div>
              </details>

              <details className="group rounded-sm border border-slate-200 bg-white shadow-sm" open>
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  <span>Delivery &amp; shipping (checkout)</span>
                  <span className="text-slate-400 transition-transform duration-200 group-open:rotate-180">▼</span>
                </summary>
                <div className="border-t border-slate-200 p-4">
                  <div className="space-y-5 rounded-sm border border-slate-200 bg-slate-50 p-5">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">Shipping charges</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Checkout asks for district → we decide <strong>Inside</strong> or <strong>Outside</strong> using the list below, then add the fee for <strong>pickup/point</strong> or <strong>home</strong> delivery.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Districts counted as “Inside Dhaka” (comma-separated)</label>
                      <textarea
                        rows={2}
                        value={settings.inside_dhaka_districts || ''}
                        onChange={(e) => setSettings({ ...settings, inside_dhaka_districts: e.target.value })}
                        placeholder="Dhaka, Narayanganj, Gazipur, Munshiganj, Manikganj, Narsingdi"
                        className="w-full rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm"
                      />
                      <p className="text-xs text-slate-500">Use the same spelling as in checkout (e.g. Dhaka, Chattogram). Any other district = outside.</p>
                    </div>
                    <div className="overflow-x-auto rounded-sm border border-slate-200 bg-white">
                      <table className="w-full min-w-[320px] text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-100 text-left">
                            <th className="px-3 py-2 font-semibold text-slate-700">Area</th>
                            <th className="px-3 py-2 font-semibold text-slate-700">Pickup / point (৳)</th>
                            <th className="px-3 py-2 font-semibold text-slate-700">Home delivery (৳)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-800">Inside list above</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                value={settings.shipping_inside_point ?? ''}
                                onChange={(e) => setSettings({ ...settings, shipping_inside_point: e.target.value })}
                                placeholder="e.g. 60"
                                className="w-full min-w-0 rounded-sm border border-slate-200 bg-white px-2 py-1.5"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                value={settings.shipping_inside_home ?? ''}
                                onChange={(e) => setSettings({ ...settings, shipping_inside_home: e.target.value })}
                                placeholder="e.g. 80"
                                className="w-full min-w-0 rounded-sm border border-slate-200 bg-white px-2 py-1.5"
                              />
                            </td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-800">All other districts</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                value={settings.shipping_outside_point ?? ''}
                                onChange={(e) => setSettings({ ...settings, shipping_outside_point: e.target.value })}
                                placeholder="e.g. 120"
                                className="w-full min-w-0 rounded-sm border border-slate-200 bg-white px-2 py-1.5"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                value={settings.shipping_outside_home ?? ''}
                                onChange={(e) => setSettings({ ...settings, shipping_outside_home: e.target.value })}
                                placeholder="e.g. 150"
                                className="w-full min-w-0 rounded-sm border border-slate-200 bg-white px-2 py-1.5"
                              />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-slate-500">
                      If a cell is left empty, checkout falls back to the saved “legacy” values (defaults ৳60 inside / ৳120 outside). Saving below copies your numbers into those backups automatically.
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        const pin = String(settings.shipping_inside_point ?? '').trim();
                        const hin = String(settings.shipping_inside_home ?? '').trim();
                        const pout = String(settings.shipping_outside_point ?? '').trim();
                        const hout = String(settings.shipping_outside_home ?? '').trim();
                        const legacyIn = pin || hin || settings.shipping_inside_dhaka || '60';
                        const legacyOut = pout || hout || settings.shipping_outside_dhaka || '120';
                        try {
                          setSavingId('shipping_bulk');
                          await Promise.all([
                            fetch(apiUrl('/api/settings/inside_dhaka_districts'), {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json', ...authHeaders },
                              body: JSON.stringify({ value: settings.inside_dhaka_districts ?? '' }),
                            }),
                            fetch(apiUrl('/api/settings/shipping_inside_point'), {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json', ...authHeaders },
                              body: JSON.stringify({ value: settings.shipping_inside_point ?? '' }),
                            }),
                            fetch(apiUrl('/api/settings/shipping_inside_home'), {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json', ...authHeaders },
                              body: JSON.stringify({ value: settings.shipping_inside_home ?? '' }),
                            }),
                            fetch(apiUrl('/api/settings/shipping_outside_point'), {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json', ...authHeaders },
                              body: JSON.stringify({ value: settings.shipping_outside_point ?? '' }),
                            }),
                            fetch(apiUrl('/api/settings/shipping_outside_home'), {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json', ...authHeaders },
                              body: JSON.stringify({ value: settings.shipping_outside_home ?? '' }),
                            }),
                            fetch(apiUrl('/api/settings/shipping_inside_dhaka'), {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json', ...authHeaders },
                              body: JSON.stringify({ value: String(legacyIn) }),
                            }),
                            fetch(apiUrl('/api/settings/shipping_outside_dhaka'), {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json', ...authHeaders },
                              body: JSON.stringify({ value: String(legacyOut) }),
                            }),
                          ]);
                          toast.success('Shipping rates saved');
                          fetchAdminData();
                        } catch (e) {
                          console.error(e);
                          toast.error('Could not save shipping');
                        } finally {
                          setSavingId(null);
                        }
                      }}
                      disabled={savingId === 'shipping_bulk'}
                      className="rounded-sm bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {savingId === 'shipping_bulk' ? 'Saving…' : 'Save shipping rates'}
                    </button>
                  </div>
                </div>
              </details>

              <details className="group rounded-sm border border-slate-200 bg-white shadow-sm" open>
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  <span>General options</span>
                  <span className="text-slate-400 transition-transform duration-200 group-open:rotate-180">▼</span>
                </summary>
                <div className="border-t border-slate-200 p-4">
              <div className="rounded-sm border border-slate-300 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="max-w-xl space-y-1">
                    <h3 className="text-lg font-semibold text-slate-950">General Options</h3>
                    <p className="text-sm leading-relaxed text-slate-700">
                      Enable or disable features globally.
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 rounded-sm border border-slate-200 bg-slate-50 px-4 py-3">
                    <span className="text-sm font-semibold text-slate-900">Payment Gateway</span>
                    <button
                      type="button"
                      aria-pressed={settings.is_payment_enabled === 'true'}
                      onClick={() => updateSetting('is_payment_enabled', settings.is_payment_enabled === 'true' ? 'false' : 'true')}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                        settings.is_payment_enabled === 'true'
                          ? 'bg-slate-900'
                          : 'bg-slate-300 ring-2 ring-inset ring-slate-400/80'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-sm bg-white transition ${
                          settings.is_payment_enabled === 'true' ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
                </div>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Admin;