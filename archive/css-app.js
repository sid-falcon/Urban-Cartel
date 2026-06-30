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
    deleteField
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

console.log("Firebase modules imported");

// Show initial loading screen
const appEl = document.getElementById('app');
if (appEl) {
    // Added 'flex-col' to the class list below
    appEl.innerHTML = '<div class="flex flex-col justify-center items-center h-screen"><div class="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-teal-600"></div><p class="mt-4 text-gray-600 text-center font-medium">Loading...</p></div>';
}
if (appEl) {
    appEl.innerHTML = '<div class="flex justify-center items-center h-screen"><div class="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-teal-600"></div><p class="mt-4 text-gray-600 text-center">Loading...</p></div>';
}

// Import config
const appId = typeof __app_id !== 'undefined' ? __app_id : 'urban-plus-app';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

console.log("Firebase config from window:", { appId, hasConfig: !!firebaseConfig, apiKey: firebaseConfig?.apiKey ? 'present' : 'missing' });

// -----------------------------------------------------------------
// INITIALIZE FIREBASE
// -----------------------------------------------------------------
let app, db, auth;
try {
    if (!firebaseConfig || !firebaseConfig.apiKey) {
        throw new Error("Firebase config is missing or incomplete. Check firebase-config.js");
    }
    
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    
    console.log("Firebase initialized successfully");
} catch (e) {
    console.error("Firebase initialization error:", e);
    const appEl = document.getElementById('app');
    if (appEl) {
        appEl.innerHTML = `<div class="p-4 text-red-700 bg-red-100 rounded-lg border border-red-200 m-4"><strong>Error initializing Firebase:</strong><br>${e.message}<br><br>Check the browser console for details.</div>`;
    }
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
    masterProducts: [], 
    allMarketplaceItems: [], 
    currentStore: { 
        info: null,
        inventory: []
    },
    cart: [], 
    appliedCoupons: {}, 
    deliveryOptions: {}, 
    myInventory: [], 
    myCoupons: [], 
    myOrders: { 
        placed: [],
        received: []
    },
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
    editingItemId: null
};

// Firestore collection paths helper
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
// HELPERS (Math & Formatting)
// -----------------------------------------------------------------

function calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371; 
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const d = R * c; 
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI/180);
}

function safeDate(timestamp) {
    if (!timestamp) return new Date();
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (timestamp instanceof Date) return timestamp;
    return new Date(timestamp);
}

// -----------------------------------------------------------------
// RENDER HELPERS
// -----------------------------------------------------------------

// Added 'flex-col' to the class list below
const renderLoading = () => `<div class="flex flex-col justify-center items-center h-screen"><div class="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-teal-600"></div><p class="mt-4 text-gray-600 text-center font-medium">Loading...</p></div>`;
const renderError = (msg) => `<div class="p-4 text-red-700 bg-red-100 rounded-lg border border-red-200 m-4"><strong>Error:</strong> ${msg}</div>`;

function getHeaderClass(viewName) {
    const isActive = appState.currentView === viewName || 
                    (viewName === 'marketplace' && appState.currentView === 'browseProducts') ||
                    (viewName === 'ordersView' && appState.currentView === 'ordersView'); 
    return isActive ? "text-teal-800 font-bold" : "text-gray-600 hover:text-teal-600";
}

function getHomeView() {
    if (!appState.currentUser) return 'marketplace';
    return appState.currentUser.role === 'customer' ? 'marketplace' : appState.currentUser.role + 'Dashboard';
}

function renderBackButton(targetView, label = 'Back', params = {}) {
    const dataAttrs = Object.entries(params)
        .map(([key, value]) => `data-${key}="${value}"`)
        .join(' ');

    return `
        <button 
            data-action="navigate" 
            data-view="${targetView}" 
            ${dataAttrs}
            class="inline-flex items-center text-gray-500 hover:text-teal-600 mb-6 transition-colors font-medium group"
        >
            <i data-lucide="arrow-left" class="h-5 w-5 mr-2 group-hover:-translate-x-1 transition-transform"></i> 
            ${label}
        </button>
    `;
}

function renderHeader() {
    const role = appState.currentUser.role;
    const walletBalance = appState.currentUser.walletBalance || 0;
    
    let navLinks = '';
    if (role === 'customer') {
        navLinks = `
            <a href="#" class="${getHeaderClass('marketplace')}" data-action="navigate" data-view="marketplace">Marketplace</a>
            <a href="#" class="${getHeaderClass('browseStores')}" data-action="navigate" data-view="browseStores" data-store-type="all">Stores</a>
            <a href="#" class="${getHeaderClass('ordersView')}" data-action="navigate" data-view="ordersView">Orders</a>
        `;
    } else if (role === 'retailer') {
        navLinks = `
            <a href="#" class="${getHeaderClass('retailerDashboard')}" data-action="navigate" data-view="retailerDashboard">My Store</a>
            <a href="#" class="${getHeaderClass('browseStores')}" data-action="navigate" data-view="browseStores" data-store-type="wholesaler">Wholesalers</a>
            <a href="#" class="${getHeaderClass('ordersView')}" data-action="navigate" data-view="ordersView">Orders</a>
        `;
    } else if (role === 'wholesaler') {
        navLinks = `
            <a href="#" class="${getHeaderClass('wholesalerDashboard')}" data-action="navigate" data-view="wholesalerDashboard">My Store</a>
            <a href="#" class="${getHeaderClass('ordersView')}" data-action="navigate" data-view="ordersView">Orders</a>
        `;
    }
    
    navLinks += `<a href="#" class="${getHeaderClass('infoView')}" data-action="navigate" data-view="infoView">Info & Policy</a>`;

    // ONLY SHOW CART IF NOT WHOLESALER
    const cartButtonHtml = role !== 'wholesaler' ? `
        <button data-action="navigate" data-view="cartView" class="relative text-gray-600 hover:text-teal-600">
            <i data-lucide="shopping-bag"></i>
            <span class="absolute -top-2 -right-2 bg-teal-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">${appState.cart.length}</span>
        </button>
    ` : '';

    return `
        <header class="bg-white shadow-md sticky top-0 z-30 border-b-4 border-teal-500">
            <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex justify-between items-center h-16">
                    <div class="flex-shrink-0 flex items-center cursor-pointer" data-action="navigate" data-view="${getHomeView()}">
                        <i data-lucide="shopping-cart" class="h-8 w-8 text-teal-600"></i>
                        <span class="text-2xl font-bold text-teal-800 ml-2">Live MART</span>
                    </div>
                    <div class="hidden md:flex sm:space-x-8 font-medium">
                        ${navLinks}
                    </div>
                    <div class="flex items-center space-x-4">
                        <div class="hidden sm:flex items-center text-sm font-semibold text-teal-700 bg-teal-50 px-3 py-1 rounded-full border border-teal-100">
                            <i data-lucide="wallet" class="h-4 w-4 mr-2"></i>
                            ₹${walletBalance.toFixed(2)}
                        </div>

                        ${cartButtonHtml}

                        <div class="flex items-center space-x-2 cursor-pointer hover:text-teal-600" data-action="navigate" data-view="profileView">
                            <div class="text-sm text-right hidden sm:block">
                                <div class="font-medium text-gray-800 flex items-center justify-end">
                                    ${appState.currentUser.name || appState.currentUser.email}
                                    ${appState.currentUser.isUrbanPlus ? `<i data-lucide="crown" class="h-3 w-3 ml-1 text-amber-500 fill-amber-500"></i>` : ''}
                                </div>
                                <div class="text-gray-500 capitalize text-xs flex items-center justify-end gap-1">
                                    ${appState.currentUser.role}
                                </div>
                            </div>
                            <div class="p-1 bg-gray-100 rounded-full">
                                <i data-lucide="user" class="h-5 w-5 text-gray-600"></i>
                            </div>
                        </div>
                        <button data-action="logout" class="text-gray-400 hover:text-red-500" title="Logout">
                            <i data-lucide="log-out" class="h-5 w-5"></i>
                        </button>
                    </div>
                </div>
                <div class="md:hidden flex space-x-4 py-2 overflow-x-auto text-sm">
                        ${navLinks}
                </div>
            </nav>
        </header>
    `;
}

// -----------------------------------------------------------------
// VIEW RENDERERS
// -----------------------------------------------------------------

function renderAuthView() {
    return `
        <div class="flex min-h-[80vh] items-center justify-center">
            <div class="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-teal-100">
                <div class="text-center mb-8">
                    <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-teal-100 text-teal-600 mb-4">
                        <i data-lucide="shopping-cart" class="h-8 w-8"></i>
                    </div>
                    <h1 class="text-3xl font-extrabold text-teal-900">Welcome Back</h1>
                    <p class="text-gray-500 mt-2">Sign in to Live MART</p>
                </div>
                
                <form onsubmit="event.preventDefault();" class="space-y-4">
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-2">Email Address</label>
                        <input type="email" id="login-email" class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all" placeholder="you@example.com" required>
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-2">Password</label>
                        <input type="password" id="login-password" class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all" placeholder="••••••••" required>
                    </div>
                    <button data-action="login" class="w-full bg-teal-600 text-white font-bold py-3 rounded-lg shadow-lg hover:bg-teal-700 hover:shadow-xl transition-all transform hover:-translate-y-0.5">
                        Sign In
                    </button>
                </form>

                <div class="social-separator">or continue with</div>

                <div class="social-login-grid">
                    <button data-action="social-login" data-provider="google" class="social-btn google">
                        <i data-lucide="chrome" class="h-4 w-4"></i>
                        Google
                    </button>
                    <button data-action="social-login" data-provider="facebook" class="social-btn facebook">
                        <i data-lucide="facebook" class="h-4 w-4"></i>
                        Facebook
                    </button>
                </div>

                <div class="mt-6 text-center text-sm text-gray-600">
                    Don't have an account? 
                    <button data-action="navigate" data-view="register" class="text-teal-600 font-bold hover:underline">Create Account</button>
                </div>
            </div>
        </div>
    `;
}

function renderRegister() {
    return `
        <div class="flex min-h-[80vh] items-center justify-center py-12">
            <div class="bg-white p-8 rounded-2xl shadow-xl w-full max-w-lg border border-teal-100">
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-extrabold text-teal-900">Create Account</h1>
                    <p class="text-gray-500 mt-2">Join the Live MART community</p>
                </div>
                
                <form onsubmit="event.preventDefault();" class="space-y-5">
                    <div class="bg-teal-50 p-4 rounded-xl border border-teal-100 mb-6">
                        <label class="block text-sm font-bold text-teal-800 mb-3">I am a:</label>
                        <div class="flex gap-4">
                            <label class="flex items-center space-x-2 cursor-pointer">
                                <input type="radio" name="role" value="customer" checked class="text-teal-600 focus:ring-teal-500 w-4 h-4">
                                <span class="font-medium text-gray-700">Customer</span>
                            </label>
                            <label class="flex items-center space-x-2 cursor-pointer">
                                <input type="radio" name="role" value="retailer" class="text-teal-600 focus:ring-teal-500 w-4 h-4">
                                <span class="font-medium text-gray-700">Retailer</span>
                            </label>
                            <label class="flex items-center space-x-2 cursor-pointer">
                                <input type="radio" name="role" value="wholesaler" class="text-teal-600 focus:ring-teal-500 w-4 h-4">
                                <span class="font-medium text-gray-700">Wholesaler</span>
                            </label>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                         <div class="col-span-2">
                            <label class="block text-sm font-bold text-gray-700 mb-2">Full Name</label>
                            <input type="text" id="name" class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500" placeholder="John Doe" required>
                        </div>
                        <div class="col-span-2">
                            <label class="block text-sm font-bold text-gray-700 mb-2">Mobile Number (For Updates)</label>
                            <input type="tel" id="phoneNumber" class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500" placeholder="+91 9876543210" required>
                        </div>
                        <div class="col-span-2 hidden" id="store-name-container">
                            <label class="block text-sm font-bold text-gray-700 mb-2">Store Name</label>
                            <input type="text" id="storeName" class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500" placeholder="My Awesome Store">
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-2">Email Address</label>
                        <input type="email" id="register-email" class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500" required>
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-2">Password (Min 6 chars)</label>
                        <input type="password" id="register-password" class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500" required>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-2">Address</label>
                        <div class="flex gap-2 mb-2">
                            <input type="text" id="pinned-location" readonly class="flex-grow px-4 py-2 border bg-gray-50 text-gray-500 rounded-lg text-sm" placeholder="Pin location on map ->">
                            <button type="button" data-action="open-map-modal" class="bg-teal-100 text-teal-700 px-3 rounded-lg hover:bg-teal-200 border border-teal-200"><i data-lucide="map-pin" class="h-5 w-5"></i></button>
                        </div>
                        <textarea id="address-details" class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500" placeholder="House No, Street, Landmark..." rows="2" required></textarea>
                    </div>

                    <div class="pt-2">
                        <button data-action="create-account" class="w-full bg-teal-600 text-white font-bold py-3 rounded-lg shadow-md hover:bg-teal-700 transition-colors">
                            Complete Registration
                        </button>
                    </div>
                </form>
                 <div class="mt-6 text-center text-sm text-gray-600">
                    Already have an account? 
                    <button data-action="navigate" data-view="auth" class="text-teal-600 font-bold hover:underline">Sign In</button>
                </div>
            </div>
        </div>
    `;
}

function renderMarketplace() {
    const selectedTab = appState.marketplaceTab;
    let displayItems = appState.marketplaceTab === 'wishlist' 
        ? appState.allMarketplaceItems.filter(i => appState.favorites.includes(i.id))
        : appState.allMarketplaceItems;

    if (appState.marketplaceTab !== 'wishlist' && selectedTab !== 'all') {
        displayItems = displayItems.filter(item => item.storeType === selectedTab);
    }

    const categories = [...new Set(appState.allMarketplaceItems.map(i => i.category))].sort();
    if (appState.filterCategory !== 'all') displayItems = displayItems.filter(item => item.category === appState.filterCategory);

    if (appState.searchQuery) {
        displayItems = displayItems.filter(item => 
            item.name.toLowerCase().includes(appState.searchQuery) || 
            item.description?.toLowerCase().includes(appState.searchQuery)
        );
    }

    const userLat = appState.currentUser?.coordinates?.lat;
    const userLng = appState.currentUser?.coordinates?.lng;
    const isUrbanPlus = appState.currentUser?.isUrbanPlus;

    displayItems = displayItems.map(item => {
        let distance = null;
        if (userLat && userLng && item.coordinates) {
            distance = calculateDistance(userLat, userLng, item.coordinates.lat, item.coordinates.lng);
        }
        return { ...item, distance };
    });

    if (appState.sortOption === 'price-asc') displayItems.sort((a, b) => a.price - b.price);
    else if (appState.sortOption === 'price-desc') displayItems.sort((a, b) => b.price - a.price);
    else if (appState.sortOption === 'name-asc') displayItems.sort((a, b) => a.name.localeCompare(b.name));
    else if (appState.sortOption === 'distance-asc') {
        displayItems.sort((a, b) => {
            if (a.distance === null) return 1; 
            if (b.distance === null) return -1;
            return a.distance - b.distance;
        });
    }

    const getTabClass = (tab) => `px-4 py-2 rounded-full font-semibold text-sm transition-colors ${selectedTab === tab ? 'bg-teal-600 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`;
    const showDistanceSort = !!(userLat && userLng);

    return `
        <div class="mb-8">
            <div class="text-center mb-6">
                <h1 class="text-4xl font-extrabold text-teal-900 mb-2">Marketplace</h1>
                ${isUrbanPlus ? `<div class="urban-badge mb-2"><i data-lucide="crown" class="h-3 w-3 mr-1"></i> Urban+ Member</div>` : ''}
                <div class="max-w-md mx-auto mt-4 relative">
                    <input type="text" id="search-input" data-action="set-search-query" value="${appState.searchQuery}" 
                        placeholder="Search products..." 
                        class="w-full pl-10 pr-4 py-3 rounded-full border-2 border-teal-100 focus:border-teal-500 focus:outline-none shadow-sm"
                    >
                    <i data-lucide="search" class="absolute left-3 top-3.5 h-5 w-5 text-gray-400"></i>
                </div>
            </div>

            <div class="flex justify-center space-x-2 md:space-x-4 mb-6 overflow-x-auto py-2">
                <button data-action="set-marketplace-tab" data-tab="all" class="${getTabClass('all')}">All</button>
                <button data-action="set-marketplace-tab" data-tab="retailer" class="${getTabClass('retailer')}">Retail</button>
                <button data-action="set-marketplace-tab" data-tab="wholesaler" class="${getTabClass('wholesaler')}">Wholesale</button>
                <button data-action="set-marketplace-tab" data-tab="wishlist" class="${getTabClass('wishlist')}"><i data-lucide="heart" class="h-4 w-4 inline mr-1"></i> Wishlist</button>
            </div>

            <div class="flex flex-col md:flex-row justify-between items-center gap-4 max-w-4xl mx-auto bg-white p-4 rounded-xl shadow-sm border border-teal-50 mb-8">
                <div class="w-full md:w-auto flex items-center gap-2">
                    <span class="text-sm font-bold text-teal-800">Category:</span>
                    <select id="filter-category" class="w-full md:w-48 px-4 py-2 border border-gray-300 rounded-lg text-sm">
                        <option value="all" ${appState.filterCategory === 'all' ? 'selected' : ''}>All Categories</option>
                        ${categories.map(cat => `<option value="${cat}" ${appState.filterCategory === cat ? 'selected' : ''}>${cat}</option>`).join('')}
                    </select>
                </div>
                <div class="w-full md:w-auto flex items-center gap-2">
                    <span class="text-sm font-bold text-teal-800">Sort:</span>
                    <select id="sort-option" class="w-full md:w-48 px-4 py-2 border border-gray-300 rounded-lg text-sm">
                        <option value="price-asc" ${appState.sortOption === 'price-asc' ? 'selected' : ''}>Price: Low to High</option>
                        <option value="price-desc" ${appState.sortOption === 'price-desc' ? 'selected' : ''}>Price: High to Low</option>
                        <option value="name-asc" ${appState.sortOption === 'name-asc' ? 'selected' : ''}>Name: A-Z</option>
                        ${showDistanceSort ? `<option value="distance-asc" ${appState.sortOption === 'distance-asc' ? 'selected' : ''}>Distance: Nearest First</option>` : ''}
                    </select>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            ${!isUrbanPlus && appState.marketplaceTab !== 'wishlist' ? `
                <div class="rounded-xl shadow-lg flex flex-col h-full relative group overflow-hidden bg-gradient-to-br from-amber-400 to-amber-600 text-white">
                    <div class="p-6 flex-grow flex flex-col items-center text-center justify-center">
                        <div class="bg-white p-4 rounded-full mb-4 shadow-lg text-amber-600">
                            <i data-lucide="crown" class="h-8 w-8"></i>
                        </div>
                        <h3 class="text-2xl font-extrabold mb-2 text-white drop-shadow-sm">Urban+</h3>
                        <p class="text-sm mb-4 text-amber-100 font-medium">Unlock Premium Benefits!</p>
                        <ul class="text-left text-sm space-y-2 mb-6 text-white font-medium">
                            <li><i data-lucide="check" class="h-4 w-4 inline mr-1 text-amber-200"></i> Faster Delivery</li>
                            <li><i data-lucide="check" class="h-4 w-4 inline mr-1 text-amber-200"></i> Exclusive Discounts</li>
                            <li><i data-lucide="check" class="h-4 w-4 inline mr-1 text-amber-200"></i> Priority Support</li>
                        </ul>
                        <div class="text-3xl font-bold text-white mb-1 drop-shadow-sm">₹499<span class="text-sm font-normal text-amber-100">/year</span></div>
                    </div>
                    <div class="p-4 bg-white hover:bg-gray-50 text-amber-600 font-bold text-center cursor-pointer transition-colors border-t border-amber-300" data-action="add-to-cart" data-item-id="urban-plus-subscription" data-store-id="system">
                        Join Now
                    </div>
                </div>
            ` : ''}

            ${displayItems.map(item => {
                let stockClass = "text-gray-600";
                let stockText = `${item.stock} units left`;
                if (item.storeType === 'retailer' && item.stock < 5) { stockClass = "text-red-600 font-bold animate-pulse"; stockText = `Low Stock: Only ${item.stock} left!`; } 
                else if (item.storeType === 'wholesaler' && item.stock < 100) { stockClass = "text-red-600 font-bold animate-pulse"; stockText = `Low Bulk Stock: ${item.stock} left`; }
                
                const isFav = appState.favorites.includes(item.id);
                const moq = item.storeType === 'wholesaler' ? (item.minOrderQuantity || 100) : 1;
                const moqBadge = moq > 1 ? `<div class="absolute top-2 left-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded shadow-sm border border-yellow-200">Min Order: ${moq}</div>` : '';
                
                const distanceHtml = item.distance !== null 
                    ? `<div class="absolute bottom-2 right-2 distance-badge"><i data-lucide="map-pin" class="h-3 w-3 mr-1"></i>${item.distance.toFixed(1)} km</div>` 
                    : '';

                // Urban+ Pricing logic
                const urbanDiscount = item.urbanPlusDiscount || 0;
                let priceDisplay = `<span class="text-2xl font-bold text-teal-600">₹${Number(item.price).toFixed(2)}</span>`;
                
                if (isUrbanPlus && urbanDiscount > 0) {
                     const discountedPrice = Math.max(0, item.price - urbanDiscount);
                     priceDisplay = `
                        <div class="flex flex-col items-end">
                            <span class="text-xs text-gray-400 line-through">₹${item.price}</span>
                            <span class="text-2xl font-bold text-amber-600 flex items-center"><i data-lucide="crown" class="h-3 w-3 mr-1"></i>₹${discountedPrice.toFixed(2)}</span>
                        </div>
                     `;
                }

                return `
                <div class="bg-white rounded-xl shadow hover:shadow-lg transition duration-300 border border-gray-100 flex flex-col h-full relative group">
                    <button data-action="toggle-wishlist" data-item-id="${item.id}" class="absolute top-3 right-3 z-10 p-2 bg-white rounded-full shadow-md hover:bg-gray-50 btn-heart ${isFav ? 'active' : ''}">
                        <i data-lucide="heart" class="h-5 w-5 ${isFav ? 'fill-red-500 text-red-500' : 'text-gray-400'}"></i>
                    </button>

                    <div class="relative h-48">
                        <img class="w-full h-full object-cover rounded-t-xl" src="${item.imageUrl || `https://placehold.co/600x400/ccfbf1/115e59?text=${item.name}`}" alt="${item.name}">
                        <span class="absolute bottom-2 left-2 px-2 py-1 rounded-md bg-white/90 text-xs font-bold uppercase text-teal-800 shadow-sm">${item.storeType}</span>
                        ${moqBadge}
                        ${distanceHtml}
                    </div>
                    <div class="p-5 flex-grow">
                        <h3 class="text-lg font-bold text-gray-900 mb-1 truncate">${item.name}</h3>
                        <p class="text-sm text-gray-500 mb-2">${item.category}</p>
                        <div class="flex justify-between items-end mb-3">
                            ${priceDisplay}
                            <span class="text-xs text-gray-400 mb-1">per unit</span>
                        </div>
                        <div class="text-sm mb-4 ${stockClass}"><i data-lucide="box" class="inline-block h-4 w-4 mr-1 align-text-bottom"></i>${stockText}</div>
                        <div class="flex items-center text-xs text-gray-500 border-t pt-3"><i data-lucide="store" class="h-3 w-3 mr-1"></i>Sold by: <strong class="ml-1">${item.storeName}</strong></div>
                    </div>
                    <div class="p-5 pt-0 mt-auto"><button data-action="add-to-cart" data-item-id="${item.id}" data-store-id="${item.storeId}" class="w-full bg-teal-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-teal-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed" ${item.stock === 0 ? 'disabled' : ''}>${item.stock === 0 ? 'Out of Stock' : 'Add to Cart'}</button></div>
                </div>`;
            }).join('')}
            
            ${displayItems.length === 0 ? `<div class="col-span-full text-center py-20 bg-white rounded-xl shadow-sm"><i data-lucide="package-open" class="h-16 w-16 text-gray-300 mx-auto mb-4"></i><p class="text-xl text-gray-500">No items found matching your filters.</p></div>` : ''}
        </div>
    `;
}

function renderBrowseStores(typeFilter) {
    let stores = appState.stores;
    if (typeFilter && typeFilter !== 'all') {
        stores = stores.filter(s => s.type === typeFilter);
    }
    
    const userLat = appState.currentUser?.coordinates?.lat;
    const userLng = appState.currentUser?.coordinates?.lng;
    
    stores = stores.map(store => {
        let distance = null;
        if (userLat && userLng && store.coordinates) {
            distance = calculateDistance(userLat, userLng, store.coordinates.lat, store.coordinates.lng);
        }
        return { ...store, distance };
    });

    if (appState.sortOption === 'distance-asc') {
        stores.sort((a, b) => {
             if (a.distance === null) return 1; 
             if (b.distance === null) return -1;
             return a.distance - b.distance;
        });
    }

    const showSort = !!(userLat && userLng);

    return `
        <div class="max-w-6xl mx-auto">
            ${renderBackButton(getHomeView())}
            
            <div class="flex flex-col md:flex-row justify-between items-center mb-6">
                <h1 class="text-3xl font-bold text-teal-900">Browse Stores ${typeFilter && typeFilter !== 'all' ? `(${typeFilter}s)` : ''}</h1>
                ${showSort ? `
                    <div class="flex items-center gap-2 mt-4 md:mt-0">
                         <span class="text-sm font-bold text-teal-800">Sort:</span>
                         <select id="sort-option" class="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                            <option value="default">Default</option>
                            <option value="distance-asc" ${appState.sortOption === 'distance-asc' ? 'selected' : ''}>Distance: Nearest First</option>
                        </select>
                    </div>
                `: ''}
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${stores.map(store => {
                     const distanceBadge = store.distance !== null 
                        ? `<span class="bg-teal-100 text-teal-800 text-xs font-bold px-2 py-1 rounded-full flex items-center"><i data-lucide="map-pin" class="h-3 w-3 mr-1"></i>${store.distance.toFixed(1)} km</span>` 
                        : '';
                        
                     return `
                    <div class="bg-white rounded-xl shadow hover:shadow-lg transition overflow-hidden border border-gray-100 cursor-pointer group" data-action="navigate" data-view="storeView" data-store-id="${store.id}">
                        <div class="h-32 bg-gradient-to-r from-teal-500 to-emerald-600 relative">
                             ${store.backdropUrl ? `<img src="${store.backdropUrl}" class="w-full h-full object-cover opacity-50">` : ''}
                             <div class="absolute -bottom-6 left-6 h-16 w-16 bg-white rounded-lg shadow-md flex items-center justify-center text-2xl font-bold text-teal-700 border-2 border-white">
                                ${store.storeName.charAt(0)}
                             </div>
                        </div>
                        <div class="pt-8 p-6">
                            <div class="flex justify-between items-start mb-1">
                                <h3 class="text-xl font-bold text-gray-900 group-hover:text-teal-600 transition">${store.storeName}</h3>
                                ${distanceBadge}
                            </div>
                            <p class="text-sm text-gray-500 capitalize mb-4">${store.type} • ${store.ownerName}</p>
                            <div class="text-sm text-gray-600 flex items-start">
                                <i data-lucide="map-pin" class="h-4 w-4 mr-2 mt-1 flex-shrink-0 text-gray-400"></i>
                                <span class="line-clamp-2">${store.address}</span>
                            </div>
                        </div>
                    </div>
                `}).join('')}
                ${stores.length === 0 ? '<p class="text-gray-500 col-span-3 text-center py-10">No stores found.</p>' : ''}
            </div>
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
            
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 mb-8 overflow-hidden">
                <div class="h-48 bg-gray-800 relative">
                    ${store.backdropUrl ? `<img src="${store.backdropUrl}" class="w-full h-full object-cover opacity-60">` : ''}
                    <div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
                    <div class="absolute bottom-6 left-6 md:left-10 text-white">
                        <h1 class="text-4xl font-bold mb-2">${store.storeName}</h1>
                        <p class="text-gray-200 flex items-center"><i data-lucide="map-pin" class="h-4 w-4 mr-2"></i> ${store.address}</p>
                    </div>
                </div>
            </div>

            <h2 class="text-2xl font-bold text-gray-800 mb-6">Store Inventory</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                ${inventory.map(item => {
                    const isFav = appState.favorites.includes(item.id);
                    return `
                    <div class="bg-white rounded-xl shadow border border-gray-100 flex flex-col relative">
                        <button data-action="toggle-wishlist" data-item-id="${item.id}" class="absolute top-2 right-2 p-2 bg-white rounded-full shadow-sm hover:bg-gray-50 z-10 btn-heart ${isFav ? 'active' : ''}">
                             <i data-lucide="heart" class="h-4 w-4 ${isFav ? 'fill-red-500 text-red-500' : 'text-gray-400'}"></i>
                        </button>
                        <div class="h-40 bg-gray-100 rounded-t-xl overflow-hidden">
                             <img class="w-full h-full object-cover" src="${item.imageUrl || `https://placehold.co/600x400/f0fdfa/0f766e?text=${item.name}`}">
                        </div>
                        <div class="p-4 flex-grow">
                            <h3 class="font-bold text-gray-900 truncate">${item.name}</h3>
                            <p class="text-xs text-gray-500 mb-2">${item.category}</p>
                            <div class="flex justify-between items-center">
                                <span class="font-bold text-teal-600">₹${item.price}</span>
                                <span class="text-xs text-gray-500">Stock: ${item.stock}</span>
                            </div>
                        </div>
                        <div class="p-4 pt-0">
                            <button data-action="add-to-cart" data-item-id="${item.id}" data-store-id="${store.id}" class="w-full bg-teal-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50" ${item.stock < 1 ? 'disabled' : ''}>
                                ${item.stock < 1 ? 'Out of Stock' : 'Add to Cart'}
                            </button>
                        </div>
                    </div>
                `}).join('')}
                ${inventory.length === 0 ? '<div class="col-span-full text-center py-10 text-gray-500">This store has no products listed yet.</div>' : ''}
            </div>
        </div>
    `;
}

function renderProfileView() {
    const user = appState.currentUser;
    const isSeller = user.role === 'retailer' || user.role === 'wholesaler';
    
    // Check for Cancellation Eligibility (3 Days)
    let showCancelSub = false;
    let daysLeft = 0;
    if (user.isUrbanPlus && user.urbanPlusJoinedAt) {
        const joinDate = safeDate(user.urbanPlusJoinedAt);
        const diffTime = Math.abs(new Date() - joinDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        if (diffDays <= 3) {
            showCancelSub = true;
            daysLeft = 4 - diffDays; // approx
        }
    }

    return `
        <div class="max-w-2xl mx-auto">
            ${renderBackButton(getHomeView(), 'Back to Home')}
            <div class="bg-white p-8 rounded-xl shadow-lg border border-teal-100">
                <div class="flex justify-between items-center mb-6">
                    <div>
                        <h1 class="text-3xl font-bold text-teal-900 flex items-center gap-2">
                            Edit Profile
                            ${user.isUrbanPlus ? `<span class="urban-badge"><i data-lucide="crown" class="h-3 w-3 mr-1"></i> Urban+</span>` : ''}
                        </h1>
                    </div>
                    <div class="text-right">
                        <div class="text-sm text-gray-500">Wallet Balance</div>
                        <div class="text-2xl font-bold text-teal-600">₹${(user.walletBalance || 0).toFixed(2)}</div>
                    </div>
                </div>
                
                ${showCancelSub ? `
                    <div class="bg-amber-50 border border-amber-200 p-4 rounded-lg mb-6 flex justify-between items-center">
                        <div>
                            <p class="font-bold text-amber-800">Urban+ Membership Active</p>
                            <p class="text-sm text-amber-700">You can cancel for a full refund within the first 3 days.</p>
                        </div>
                        <button data-action="cancel-subscription" class="bg-white text-red-600 border border-red-200 font-bold py-2 px-4 rounded hover:bg-red-50 text-sm">
                            Cancel & Refund
                        </button>
                    </div>
                ` : ''}
            
                <form id="update-profile-form">
                    <div class="grid grid-cols-1 gap-6">
                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-2">Email</label>
                            <input type="email" value="${user.email}" disabled class="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed">
                        </div>
                        <div>
                            <label for="profile-name" class="block text-sm font-bold text-gray-700 mb-2">Name / Business Name</label>
                            <input type="text" id="profile-name" value="${user.name || ''}" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500">
                        </div>
                        <div>
                            <label for="profile-phone" class="block text-sm font-bold text-gray-700 mb-2">Mobile Number</label>
                            <input type="tel" id="profile-phone" value="${user.phoneNumber || ''}" placeholder="+91 9876543210" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500">
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-2">Location</label>
                            <div class="flex gap-2 mb-3">
                                <input type="text" id="profile-pinned-location" value="${user.pinnedLocation || ''}" readonly class="flex-grow px-4 py-2 border border-gray-200 bg-gray-50 text-gray-600 rounded-lg cursor-not-allowed" placeholder="No location pinned yet">
                                <button type="button" data-action="open-map-modal" class="bg-teal-100 text-teal-700 px-4 rounded-lg hover:bg-teal-200 border border-teal-200 font-medium flex items-center whitespace-nowrap"><i data-lucide="map-pin" class="h-4 w-4 mr-2"></i> ${user.coordinates ? 'Update Pin' : 'Pin on Map'}</button>
                            </div>
                            ${user.coordinates ? `<p class="text-xs text-green-600 mb-2">✓ Coordinates Saved: ${user.coordinates.lat.toFixed(4)}, ${user.coordinates.lng.toFixed(4)}</p>` : ''}
                            <label for="profile-address-details" class="block text-sm font-bold text-gray-700 mb-2">Complete Address</label>
                            <textarea id="profile-address-details" rows="3" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500">${user.addressDetails || ''}</textarea>
                        </div>
                        ${isSeller ? `
                            <div>
                                <label for="profile-store-name" class="block text-sm font-bold text-gray-700 mb-2">Store Name</label>
                                <input type="text" id="profile-store-name" value="${user.storeName || ''}" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500">
                            </div>
                            <div class="mt-4">
                                <label for="profile-backdrop" class="block text-sm font-bold text-gray-700 mb-2">Store Backdrop URL (Optional)</label>
                                <input type="text" id="profile-backdrop" value="${user.backdropUrl || ''}" placeholder="https://example.com/banner.jpg" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500">
                                <p class="text-xs text-gray-500 mt-1">Image will appear behind your store name.</p>
                            </div>
                        ` : ''}
                        <div class="flex justify-end pt-4"><button data-action="update-profile" class="bg-teal-600 text-white font-bold py-3 px-8 rounded-lg shadow-md hover:bg-teal-700 transition-colors">Save Changes</button></div>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function renderCartView() {
    const cartByStore = {};
    appState.cart.forEach(item => {
        if (!cartByStore[item.storeId]) cartByStore[item.storeId] = { name: item.storeName, items: [] };
        cartByStore[item.storeId].items.push(item);
    });

    const storeIds = Object.keys(cartByStore);

    if (storeIds.length === 0) {
        return `
            <div class="text-center py-20">
                <div class="inline-flex bg-teal-50 p-6 rounded-full mb-6"><i data-lucide="shopping-cart" class="h-12 w-12 text-teal-300"></i></div>
                <h2 class="text-2xl font-bold text-gray-800 mb-2">Your Cart is Empty</h2>
                <p class="text-gray-500 mb-6">Looks like you haven't added anything yet.</p>
                <button data-action="navigate" data-view="marketplace" class="bg-teal-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-teal-700 transition">Start Shopping</button>
            </div>
        `;
    }

    return `
        <div class="max-w-4xl mx-auto">
            <h1 class="text-3xl font-bold text-teal-900 mb-6">Shopping Cart</h1>
            
            ${storeIds.map(storeId => {
                const storeGroup = cartByStore[storeId];
                let subtotal = 0;
                let totalQuantity = 0;
                storeGroup.items.forEach(i => {
                    subtotal += i.price * i.quantity; // Price here is already the effective price added to cart
                    totalQuantity += i.quantity;
                });
                
                const coupon = appState.appliedCoupons[storeId];
                let discount = 0;
                let couponMsg = '';
                
                if (coupon) {
                    if (coupon.applicableItemIds && coupon.applicableItemIds.length > 0) {
                         const eligibleItems = storeGroup.items.filter(i => coupon.applicableItemIds.includes(i.inventoryItemId));
                         const eligibleSubtotal = eligibleItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
                         discount = coupon.type === 'percent' ? eligibleSubtotal * (coupon.value / 100) : Math.min(coupon.value, eligibleSubtotal);
                         couponMsg = `<span class="text-green-600 text-sm flex items-center mt-1"><i data-lucide="tag" class="h-3 w-3 mr-1"></i> Coupon ${coupon.code} applied on specific items!</span>`;
                    } else {
                         discount = coupon.type === 'percent' ? subtotal * (coupon.value / 100) : coupon.value;
                         couponMsg = `<span class="text-green-600 text-sm flex items-center mt-1"><i data-lucide="tag" class="h-3 w-3 mr-1"></i> Coupon ${coupon.code} applied!</span>`;
                    }
                    if (discount > subtotal) discount = subtotal; 
                }

                const deliveryType = appState.deliveryOptions[storeId] || 'delivery'; 
                const deliveryFee = deliveryType === 'pickup' ? 0 : (totalQuantity * 20);
                const total = subtotal - discount + deliveryFee;

                return `
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 mb-8 overflow-hidden">
                    <div class="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                        <div class="font-bold text-lg text-gray-800 flex items-center"><i data-lucide="store" class="h-5 w-5 mr-2 text-teal-600"></i> ${storeGroup.name}</div>
                    </div>
                    
                    <div class="p-6">
                        ${storeGroup.items.map(item => {
                            const moq = item.minOrderQuantity || 1;
                            return `
                            <div class="flex flex-col sm:flex-row justify-between items-center mb-6 pb-6 border-b border-gray-100 last:border-0 last:mb-0 last:pb-0">
                                <div class="flex items-center w-full sm:w-auto mb-4 sm:mb-0">
                                    <div class="h-16 w-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 mr-4">
                                        <img src="${item.imageUrl || 'https://placehold.co/100'}" class="w-full h-full object-cover">
                                    </div>
                                    <div>
                                        <h4 class="font-bold text-gray-800">${item.name}</h4>
                                        <p class="text-teal-600 font-medium">₹${item.price}</p>
                                        ${moq > 1 ? `<p class="text-xs text-orange-600 font-medium mt-1">Min Order: ${moq}</p>` : ''}
                                    </div>
                                </div>
                                <div class="flex items-center gap-4">
                                    <div class="flex items-center border border-gray-300 rounded-lg">
                                        <button data-action="update-cart-quantity" data-cart-id="${item.id}" data-change="-1" class="px-3 py-1 text-gray-600 hover:bg-gray-100 hover:text-red-500 rounded-l-lg disabled:opacity-30 disabled:cursor-not-allowed" ${item.quantity <= moq ? 'disabled' : ''}>-</button>
                                        <span class="px-3 font-medium text-gray-800 w-8 text-center">${item.quantity}</span>
                                        <button data-action="update-cart-quantity" data-cart-id="${item.id}" data-change="1" class="px-3 py-1 text-gray-600 hover:bg-gray-100 hover:text-green-600 rounded-r-lg">+</button>
                                    </div>
                                    <button data-action="remove-from-cart" data-cart-id="${item.id}" class="text-gray-400 hover:text-red-500 p-2"><i data-lucide="trash-2" class="h-5 w-5"></i></button>
                                </div>
                            </div>
                        `}).join('')}
                    </div>

                    <div class="bg-gray-50 p-6 border-t border-gray-200">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div class="space-y-4">
                                <div>
                                    <label class="block text-sm font-bold text-gray-700 mb-2">Delivery Method</label>
                                    <div class="flex gap-4">
                                        <label class="flex items-center p-3 border rounded-lg bg-white cursor-pointer w-full hover:border-teal-500 transition ${deliveryType === 'delivery' ? 'ring-2 ring-teal-500 border-teal-500' : 'border-gray-200'}">
                                            <input type="radio" name="delivery-${storeId}" value="delivery" data-action="select-delivery" data-store-id="${storeId}" class="hidden" ${deliveryType === 'delivery' ? 'checked' : ''}>
                                            <i data-lucide="truck" class="h-5 w-5 mr-2 text-teal-600"></i>
                                            <div>
                                                <div class="text-sm font-bold text-gray-800">Delivery</div>
                                                <div class="text-xs text-gray-500">₹20 per item</div>
                                            </div>
                                        </label>
                                        <label class="flex items-center p-3 border rounded-lg bg-white cursor-pointer w-full hover:border-teal-500 transition ${deliveryType === 'pickup' ? 'ring-2 ring-teal-500 border-teal-500' : 'border-gray-200'}">
                                            <input type="radio" name="delivery-${storeId}" value="pickup" data-action="select-delivery" data-store-id="${storeId}" class="hidden" ${deliveryType === 'pickup' ? 'checked' : ''}>
                                            <i data-lucide="store" class="h-5 w-5 mr-2 text-teal-600"></i>
                                            <div>
                                                <div class="text-sm font-bold text-gray-800">Pickup</div>
                                                <div class="text-xs text-green-600 font-bold">Free</div>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label class="block text-sm font-bold text-gray-700 mb-2">Have a Coupon?</label>
                                    ${coupon ? `
                                        <div class="flex justify-between items-center bg-green-50 border border-green-200 p-3 rounded-lg">
                                            <div>
                                                <span class="font-bold text-green-800">${coupon.code}</span>
                                                ${couponMsg}
                                            </div>
                                            <button data-action="remove-coupon" data-store-id="${storeId}" class="text-red-500 hover:text-red-700"><i data-lucide="x" class="h-4 w-4"></i></button>
                                        </div>
                                    ` : `
                                        <div class="flex gap-2">
                                            <input type="text" id="coupon-${storeId}" placeholder="Enter Code" class="flex-grow px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase">
                                            <button data-action="apply-coupon" data-store-id="${storeId}" class="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-black">Apply</button>
                                        </div>
                                    `}
                                </div>
                            </div>

                            <div class="space-y-2">
                                <div class="flex justify-between text-gray-600"><span>Subtotal</span><span>₹${subtotal.toFixed(2)}</span></div>
                                <div class="flex justify-between text-gray-600"><span>Delivery</span><span>${deliveryFee === 0 ? 'Free' : '₹' + deliveryFee.toFixed(2)}</span></div>
                                ${discount > 0 ? `<div class="flex justify-between text-green-600 font-medium"><span>Discount</span><span>-₹${discount.toFixed(2)}</span></div>` : ''}
                                <div class="flex justify-between text-xl font-bold text-gray-900 pt-4 border-t border-gray-200 mt-2"><span>Total</span><span>₹${total.toFixed(2)}</span></div>
                                
                                <button data-action="initiate-payment" data-store-id="${storeId}" class="w-full bg-teal-600 text-white font-bold py-3 rounded-lg shadow-md hover:bg-teal-700 mt-4">Checkout from this Store</button>
                            </div>
                        </div>
                    </div>
                </div>`;
            }).join('')}
        </div>
    `;
}

function renderOrdersView() {
    let placed = appState.myOrders.placed || [];
    let received = appState.myOrders.received || []; 
    
    // Sort placed orders by date (newest first)
    placed.sort((a,b) => b.createdAt - a.createdAt);
    
    // Sort received orders: Urban+ buyers first, then by date
    received.sort((a,b) => {
        if (b.buyerIsUrbanPlus && !a.buyerIsUrbanPlus) return 1;
        if (!b.buyerIsUrbanPlus && a.buyerIsUrbanPlus) return -1;
        return b.createdAt - a.createdAt;
    });

    const isSeller = appState.currentUser.role !== 'customer';

    const renderOrderList = (orders, type) => {
        if(orders.length === 0) return `<div class="p-8 text-center text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">No orders found.</div>`;
        
        return orders.map(order => {
            const date = safeDate(order.createdAt).toLocaleDateString();
            
            // Status Colors (updated with return statuses)
            const statusColor = {
                'Placed': 'bg-blue-100 text-blue-800', 
                'Confirmed': 'bg-indigo-100 text-indigo-800', 
                'Shipped': 'bg-amber-100 text-amber-800',
                'Delivered': 'bg-green-100 text-green-800',
                'Cancelled': 'bg-red-100 text-red-800',
                'Returned': 'bg-orange-100 text-orange-800',
                'Return Requested': 'bg-pink-100 text-pink-800',
                'Return Rejected': 'bg-gray-200 text-gray-800'
            }[order.status] || 'bg-gray-100 text-gray-800';

            const isPriority = order.buyerIsUrbanPlus;

            let actionButtons = '';
            
            // --- BUYER VIEW (Placed Orders) ---
            if (type === 'placed') {
                actionButtons = `<button data-action="track-order" data-order-id="${order.id}" class="px-4 py-2 bg-teal-50 text-teal-700 rounded-lg text-sm font-medium hover:bg-teal-100 border border-teal-200">Track Order</button>`;
                
                if (['Placed', 'Confirmed'].includes(order.status)) {
                    actionButtons += `<button data-action="cancel-order" data-order-id="${order.id}" class="ml-2 px-4 py-2 bg-white text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-50">Cancel Order</button>`;
                }
                
                if (order.status === 'Delivered') {
                    actionButtons += `<button data-action="return-order" data-order-id="${order.id}" class="ml-2 px-4 py-2 bg-white text-orange-600 border border-orange-200 rounded-lg text-sm font-medium hover:bg-orange-50">Return Item</button>`;
                }

                if (['Shipped', 'Delivered'].includes(order.status) && order.deliveryOtp) {
                    actionButtons += `<div class="mt-2 text-sm font-bold text-teal-700 bg-teal-50 p-2 rounded text-center border border-teal-200">Your Delivery OTP: ${order.deliveryOtp}</div>`;
                }

            // --- SELLER VIEW (Received Orders) ---
            } else {
                let msgButton = '';
                if (order.buyerPhone) {
                    const msgText = `Hello, regarding order #${order.id.slice(0,5)}. Status: ${order.status}`;
                    msgButton = `
                        <button onclick="window.open('https://wa.me/${order.buyerPhone}?text=${encodeURIComponent(msgText)}', '_blank')" class="px-4 py-2 bg-green-100 text-green-700 border border-green-200 rounded-lg text-sm font-bold hover:bg-green-200 flex items-center justify-center">
                            <i data-lucide="message-circle" class="h-4 w-4 mr-2"></i> Chat
                        </button>
                    `;
                }

                if (order.status === 'Placed') {
                    actionButtons = `
                        <button data-action="update-order-status" data-order-id="${order.id}" data-new-status="Confirmed" class="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-bold hover:bg-teal-700">Accept</button>
                        <button data-action="cancel-order" data-order-id="${order.id}" class="ml-2 px-4 py-2 bg-white text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-50">Reject</button>
                    `;
                } else if (order.status === 'Confirmed') {
                    actionButtons = `<button data-action="update-order-status" data-order-id="${order.id}" data-new-status="Shipped" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700">Ship Order</button>`;
                } else if (order.status === 'Shipped') {
                    actionButtons = `<button data-action="mark-delivered-with-otp" data-order-id="${order.id}" data-correct-otp="${order.deliveryOtp}" class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700">Verify & Deliver</button>`;
                } else if (order.status === 'Return Requested') {
                    // SELLER SEES RETURN REQUEST
                    actionButtons = `
                        <button data-action="resolve-return" data-order-id="${order.id}" data-resolution="approve" class="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-bold hover:bg-orange-700">Accept Return</button>
                        <button data-action="resolve-return" data-order-id="${order.id}" data-resolution="reject" class="ml-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300">Reject</button>
                    `;
                } 
                
                if (msgButton) {
                    actionButtons = `<div class="flex flex-wrap gap-2 justify-end w-full mb-2">${msgButton}</div>` + actionButtons;
                }
            }

            // Return Details Block (Visible to both if status is related to returns)
            let returnInfoHtml = '';
            if (['Return Requested', 'Returned', 'Return Rejected'].includes(order.status) && order.returnDetails) {
                returnInfoHtml = `
                    <div class="mt-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <p class="text-sm font-bold text-gray-800 mb-1">Return Request Details:</p>
                        <p class="text-sm text-gray-600 italic">"${order.returnDetails.reason}"</p>
                        ${order.returnDetails.imageUrl ? `<a href="${order.returnDetails.imageUrl}" target="_blank" class="text-blue-600 text-xs hover:underline mt-1 inline-block flex items-center"><i data-lucide="image" class="h-3 w-3 mr-1"></i> View Proof Image</a>` : ''}
                    </div>
                `;
            }

            return `
                <div class="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4 hover:shadow-md transition ${isPriority && type !== 'placed' ? 'order-priority' : ''}">
                    <div class="bg-gray-50 px-6 py-3 border-b border-gray-200 flex flex-wrap justify-between items-center gap-4">
                        <div class="flex gap-6 text-sm">
                            <div><span class="block text-gray-500 text-xs uppercase">Order Placed</span><span class="font-medium text-gray-900">${date}</span></div>
                            <div><span class="block text-gray-500 text-xs uppercase">Total</span><span class="font-medium text-gray-900">₹${order.total.toFixed(2)}</span></div>
                            <div><span class="block text-gray-500 text-xs uppercase">${type === 'placed' ? 'Seller' : 'Buyer'}</span><span class="font-medium text-gray-900">${type === 'placed' ? order.sellerStoreName : order.buyerName}</span></div>
                        </div>
                        <div class="flex items-center gap-3">
                            ${isPriority && type !== 'placed' ? '<span class="priority-tag"><i data-lucide="zap" class="h-3 w-3"></i> Priority</span>' : ''}
                            <span class="px-3 py-1 rounded-full text-xs font-bold uppercase ${statusColor}">${order.status}</span>
                            <div class="text-xs text-gray-500">ID: #${order.id.slice(0,8)}</div>
                        </div>
                    </div>
                    <div class="p-6">
                        <div class="space-y-3 mb-4">
                            ${order.items.map(item => `
                                <div class="flex justify-between items-center">
                                    <div class="flex items-center">
                                        <div class="h-10 w-10 bg-gray-100 rounded flex items-center justify-center text-gray-400 mr-3"><i data-lucide="package" class="h-5 w-5"></i></div>
                                        <div>
                                            <div class="font-medium text-gray-900">${item.name}</div>
                                            <div class="text-xs text-gray-500">Qty: ${item.quantity} × ₹${item.price}</div>
                                        </div>
                                    </div>
                                    <div class="font-medium text-gray-900">₹${(item.price * item.quantity).toFixed(2)}</div>
                                </div>
                            `).join('')}
                        </div>
                        
                        ${returnInfoHtml}

                        <div class="flex flex-wrap gap-2 pt-4 border-t border-gray-100 justify-end flex-col items-end">
                            ${actionButtons}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    };

    return `
        <div class="max-w-5xl mx-auto">
            <h1 class="text-3xl font-bold text-teal-900 mb-6">Your Orders</h1>
            ${isSeller ? `
                <div class="mb-6 border-b border-gray-200">
                    <nav class="-mb-px flex space-x-8">
                        <button class="border-b-2 border-teal-500 py-4 px-1 text-sm font-bold text-teal-600">My Purchases</button>
                        <button class="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300">Customer Orders (Received)</button>
                    </nav>
                </div>
            ` : ''}
            
            <div class="space-y-6">
                ${renderOrderList(placed, 'placed')}
            </div>
            
            ${isSeller ? `
                <div class="mt-12 pt-8 border-t-4 border-dashed border-gray-200">
                    <h2 class="text-2xl font-bold text-gray-800 mb-4">Orders Received from Customers</h2>
                    ${renderOrderList(received, 'received')}
                </div>
            `: ''}
        </div>
    `;
}

function renderSellerDashboard(type) {
    const inventory = appState.myInventory || [];
    const coupons = appState.myCoupons || [];
    
    return `
        <div class="max-w-6xl mx-auto">
            <div class="flex justify-between items-center mb-8">
                <h1 class="text-3xl font-bold text-teal-900 capitalize">${type} Dashboard</h1>
                <div class="flex gap-2">
                    <button data-action="open-add-inventory-modal" class="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 flex items-center"><i data-lucide="plus" class="h-4 w-4 mr-2"></i> Add Inventory</button>
                    <button data-action="open-create-coupon-modal" class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 flex items-center"><i data-lucide="tag" class="h-4 w-4 mr-2"></i> Create Coupon</button>
                </div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h2 class="text-xl font-bold text-gray-800 mb-4 flex items-center"><i data-lucide="box" class="mr-2 text-teal-600"></i> My Inventory</h2>
                    ${inventory.length === 0 ? '<p class="text-gray-500">No items in inventory.</p>' : 
                    `<div class="space-y-3">
                        ${inventory.map(item => `
                            <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                                <div>
                                    <p class="font-bold text-gray-800">${item.name}</p>
                                    <p class="text-xs text-gray-500">Stock: ${item.stock} | Price: ₹${item.price}</p>
                                    ${item.urbanPlusDiscount ? `<p class="text-xs text-amber-600 font-bold"><i data-lucide="crown" class="h-3 w-3 inline"></i> Urban+ Discount: ₹${item.urbanPlusDiscount}</p>` : ''}
                                </div>
                                <div class="flex gap-2">
                                    <button data-action="open-edit-inventory-modal" data-item-id="${item.id}" class="text-blue-500 hover:bg-blue-50 p-2 rounded"><i data-lucide="edit-2" class="h-4 w-4"></i></button>
                                    <button data-action="delete-inventory-item" data-item-id="${item.id}" class="text-red-500 hover:bg-red-50 p-2 rounded"><i data-lucide="trash-2" class="h-4 w-4"></i></button>
                                </div>
                            </div>
                        `).join('')}
                    </div>`}
                </div>

                <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h2 class="text-xl font-bold text-gray-800 mb-4 flex items-center"><i data-lucide="ticket" class="mr-2 text-purple-600"></i> My Coupons</h2>
                    ${coupons.length === 0 ? '<p class="text-gray-500">No active coupons.</p>' : 
                    `<div class="space-y-3">
                        ${coupons.map(coupon => `
                            <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                                <div>
                                    <p class="font-bold text-gray-800 text-lg">${coupon.code}</p>
                                    <p class="text-xs text-gray-500">${coupon.type === 'percent' ? coupon.value + '% OFF' : '₹' + coupon.value + ' OFF'}</p>
                                </div>
                                <button data-action="delete-coupon" data-coupon-id="${coupon.id}" class="text-red-500 hover:bg-red-50 p-2 rounded"><i data-lucide="trash-2" class="h-4 w-4"></i></button>
                            </div>
                        `).join('')}
                    </div>`}
                </div>
            </div>
        </div>
    `;
}

function renderRetailerDashboard() { return renderSellerDashboard('retailer'); }
function renderWholesalerDashboard() { return renderSellerDashboard('wholesaler'); }
function renderCustomerDashboard() { navigateTo('marketplace'); return ''; }

function renderInfoView() {
    return `
        <div class="max-w-4xl mx-auto">
            ${renderBackButton(getHomeView(), 'Back to Home')}
            <div class="bg-white p-8 rounded-xl shadow-lg border border-teal-100">
                <h1 class="text-4xl font-bold text-teal-900 mb-6 text-center">Live MART Policies & Information</h1>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div class="space-y-4">
                        <div class="bg-teal-50 p-6 rounded-lg border border-teal-200">
                            <h2 class="text-xl font-bold text-teal-800 flex items-center mb-3"><i data-lucide="rotate-ccw" class="mr-2"></i> Returns & Exchanges</h2>
                            <p class="text-gray-700 text-sm">Returns accepted within 7 days. Refund credited to Wallet.</p>
                        </div>
                        <div class="bg-red-50 p-6 rounded-lg border border-red-200">
                            <h2 class="text-xl font-bold text-red-800 flex items-center mb-3"><i data-lucide="x-circle" class="mr-2"></i> Cancellations</h2>
                            <p class="text-gray-700 text-sm">Cancel anytime before shipping. Refunds to Wallet.</p>
                        </div>
                    </div>
                    <div class="space-y-4">
                        <div class="bg-purple-50 p-6 rounded-lg border border-purple-200">
                            <h2 class="text-xl font-bold text-purple-800 flex items-center mb-3"><i data-lucide="wallet" class="mr-2"></i> In-Store Credits</h2>
                            <p class="text-gray-700 text-sm">1 Credit = ₹1. Use wallet for future orders.</p>
                        </div>
                        <div class="bg-blue-50 p-6 rounded-lg border border-blue-200">
                            <h2 class="text-xl font-bold text-blue-800 flex items-center mb-3"><i data-lucide="store" class="mr-2"></i> In-Store Pickup</h2>
                            <p class="text-gray-700 text-sm">Save on delivery! Pick up orders directly from the store.</p>
                        </div>
                    </div>
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

    // Add a timeout to prevent infinite loading if Firebase has issues
    const initTimeout = setTimeout(() => {
        if (appState.currentView === 'loading') {
            console.error("Firebase initialization timeout - auth not ready");
            appState.error = "Connection timeout. Please refresh the page.";
            renderApp();
        }
    }, 10000); // 10 second timeout

    onAuthStateChanged(auth, async (user) => {
        clearTimeout(initTimeout);
        if (user) {
            await loadUserAccount(user.uid);
        } else {
            appState.listeners.forEach(unsub => unsub()); 
            appState.currentUser = null;
            appState.cart = [];
            appState.favorites = [];
            appState.myInventory = [];
            appState.myCoupons = [];
            appState.myOrders = { placed: [], received: [] };
            appState.appliedCoupons = {};
            appState.deliveryOptions = {};
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
            if (appState.currentUser.walletBalance === undefined) {
                    appState.currentUser.walletBalance = 0;
            }

            if(appState.currentUser.role !== 'customer') {
                appState.currentUser.storeId = uid; 
            }
            await setupRealtimeListeners(uid, appState.currentUser.role);
            
            const defaultView = appState.currentUser.role === 'customer' ? 'marketplace' : appState.currentUser.role + 'Dashboard';
            navigateTo(defaultView); 
        } else {
            appState.currentUser = { uid, email: auth.currentUser.email };
            navigateTo('register');
        }
    } catch (e) {
        console.error("Error in loadUserAccount:", e);
        appState.error = "Could not load user account.";
    } finally {
        appState.isLoading = false;
        renderApp();
    }
}

async function setupRealtimeListeners(uid, role) {
    appState.listeners.forEach(unsub => unsub());
    appState.listeners = [];
    
    // Listen to current user
    const userQuery = doc(db, `artifacts/${appId}/public/data/users`, uid);
    appState.listeners.push(onSnapshot(userQuery, (doc) => {
        if (doc.exists()) {
            appState.currentUser = { ...appState.currentUser, ...doc.data() };
            renderAppDebounced(); 
        }
    }));

    // Listen to Stores (for distance calcs)
    const storesQuery = query(paths.stores());
    appState.listeners.push(onSnapshot(storesQuery, (snapshot) => {
        appState.stores = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (appState.currentView === 'marketplace') {
            loadMarketplaceItems();
        }
        renderAppDebounced(); 
    }));

    // Listen to Cart
    const cartQuery = query(paths.cart(uid));
    appState.listeners.push(onSnapshot(cartQuery, (snapshot) => {
        appState.cart = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        appState.cart.forEach(item => {
            if (!appState.deliveryOptions[item.storeId]) {
                appState.deliveryOptions[item.storeId] = 'delivery';
            }
        });
        renderAppDebounced();
    }));

    // Listen to Favorites
    if (role === 'customer') {
        const favQuery = query(paths.favorites(uid));
        appState.listeners.push(onSnapshot(favQuery, (snapshot) => {
            appState.favorites = snapshot.docs.map(doc => doc.id); 
            renderAppDebounced();
        }));
    }

    // Seller Specific Listeners
    if (role === 'retailer' || role === 'wholesaler') {
        const invQuery = query(paths.inventory(uid)); 
        appState.listeners.push(onSnapshot(invQuery, (snapshot) => {
            appState.myInventory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderAppDebounced();
        }));

        const couponsQuery = query(paths.coupons(uid));
        appState.listeners.push(onSnapshot(couponsQuery, (snapshot) => {
            appState.myCoupons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderAppDebounced();
        }));
        
        const receivedOrdersQuery = query(paths.orders(), where("sellerStoreId", "==", uid));
        appState.listeners.push(onSnapshot(receivedOrdersQuery, (snapshot) => {
            appState.myOrders.received = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderAppDebounced();
        }));
    }

    // Orders Listener
    const placedOrdersQuery = query(paths.orders(), where("buyerId", "==", uid));
    appState.listeners.push(onSnapshot(placedOrdersQuery, (snapshot) => {
        appState.myOrders.placed = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAppDebounced();
    }));
}

async function loadMarketplaceItems() {
    let allItems = [];
    try {
        for (const store of appState.stores) {
            const invQuery = query(paths.inventory(store.id));
            const snapshot = await getDocs(invQuery);
            const storeItems = snapshot.docs.map(doc => ({
                id: doc.id,
                storeId: store.id,
                storeName: store.storeName,
                storeType: store.type,
                coordinates: store.coordinates, 
                ...doc.data()
            }));
            allItems = [...allItems, ...storeItems];
        }
        appState.allMarketplaceItems = allItems;
    } catch (e) {
        console.error("Error loading marketplace:", e);
    } finally {
        renderAppDebounced();
    }
}

let renderTimeout;
function renderAppDebounced() {
    clearTimeout(renderTimeout);
    renderTimeout = setTimeout(renderApp, 50); 
}

function renderApp() {
    const appContainer = document.getElementById('app');
    if (!appContainer) return;

    // Focus Preservation
    const activeEl = document.activeElement;
    const focusedId = activeEl?.id;
    const cursorStart = activeEl?.selectionStart;
    const cursorEnd = activeEl?.selectionEnd;

    let headerHtml = '';
    if (appState.currentUser && appState.currentUser.role) {
        headerHtml = renderHeader();
    }

    let viewHtml = '';
    if (appState.isLoading) {
        viewHtml = renderLoading();
    } else if (appState.error) {
        viewHtml = renderError(appState.error);
    } else {
        try {
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
        } catch (e) {
            console.error("Render error:", e);
            viewHtml = renderError("Something went wrong rendering the view. Please refresh.");
        }
    }
    const mainClass = appState.currentView === 'auth' ? '' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8';
    appContainer.innerHTML = headerHtml + `<main class="${mainClass}">${viewHtml}</main>`;
    if(window.lucide) lucide.createIcons();
    addEventListeners();

    if (focusedId) {
        const el = document.getElementById(focusedId);
        if (el) {
            el.focus();
            if (['text', 'search', 'password', 'tel', 'url'].includes(el.type) || el.tagName === 'TEXTAREA') {
                try { el.setSelectionRange(cursorStart, cursorEnd); } catch(e) {}
            }
        }
    }
}

function navigateTo(view, params = {}) {
    // --- SECURITY GUARD ---
    // Prevent Wholesalers from accessing Marketplace or Cart
    if (appState.currentUser && appState.currentUser.role === 'wholesaler') {
        if (view === 'marketplace' || view === 'cartView') {
            showToast("Wholesalers cannot access Marketplace or Cart", "error");
            view = 'wholesalerDashboard'; // Redirect home
        }
    }
    // ----------------------

    appState.currentView = view;
    appState.viewParams = params;
    appState.error = null; 

    if (view === 'storeView' && params.storeId) {
        loadStoreData(params.storeId);
    } else if (view === 'marketplace') {
        loadMarketplaceItems();
    } else {
        renderApp();
    }
}

async function loadStoreData(storeId) {
    appState.isLoading = true;
    renderApp();
    try {
        const storeDoc = await getDoc(paths.store(storeId));
        if (!storeDoc.exists()) throw new Error("Store not found");
        const inventorySnap = await getDocs(paths.inventory(storeId));
        appState.currentStore.info = { id: storeDoc.id, ...storeDoc.data() };
        appState.currentStore.inventory = inventorySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Error loading store data:", e);
        appState.error = e.message;
    } finally {
        appState.isLoading = false;
        renderApp();
    }
}

function addEventListeners() {
    document.onclick = (e) => {
        const actionEl = e.target.closest('[data-action]');
        if (!actionEl) return;
        
        if (actionEl.tagName !== 'SELECT' && actionEl.tagName !== 'INPUT') {
                e.preventDefault();
        }
        
        const action = actionEl.dataset.action;
        const params = { ...actionEl.dataset };

        switch (action) {
            case 'navigate': navigateTo(params.view, params); break;
            case 'login': handleLogin(); break;
            // ... inside the switch(action) statement ...
            case 'submit-return-request': handleSubmitReturnRequest(); break;
            case 'resolve-return': handleResolveReturn(params.orderId, params.resolution); break;
// ... existing cases ...
            case 'social-login': handleSocialLogin(params.provider); break;
            case 'create-account': handleCreateAccount(); break;
            case 'logout': handleLogout(); break;
            
            // Inventory & Store
            case 'open-add-inventory-modal': openModal('Add to My Inventory', renderAddInventoryForm()); break;
            case 'add-to-inventory': handleAddToInventory(); break;
            case 'delete-inventory-item': handleDeleteInventoryItem(params.itemId); break;
            case 'open-edit-inventory-modal': openModal('Edit Product', renderEditInventoryForm(params.itemId)); break;
            case 'update-inventory': handleUpdateInventory(); break;
            
            // Coupons
            case 'open-create-coupon-modal': openModal('Create New Coupon', renderCreateCouponForm()); break;
            case 'create-coupon': handleCreateCoupon(); break;
            case 'delete-coupon': handleDeleteCoupon(params.couponId); break;
            case 'apply-coupon': handleApplyCoupon(params.storeId); break;
            case 'remove-coupon': handleRemoveCoupon(params.storeId); break;

            // Cart
            case 'add-to-cart': handleAddToCart(params.itemId, params.storeId); break;
            case 'remove-from-cart': handleRemoveFromCart(params.cartId); break;
            case 'update-cart-quantity': handleUpdateCartQuantity(params.cartId, params.change); break;
            
            // Payment
            case 'initiate-payment': handleInitiatePayment(params.storeId); break; 
            case 'process-payment': handleProcessPayment(); break; 
            case 'switch-payment-tab': switchPaymentTab(params.tab, e); break; 
            
            // General UI
            case 'set-marketplace-tab': appState.marketplaceTab = params.tab; renderApp(); break;
            case 'open-map-modal': openMapModal(); break;
            case 'confirm-location': handleConfirmLocation(); break;
            case 'update-profile': handleUpdateProfile(); break; 
            case 'toggle-wishlist': handleToggleWishlist(params.itemId); break; 
            case 'set-search-query': handleSearch(e.target.value); break; 

            // Inside the switch(action) block:
            case 'cancel-subscription': handleCancelSubscription(); break;
            
            // Orders
            case 'cancel-order': handleCancelOrder(params.orderId); break; 
            case 'return-order': handleReturnOrder(params.orderId); break; 
            case 'track-order': handleTrackOrder(params.orderId); break; 
            case 'update-order-status': handleUpdateOrderStatus(params.orderId, params.newStatus); break;
            case 'mark-delivered-with-otp': handleMarkDeliveredWithOtp(params.orderId, params.correctOtp); break;
        }
    };
    
    document.onchange = (e) => {
        if (e.target.id === 'filter-category') {
            appState.filterCategory = e.target.value;
            renderApp();
            return;
        }
        if (e.target.id === 'sort-option') {
            appState.sortOption = e.target.value;
            renderApp();
            return;
        }
    };

    document.oninput = (e) => {
        if (e.target.dataset.action === 'set-search-query') {
            appState.searchQuery = e.target.value.toLowerCase();
            renderAppDebounced();
        }
    };
}

// -----------------------------------------------------------------
// HANDLERS
// -----------------------------------------------------------------
function handleReturnOrder(orderId) {
    // Store the order ID in appState so the submit function knows which order to update
    appState.activeReturnOrderId = orderId;

    const content = `
        <div class="space-y-4">
            <div class="bg-orange-50 border border-orange-200 p-3 rounded-lg text-sm text-orange-800">
                <i data-lucide="alert-circle" class="h-4 w-4 inline mr-1"></i>
                Returns are subject to seller approval.
            </div>
            
            <div>
                <label class="block text-sm font-bold text-gray-700 mb-2">Reason for Return</label>
                <textarea id="return-reason" rows="3" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" placeholder="Wrong item, damaged, etc..." required></textarea>
            </div>

            <div>
                <label class="block text-sm font-bold text-gray-700 mb-2">Proof Image (URL)</label>
                <input type="text" id="return-image" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500" placeholder="https://example.com/damaged-item.jpg">
                <p class="text-xs text-gray-500 mt-1">Paste a link to an image showing the issue.</p>
            </div>

            <button data-action="submit-return-request" class="w-full bg-orange-600 text-white font-bold py-3 rounded-lg shadow hover:bg-orange-700 transition-colors mt-2">
                Submit Return Request
            </button>
        </div>
    `;

    openModal('Request Return', content);
}

async function handleSubmitReturnRequest() {
    const orderId = appState.activeReturnOrderId;
    const reason = document.getElementById('return-reason').value;
    const imageUrl = document.getElementById('return-image').value;

    if (!reason) {
        showToast("Please provide a reason for the return.", "error");
        return;
    }

    appState.isLoading = true;
    renderApp();

    try {
        await updateDoc(paths.order(orderId), {
            status: 'Return Requested',
            returnDetails: {
                reason: reason,
                imageUrl: imageUrl || null,
                requestedAt: serverTimestamp()
            }
        });
        
        closeModal();
        appState.activeReturnOrderId = null;
        showToast("Return request submitted to seller.", "success");
    } catch (e) {
        console.error(e);
        showToast("Failed to submit request.", "error");
    } finally {
        appState.isLoading = false;
        renderApp();
    }
}

async function handleCancelSubscription() {
    if (!confirm("Are you sure you want to cancel your Urban+ membership? ₹499 will be refunded to your wallet.")) return;

    appState.isLoading = true;
    renderApp();

    try {
        const userRef = paths.user(appState.currentUser.uid);
        const userDoc = await getDoc(userRef);
        
        if (!userDoc.exists()) throw new Error("User not found");
        
        const userData = userDoc.data();
        
        // Double Check Time Limit (Server side validation would be better in real app)
        const joinDate = safeDate(userData.urbanPlusJoinedAt);
        const diffTime = Math.abs(new Date() - joinDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 3) {
            showToast("Cancellation period has expired.", "error");
            appState.isLoading = false;
            renderApp();
            return;
        }

        const refundAmount = 499;
        const newBalance = (userData.walletBalance || 0) + refundAmount;

        // Atomic update: Refund wallet and remove Urban+ status
        await updateDoc(userRef, {
            walletBalance: newBalance,
            isUrbanPlus: false,
            urbanPlusExpiry: deleteField(), // Requires importing deleteField
            urbanPlusJoinedAt: deleteField()
        });

        alert(`Membership Cancelled. ₹${refundAmount} has been refunded to your wallet.`);
        showToast("Refund Successful", "success");
        await loadUserAccount(appState.currentUser.uid); // Refresh

    } catch (e) {
        console.error("Cancel Sub Error:", e);
        showToast("Failed to cancel subscription.", "error");
        appState.isLoading = false;
        renderApp();
    }
}
async function handleResolveReturn(orderId, action) {
    if (!confirm(`Are you sure you want to ${action} this return?`)) return;

    appState.isLoading = true;
    renderApp();

    try {
        const orderRef = paths.order(orderId);
        const orderSnap = await getDoc(orderRef);
        
        if (!orderSnap.exists()) {
            throw new Error("Order not found");
        }

        const orderData = orderSnap.data();
        const newStatus = action === 'approve' ? 'Returned' : 'Return Rejected';
        
        // --- REFUND LOGIC START ---
        if (action === 'approve') {
            const buyerRef = paths.user(orderData.buyerId);
            const buyerSnap = await getDoc(buyerRef);
            
            if (buyerSnap.exists()) {
                const currentBalance = buyerSnap.data().walletBalance || 0;
                const refundAmount = orderData.total;
                const newBalance = currentBalance + refundAmount;
                
                // Update Buyer Wallet
                await updateDoc(buyerRef, { 
                    walletBalance: newBalance 
                });
                
                console.log(`Refunded ₹${refundAmount} to wallet. New Balance: ₹${newBalance}`);
                showToast(`Return Approved. ₹${refundAmount} refunded to buyer's wallet.`, "gold");
            }
        } else {
             showToast("Return Rejected. Status updated.");
        }
        // --- REFUND LOGIC END ---

        // Update Order Status
        await updateDoc(orderRef, {
            status: newStatus,
            'returnDetails.resolvedAt': serverTimestamp()
        });

    } catch (e) {
        console.error("Resolution Error:", e);
        showToast("Action failed: " + e.message, "error");
    } finally {
        appState.isLoading = false;
        renderApp();
    }
}
function handleSearch(query) {
    appState.searchQuery = query.toLowerCase();
    renderAppDebounced();
}

async function handleAddToCart(itemId, storeId) {
    if (!appState.currentUser) { 
        showToast("Please login to add items", "error"); 
        navigateTo('auth'); 
        return; 
    }

    // --- URBAN+ SUBSCRIPTION HANDLER ---
    if (itemId === 'urban-plus-subscription') {
        const confirmSub = confirm("Subscribe to Urban+ for ₹499/year? This will grant you exclusive badges, priority delivery, and discounts!");
        if (confirmSub) {
            try {
                await updateDoc(paths.user(appState.currentUser.uid), {
                    isUrbanPlus: true,
                    urbanPlusExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
                    urbanPlusJoinedAt: serverTimestamp() // <--- ADD THIS LINE
                });
                showToast("Welcome to Urban+!", "gold");
                loadUserAccount(appState.currentUser.uid); 
            } catch(e) {
                console.error(e);
                showToast("Activation failed", "error");
            }
        }
        return;
    }
    
    // Fallback: look in marketplace list first
    let product = appState.allMarketplaceItems.find(i => i.id === itemId);
    
    // Fallback: if not found, look in current store inventory (if viewing a specific store)
    if (!product && appState.currentStore.inventory) {
        product = appState.currentStore.inventory.find(i => i.id === itemId);
        if (product) {
            // Re-attach store info if found here
            product.storeId = storeId;
            if (appState.currentStore.info) {
                product.storeName = appState.currentStore.info.storeName;
            }
        }
    }
    
    if (!product) {
        showToast("Product details not found. Please refresh.", "error");
        return;
    }

    const moq = product.storeType === 'wholesaler' ? (product.minOrderQuantity || 100) : 1;
    const existingCartItem = appState.cart.find(item => item.inventoryItemId === itemId && item.storeId === storeId);

    // Calculate effective price for Urban+
    let effectivePrice = Number(product.price);
    if (appState.currentUser.isUrbanPlus && product.urbanPlusDiscount) {
        effectivePrice = Math.max(0, effectivePrice - product.urbanPlusDiscount);
    }

    try {
        if (existingCartItem) {
            const newQty = existingCartItem.quantity + 1;
            if (newQty > product.stock) { showToast("Max stock reached", "error"); return; }
            await updateDoc(paths.cartItem(appState.currentUser.uid, existingCartItem.id), { quantity: newQty });
            showToast("Quantity updated", "success");
        } else {
            const newItem = {
                inventoryItemId: itemId,
                productId: product.productId || 'unknown',
                name: product.name,
                price: effectivePrice, // Save discounted price to cart
                originalPrice: Number(product.price),
                storeId: storeId,
                storeName: product.storeName,
                imageUrl: product.imageUrl || '',
                quantity: moq, 
                minOrderQuantity: moq,
                addedAt: serverTimestamp()
            };
            await addDoc(paths.cart(appState.currentUser.uid), newItem);
            showToast("Added to Cart", "success");
        }
    } catch (e) {
        console.error("Add to cart failed:", e);
        showToast("Failed to add to cart", "error");
    }
}

function handleLogin() {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    
    if (!email || !pass) {
        showToast("Please enter email and password", "error");
        return;
    }

    appState.isLoading = true;
    renderApp();

    signInWithEmailAndPassword(auth, email, pass)
        .then(() => {
            showToast("Logged in successfully");
        })
        .catch((e) => {
            console.error("Login Error:", e);
            showToast("Login failed. Check credentials.", "error");
            appState.isLoading = false;
            renderApp();
        });
}

function handleSocialLogin(providerName) {
    let provider;
    if (providerName === 'google') {
        provider = new GoogleAuthProvider();
    } else if (providerName === 'facebook') {
        provider = new FacebookAuthProvider();
    } else {
        return;
    }

    appState.isLoading = true;
    renderApp();

    signInWithPopup(auth, provider)
        .then(async (result) => {
            const userDoc = await getDoc(paths.user(result.user.uid));
            if (!userDoc.exists()) {
                showToast(`Welcome ${result.user.displayName}! Please complete registration.`, "info");
            } else {
                showToast("Logged in successfully");
            }
        })
        .catch((error) => {
            console.error("Social Auth Error", error);
            appState.isLoading = false;
            renderApp();
            if (error.code === 'auth/account-exists-with-different-credential') {
                showToast("Email used with different provider.", "error");
            } else if (error.code === 'auth/popup-closed-by-user') {
                showToast("Login cancelled.", "info");
            } else {
                showToast(`Login failed: ${error.message}`, "error");
            }
        });
}

async function handleCreateAccount() {
    const email = document.getElementById('register-email')?.value || appState.currentUser?.email; 
    const pass = document.getElementById('register-password')?.value;
    const name = document.getElementById('name').value;
    const phone = document.getElementById('phoneNumber').value;
    const addressDetails = document.getElementById('address-details').value;
    const pinnedLocation = document.getElementById('pinned-location').value;
    
    const roleEl = document.querySelector('input[name="role"]:checked');
    const role = roleEl ? roleEl.value : 'customer';
    
    let storeName = '';
    if (role !== 'customer') {
        const storeNameInput = document.getElementById('storeName');
        storeName = storeNameInput ? storeNameInput.value : '';
    }

    if (!email || !name || !addressDetails) {
        showToast("Please fill all fields", "error");
        return;
    }
    
    if (!auth.currentUser && (!pass || pass.length < 6)) {
        showToast("Password must be at least 6 characters", "error");
        return;
    }

    appState.isLoading = true;
    renderApp();

    try {
        let uid;
        if (auth.currentUser) {
            uid = auth.currentUser.uid;
        } else {
            const userCred = await createUserWithEmailAndPassword(auth, email, pass);
            uid = userCred.user.uid;
        }

        const fullAddress = `${addressDetails} [Pinned: ${pinnedLocation || 'None'}]`;
        const userData = {
            name,
            phoneNumber: phone || '',
            address: fullAddress,
            pinnedLocation: pinnedLocation || '',
            coordinates: appState.tempCoordinates || null,
            addressDetails: addressDetails,
            role,
            email: email,
            walletBalance: 0,
            isUrbanPlus: false, // Default
            createdAt: serverTimestamp()
        };

        if (storeName) userData.storeName = storeName;

        const batch = writeBatch(db);
        batch.set(paths.user(uid), userData);

        if (role !== 'customer') {
            const storeData = {
                storeName,
                ownerName: name,
                address: fullAddress,
                coordinates: appState.tempCoordinates || null, 
                type: role,
                ownerId: uid,
                createdAt: serverTimestamp()
            };
            batch.set(paths.store(uid), storeData);
        }

        await batch.commit();
        showToast("Account created successfully!", "success");
        await loadUserAccount(uid);

    } catch (e) {
        console.error("Signup Error:", e);
        showToast("Signup failed: " + e.message, "error");
        appState.isLoading = false;
        renderApp();
    }
}

function handleUpdateProfile() {
    const name = document.getElementById('profile-name').value;
    const phone = document.getElementById('profile-phone').value;
    const pinned = document.getElementById('profile-pinned-location').value;
    const details = document.getElementById('profile-address-details').value;
    const fullAddress = `${details} [Pinned: ${pinned || 'None'}]`;
    const storeNameInput = document.getElementById('profile-store-name');
    const backdropInput = document.getElementById('profile-backdrop');
    const storeName = storeNameInput ? storeNameInput.value : null;
    const backdropUrl = backdropInput ? backdropInput.value : null;

    if (!name || !details) { showToast("Fill required fields.", "error"); return; }
    
    appState.isLoading = true; renderApp();
    try {
        const uid = appState.currentUser.uid;
        const userUpdates = { name, phoneNumber: phone, address: fullAddress, pinnedLocation: pinned, addressDetails: details };
        
        if (appState.tempCoordinates) {
            userUpdates.coordinates = appState.tempCoordinates;
        }

        if (storeName) userUpdates.storeName = storeName;
        if (backdropUrl !== null) userUpdates.backdropUrl = backdropUrl;

        updateDoc(paths.user(uid), userUpdates).then(async () => {
             if (storeName) {
                 const storeUpdates = { ownerName: name, storeName, address: fullAddress, backdropUrl };
                 if (appState.tempCoordinates) storeUpdates.coordinates = appState.tempCoordinates;
                 await updateDoc(paths.store(uid), storeUpdates);
             }
             appState.tempCoordinates = null; 
             await loadUserAccount(uid); 
             showToast("Updated!", "success");
        });
    } catch (err) { showToast("Failed.", "error"); appState.isLoading = false; renderApp(); }
}

function openMapModal() {
    if (appState.map) {
        appState.map.remove();
        appState.map = null;
    }
    appState.tempCoordinates = null;

    openModal('Pick Location', `
        <div id="map" style="height: 300px; width: 100%; background-color: #eee;"></div>
        <div class="mt-4 flex justify-end">
            <button data-action="confirm-location" class="bg-teal-600 text-white py-2 px-4 rounded-lg shadow disabled:bg-gray-300" disabled id="confirm-loc-btn">Confirm Selection</button>
        </div>
    `);
    
    setTimeout(() => {
        const mapContainer = document.getElementById('map');
        if (!mapContainer) return;

        try {
            appState.map = L.map('map').setView([20.5937, 78.9629], 5); 
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
                attribution: '© OpenStreetMap' 
            }).addTo(appState.map);
            
            appState.map.invalidateSize();

            appState.map.on('click', async (e) => {
                if (appState.mapMarker) appState.map.removeLayer(appState.mapMarker);
                appState.mapMarker = L.marker(e.latlng).addTo(appState.map);
                appState.tempCoordinates = { lat: e.latlng.lat, lng: e.latlng.lng };

                try {
                    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.latlng.lat}&lon=${e.latlng.lng}`);
                    const data = await response.json();
                    appState.selectedAddress = data.display_name;
                } catch (err) { 
                    appState.selectedAddress = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`; 
                }
                
                const btn = document.getElementById('confirm-loc-btn');
                if(btn) {
                    btn.disabled = false;
                    btn.textContent = "Confirm";
                }
            });
        } catch (e) {
            console.error("Map initialization error:", e);
        }
    }, 250); 
}

function handleConfirmLocation() {
    if (appState.selectedAddress) {
        const pinnedInputReg = document.getElementById('pinned-location');
        const pinnedInputProfile = document.getElementById('profile-pinned-location');
        if (pinnedInputReg) pinnedInputReg.value = appState.selectedAddress;
        if (pinnedInputProfile) pinnedInputProfile.value = appState.selectedAddress;
        closeModal();
    }
}

function renderAddInventoryForm() { 
     return `
        <form id="add-inventory-form" class="space-y-4">
            <div><label class="block text-sm font-medium">Product Name</label><input type="text" id="inv-name" class="w-full border p-2 rounded" required></div>
            <div><label class="block text-sm font-medium">Category</label><select id="inv-category" class="w-full border p-2 rounded"><option>Groceries</option><option>Electronics</option><option>Fashion</option><option>Home & Kitchen</option><option>Health</option></select></div>
            <div><label class="block text-sm font-medium">Image URL</label><input type="text" id="inv-image" class="w-full border p-2 rounded"></div>
            <div class="grid grid-cols-2 gap-4">
                <div><label class="block text-sm font-medium">Price (₹)</label><input type="number" id="inv-price" class="w-full border p-2 rounded" required></div>
                <div><label class="block text-sm font-medium">Stock</label><input type="number" id="inv-stock" class="w-full border p-2 rounded" required></div>
            </div>
             <div><label class="block text-sm font-medium text-amber-700">Urban+ Discount (₹ off per item)</label><input type="number" id="inv-urban-disc" class="w-full border border-amber-300 bg-amber-50 p-2 rounded" value="0"></div>
             ${appState.currentUser.role === 'wholesaler' ? `<div><label class="block text-sm font-medium">Min Order Quantity</label><input type="number" id="inv-moq" class="w-full border p-2 rounded" value="10"></div>` : ''}
            <div class="flex gap-3 pt-2"><button type="button" onclick="closeModal()" class="w-1/3 bg-gray-200 py-2 rounded">Cancel</button><button type="button" data-action="add-to-inventory" class="w-2/3 bg-teal-600 text-white py-2 rounded">Add Product</button></div>
        </form>
    `;
}

function renderCreateCouponForm() {
    const inventory = appState.myInventory || [];
    return `
        <form id="create-coupon-form" class="space-y-4">
            <div><label class="block text-sm font-medium">Code</label><input type="text" id="coupon-code" class="w-full border p-2 rounded uppercase" required></div>
            <div><label class="block text-sm font-medium">Type</label><select id="coupon-type" class="w-full border p-2 rounded"><option value="percent">%</option><option value="flat">Flat ₹</option></select></div>
            <div><label class="block text-sm font-medium">Value</label><input type="number" id="coupon-value" class="w-full border p-2 rounded" required></div>
            <div class="border-t pt-4"><label class="block text-sm font-medium mb-2">Applicable Products</label><div class="max-h-40 overflow-y-auto border rounded p-2 space-y-2 bg-gray-50">${inventory.map(item => `<label class="flex items-center space-x-2 text-sm cursor-pointer"><input type="checkbox" name="coupon-product" value="${item.id}"><span>${item.name}</span></label>`).join('')}</div></div>
            <div class="flex gap-3 pt-2"><button type="button" onclick="closeModal()" class="w-1/3 bg-gray-200 py-2 rounded">Cancel</button><button type="button" data-action="create-coupon" class="w-2/3 bg-purple-600 text-white py-2 rounded">Create</button></div>
        </form>
    `;
}


function handleCreateCoupon() {
    const code = document.getElementById('coupon-code').value.toUpperCase();
    const type = document.getElementById('coupon-type').value;
    const value = Number(document.getElementById('coupon-value').value);
    const checkboxes = document.querySelectorAll('input[name="coupon-product"]:checked');
    const applicableItemIds = Array.from(checkboxes).map(cb => cb.value);
    if(!code || !value) return showToast("Invalid details", "error");
    addDoc(paths.coupons(appState.currentUser.uid), { code, type, value, storeId: appState.currentUser.uid, applicableItemIds }).then(() => { closeModal(); showToast("Coupon created!"); });
}

function handleDeleteInventoryItem(id) { if(confirm("Delete?")) deleteDoc(paths.inventoryItem(appState.currentUser.uid, id)); }
function handleDeleteCoupon(id) { if(confirm("Delete?")) deleteDoc(paths.coupon(appState.currentUser.uid, id)); }
function handleRemoveFromCart(cartId) { deleteDoc(paths.cartItem(appState.currentUser.uid, cartId)); }
function handleUpdateCartQuantity(cartId, change) { const item = appState.cart.find(c => c.id === cartId); if(item && item.quantity + Number(change) > 0) updateDoc(paths.cartItem(appState.currentUser.uid, cartId), { quantity: item.quantity + Number(change) }); }
function handleApplyCoupon(storeId) { const code = document.getElementById(`coupon-${storeId}`).value.toUpperCase(); getDocs(query(paths.coupons(storeId), where("code", "==", code))).then(snap => { if(!snap.empty) { appState.appliedCoupons[storeId] = snap.docs[0].data(); renderApp(); } else showToast("Invalid code", "error"); }); }
function handleRemoveCoupon(storeId) { delete appState.appliedCoupons[storeId]; renderApp(); }

function handleInitiatePayment(storeId) {
    const items = appState.cart.filter(i => i.storeId === storeId);
    let subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const coupon = appState.appliedCoupons[storeId];
    let discount = 0;
    if (coupon) discount = coupon.type === 'percent' ? subtotal * (coupon.value / 100) : coupon.value;
    const deliveryType = appState.deliveryOptions[storeId] || 'delivery';
    const deliveryFee = deliveryType === 'pickup' ? 0 : (totalQuantity * 20);
    const total = subtotal - discount + deliveryFee;
    appState.pendingPaymentStoreId = storeId;
    appState.pendingPaymentTotal = total;
    
    const walletBalance = appState.currentUser.walletBalance || 0;
    const canPayWithWallet = walletBalance >= total;

    // Updated Modal Content with Horizontal Tabs and Wallet Option
    const modalContent = `
        <div class="payment-container">
            <h3 class="text-xl font-bold mb-4 text-center">Pay ₹${total.toFixed(2)}</h3>
            
            <div class="flex space-x-2 mb-4 border-b border-gray-200 pb-2 overflow-x-auto">
                <button class="payment-tab active flex-1 py-2 text-sm font-bold text-gray-500 hover:text-teal-600 border-b-2 border-transparent hover:border-teal-400 whitespace-nowrap" data-action="switch-payment-tab" data-tab="wallet">
                    <i data-lucide="wallet" class="h-4 w-4 inline mr-1"></i> Wallet
                </button>
                <button class="payment-tab flex-1 py-2 text-sm font-bold text-gray-500 hover:text-teal-600 border-b-2 border-transparent hover:border-teal-400" data-action="switch-payment-tab" data-tab="card">Card</button>
                <button class="payment-tab flex-1 py-2 text-sm font-bold text-gray-500 hover:text-teal-600 border-b-2 border-transparent hover:border-teal-400" data-action="switch-payment-tab" data-tab="upi">UPI</button>
                <button class="payment-tab flex-1 py-2 text-sm font-bold text-gray-500 hover:text-teal-600 border-b-2 border-transparent hover:border-teal-400" data-action="switch-payment-tab" data-tab="cod">COD</button>
            </div>

            <div id="payment-wallet" class="payment-content active">
                <div class="bg-teal-50 p-4 rounded-lg border border-teal-100 text-center mb-4">
                    <p class="text-sm text-gray-600">Your Balance</p>
                    <p class="text-2xl font-bold text-teal-700">₹${walletBalance.toFixed(2)}</p>
                </div>
                ${canPayWithWallet 
                    ? `<button class="bg-teal-600 text-white w-full py-3 rounded font-bold hover:bg-teal-700 shadow-md" onclick="handleProcessPayment('Wallet')">Pay ₹${total.toFixed(2)} from Wallet</button>`
                    : `<button class="bg-gray-300 text-gray-500 w-full py-3 rounded font-bold cursor-not-allowed" disabled>Insufficient Balance</button>
                       <p class="text-xs text-red-500 text-center mt-2">You need ₹${(total - walletBalance).toFixed(2)} more.</p>`
                }
            </div>

            <div id="payment-card" class="payment-content hidden">
                <div class="space-y-3">
                    <input type="text" placeholder="Card Number" class="w-full border p-2 rounded">
                    <div class="flex gap-2">
                        <input type="text" placeholder="MM/YY" class="w-1/2 border p-2 rounded">
                        <input type="text" placeholder="CVV" class="w-1/2 border p-2 rounded">
                    </div>
                    <button class="bg-teal-600 text-white w-full py-3 rounded font-bold hover:bg-teal-700 mt-2" onclick="handleProcessPayment('Card')">Pay Securely</button>
                </div>
            </div>

            <div id="payment-upi" class="payment-content hidden">
                <div class="space-y-3">
                    <label class="block text-sm font-medium">Enter VPA</label>
                    <input type="text" placeholder="username@upi" class="w-full border p-2 rounded">
                    <button class="bg-teal-600 text-white w-full py-3 rounded font-bold hover:bg-teal-700 mt-2" onclick="handleProcessPayment('UPI')">Verify & Pay</button>
                </div>
            </div>

            <div id="payment-cod" class="payment-content hidden">
                <div class="text-center py-4">
                    <div class="bg-green-50 text-green-700 p-4 rounded-lg mb-4">
                        <i data-lucide="banknote" class="h-8 w-8 mx-auto mb-2"></i>
                        <p class="font-bold">Pay Cash on Delivery</p>
                        <p class="text-xs mt-1">Please keep exact change ready.</p>
                    </div>
                    <button class="bg-gray-800 text-white w-full py-3 rounded font-bold hover:bg-gray-900" onclick="handleProcessPayment('COD')">Confirm Order</button>
                </div>
            </div>
        </div>
    `;
    openModal('Select Payment Method', modalContent);
    
    // Helper to switch tabs visibility
    setTimeout(() => {
        const tabs = document.querySelectorAll('.payment-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                // Reset styling
                tabs.forEach(t => {
                    t.classList.remove('text-teal-600', 'border-teal-500');
                    t.classList.add('text-gray-500', 'border-transparent');
                });
                // Activate clicked tab
                e.currentTarget.classList.remove('text-gray-500', 'border-transparent');
                e.currentTarget.classList.add('text-teal-600', 'border-teal-500');
                
                // Show content
                const targetId = e.currentTarget.dataset.tab;
                document.querySelectorAll('.payment-content').forEach(c => c.classList.add('hidden'));
                document.getElementById(`payment-${targetId}`).classList.remove('hidden');
            });
        });
        
        // Activate first tab (Wallet) by default styling
        tabs[0].classList.remove('text-gray-500', 'border-transparent');
        tabs[0].classList.add('text-teal-600', 'border-teal-500');
    }, 100);
}

async function handleCancelOrder(orderId) {
    if (!confirm("Are you sure you want to cancel this order?")) return;

    appState.isLoading = true;
    renderApp();

    try {
        const orderRef = paths.order(orderId);
        const orderSnap = await getDoc(orderRef);

        if (!orderSnap.exists()) {
            throw new Error("Order not found");
        }

        const orderData = orderSnap.data();

        // Prevent double cancellation
        if (orderData.status === 'Cancelled') {
             showToast("Order is already cancelled.", "info");
             return;
        }

        let alertMessage = "Order has been cancelled.";

        // --- REFUND LOGIC ---
        // Only refund if payment method was NOT Cash on Delivery (COD)
        if (orderData.paymentMethod !== 'COD') {
            const refundAmount = orderData.total;
            const buyerRef = paths.user(orderData.buyerId);
            const buyerSnap = await getDoc(buyerRef);

            if (buyerSnap.exists()) {
                const currentBalance = buyerSnap.data().walletBalance || 0;
                const newBalance = currentBalance + refundAmount;

                // Update Buyer Wallet
                await updateDoc(buyerRef, {
                    walletBalance: newBalance
                });
                
                alertMessage = `Order Cancelled. ₹${refundAmount.toFixed(2)} has been refunded to your wallet.`;
                console.log(`Refunded ₹${refundAmount} for Order #${orderId}`);
            }
        } else {
            alertMessage = "Order Cancelled. No refund required for COD orders.";
        }

        // Update Order Status
        await updateDoc(orderRef, {
            status: 'Cancelled',
            cancelledAt: serverTimestamp()
        });

        // Show Alert and Toast
        alert(alertMessage);
        showToast(orderData.paymentMethod !== 'COD' ? "Cancelled & Refunded" : "Order Cancelled", "gold");

    } catch (e) {
        console.error("Cancellation Error:", e);
        showToast("Cancellation failed: " + e.message, "error");
    } finally {
        appState.isLoading = false;
        renderApp();
    }
}
function handleUpdateOrderStatus(id, status) { updateDoc(paths.order(id), { status }); }
function handleMarkDeliveredWithOtp(id, correctOtp) { const otp = prompt("Enter OTP"); if(otp === correctOtp) updateDoc(paths.order(id), { status: 'Delivered' }); else showToast("Wrong OTP", "error"); }

function handleTrackOrder(orderId) {
    const order = [...appState.myOrders.placed, ...appState.myOrders.received].find(o => o.id === orderId);
    if (!order) return showToast("Order details not found.", "error");
    
    // Check if order is in a state where the standard timeline applies
    const isCancelled = ['Cancelled', 'Returned', 'Return Rejected'].includes(order.status);
    
    // Mock Estimated Date
    const estDateObj = new Date(); 
    estDateObj.setDate(estDateObj.getDate() + 3);
    const estDate = estDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const timelineSteps = [
        { id: 'Placed', label: 'Order Placed' },
        { id: 'Confirmed', label: 'Order Confirmed' },
        { id: 'Shipped', label: 'Shipped' },
        { id: 'Delivered', label: 'Delivered' }
    ];

    const flow = ['Placed', 'Confirmed', 'Shipped', 'Delivered'];
    const currentStatusIndex = flow.indexOf(order.status);

    let timelineHtml = '';

    if (!isCancelled) {
        timelineHtml = `<div class="step-container">`;
        
        timelineSteps.forEach((step, index) => {
            const stepIndex = flow.indexOf(step.id);
            
            let statusClass = 'pending';
            let iconName = 'circle'; // Default pending icon
            let isSpinning = false;

            if (stepIndex <= currentStatusIndex) {
                // Step is Completed (Current status or previous)
                statusClass = 'completed';
                iconName = 'check';
            } else if (stepIndex === currentStatusIndex + 1) {
                // Step is the IMMEDIATE NEXT one -> LOADING
                statusClass = 'active'; 
                iconName = 'loader-2';
                isSpinning = true;
            } 
            // Else stays 'pending' with 'circle' icon

            // Specific case: If Delivered, nothing should load anymore
            if (order.status === 'Delivered' && step.id === 'Delivered') {
                 statusClass = 'completed';
                 iconName = 'check';
                 isSpinning = false;
            }

            timelineHtml += `
                <div class="step-item ${statusClass}">
                    <div class="step-circle">
                        <i data-lucide="${iconName}" class="h-5 w-5 ${isSpinning ? 'animate-spin' : ''}"></i>
                    </div>
                    <div class="step-content">
                        <div class="step-title">${step.label}</div>
                    </div>
                </div>
            `;
        });
        timelineHtml += `</div>`;
    } else {
        // If Cancelled or Returned, show a simple banner instead of the timeline
        let bannerColor = order.status === 'Cancelled' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600';
        timelineHtml = `<div class="p-4 ${bannerColor} rounded font-bold text-center border">${order.status}</div>`;
    }

    const content = `
        <div class="space-y-6">
            <div class="bg-teal-50 p-6 rounded-xl border border-teal-100 flex justify-between items-center">
                <div>
                    <p class="text-xs font-bold text-teal-600 uppercase">Estimated Arrival</p>
                    <p class="text-xl font-extrabold text-teal-900">${estDate}</p>
                </div>
                <div class="h-10 w-10 bg-teal-100 rounded-full flex items-center justify-center text-teal-600">
                    <i data-lucide="calendar" class="h-5 w-5"></i>
                </div>
            </div>
            
            <div class="py-2">${timelineHtml}</div>
            
            <div id="tracking-map" style="height: 200px; width: 100%; background-color: #eee;" class="w-full rounded-xl border border-gray-200"></div>
        </div>
    `;
    
    openModal(`Tracking #${order.id.slice(0,8)}`, content);
    
    // Map initialization (remains same)
    setTimeout(() => {
        if (appState.trackMap) { appState.trackMap.remove(); appState.trackMap = null; }
        const mapContainer = document.getElementById('tracking-map');
        if(!mapContainer) return;
        
        try {
            appState.trackMap = L.map('tracking-map').setView([20.5937, 78.9629], 4);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(appState.trackMap);
            
            // Dummy path for visual effect
            const start = [28.6139, 77.2090]; 
            const end = [19.0760, 72.8777]; 
            L.marker(start).addTo(appState.trackMap);
            L.marker(end).addTo(appState.trackMap);
            const polyline = L.polyline([start, end], {color: '#0d9488'}).addTo(appState.trackMap);
            appState.trackMap.fitBounds(polyline.getBounds());
            appState.trackMap.invalidateSize();
        } catch(e) { console.error("Map error", e); }
    }, 250);
}
function handleToggleWishlist(itemId) { const uid = appState.currentUser.uid; if(appState.favorites.includes(itemId)) deleteDoc(paths.favorite(uid, itemId)); else setDoc(paths.favorite(uid, itemId), { itemId }); }
function renderEditInventoryForm(itemId) { const item = appState.myInventory.find(i => i.id === itemId); return `<div><label>Edit Name</label><input id="edit-inv-name" value="${item.name}" class="border p-2 w-full"><button class="bg-blue-600 text-white p-2 mt-2 w-full" onclick="handleUpdateInventory()">Update</button></div>`; } 
function handleUpdateInventory() { 
    if(!appState.editingItemId) return;
    const name = document.getElementById('edit-inv-name').value;
    updateDoc(paths.inventoryItem(appState.currentUser.uid, appState.editingItemId), { name }).then(() => { closeModal(); showToast("Updated"); });
}

function showToast(msg, type="success") {
    const t = document.getElementById("toast"); t.textContent = msg; t.className = type; t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3000);
}

function openModal(title, content) {
    const m = document.getElementById('modal'); 
    m.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-teal-900">${title}</h2>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors">
                <i data-lucide="x" class="h-6 w-6"></i>
            </button>
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
    const content = document.getElementById(`payment-${tabName}`);
    if(content) content.classList.add('active');
};

function handleLogout() {
    signOut(auth).then(() => {
        navigateTo('auth');
        showToast("Logged out successfully");
    });
}

// Initialize application
init();