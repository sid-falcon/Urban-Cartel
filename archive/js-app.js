/* global L, lucide */

console.log("App.js is loading...");

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged,
    signOut,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    GoogleAuthProvider,
    FacebookAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    addDoc, 
    collection, 
    query, 
    where, 
    getDocs, 
    onSnapshot, 
    deleteDoc, 
    updateDoc,
    writeBatch,
    serverTimestamp,
    increment
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Import config

const appId = typeof __app_id !== 'undefined' ? __app_id : 'urban-plus-app';
const firebaseConfig = {
  apiKey: "AIzaSyCuXdVwmF5q9aJt9ZXBC7S95e9dCzsY07U",
  authDomain: "live-mart-da577.firebaseapp.com",
  projectId: "live-mart-da577",
  storageBucket: "live-mart-da577.firebasestorage.app",
  messagingSenderId: "635144123160",
  appId: "1:635144123160:web:5dbb8224660606ebab646d",
  measurementId: "G-DGVDN201J2"
};

// -----------------------------------------------------------------
// INITIALIZE FIREBASE
// -----------------------------------------------------------------
let app, db, auth;
try {
    if (!firebaseConfig || !firebaseConfig.apiKey) throw new Error("Firebase config missing");
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
} catch (e) {
    console.error("Firebase Init Error:", e);
    document.getElementById('app').innerHTML = `<div class="p-8 text-center text-red-600">Error: ${e.message}</div>`;
    throw e;
}

// -----------------------------------------------------------------
// GLOBAL APPLICATION STATE
// -----------------------------------------------------------------
const appState = {
    currentView: 'loading', 
    authView: 'login', 
    marketplaceTab: 'all', 
    filterCategory: 'all', 
    sortOption: 'price-asc', 
    searchQuery: '', 
    favorites: [], 
    currentUser: null, 
    stores: [], 
    allMarketplaceItems: [], 
    currentStore: { info: null, inventory: [] },
    cart: [], 
    appliedCoupons: {}, 
    deliveryOptions: {}, 
    myInventory: [], 
    myCoupons: [], 
    myOrders: { placed: [], received: [] },
    isLoading: false,
    error: null,
    listeners: [],
    map: null, 
    trackMap: null,
    mapMarker: null, 
    selectedAddress: null,
    tempCoordinates: null,
    pendingPaymentStoreId: null,
    pendingPaymentTotal: 0,
    editingItemId: null,
    returnOrderId: null // For return modal logic
};

const paths = {
    user: (uid) => doc(db, `artifacts/${appId}/public/data/users`, uid),
    users: () => collection(db, `artifacts/${appId}/public/data/users`),
    store: (storeId) => doc(db, `artifacts/${appId}/public/data/stores`, storeId),
    stores: () => collection(db, `artifacts/${appId}/public/data/stores`),
    inventoryItem: (storeId, iid) => doc(db, `artifacts/${appId}/public/data/stores/${storeId}/inventory`, iid),
    inventory: (storeId) => collection(db, `artifacts/${appId}/public/data/stores/${storeId}/inventory`),
    coupon: (storeId, cid) => doc(db, `artifacts/${appId}/public/data/stores/${storeId}/coupons`, cid),
    coupons: (storeId) => collection(db, `artifacts/${appId}/public/data/stores/${storeId}/coupons`),
    cartItem: (uid, cid) => doc(db, `artifacts/${appId}/users/${uid}/cart`, cid),
    cart: (uid) => collection(db, `artifacts/${appId}/users/${uid}/cart`),
    order: (oid) => doc(db, `artifacts/${appId}/public/data/orders`, oid),
    orders: () => collection(db, `artifacts/${appId}/public/data/orders`),
    favorite: (uid, itemId) => doc(db, `artifacts/${appId}/users/${uid}/favorites`, itemId), 
    favorites: (uid) => collection(db, `artifacts/${appId}/users/${uid}/favorites`),        
};

// -----------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------
function calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371; 
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; 
}
function deg2rad(deg) { return deg * (Math.PI/180); }
function safeDate(timestamp) {
    if (!timestamp) return new Date();
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (timestamp instanceof Date) return timestamp;
    return new Date(timestamp);
}

// -----------------------------------------------------------------
// RENDER HELPERS
// -----------------------------------------------------------------

const renderLoading = () => `
    <div id="loading-overlay">
        <div class="spinner"></div>
        <p class="mt-4 text-teal-800 font-bold animate-pulse text-lg tracking-wide">Loading Live MART...</p>
    </div>`;

const renderError = (msg) => `<div class="max-w-4xl mx-auto mt-10 p-6 text-red-700 bg-red-50 rounded-xl border border-red-200 shadow-sm flex items-center gap-4"><i data-lucide="alert-circle" class="h-8 w-8"></i><div><strong>Something went wrong:</strong><br>${msg}</div></div>`;

function getHeaderClass(viewName) {
    const isActive = appState.currentView === viewName;
    return isActive ? "text-teal-700 font-extrabold border-b-2 border-teal-600" : "text-gray-500 hover:text-teal-600 font-medium transition-colors";
}
function getHomeView() { return !appState.currentUser ? 'marketplace' : (appState.currentUser.role === 'customer' ? 'marketplace' : appState.currentUser.role + 'Dashboard'); }

function renderBackButton(targetView, label = 'Back', params = {}) {
    const dataAttrs = Object.entries(params).map(([key, value]) => `data-${key}="${value}"`).join(' ');
    return `<button data-action="navigate" data-view="${targetView}" ${dataAttrs} class="inline-flex items-center text-gray-500 hover:text-teal-600 mb-6 transition-colors font-semibold group"><i data-lucide="arrow-left" class="h-5 w-5 mr-2 group-hover:-translate-x-1 transition-transform"></i> ${label}</button>`;
}

function renderHeader() {
    const role = appState.currentUser.role;
    const walletBalance = appState.currentUser.walletBalance || 0;
    
    let navLinks = '';
    if (role === 'customer') {
        navLinks = `
            <a href="#" class="${getHeaderClass('marketplace')}" data-action="navigate" data-view="marketplace">Shop</a>
            <a href="#" class="${getHeaderClass('browseStores')}" data-action="navigate" data-view="browseStores" data-store-type="all">Stores</a>
            <a href="#" class="${getHeaderClass('ordersView')}" data-action="navigate" data-view="ordersView">Orders</a>
        `;
    } else if (role === 'retailer') {
        navLinks = `
            <a href="#" class="${getHeaderClass('retailerDashboard')}" data-action="navigate" data-view="retailerDashboard">Dashboard</a>
            <a href="#" class="${getHeaderClass('browseStores')}" data-action="navigate" data-view="browseStores" data-store-type="wholesaler">Wholesalers</a>
            <a href="#" class="${getHeaderClass('ordersView')}" data-action="navigate" data-view="ordersView">Orders</a>
        `;
    } else if (role === 'wholesaler') {
        navLinks = `
            <a href="#" class="${getHeaderClass('wholesalerDashboard')}" data-action="navigate" data-view="wholesalerDashboard">Dashboard</a>
            <a href="#" class="${getHeaderClass('ordersView')}" data-action="navigate" data-view="ordersView">Orders</a>
        `;
    }
    navLinks += `<a href="#" class="${getHeaderClass('infoView')}" data-action="navigate" data-view="infoView">Policy</a>`;

    return `
        <header class="bg-white/90 backdrop-blur-md shadow-sm sticky top-0 z-30 border-b border-gray-100">
            <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex justify-between items-center h-16">
                    <div class="flex-shrink-0 flex items-center cursor-pointer gap-2" data-action="navigate" data-view="marketplace">
                        <div class="bg-teal-600 p-1.5 rounded-lg text-white"><i data-lucide="shopping-cart" class="h-6 w-6"></i></div>
                        <span class="text-xl font-black text-gray-800 tracking-tight">Live<span class="text-teal-600">MART</span></span>
                    </div>
                    <div class="hidden md:flex space-x-8">${navLinks}</div>
                    <div class="flex items-center space-x-5">
                        <div class="hidden sm:flex items-center text-sm font-bold text-teal-800 bg-teal-50 px-3 py-1.5 rounded-full border border-teal-100 shadow-sm">
                            <i data-lucide="wallet" class="h-4 w-4 mr-2 text-teal-600"></i>₹${walletBalance.toFixed(2)}
                        </div>
                        <button data-action="navigate" data-view="cartView" class="relative text-gray-500 hover:text-teal-600 transition">
                            <i data-lucide="shopping-bag" class="h-6 w-6"></i>
                            ${appState.cart.length > 0 ? `<span class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center border-2 border-white">${appState.cart.length}</span>` : ''}
                        </button>
                        <div class="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded-full transition" data-action="navigate" data-view="profileView">
                             <div class="h-8 w-8 bg-gradient-to-br from-teal-100 to-teal-200 rounded-full flex items-center justify-center text-teal-700 border border-teal-200"><i data-lucide="user" class="h-4 w-4"></i></div>
                        </div>
                        <button data-action="logout" class="text-gray-400 hover:text-red-500 transition" title="Logout"><i data-lucide="log-out" class="h-5 w-5"></i></button>
                    </div>
                </div>
                <div class="md:hidden flex space-x-4 py-3 overflow-x-auto text-sm border-t border-gray-100 no-scrollbar">${navLinks}</div>
            </nav>
        </header>
    `;
}

// -----------------------------------------------------------------
// VIEWS
// -----------------------------------------------------------------

function renderAuthView() {
    return `
        <div class="flex min-h-[85vh] items-center justify-center py-10">
            <div class="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md border border-gray-100">
                <div class="text-center mb-8">
                    <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal-50 text-teal-600 mb-6 shadow-sm">
                        <i data-lucide="shopping-cart" class="h-8 w-8"></i>
                    </div>
                    <h1 class="text-3xl font-black text-gray-900 tracking-tight">Welcome Back</h1>
                    <p class="text-gray-500 mt-2 font-medium">Sign in to your account</p>
                </div>
                <form onsubmit="event.preventDefault();" class="space-y-5">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Email</label>
                        <input type="email" id="login-email" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 transition-all outline-none bg-gray-50 focus:bg-white" placeholder="you@example.com" required>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Password</label>
                        <input type="password" id="login-password" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 transition-all outline-none bg-gray-50 focus:bg-white" placeholder="••••••••" required>
                    </div>
                    <button data-action="login" class="w-full bg-teal-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-teal-600/20 hover:bg-teal-700 hover:shadow-xl hover:shadow-teal-600/30 transition-all transform hover:-translate-y-0.5">Sign In</button>
                </form>
                <div class="social-separator">or continue with</div>
                <div class="social-login-grid">
                    <button data-action="social-login" data-provider="google" class="social-btn google"><i data-lucide="chrome" class="h-4 w-4"></i> Google</button>
                    <button data-action="social-login" data-provider="facebook" class="social-btn facebook"><i data-lucide="facebook" class="h-4 w-4"></i> Facebook</button>
                </div>
                <div class="mt-8 text-center text-sm font-medium text-gray-500">
                    New here? <button data-action="navigate" data-view="register" class="text-teal-600 font-bold hover:underline">Create Account</button>
                </div>
            </div>
        </div>
    `;
}

function renderRegister() {
    return `
         <div class="flex min-h-[85vh] items-center justify-center py-10">
            <div class="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-lg border border-gray-100">
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-black text-gray-900">Create Account</h1>
                    <p class="text-gray-500 mt-2">Join the community</p>
                </div>
                <form onsubmit="event.preventDefault();" class="space-y-5">
                    <div class="bg-gray-50 p-5 rounded-2xl border border-gray-200 mb-6">
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">I want to:</label>
                        <div class="flex gap-4">
                            <label class="flex items-center space-x-2 cursor-pointer bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm flex-1 justify-center hover:border-teal-500 transition">
                                <input type="radio" name="role" value="customer" checked class="text-teal-600 focus:ring-teal-500"> <span class="font-bold text-gray-700 text-sm">Buy</span>
                            </label>
                            <label class="flex items-center space-x-2 cursor-pointer bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm flex-1 justify-center hover:border-teal-500 transition">
                                <input type="radio" name="role" value="retailer" class="text-teal-600 focus:ring-teal-500"> <span class="font-bold text-gray-700 text-sm">Sell</span>
                            </label>
                             <label class="flex items-center space-x-2 cursor-pointer bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm flex-1 justify-center hover:border-teal-500 transition">
                                <input type="radio" name="role" value="wholesaler" class="text-teal-600 focus:ring-teal-500"> <span class="font-bold text-gray-700 text-sm">Wholesale</span>
                            </label>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="col-span-2">
                             <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Full Name</label>
                             <input type="text" id="name" class="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50" placeholder="John Doe" required>
                        </div>
                        <div class="col-span-2">
                             <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Phone</label>
                             <input type="tel" id="phoneNumber" class="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50" placeholder="+91..." required>
                        </div>
                        <div class="col-span-2 hidden" id="store-name-container">
                             <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Store Name</label>
                             <input type="text" id="storeName" class="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50" placeholder="My Store">
                        </div>
                    </div>
                     <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Email</label>
                        <input type="email" id="register-email" class="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50" required>
                    </div>
                     <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Password</label>
                        <input type="password" id="register-password" class="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50" required>
                    </div>
                    <div>
                         <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Address</label>
                         <div class="flex gap-2 mb-2">
                            <input type="text" id="pinned-location" readonly class="flex-grow px-4 py-2 border rounded-xl bg-gray-100 text-gray-500 text-sm" placeholder="Pin location ->">
                            <button type="button" data-action="open-map-modal" class="bg-teal-100 text-teal-700 px-4 rounded-xl hover:bg-teal-200"><i data-lucide="map-pin" class="h-5 w-5"></i></button>
                        </div>
                        <textarea id="address-details" class="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50" placeholder="Full Address" rows="2" required></textarea>
                    </div>
                    <button data-action="create-account" class="w-full bg-teal-600 text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-teal-700 transition">Complete Registration</button>
                </form>
                <div class="mt-6 text-center text-sm text-gray-600">Already have an account? <button data-action="navigate" data-view="auth" class="text-teal-600 font-bold hover:underline">Sign In</button></div>
            </div>
        </div>
    `;
}

function renderMarketplace() {
    const selectedTab = appState.marketplaceTab;
    let displayItems = appState.marketplaceTab === 'wishlist' ? appState.allMarketplaceItems.filter(i => appState.favorites.includes(i.id)) : appState.allMarketplaceItems;
    if (appState.marketplaceTab !== 'wishlist' && selectedTab !== 'all') displayItems = displayItems.filter(item => item.storeType === selectedTab);
    const categories = [...new Set(appState.allMarketplaceItems.map(i => i.category))].sort();
    if (appState.filterCategory !== 'all') displayItems = displayItems.filter(item => item.category === appState.filterCategory);
    if (appState.searchQuery) displayItems = displayItems.filter(item => item.name.toLowerCase().includes(appState.searchQuery) || item.description?.toLowerCase().includes(appState.searchQuery));

    const userLat = appState.currentUser?.coordinates?.lat;
    const userLng = appState.currentUser?.coordinates?.lng;
    const isUrbanPlus = appState.currentUser?.isUrbanPlus;

    displayItems = displayItems.map(item => {
        let distance = (userLat && userLng && item.coordinates) ? calculateDistance(userLat, userLng, item.coordinates.lat, item.coordinates.lng) : null;
        return { ...item, distance };
    });

    if (appState.sortOption === 'price-asc') displayItems.sort((a, b) => a.price - b.price);
    else if (appState.sortOption === 'price-desc') displayItems.sort((a, b) => b.price - a.price);
    else if (appState.sortOption === 'name-asc') displayItems.sort((a, b) => a.name.localeCompare(b.name));
    else if (appState.sortOption === 'distance-asc') displayItems.sort((a, b) => (a.distance === null ? 1 : b.distance === null ? -1 : a.distance - b.distance));

    const getTabClass = (tab) => `px-5 py-2.5 rounded-full font-bold text-sm transition-all ${selectedTab === tab ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`;
    
    return `
        <div class="mb-8">
            <div class="text-center mb-8">
                <h1 class="text-4xl font-black text-gray-900 mb-2 tracking-tight">Marketplace</h1>
                ${isUrbanPlus ? `<div class="urban-badge mb-4"><i data-lucide="crown" class="h-3 w-3 mr-1"></i> Urban+ Member</div>` : ''}
                <div class="max-w-xl mx-auto mt-4 relative">
                    <input type="text" id="search-input" data-action="set-search-query" value="${appState.searchQuery}" placeholder="Search for products..." class="w-full pl-12 pr-4 py-4 rounded-full border border-gray-200 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 outline-none shadow-sm transition-all">
                    <i data-lucide="search" class="absolute left-4 top-4.5 h-5 w-5 text-gray-400"></i>
                </div>
            </div>
            <div class="flex justify-center flex-wrap gap-3 mb-8">
                <button data-action="set-marketplace-tab" data-tab="all" class="${getTabClass('all')}">All Items</button>
                <button data-action="set-marketplace-tab" data-tab="retailer" class="${getTabClass('retailer')}">Retail</button>
                <button data-action="set-marketplace-tab" data-tab="wholesaler" class="${getTabClass('wholesaler')}">Wholesale</button>
                <button data-action="set-marketplace-tab" data-tab="wishlist" class="${getTabClass('wishlist')}"><i data-lucide="heart" class="h-4 w-4 inline mr-1"></i> Wishlist</button>
            </div>
            <div class="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-8">
                <div class="flex items-center gap-3">
                    <span class="text-xs font-bold text-gray-500 uppercase">Category</span>
                    <select id="filter-category" class="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-teal-500">
                        <option value="all">All Categories</option>${categories.map(cat => `<option value="${cat}" ${appState.filterCategory === cat ? 'selected' : ''}>${cat}</option>`).join('')}
                    </select>
                </div>
                <div class="flex items-center gap-3">
                     <span class="text-xs font-bold text-gray-500 uppercase">Sort By</span>
                     <select id="sort-option" class="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-teal-500">
                        <option value="price-asc" ${appState.sortOption === 'price-asc' ? 'selected' : ''}>Price: Low to High</option>
                        <option value="price-desc" ${appState.sortOption === 'price-desc' ? 'selected' : ''}>Price: High to Low</option>
                        <option value="name-asc" ${appState.sortOption === 'name-asc' ? 'selected' : ''}>Name: A-Z</option>
                        ${(userLat && userLng) ? `<option value="distance-asc" ${appState.sortOption === 'distance-asc' ? 'selected' : ''}>Distance: Nearest</option>` : ''}
                    </select>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
             ${!isUrbanPlus && appState.marketplaceTab !== 'wishlist' ? `
                <div class="rounded-3xl shadow-lg flex flex-col h-full relative group overflow-hidden bg-gradient-to-br from-gray-900 to-gray-800 text-white transform hover:scale-[1.02] transition duration-300">
                    <div class="p-8 flex-grow flex flex-col items-center text-center justify-center">
                        <div class="bg-gradient-to-br from-yellow-400 to-amber-600 p-4 rounded-2xl mb-6 shadow-lg shadow-amber-500/20 text-white"><i data-lucide="crown" class="h-10 w-10"></i></div>
                        <h3 class="text-2xl font-black mb-2">Urban+</h3>
                        <p class="text-gray-300 text-sm mb-6">Unlock the premium experience.</p>
                        <ul class="text-left text-sm space-y-3 mb-8 text-gray-300">
                            <li class="flex items-center"><i data-lucide="check-circle" class="h-4 w-4 mr-2 text-yellow-400"></i> Free Priority Delivery</li>
                            <li class="flex items-center"><i data-lucide="check-circle" class="h-4 w-4 mr-2 text-yellow-400"></i> Extra Discounts</li>
                        </ul>
                        <div class="text-3xl font-bold text-white mb-1">₹499<span class="text-sm font-normal text-gray-400">/year</span></div>
                    </div>
                    <button data-action="add-to-cart" data-item-id="urban-plus-subscription" data-store-id="system" class="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-bold uppercase tracking-wider transition-colors">Join Now</button>
                </div>
            ` : ''}

            ${displayItems.map(item => {
                const isFav = appState.favorites.includes(item.id);
                const moq = item.storeType === 'wholesaler' ? (item.minOrderQuantity || 100) : 1;
                const distanceHtml = item.distance !== null ? `<div class="absolute bottom-3 right-3 distance-badge"><i data-lucide="map-pin" class="h-3 w-3 mr-1"></i>${item.distance.toFixed(1)} km</div>` : '';
                const urbanDiscount = item.urbanPlusDiscount || 0;
                let priceDisplay = `<span class="text-xl font-bold text-gray-900">₹${Number(item.price).toFixed(2)}</span>`;
                
                if (isUrbanPlus && urbanDiscount > 0) {
                     const discountedPrice = Math.max(0, item.price - urbanDiscount);
                     priceDisplay = `<div class="flex flex-col items-end"><span class="text-xs text-gray-400 line-through">₹${item.price}</span><span class="text-xl font-bold text-amber-600 flex items-center"><i data-lucide="crown" class="h-3 w-3 mr-1"></i>₹${discountedPrice.toFixed(2)}</span></div>`;
                }

                return `
                <div class="bg-white rounded-3xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 flex flex-col h-full relative group overflow-hidden">
                    <button data-action="toggle-wishlist" data-item-id="${item.id}" class="absolute top-3 right-3 z-10 p-2.5 rounded-full shadow-md btn-heart ${isFav ? 'active' : 'bg-white text-gray-300 hover:text-gray-500'}"><i data-lucide="heart" class="h-5 w-5"></i></button>
                    <div class="product-image-container">
                        <img src="${item.imageUrl || 'https://placehold.co/400?text=No+Image'}" alt="${item.name}">
                        <span class="absolute bottom-3 left-3 px-2 py-1 rounded-lg bg-gray-900/5 backdrop-blur-sm text-[10px] font-bold uppercase text-gray-700 border border-gray-200">${item.storeType}</span>
                        ${moq > 1 ? `<div class="absolute top-3 left-3 px-2 py-1 bg-amber-50 text-amber-700 text-[10px] font-bold rounded border border-amber-200">MOQ: ${moq}</div>` : ''}
                        ${distanceHtml}
                    </div>
                    <div class="p-5 flex-grow flex flex-col">
                        <div class="flex justify-between items-start mb-2">
                            <div>
                                <p class="text-xs font-bold text-teal-600 uppercase mb-1">${item.category}</p>
                                <h3 class="text-lg font-bold text-gray-800 leading-tight line-clamp-2">${item.name}</h3>
                            </div>
                        </div>
                        <div class="mt-auto pt-4 border-t border-gray-50 flex justify-between items-end">
                            <div>${priceDisplay}</div>
                            <div class="text-xs text-gray-500 flex items-center"><i data-lucide="store" class="h-3 w-3 mr-1"></i> ${item.storeName}</div>
                        </div>
                    </div>
                    <div class="p-4 pt-0">
                        <button data-action="add-to-cart" data-item-id="${item.id}" data-store-id="${item.storeId}" class="w-full bg-teal-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-teal-600/10 hover:bg-teal-700 hover:shadow-teal-600/20 transition-all transform active:scale-95 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed" ${item.stock === 0 ? 'disabled' : ''}>
                            ${item.stock === 0 ? 'Out of Stock' : '<i data-lucide="shopping-cart" class="h-4 w-4 inline mr-2"></i> Add to Cart'}
                        </button>
                    </div>
                </div>`;
            }).join('')}
            ${displayItems.length === 0 ? `<div class="col-span-full text-center py-24"><div class="bg-gray-50 rounded-full h-24 w-24 flex items-center justify-center mx-auto mb-4"><i data-lucide="package-open" class="h-10 w-10 text-gray-400"></i></div><p class="text-xl font-bold text-gray-500">No items found.</p></div>` : ''}
        </div>
    `;
}

function renderStoreView() {
    const store = appState.currentStore.info;
    const inventory = appState.currentStore.inventory;
    if (!store) return renderLoading();

    return `
        <div>
            ${renderBackButton(appState.currentUser.role === 'customer' ? 'browseStores' : getHomeView(), 'Back to Stores', { storeType: store.type === 'wholesaler' ? 'wholesaler' : 'all' })}
            <div class="bg-white rounded-3xl shadow-sm border border-gray-100 mb-8 overflow-hidden relative">
                <div class="h-56 bg-gray-900 relative">
                    ${store.backdropUrl ? `<img src="${store.backdropUrl}" class="w-full h-full object-cover opacity-60">` : '<div class="w-full h-full bg-gradient-to-r from-teal-800 to-teal-600 opacity-90"></div>'}
                    <div class="absolute inset-0 bg-gradient-to-t from-gray-900/90 to-transparent"></div>
                    <div class="absolute bottom-0 left-0 p-8 text-white w-full">
                        <h1 class="text-4xl font-black mb-2">${store.storeName}</h1>
                        <p class="text-gray-300 flex items-center text-sm font-medium"><i data-lucide="map-pin" class="h-4 w-4 mr-2 text-teal-400"></i> ${store.address}</p>
                    </div>
                </div>
            </div>
            <h2 class="text-2xl font-bold text-gray-800 mb-6 flex items-center"><i data-lucide="package" class="mr-2 text-teal-600"></i> Products</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                ${inventory.map(item => {
                    const isFav = appState.favorites.includes(item.id);
                    return `
                    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col relative overflow-hidden group hover:shadow-md transition">
                         <button data-action="toggle-wishlist" data-item-id="${item.id}" class="absolute top-2 right-2 p-2 rounded-full z-10 btn-heart ${isFav ? 'active' : 'bg-gray-100 text-gray-400'}"><i data-lucide="heart" class="h-4 w-4"></i></button>
                         <div class="product-image-container h-48">
                             <img src="${item.imageUrl || 'https://placehold.co/300'}" alt="${item.name}">
                         </div>
                        <div class="p-4 flex-grow">
                            <h3 class="font-bold text-gray-900 line-clamp-1">${item.name}</h3>
                            <p class="text-xs text-gray-500 mb-3">${item.category}</p>
                            <div class="flex justify-between items-center">
                                <span class="font-bold text-teal-700 text-lg">₹${item.price}</span>
                                <span class="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">Qty: ${item.stock}</span>
                            </div>
                        </div>
                        <div class="p-4 pt-0">
                            <button data-action="add-to-cart" data-item-id="${item.id}" data-store-id="${store.id}" class="w-full bg-teal-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed" ${item.stock < 1 ? 'disabled' : ''}>${item.stock < 1 ? 'Out of Stock' : 'Add'}</button>
                        </div>
                    </div>
                `}).join('')}
                ${inventory.length === 0 ? '<div class="col-span-full text-center py-10 text-gray-500">This store has no products listed yet.</div>' : ''}
            </div>
        </div>
    `;
}

function renderOrdersView() {
    let placed = appState.myOrders.placed || [];
    let received = appState.myOrders.received || []; 
    placed.sort((a,b) => b.createdAt - a.createdAt);
    received.sort((a,b) => (b.buyerIsUrbanPlus && !a.buyerIsUrbanPlus) ? 1 : (!b.buyerIsUrbanPlus && a.buyerIsUrbanPlus) ? -1 : b.createdAt - a.createdAt);
    const isSeller = appState.currentUser.role !== 'customer';

    const renderOrderList = (orders, type) => {
        if(orders.length === 0) return `<div class="p-8 text-center text-gray-500 bg-white rounded-2xl border border-dashed border-gray-300">No orders found.</div>`;
        return orders.map(order => {
            const date = safeDate(order.createdAt).toLocaleDateString();
            const statusConfig = {
                'Placed': { color: 'bg-blue-50 text-blue-700 border-blue-200', icon: 'clock' },
                'Confirmed': { color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: 'check-circle' },
                'Shipped': { color: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'truck' },
                'Delivered': { color: 'bg-green-50 text-green-700 border-green-200', icon: 'package-check' },
                'Cancelled': { color: 'bg-red-50 text-red-700 border-red-200', icon: 'x-circle' },
                'Return Requested': { color: 'bg-orange-50 text-orange-700 border-orange-200', icon: 'rotate-ccw' },
                'Return Approved': { color: 'bg-teal-50 text-teal-700 border-teal-200', icon: 'check-check' },
                'Return Rejected': { color: 'bg-gray-100 text-gray-600 border-gray-200', icon: 'ban' }
            };
            const st = statusConfig[order.status] || { color: 'bg-gray-50 text-gray-700', icon: 'help-circle' };
            const isPriority = order.buyerIsUrbanPlus;

            let actionButtons = '';
            if (type === 'placed') {
                actionButtons = `<button data-action="track-order" data-order-id="${order.id}" class="px-4 py-2 bg-gray-50 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-100 border border-gray-200 transition">Track</button>`;
                if(['Placed', 'Confirmed'].includes(order.status)) actionButtons += `<button data-action="cancel-order" data-order-id="${order.id}" class="px-4 py-2 bg-white text-red-600 border border-red-200 rounded-lg text-sm font-bold hover:bg-red-50 transition ml-2">Cancel</button>`;
                // NEW: RETURN BUTTON
                if(order.status === 'Delivered') actionButtons += `<button data-action="return-order" data-order-id="${order.id}" class="px-4 py-2 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg text-sm font-bold hover:bg-orange-100 transition ml-2">Return Item</button>`;
                if(['Shipped', 'Delivered'].includes(order.status) && order.deliveryOtp) actionButtons += `<div class="inline-block ml-2 px-3 py-2 bg-teal-50 text-teal-800 text-sm font-mono font-bold rounded-lg border border-teal-100">OTP: ${order.deliveryOtp}</div>`;
            } else {
                // Seller Actions
                if(order.buyerPhone) {
                    const msgText = `Order #${order.id.slice(0,5)} Update: ${order.status}.`;
                    actionButtons = `<button onclick="window.open('https://wa.me/${order.buyerPhone}?text=${encodeURIComponent(msgText)}', '_blank')" class="px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-bold hover:bg-green-200 mr-2"><i data-lucide="message-circle" class="h-4 w-4"></i></button>`;
                }
                if (order.status === 'Placed') actionButtons += `<button data-action="update-order-status" data-order-id="${order.id}" data-new-status="Confirmed" class="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-bold hover:bg-teal-700">Accept</button><button data-action="cancel-order" data-order-id="${order.id}" class="px-4 py-2 ml-2 bg-white text-red-600 border border-red-200 rounded-lg text-sm font-bold hover:bg-red-50">Reject</button>`;
                else if (order.status === 'Confirmed') actionButtons += `<button data-action="update-order-status" data-order-id="${order.id}" data-new-status="Shipped" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700">Ship</button>`;
                else if (order.status === 'Shipped') actionButtons += `<button data-action="mark-delivered-with-otp" data-order-id="${order.id}" data-correct-otp="${order.deliveryOtp}" class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700">Verify OTP & Deliver</button>`;
                // NEW: MANAGE RETURN
                else if (order.status === 'Return Requested') actionButtons += `<button data-action="manage-return" data-order-id="${order.id}" class="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-bold hover:bg-orange-700 shadow-md shadow-orange-200">Review Return Request</button>`;
            }

            return `
                <div class="bg-white border border-gray-100 rounded-2xl overflow-hidden mb-6 hover:shadow-lg transition duration-300 ${isPriority && type !== 'placed' ? 'order-priority' : ''}">
                    <div class="bg-gray-50/50 px-6 py-4 border-b border-gray-100 flex flex-wrap justify-between items-center gap-4">
                        <div class="flex gap-8 text-sm">
                            <div><span class="block text-gray-400 text-[10px] uppercase font-bold tracking-wider">Date</span><span class="font-bold text-gray-800">${date}</span></div>
                            <div><span class="block text-gray-400 text-[10px] uppercase font-bold tracking-wider">Amount</span><span class="font-bold text-gray-800">₹${order.total.toFixed(2)}</span></div>
                             <div><span class="block text-gray-400 text-[10px] uppercase font-bold tracking-wider">${type === 'placed' ? 'Seller' : 'Buyer'}</span><span class="font-bold text-gray-800">${type === 'placed' ? order.sellerStoreName : order.buyerName}</span></div>
                        </div>
                        <div class="flex items-center gap-3">
                            ${isPriority && type !== 'placed' ? '<span class="priority-tag"><i data-lucide="zap" class="h-3 w-3"></i> Priority</span>' : ''}
                            <span class="px-3 py-1.5 rounded-full text-xs font-bold uppercase border flex items-center gap-2 ${st.color}"><i data-lucide="${st.icon}" class="h-3 w-3"></i> ${order.status}</span>
                        </div>
                    </div>
                    <div class="p-6">
                        <div class="space-y-4 mb-6">
                            ${order.items.map(item => `
                                <div class="flex justify-between items-center">
                                    <div class="flex items-center">
                                        <div class="h-12 w-12 bg-gray-50 rounded-lg flex items-center justify-center text-gray-300 mr-4 border border-gray-100"><i data-lucide="package" class="h-6 w-6"></i></div>
                                        <div><div class="font-bold text-gray-800">${item.name}</div><div class="text-xs text-gray-500 font-medium">${item.quantity} x ₹${item.price}</div></div>
                                    </div>
                                    <div class="font-bold text-gray-900">₹${(item.price * item.quantity).toFixed(2)}</div>
                                </div>
                            `).join('')}
                        </div>
                        ${(order.returnReason && (order.status.includes('Return'))) ? `<div class="bg-orange-50 p-3 rounded-lg text-sm text-orange-800 mb-4 border border-orange-100"><strong>Return Reason:</strong> ${order.returnReason}</div>` : ''}
                        <div class="flex flex-wrap gap-2 pt-4 border-t border-gray-50 justify-end items-center">${actionButtons}</div>
                    </div>
                </div>
            `;
        }).join('');
    };

    return `
        <div class="max-w-5xl mx-auto">
            <h1 class="text-3xl font-black text-gray-900 mb-8 tracking-tight">Your Orders</h1>
            ${isSeller ? `
                <div class="mb-8 border-b border-gray-200">
                    <nav class="-mb-px flex space-x-8">
                        <button class="border-b-4 border-teal-600 py-4 px-1 font-bold text-teal-800">My Purchases</button>
                    </nav>
                </div>
            ` : ''}
            <div class="space-y-6">${renderOrderList(placed, 'placed')}</div>
            ${isSeller ? `
                <div class="mt-16 pt-10 border-t-2 border-dashed border-gray-200">
                    <h2 class="text-2xl font-black text-gray-800 mb-6 flex items-center"><i data-lucide="inbox" class="mr-2 text-teal-600"></i> Incoming Orders</h2>
                    ${renderOrderList(received, 'received')}
                </div>
            `: ''}
        </div>
    `;
}

function renderCartView() {
    const cartByStore = {};
    appState.cart.forEach(item => { if (!cartByStore[item.storeId]) cartByStore[item.storeId] = { name: item.storeName, items: [] }; cartByStore[item.storeId].items.push(item); });
    const storeIds = Object.keys(cartByStore);
    if (storeIds.length === 0) return `<div class="text-center py-20"><div class="inline-flex bg-teal-50 p-6 rounded-full mb-6"><i data-lucide="shopping-cart" class="h-12 w-12 text-teal-300"></i></div><h2 class="text-2xl font-bold text-gray-800 mb-2">Cart is Empty</h2><button data-action="navigate" data-view="marketplace" class="bg-teal-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-teal-700 transition shadow-lg shadow-teal-600/20">Start Shopping</button></div>`;
    
    return `
        <div class="max-w-4xl mx-auto">
            <h1 class="text-3xl font-bold text-gray-900 mb-8">Shopping Cart</h1>
            ${storeIds.map(storeId => {
                const storeGroup = cartByStore[storeId];
                let subtotal = 0, totalQty = 0;
                storeGroup.items.forEach(i => { subtotal += i.price * i.quantity; totalQty += i.quantity; });
                const deliveryFee = (appState.deliveryOptions[storeId] === 'pickup') ? 0 : (totalQty * 20);
                const total = subtotal + deliveryFee; 
                
                return `
                <div class="bg-white rounded-2xl shadow-sm border border-gray-200 mb-8 overflow-hidden">
                    <div class="bg-gray-50 px-6 py-4 border-b border-gray-200 font-bold text-lg text-gray-800 flex items-center"><i data-lucide="store" class="h-5 w-5 mr-2 text-teal-600"></i> ${storeGroup.name}</div>
                    <div class="p-6">
                        ${storeGroup.items.map(item => `
                            <div class="flex justify-between items-center mb-6 pb-6 border-b border-gray-100 last:border-0 last:mb-0 last:pb-0">
                                <div class="flex items-center">
                                    <div class="h-16 w-16 bg-gray-100 rounded-lg overflow-hidden mr-4"><img src="${item.imageUrl || 'https://placehold.co/100'}" class="w-full h-full object-cover"></div>
                                    <div><h4 class="font-bold text-gray-800">${item.name}</h4><p class="text-teal-600 font-medium">₹${item.price}</p></div>
                                </div>
                                <div class="flex items-center gap-4">
                                    <div class="flex items-center border border-gray-300 rounded-lg"><button data-action="update-cart-quantity" data-cart-id="${item.id}" data-change="-1" class="px-3 py-1 text-gray-600 hover:bg-gray-100">-</button><span class="px-3 font-medium text-gray-800">${item.quantity}</span><button data-action="update-cart-quantity" data-cart-id="${item.id}" data-change="1" class="px-3 py-1 text-gray-600 hover:bg-gray-100">+</button></div>
                                    <button data-action="remove-from-cart" data-cart-id="${item.id}" class="text-gray-400 hover:text-red-500 p-2"><i data-lucide="trash-2" class="h-5 w-5"></i></button>
                                </div>
                            </div>`).join('')}
                    </div>
                    <div class="bg-gray-50 p-6 border-t border-gray-200">
                        <div class="flex justify-between items-center mb-4">
                             <div class="flex gap-4">
                                <label class="flex items-center cursor-pointer"><input type="radio" name="d-${storeId}" value="delivery" checked class="mr-2 text-teal-600"> Delivery (₹${totalQty*20})</label>
                                <label class="flex items-center cursor-pointer"><input type="radio" name="d-${storeId}" value="pickup" class="mr-2 text-teal-600"> Pickup (Free)</label>
                             </div>
                             <div class="text-xl font-bold">Total: ₹${total.toFixed(2)}</div>
                        </div>
                        <button data-action="initiate-payment" data-store-id="${storeId}" class="w-full bg-teal-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-teal-700">Checkout</button>
                    </div>
                </div>`;
            }).join('')}
        </div>
    `;
}

function renderBrowseStores(typeFilter) {
    let stores = appState.stores;
    if (typeFilter && typeFilter !== 'all') stores = stores.filter(s => s.type === typeFilter);
    const userLat = appState.currentUser?.coordinates?.lat;
    const userLng = appState.currentUser?.coordinates?.lng;
    stores = stores.map(store => ({ ...store, distance: (userLat && userLng && store.coordinates) ? calculateDistance(userLat, userLng, store.coordinates.lat, store.coordinates.lng) : null }));
    if (appState.sortOption === 'distance-asc') stores.sort((a, b) => (a.distance === null ? 1 : b.distance === null ? -1 : a.distance - b.distance));

    return `
        <div class="max-w-6xl mx-auto">
            ${renderBackButton(getHomeView())}
            <div class="flex justify-between items-center mb-8">
                <h1 class="text-3xl font-black text-gray-900 tracking-tight">Browse Stores ${typeFilter && typeFilter !== 'all' ? `(${typeFilter}s)` : ''}</h1>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${stores.map(store => `
                    <div class="bg-white rounded-2xl shadow-sm hover:shadow-xl transition overflow-hidden border border-gray-100 cursor-pointer group" data-action="navigate" data-view="storeView" data-store-id="${store.id}">
                        <div class="h-32 bg-gradient-to-r from-teal-500 to-emerald-600 relative">
                             ${store.backdropUrl ? `<img src="${store.backdropUrl}" class="w-full h-full object-cover opacity-50">` : ''}
                             <div class="absolute -bottom-6 left-6 h-16 w-16 bg-white rounded-xl shadow-md flex items-center justify-center text-2xl font-bold text-teal-700 border-2 border-white">
                                ${store.storeName.charAt(0)}
                             </div>
                        </div>
                        <div class="pt-10 p-6">
                            <div class="flex justify-between items-start mb-1">
                                <h3 class="text-xl font-bold text-gray-900 group-hover:text-teal-600 transition">${store.storeName}</h3>
                                ${store.distance !== null ? `<span class="bg-teal-50 text-teal-800 text-xs font-bold px-2 py-1 rounded-full border border-teal-100">${store.distance.toFixed(1)} km</span>` : ''}
                            </div>
                            <p class="text-sm text-gray-500 capitalize mb-4">${store.type} • ${store.ownerName}</p>
                            <div class="text-sm text-gray-600 flex items-start"><i data-lucide="map-pin" class="h-4 w-4 mr-2 mt-1 text-gray-400"></i> ${store.address}</div>
                        </div>
                    </div>
                `).join('')}
                ${stores.length === 0 ? '<p class="text-gray-500 col-span-3 text-center py-10">No stores found.</p>' : ''}
            </div>
        </div>
    `;
}

function renderSellerDashboard(type) {
    const inventory = appState.myInventory || [];
    const coupons = appState.myCoupons || [];
    return `
        <div class="max-w-6xl mx-auto">
            <div class="flex justify-between items-center mb-8">
                <h1 class="text-3xl font-bold text-gray-900 capitalize">${type} Dashboard</h1>
                <div class="flex gap-3">
                    <button data-action="open-add-inventory-modal" class="bg-teal-600 text-white px-5 py-2.5 rounded-xl hover:bg-teal-700 flex items-center shadow-md"><i data-lucide="plus" class="h-4 w-4 mr-2"></i> Add Item</button>
                    <button data-action="open-create-coupon-modal" class="bg-purple-600 text-white px-5 py-2.5 rounded-xl hover:bg-purple-700 flex items-center shadow-md"><i data-lucide="tag" class="h-4 w-4 mr-2"></i> Coupon</button>
                </div>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 class="text-xl font-bold text-gray-800 mb-4 flex items-center"><i data-lucide="box" class="mr-2 text-teal-600"></i> Inventory</h2>
                    ${inventory.length === 0 ? '<p class="text-gray-500 text-center py-4">No items.</p>' : 
                    `<div class="space-y-3">${inventory.map(item => `
                        <div class="flex justify-between items-center p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-teal-200 transition">
                            <div><p class="font-bold text-gray-800">${item.name}</p><p class="text-xs text-gray-500">Stock: ${item.stock} | ₹${item.price}</p></div>
                            <div class="flex gap-2"><button data-action="open-edit-inventory-modal" data-item-id="${item.id}" class="text-blue-500 hover:bg-blue-50 p-2 rounded-lg"><i data-lucide="edit-2" class="h-4 w-4"></i></button><button data-action="delete-inventory-item" data-item-id="${item.id}" class="text-red-500 hover:bg-red-50 p-2 rounded-lg"><i data-lucide="trash-2" class="h-4 w-4"></i></button></div>
                        </div>`).join('')}</div>`}
                </div>
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 class="text-xl font-bold text-gray-800 mb-4 flex items-center"><i data-lucide="ticket" class="mr-2 text-purple-600"></i> Coupons</h2>
                    ${coupons.length === 0 ? '<p class="text-gray-500 text-center py-4">No active coupons.</p>' : 
                    `<div class="space-y-3">${coupons.map(c => `
                        <div class="flex justify-between items-center p-3 bg-gray-50 rounded-xl border border-gray-100">
                            <div><p class="font-bold text-gray-800">${c.code}</p><p class="text-xs text-gray-500">${c.type === 'percent' ? c.value + '%' : '₹' + c.value} OFF</p></div>
                            <button data-action="delete-coupon" data-coupon-id="${c.id}" class="text-red-500 hover:bg-red-50 p-2 rounded-lg"><i data-lucide="trash-2" class="h-4 w-4"></i></button>
                        </div>`).join('')}</div>`}
                </div>
            </div>
        </div>
    `;
}

function renderRetailerDashboard() { return renderSellerDashboard('retailer'); }
function renderWholesalerDashboard() { return renderSellerDashboard('wholesaler'); }
function renderCustomerDashboard() { navigateTo('marketplace'); return ''; }

function renderProfileView() {
    const user = appState.currentUser;
    return `
        <div class="max-w-2xl mx-auto">
            ${renderBackButton(getHomeView(), 'Back')}
            <div class="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                <h1 class="text-3xl font-bold text-gray-900 mb-6">Edit Profile</h1>
                <form id="update-profile-form" class="space-y-4">
                    <div><label class="block text-sm font-bold text-gray-700 mb-1">Name</label><input type="text" id="profile-name" value="${user.name || ''}" class="w-full border rounded-xl px-4 py-2"></div>
                    <div><label class="block text-sm font-bold text-gray-700 mb-1">Phone</label><input type="tel" id="profile-phone" value="${user.phoneNumber || ''}" class="w-full border rounded-xl px-4 py-2"></div>
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-1">Location</label>
                        <div class="flex gap-2 mb-2"><input type="text" id="profile-pinned-location" value="${user.pinnedLocation || ''}" readonly class="flex-grow border rounded-xl px-4 py-2 bg-gray-50 text-gray-500"><button type="button" data-action="open-map-modal" class="bg-teal-50 text-teal-700 px-4 rounded-xl border border-teal-100 hover:bg-teal-100">Pin</button></div>
                        <textarea id="profile-address-details" class="w-full border rounded-xl px-4 py-2" rows="3">${user.addressDetails || ''}</textarea>
                    </div>
                    ${(user.role !== 'customer') ? `<div><label class="block text-sm font-bold text-gray-700 mb-1">Store Name</label><input type="text" id="profile-store-name" value="${user.storeName || ''}" class="w-full border rounded-xl px-4 py-2"></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Backdrop URL</label><input type="text" id="profile-backdrop" value="${user.backdropUrl || ''}" class="w-full border rounded-xl px-4 py-2"></div>` : ''}
                    <button data-action="update-profile" class="w-full bg-teal-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-teal-700">Save Changes</button>
                </form>
            </div>
        </div>
    `;
}

function renderInfoView() {
    return `
        <div class="max-w-4xl mx-auto">
            ${renderBackButton(getHomeView(), 'Back')}
            <div class="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                <h1 class="text-3xl font-bold text-gray-900 mb-6 text-center">Policies</h1>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="bg-teal-50 p-6 rounded-xl"><h2 class="font-bold text-teal-800 mb-2">Returns</h2><p class="text-sm text-gray-600">Accepted within 7 days. Refund to wallet.</p></div>
                    <div class="bg-red-50 p-6 rounded-xl"><h2 class="font-bold text-red-800 mb-2">Cancellations</h2><p class="text-sm text-gray-600">Cancel before shipping for full refund.</p></div>
                </div>
            </div>
        </div>
    `;
}

// -----------------------------------------------------------------
// MAIN LOGIC & HANDLERS
// -----------------------------------------------------------------

async function init() {
    renderApp(); 
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await loadUserAccount(user.uid);
        } else {
            appState.currentUser = null;
            navigateTo('auth');
        }
    });
}

async function loadUserAccount(uid) {
    appState.isLoading = true;
    renderApp();
    try {
        const userDoc = await getDoc(paths.user(uid));
        if (userDoc.exists()) {
            appState.currentUser = { uid, email: auth.currentUser.email, ...userDoc.data() };
            if (appState.currentUser.walletBalance === undefined) appState.currentUser.walletBalance = 0;
            if(appState.currentUser.role !== 'customer') appState.currentUser.storeId = uid; 
            await setupRealtimeListeners(uid, appState.currentUser.role);
            navigateTo(appState.currentUser.role === 'customer' ? 'marketplace' : appState.currentUser.role + 'Dashboard'); 
        } else {
            navigateTo('register');
        }
    } catch (e) {
        appState.error = "Could not load user account.";
    } finally {
        appState.isLoading = false;
        renderApp();
    }
}

async function setupRealtimeListeners(uid, role) {
    appState.listeners.forEach(unsub => unsub());
    appState.listeners = [];
    
    appState.listeners.push(onSnapshot(doc(db, `artifacts/${appId}/public/data/users`, uid), (doc) => {
        if (doc.exists()) { appState.currentUser = { ...appState.currentUser, ...doc.data() }; renderApp(); }
    }));

    appState.listeners.push(onSnapshot(query(paths.stores()), (snapshot) => {
        appState.stores = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (appState.currentView === 'marketplace') loadMarketplaceItems();
        renderApp(); 
    }));

    appState.listeners.push(onSnapshot(query(paths.cart(uid)), (snapshot) => {
        appState.cart = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        appState.cart.forEach(item => { if (!appState.deliveryOptions[item.storeId]) appState.deliveryOptions[item.storeId] = 'delivery'; });
        renderApp();
    }));

    if (role === 'customer') {
        appState.listeners.push(onSnapshot(query(paths.favorites(uid)), (snapshot) => {
            appState.favorites = snapshot.docs.map(doc => doc.id); 
            renderApp();
        }));
    }

    if (role === 'retailer' || role === 'wholesaler') {
        appState.listeners.push(onSnapshot(query(paths.inventory(uid)), (snapshot) => {
            appState.myInventory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderApp();
        }));
        appState.listeners.push(onSnapshot(query(paths.coupons(uid)), (snapshot) => {
            appState.myCoupons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderApp();
        }));
        appState.listeners.push(onSnapshot(query(paths.orders(), where("sellerStoreId", "==", uid)), (snapshot) => {
            appState.myOrders.received = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderApp();
        }));
    }

    appState.listeners.push(onSnapshot(query(paths.orders(), where("buyerId", "==", uid)), (snapshot) => {
        appState.myOrders.placed = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderApp();
    }));
}

async function loadMarketplaceItems() {
    let allItems = [];
    try {
        for (const store of appState.stores) {
            const invQuery = query(paths.inventory(store.id));
            const snapshot = await getDocs(invQuery);
            const storeItems = snapshot.docs.map(doc => ({
                id: doc.id, storeId: store.id, storeName: store.storeName, storeType: store.type, coordinates: store.coordinates, ...doc.data()
            }));
            allItems = [...allItems, ...storeItems];
        }
        appState.allMarketplaceItems = allItems;
    } catch (e) { console.error(e); } finally { renderApp(); }
}

function renderApp() {
    const appContainer = document.getElementById('app');
    if (appState.isLoading) { appContainer.innerHTML = renderLoading(); return; }
    
    let viewHtml = '';
    switch (appState.currentView) {
        case 'auth': viewHtml = renderAuthView(); break;
        case 'register': viewHtml = renderRegister(); break;
        case 'marketplace': viewHtml = renderMarketplace(); break;
        case 'customerDashboard': viewHtml = renderCustomerDashboard(); break;
        case 'retailerDashboard': viewHtml = renderRetailerDashboard(); break;
        case 'wholesalerDashboard': viewHtml = renderWholesalerDashboard(); break;
        case 'browseStores': viewHtml = renderBrowseStores(appState.viewParams?.storeType); break;
        case 'storeView': viewHtml = renderStoreView(); break;
        case 'cartView': viewHtml = renderCartView(); break;
        case 'ordersView': viewHtml = renderOrdersView(); break;
        case 'profileView': viewHtml = renderProfileView(); break;
        case 'infoView': viewHtml = renderInfoView(); break;
        default: viewHtml = renderLoading();
    }
    
    const header = (appState.currentView !== 'auth' && appState.currentView !== 'register' && appState.currentUser) ? renderHeader() : '';
    const mainClass = (appState.currentView === 'auth' || appState.currentView === 'register') ? '' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8';
    appContainer.innerHTML = header + `<main class="${mainClass}">${viewHtml}</main>`;
    if(window.lucide) lucide.createIcons();
    addEventListeners();
}

function navigateTo(view, params = {}) {
    appState.currentView = view;
    appState.viewParams = params;
    if (view === 'storeView' && params.storeId) loadStoreData(params.storeId);
    else if (view === 'marketplace') loadMarketplaceItems();
    else renderApp();
}

async function loadStoreData(storeId) {
    appState.isLoading = true; renderApp();
    try {
        const storeDoc = await getDoc(paths.store(storeId));
        if (!storeDoc.exists()) throw new Error("Store not found");
        const inventorySnap = await getDocs(paths.inventory(storeId));
        appState.currentStore.info = { id: storeDoc.id, ...storeDoc.data() };
        appState.currentStore.inventory = inventorySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) { appState.error = e.message; } finally { appState.isLoading = false; renderApp(); }
}

function addEventListeners() {
    document.onclick = (e) => {
        const actionEl = e.target.closest('[data-action]');
        if (!actionEl) return;
        if (actionEl.tagName !== 'SELECT' && actionEl.tagName !== 'INPUT') e.preventDefault();
        
        const action = actionEl.dataset.action;
        const params = { ...actionEl.dataset };

        switch (action) {
            case 'navigate': navigateTo(params.view, params); break;
            case 'login': handleLogin(); break;
            case 'social-login': handleSocialLogin(params.provider); break;
            case 'create-account': handleCreateAccount(); break;
            case 'logout': signOut(auth).then(()=>navigateTo('auth')); break;
            case 'open-add-inventory-modal': openModal('Add Item', renderAddInventoryForm()); break;
            case 'add-to-inventory': handleAddToInventory(); break;
            case 'delete-inventory-item': if(confirm("Delete?")) deleteDoc(paths.inventoryItem(appState.currentUser.uid, params.itemId)); break;
            case 'open-edit-inventory-modal': appState.editingItemId = params.itemId; openModal('Edit', renderEditInventoryForm(params.itemId)); break;
            case 'open-create-coupon-modal': openModal('New Coupon', renderCreateCouponForm()); break;
            case 'create-coupon': handleCreateCoupon(); break;
            case 'delete-coupon': deleteDoc(paths.coupon(appState.currentUser.uid, params.couponId)); break;
            case 'add-to-cart': handleAddToCart(params.itemId, params.storeId); break;
            case 'remove-from-cart': deleteDoc(paths.cartItem(appState.currentUser.uid, params.cartId)); break;
            case 'update-cart-quantity': handleUpdateCartQuantity(params.cartId, params.change); break;
            case 'initiate-payment': handleInitiatePayment(params.storeId); break;
            case 'set-marketplace-tab': appState.marketplaceTab = params.tab; renderApp(); break;
            case 'open-map-modal': openMapModal(); break;
            case 'confirm-location': handleConfirmLocation(); break;
            case 'update-profile': handleUpdateProfile(); break; 
            case 'toggle-wishlist': handleToggleWishlist(params.itemId); break; 
            case 'cancel-order': if(confirm("Cancel Order?")) updateDoc(paths.order(params.orderId), { status: 'Cancelled' }); break;
            case 'return-order': handleReturnOrder(params.orderId); break;
            case 'track-order': handleTrackOrder(params.orderId); break;
            case 'update-order-status': updateDoc(paths.order(params.orderId), { status: params.newStatus }); break;
            case 'mark-delivered-with-otp': handleMarkDeliveredWithOtp(params.orderId, params.correctOtp); break;
            case 'manage-return': handleManageReturn(params.orderId); break;
        }
    };
    
    document.onchange = (e) => {
        if (e.target.id === 'filter-category') { appState.filterCategory = e.target.value; renderApp(); }
        if (e.target.id === 'sort-option') { appState.sortOption = e.target.value; renderApp(); }
    };
    document.oninput = (e) => {
        if (e.target.dataset.action === 'set-search-query') { appState.searchQuery = e.target.value.toLowerCase(); renderApp(); }
    };
}

// -----------------------------------------------------------------
// HANDLERS
// -----------------------------------------------------------------

function handleLogin() {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    if (!email || !pass) return showToast("Enter credentials", "error");
    appState.isLoading = true; renderApp();
    signInWithEmailAndPassword(auth, email, pass).catch(e => { showToast(e.message, "error"); appState.isLoading = false; renderApp(); });
}

function handleSocialLogin(providerName) {
    const provider = providerName === 'google' ? new GoogleAuthProvider() : new FacebookAuthProvider();
    appState.isLoading = true; renderApp();
    signInWithPopup(auth, provider).catch(e => { showToast(e.message, "error"); appState.isLoading = false; renderApp(); });
}

async function handleCreateAccount() {
    const email = document.getElementById('register-email')?.value; 
    const pass = document.getElementById('register-password')?.value;
    const name = document.getElementById('name').value;
    const phone = document.getElementById('phoneNumber').value;
    const details = document.getElementById('address-details').value;
    const role = document.querySelector('input[name="role"]:checked').value;
    
    if (!email || !name || !details) return showToast("Fill all fields", "error");
    appState.isLoading = true; renderApp();

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        const uid = cred.user.uid;
        const fullAddress = `${details} [Pinned: ${document.getElementById('pinned-location').value || ''}]`;
        const userData = { name, phoneNumber: phone, address: fullAddress, addressDetails: details, role, email, walletBalance: 0, isUrbanPlus: false, createdAt: serverTimestamp() };
        if(role !== 'customer') {
            userData.storeName = document.getElementById('storeName').value;
            await setDoc(paths.store(uid), { storeName: userData.storeName, ownerName: name, address: fullAddress, type: role, ownerId: uid, createdAt: serverTimestamp() });
        }
        await setDoc(paths.user(uid), userData);
        loadUserAccount(uid);
    } catch (e) { showToast(e.message, "error"); appState.isLoading = false; renderApp(); }
}

function handleUpdateProfile() {
    const name = document.getElementById('profile-name').value;
    const phone = document.getElementById('profile-phone').value;
    const details = document.getElementById('profile-address-details').value;
    const storeName = document.getElementById('profile-store-name')?.value;
    const backdrop = document.getElementById('profile-backdrop')?.value;
    
    const updates = { name, phoneNumber: phone, addressDetails: details };
    if(storeName) updates.storeName = storeName;
    if(backdrop) updates.backdropUrl = backdrop;
    
    updateDoc(paths.user(appState.currentUser.uid), updates).then(() => {
        if(storeName) updateDoc(paths.store(appState.currentUser.uid), { storeName, ownerName: name, backdropUrl: backdrop });
        showToast("Profile Updated");
    });
}

async function handleAddToCart(itemId, storeId) {
    if (!appState.currentUser) { showToast("Please login", "error"); navigateTo('auth'); return; }
    if (itemId === 'urban-plus-subscription') {
        if(confirm("Subscribe to Urban+ for ₹499/year?")) {
            await updateDoc(paths.user(appState.currentUser.uid), { isUrbanPlus: true });
            showToast("Welcome to Urban+!", "gold");
            window.location.reload();
        }
        return;
    }
    
    let product = appState.allMarketplaceItems.find(i => i.id === itemId);
    if (!product && appState.currentStore.inventory) product = appState.currentStore.inventory.find(i => i.id === itemId);
    if (!product) return;

    product.storeId = storeId;
    const existing = appState.cart.find(i => i.inventoryItemId === itemId && i.storeId === storeId);
    
    if (existing) {
        updateDoc(paths.cartItem(appState.currentUser.uid, existing.id), { quantity: existing.quantity + 1 });
        showToast("Quantity updated");
    } else {
        let price = product.price;
        if(appState.currentUser.isUrbanPlus && product.urbanPlusDiscount) price = Math.max(0, price - product.urbanPlusDiscount);
        addDoc(paths.cart(appState.currentUser.uid), {
            inventoryItemId: itemId, name: product.name, price: Number(price), 
            storeId, storeName: product.storeName || 'Store', imageUrl: product.imageUrl || '', 
            quantity: 1, addedAt: serverTimestamp()
        });
        showToast("Added to Cart");
    }
}

function handleUpdateCartQuantity(cartId, change) {
    const item = appState.cart.find(c => c.id === cartId);
    if(item && item.quantity + Number(change) > 0) updateDoc(paths.cartItem(appState.currentUser.uid, cartId), { quantity: item.quantity + Number(change) });
}

function handleToggleWishlist(itemId) {
    const uid = appState.currentUser.uid;
    if(appState.favorites.includes(itemId)) deleteDoc(paths.favorite(uid, itemId));
    else setDoc(paths.favorite(uid, itemId), { itemId });
}

// INVENTORY & COUPONS
function renderAddInventoryForm() { return `<div><label>Name</label><input id="inv-name" class="w-full border p-2 rounded mb-2"><label>Price</label><input id="inv-price" type="number" class="w-full border p-2 rounded mb-2"><label>Stock</label><input id="inv-stock" type="number" class="w-full border p-2 rounded mb-2"><label>Image URL</label><input id="inv-img" class="w-full border p-2 rounded mb-2"><label>Category</label><input id="inv-cat" class="w-full border p-2 rounded mb-2"><button onclick="submitInventory()" class="w-full bg-teal-600 text-white p-2 rounded mt-2">Add</button></div>`; }
window.submitInventory = function() {
    const name = document.getElementById('inv-name').value;
    const price = Number(document.getElementById('inv-price').value);
    const stock = Number(document.getElementById('inv-stock').value);
    const imageUrl = document.getElementById('inv-img').value;
    const category = document.getElementById('inv-cat').value;
    if(!name) return;
    addDoc(paths.inventory(appState.currentUser.uid), { name, price, stock, imageUrl, category, storeId: appState.currentUser.uid, createdAt: serverTimestamp() }).then(()=>{ closeModal(); showToast("Added"); });
};
function renderEditInventoryForm(itemId) { const item = appState.myInventory.find(i=>i.id===itemId); return `<div><label>Name</label><input id="edit-name" value="${item.name}" class="w-full border p-2 rounded"><button onclick="updateInventory('${itemId}')" class="bg-blue-600 text-white p-2 w-full mt-2 rounded">Update</button></div>`; }
window.updateInventory = function(id) { updateDoc(paths.inventoryItem(appState.currentUser.uid, id), { name: document.getElementById('edit-name').value }).then(()=>{ closeModal(); showToast("Updated"); }); };
function renderCreateCouponForm() { return `<div><label>Code</label><input id="c-code" class="w-full border p-2 rounded mb-2 uppercase"><label>Value</label><input id="c-val" type="number" class="w-full border p-2 rounded mb-2"><label>Type</label><select id="c-type" class="w-full border p-2 rounded"><option value="percent">%</option><option value="flat">Flat</option></select><button onclick="submitCoupon()" class="w-full bg-purple-600 text-white p-2 rounded mt-2">Create</button></div>`; }
window.submitCoupon = function() { addDoc(paths.coupons(appState.currentUser.uid), { code: document.getElementById('c-code').value, value: Number(document.getElementById('c-val').value), type: document.getElementById('c-type').value, storeId: appState.currentUser.uid }).then(()=>{ closeModal(); showToast("Created"); }); };

// PAYMENT
function handleInitiatePayment(storeId) {
    const items = appState.cart.filter(i => i.storeId === storeId);
    const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    appState.pendingPaymentStoreId = storeId;
    appState.pendingPaymentTotal = total;
    
    const content = `
        <div class="payment-container">
            <h3 class="text-2xl font-black text-center mb-6 text-gray-800">₹${total.toFixed(2)}</h3>
            <div class="payment-tabs-container">
                <div class="payment-tab active" onclick="switchPaymentTab('card', event)">Card</div>
                <div class="payment-tab" onclick="switchPaymentTab('upi', event)">UPI</div>
                <div class="payment-tab" onclick="switchPaymentTab('cod', event)">COD</div>
            </div>
            <div id="payment-card" class="payment-content active">
                <input type="text" placeholder="Card Number" class="w-full border p-3 rounded-lg mb-3">
                <div class="flex gap-3 mb-4"><input type="text" placeholder="MM/YY" class="w-1/2 border p-3 rounded-lg"><input type="text" placeholder="CVV" class="w-1/2 border p-3 rounded-lg"></div>
                <button onclick="processPayment('Card')" class="w-full bg-teal-600 text-white font-bold py-3 rounded-xl hover:bg-teal-700 shadow-lg">Pay Securely</button>
            </div>
            <div id="payment-upi" class="payment-content">
                <input type="text" placeholder="username@upi" class="w-full border p-3 rounded-lg mb-4">
                <button onclick="processPayment('UPI')" class="w-full bg-teal-600 text-white font-bold py-3 rounded-xl hover:bg-teal-700 shadow-lg">Verify & Pay</button>
            </div>
            <div id="payment-cod" class="payment-content">
                <button onclick="processPayment('COD')" class="w-full bg-gray-800 text-white font-bold py-3 rounded-xl hover:bg-gray-900 shadow-lg">Confirm Cash on Delivery</button>
            </div>
        </div>`;
    openModal("Select Payment", content);
}

window.processPayment = async function(method) {
    const sid = appState.pendingPaymentStoreId;
    const items = appState.cart.filter(i => i.storeId === sid);
    const batch = writeBatch(db);
    const orderData = {
        buyerId: appState.currentUser.uid, 
        buyerName: appState.currentUser.name,
        buyerPhone: appState.currentUser.phoneNumber || '',
        buyerIsUrbanPlus: appState.currentUser.isUrbanPlus || false, 
        sellerStoreId: sid,
        sellerStoreName: items[0].storeName,
        items: items.map(i => ({name: i.name, quantity: i.quantity, price: i.price})),
        total: appState.pendingPaymentTotal,
        paymentMethod: method,
        status: 'Placed',
        createdAt: serverTimestamp(),
        deliveryOtp: Math.floor(1000 + Math.random() * 9000).toString()
    };
    batch.set(doc(paths.orders()), orderData);
    items.forEach(i => batch.delete(paths.cartItem(appState.currentUser.uid, i.id)));
    await batch.commit();
    closeModal();
    showToast(`Order Placed!`, "success");
    navigateTo('ordersView');
};

// RETURNS
function handleReturnOrder(orderId) {
    appState.returnOrderId = orderId;
    const content = `
        <div class="space-y-4">
            <p class="text-sm text-gray-500">Why are you returning this item?</p>
            <div><label class="block text-sm font-bold text-gray-700 mb-2">Reason</label><textarea id="return-reason" class="w-full border rounded-lg p-3" rows="3"></textarea></div>
            <div><label class="block text-sm font-bold text-gray-700 mb-2">Image URL</label><input type="text" id="return-image" class="w-full border rounded-lg p-3"></div>
            <button onclick="submitReturnRequest()" class="w-full bg-orange-600 text-white font-bold py-3 rounded-xl hover:bg-orange-700 mt-2">Submit Request</button>
        </div>`;
    openModal("Return Item", content);
}

window.submitReturnRequest = async function() {
    const reason = document.getElementById('return-reason').value;
    const img = document.getElementById('return-image').value;
    if(!reason) return showToast("Provide a reason", "error");
    await updateDoc(paths.order(appState.returnOrderId), { status: 'Return Requested', returnReason: reason, returnImage: img || null, returnRequestedAt: serverTimestamp() });
    closeModal();
    showToast("Return Requested", "success");
};

function handleManageReturn(orderId) {
    const order = appState.myOrders.received.find(o => o.id === orderId);
    const content = `
        <div class="space-y-4">
            <div class="bg-orange-50 p-4 rounded-xl border border-orange-100"><h4 class="font-bold text-orange-800">Reason:</h4><p>${order.returnReason}</p></div>
            ${order.returnImage ? `<img src="${order.returnImage}" class="w-full h-40 object-contain bg-gray-100 rounded-xl">` : ''}
            <div class="grid grid-cols-2 gap-4 mt-4">
                <button onclick="resolveReturn('${orderId}', 'reject')" class="w-full border border-gray-300 font-bold py-3 rounded-xl">Reject</button>
                <button onclick="resolveReturn('${orderId}', 'approve')" class="w-full bg-teal-600 text-white font-bold py-3 rounded-xl">Approve & Refund</button>
            </div>
        </div>`;
    openModal("Manage Return", content);
}

window.resolveReturn = async function(orderId, decision) {
    if(decision === 'reject') {
        await updateDoc(paths.order(orderId), { status: 'Return Rejected' });
        showToast("Return Rejected");
    } else {
        const order = appState.myOrders.received.find(o => o.id === orderId);
        const batch = writeBatch(db);
        batch.update(paths.order(orderId), { status: 'Return Approved' });
        batch.update(paths.user(order.buyerId), { walletBalance: increment(order.total) });
        await batch.commit();
        showToast("Refunded to Buyer", "success");
    }
    closeModal();
};

function handleMarkDeliveredWithOtp(id, correctOtp) {
    const otp = prompt("Enter OTP provided by Buyer:");
    if(otp === correctOtp) updateDoc(paths.order(id), { status: 'Delivered' });
    else showToast("Incorrect OTP", "error");
}

function handleTrackOrder(orderId) {
    const order = [...appState.myOrders.placed, ...appState.myOrders.received].find(o => o.id === orderId);
    openModal(`Tracking #${order.id.slice(0,5)}`, `<div id="tracking-map"></div>`);
    setTimeout(() => {
        if(appState.trackMap) appState.trackMap.remove();
        appState.trackMap = L.map('tracking-map').setView([20.5937, 78.9629], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(appState.trackMap);
    }, 200);
}

// UI HELPERS
function openMapModal() {
    openModal('Pick Location', `<div id="map"></div><button onclick="confirmLoc()" class="w-full bg-teal-600 text-white p-3 rounded-xl mt-4 font-bold">Confirm</button>`);
    setTimeout(() => {
        if(appState.map) appState.map.remove();
        appState.map = L.map('map').setView([20.5937, 78.9629], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(appState.map);
        appState.map.on('click', (e) => {
            if(appState.mapMarker) appState.map.removeLayer(appState.mapMarker);
            appState.mapMarker = L.marker(e.latlng).addTo(appState.map);
            appState.tempCoordinates = { lat: e.latlng.lat, lng: e.latlng.lng };
        });
    }, 200);
}

window.confirmLoc = function() {
    if(appState.tempCoordinates) {
        const el = document.getElementById('pinned-location') || document.getElementById('profile-pinned-location');
        if(el) el.value = `${appState.tempCoordinates.lat.toFixed(4)}, ${appState.tempCoordinates.lng.toFixed(4)}`;
        closeModal();
    }
};

function openModal(title, content) {
    const m = document.getElementById('modal'); 
    m.innerHTML = `
        <div class="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
            <h2 class="text-xl font-bold text-gray-900">${title}</h2>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-50 transition"><i data-lucide="x" class="h-5 w-5"></i></button>
        </div>
        ${content}
    `;
    m.classList.remove('hidden'); 
    document.getElementById('modal-backdrop').classList.remove('hidden');
    lucide.createIcons();
}

window.closeModal = function() { 
    document.getElementById('modal').classList.add('hidden'); 
    document.getElementById('modal-backdrop').classList.add('hidden'); 
};

window.switchPaymentTab = (tabName, event) => {
    document.querySelectorAll('.payment-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.payment-tab').forEach(el => el.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById(`payment-${tabName}`).classList.add('active');
};

function showToast(msg, type="success") {
    const t = document.getElementById("toast"); 
    t.innerHTML = type === 'success' ? `<i data-lucide="check-circle" class="h-5 w-5"></i> ${msg}` : `<i data-lucide="alert-circle" class="h-5 w-5"></i> ${msg}`;
    t.className = type; 
    t.classList.add("show");
    lucide.createIcons();
    setTimeout(() => t.classList.remove("show"), 3000);
}

// -----------------------------------------------------------------
// START
// -----------------------------------------------------------------
init();