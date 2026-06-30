/* global L, lucide */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged,
    signOut,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword
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
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Import config
import { firebaseConfig, appId } from './firebase-config.js';

// Initialize Firebase
let app, db, auth;
try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
} catch (e) {
    console.error("Firebase initialization error:", e);
    document.getElementById('app').innerHTML = `<div class="p-4 text-red-700 bg-red-100">Error initializing Firebase. Please check console.</div>`;
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
    masterProduct: (pid) => doc(db, `artifacts/${appId}/public/data/masterProducts`, pid),
    masterProducts: () => collection(db, `artifacts/${appId}/public/data/masterProducts`),
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
// RENDER HELPERS
// -----------------------------------------------------------------

const renderLoading = () => `<div class="flex justify-center items-center h-screen"><div class="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-teal-600"></div></div>`;
const renderError = (msg) => `<div class="p-4 text-red-700 bg-red-100 rounded-lg border border-red-200 m-4">${msg}</div>`;

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

    return `
        <header class="bg-white shadow-md sticky top-0 z-30 border-b-4 border-teal-500">
            <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex justify-between items-center h-16">
                    <div class="flex-shrink-0 flex items-center cursor-pointer" data-action="navigate" data-view="marketplace">
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

                        <button data-action="navigate" data-view="cartView" class="relative text-gray-600 hover:text-teal-600">
                            <i data-lucide="shopping-bag"></i>
                            <span class="absolute -top-2 -right-2 bg-teal-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">${appState.cart.length}</span>
                        </button>
                        <!-- Profile Link -->
                        <div class="flex items-center space-x-2 cursor-pointer hover:text-teal-600" data-action="navigate" data-view="profileView">
                            <div class="text-sm text-right hidden sm:block">
                                <div class="font-medium text-gray-800">${appState.currentUser.name || appState.currentUser.email}</div>
                                <div class="text-gray-500 capitalize text-xs">${appState.currentUser.role}</div>
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
                <!-- Mobile Menu -->
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
                <form onsubmit="event.preventDefault();" class="space-y-6">
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
                        <button data-action="register" class="hidden">Hidden Submit</button> 
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

    if (appState.sortOption === 'price-asc') displayItems.sort((a, b) => a.price - b.price);
    else if (appState.sortOption === 'price-desc') displayItems.sort((a, b) => b.price - a.price);
    else if (appState.sortOption === 'name-asc') displayItems.sort((a, b) => a.name.localeCompare(b.name));

    const getTabClass = (tab) => `px-4 py-2 rounded-full font-semibold text-sm transition-colors ${selectedTab === tab ? 'bg-teal-600 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`;

    return `
        <div class="mb-8">
            <div class="text-center mb-6">
                <h1 class="text-4xl font-extrabold text-teal-900 mb-2">Marketplace</h1>
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
                    </select>
                </div>
            </div>
        </div>

        ${displayItems.length === 0 
            ? `<div class="text-center py-20 bg-white rounded-xl shadow-sm"><i data-lucide="package-open" class="h-16 w-16 text-gray-300 mx-auto mb-4"></i><p class="text-xl text-gray-500">No items found.</p></div>` 
            : `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                ${displayItems.map(item => {
                    let stockClass = "text-gray-600";
                    let stockText = `${item.stock} units left`;
                    if (item.storeType === 'retailer' && item.stock < 5) { stockClass = "text-red-600 font-bold animate-pulse"; stockText = `Low Stock: Only ${item.stock} left!`; } 
                    else if (item.storeType === 'wholesaler' && item.stock < 100) { stockClass = "text-red-600 font-bold animate-pulse"; stockText = `Low Bulk Stock: ${item.stock} left`; }
                    
                    const isFav = appState.favorites.includes(item.id);
                    const moq = item.storeType === 'wholesaler' ? (item.minOrderQuantity || 100) : 1;
                    const moqBadge = moq > 1 ? `<div class="absolute top-2 left-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded shadow-sm border border-yellow-200">Min Order: ${moq}</div>` : '';

                    return `
                    <div class="bg-white rounded-xl shadow hover:shadow-lg transition duration-300 border border-gray-100 flex flex-col h-full relative group">
                        <button data-action="toggle-wishlist" data-item-id="${item.id}" class="absolute top-3 right-3 z-10 p-2 bg-white rounded-full shadow-md hover:bg-gray-50 btn-heart ${isFav ? 'active' : ''}">
                            <i data-lucide="heart" class="h-5 w-5 ${isFav ? 'fill-red-500 text-red-500' : 'text-gray-400'}"></i>
                        </button>

                        <div class="relative h-48">
                            <img class="w-full h-full object-cover rounded-t-xl" src="${item.imageUrl || `https://placehold.co/600x400/ccfbf1/115e59?text=${item.name}`}" alt="${item.name}">
                            <span class="absolute bottom-2 left-2 px-2 py-1 rounded-md bg-white/90 text-xs font-bold uppercase text-teal-800 shadow-sm">${item.storeType}</span>
                            ${moqBadge}
                        </div>
                        <div class="p-5 flex-grow">
                            <h3 class="text-lg font-bold text-gray-900 mb-1 truncate">${item.name}</h3>
                            <p class="text-sm text-gray-500 mb-2">${item.category}</p>
                            <div class="flex justify-between items-end mb-3"><span class="text-2xl font-bold text-teal-600">₹${Number(item.price).toFixed(2)}</span><span class="text-xs text-gray-400">per unit</span></div>
                            <div class="text-sm mb-4 ${stockClass}"><i data-lucide="box" class="inline-block h-4 w-4 mr-1 align-text-bottom"></i>${stockText}</div>
                            <div class="flex items-center text-xs text-gray-500 border-t pt-3"><i data-lucide="store" class="h-3 w-3 mr-1"></i>Sold by: <strong class="ml-1">${item.storeName}</strong></div>
                        </div>
                        <div class="p-5 pt-0 mt-auto"><button data-action="add-to-cart" data-item-id="${item.id}" data-store-id="${item.storeId}" class="w-full bg-teal-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-teal-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed" ${item.stock === 0 ? 'disabled' : ''}>${item.stock === 0 ? 'Out of Stock' : 'Add to Cart'}</button></div>
                    </div>`;
                }).join('')}
                </div>`
        }
    `;
}

function renderProfileView() {
    const user = appState.currentUser;
    const isSeller = user.role === 'retailer' || user.role === 'wholesaler';

    return `
        <div class="max-w-2xl mx-auto">
            ${renderBackButton(getHomeView(), 'Back to Home')}
            <div class="bg-white p-8 rounded-xl shadow-lg border border-teal-100">
                <div class="flex justify-between items-center mb-6">
                    <h1 class="text-3xl font-bold text-teal-900">Edit Profile</h1>
                    <div class="text-right">
                        <div class="text-sm text-gray-500">Wallet Balance</div>
                        <div class="text-2xl font-bold text-teal-600">₹${(user.walletBalance || 0).toFixed(2)}</div>
                    </div>
                </div>
            
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
                            <label class="block text-sm font-bold text-gray-700 mb-2">Location (Click to Pick)</label>
                            <div class="flex gap-2 mb-3">
                                <input type="text" id="profile-pinned-location" value="${user.pinnedLocation || ''}" readonly class="flex-grow px-4 py-2 border border-gray-200 bg-gray-50 text-gray-600 rounded-lg cursor-not-allowed" placeholder="No location pinned yet">
                                <button type="button" data-action="open-map-modal" class="bg-teal-100 text-teal-700 px-4 rounded-lg hover:bg-teal-200 border border-teal-200 font-medium flex items-center whitespace-nowrap"><i data-lucide="map-pin" class="h-4 w-4 mr-2"></i> Pin on Map</button>
                            </div>
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

function renderBrowseStores(typeFilter) {
    let stores = appState.stores;
    if (typeFilter && typeFilter !== 'all') {
        stores = stores.filter(s => s.type === typeFilter);
    }
    
    return `
        <div class="max-w-6xl mx-auto">
            ${renderBackButton(getHomeView())}
            <h1 class="text-3xl font-bold text-teal-900 mb-6">Browse Stores ${typeFilter && typeFilter !== 'all' ? `(${typeFilter}s)` : ''}</h1>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${stores.map(store => `
                    <div class="bg-white rounded-xl shadow hover:shadow-lg transition overflow-hidden border border-gray-100 cursor-pointer group" data-action="navigate" data-view="storeView" data-store-id="${store.id}">
                        <div class="h-32 bg-gradient-to-r from-teal-500 to-emerald-600 relative">
                             ${store.backdropUrl ? `<img src="${store.backdropUrl}" class="w-full h-full object-cover opacity-50">` : ''}
                             <div class="absolute -bottom-6 left-6 h-16 w-16 bg-white rounded-lg shadow-md flex items-center justify-center text-2xl font-bold text-teal-700 border-2 border-white">
                                ${store.storeName.charAt(0)}
                             </div>
                        </div>
                        <div class="pt-8 p-6">
                            <h3 class="text-xl font-bold text-gray-900 group-hover:text-teal-600 transition">${store.storeName}</h3>
                            <p class="text-sm text-gray-500 capitalize mb-4">${store.type} • ${store.ownerName}</p>
                            <div class="text-sm text-gray-600 flex items-start">
                                <i data-lucide="map-pin" class="h-4 w-4 mr-2 mt-1 flex-shrink-0 text-gray-400"></i>
                                <span class="line-clamp-2">${store.address}</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
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

function renderCartView() {
    // Group items by store
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
                    subtotal += i.price * i.quantity;
                    totalQuantity += i.quantity;
                });
                
                // Coupon Logic
                const coupon = appState.appliedCoupons[storeId];
                let discount = 0;
                let couponMsg = '';
                
                if (coupon) {
                    if (coupon.applicableItemIds && coupon.applicableItemIds.length > 0) {
                         // Item specific coupon
                         const eligibleItems = storeGroup.items.filter(i => coupon.applicableItemIds.includes(i.inventoryItemId));
                         const eligibleSubtotal = eligibleItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
                         discount = coupon.type === 'percent' ? eligibleSubtotal * (coupon.value / 100) : Math.min(coupon.value, eligibleSubtotal);
                         couponMsg = `<span class="text-green-600 text-sm flex items-center mt-1"><i data-lucide="tag" class="h-3 w-3 mr-1"></i> Coupon ${coupon.code} applied on specific items!</span>`;
                    } else {
                         // General coupon
                         discount = coupon.type === 'percent' ? subtotal * (coupon.value / 100) : coupon.value;
                         couponMsg = `<span class="text-green-600 text-sm flex items-center mt-1"><i data-lucide="tag" class="h-3 w-3 mr-1"></i> Coupon ${coupon.code} applied!</span>`;
                    }
                    if (discount > subtotal) discount = subtotal; 
                }

                // Delivery Logic
                const deliveryType = appState.deliveryOptions[storeId] || 'delivery'; // Default to delivery
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
                            <!-- Options Column -->
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

                            <!-- Totals Column -->
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
    const placed = appState.myOrders.placed || [];
    const received = appState.myOrders.received || []; 
    // received is only for sellers
    
    // Sort by date desc
    placed.sort((a,b) => b.createdAt - a.createdAt);
    received.sort((a,b) => b.createdAt - a.createdAt);

    const isSeller = appState.currentUser.role !== 'customer';

    const renderOrderList = (orders, type) => {
        if(orders.length === 0) return `<div class="p-8 text-center text-gray-500">No orders found.</div>`;
        
        return orders.map(order => {
            const date = safeDate(order.createdAt).toLocaleDateString();
            const statusColor = {
                'Placed': 'bg-blue-100 text-blue-800', 
                'Confirmed': 'bg-indigo-100 text-indigo-800', 
                'Shipped': 'bg-amber-100 text-amber-800',
                'Delivered': 'bg-green-100 text-green-800',
                'Cancelled': 'bg-red-100 text-red-800',
                'Returned': 'bg-orange-100 text-orange-800'
            }[order.status] || 'bg-gray-100 text-gray-800';

            // Action Buttons Logic
            let actionButtons = '';
            if (type === 'placed') {
                actionButtons = `
                    <button data-action="track-order" data-order-id="${order.id}" class="px-4 py-2 bg-teal-50 text-teal-700 rounded-lg text-sm font-medium hover:bg-teal-100 border border-teal-200">Track Order</button>
                    ${['Placed', 'Confirmed'].includes(order.status) ? `<button data-action="cancel-order" data-order-id="${order.id}" class="px-4 py-2 bg-white text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-50">Cancel Order</button>` : ''}
                    ${order.status === 'Delivered' ? `<button data-action="return-order" data-order-id="${order.id}" class="px-4 py-2 bg-white text-orange-600 border border-orange-200 rounded-lg text-sm font-medium hover:bg-orange-50">Return Item</button>` : ''}
                `;
            } else {
                // Seller Buttons
                if (order.status === 'Placed') {
                    actionButtons = `
                        <button data-action="update-order-status" data-order-id="${order.id}" data-new-status="Confirmed" class="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-bold hover:bg-teal-700">Accept Order</button>
                        <button data-action="cancel-order" data-order-id="${order.id}" class="px-4 py-2 bg-white text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-50">Reject Order</button>
                    `;
                } else if (order.status === 'Confirmed') {
                    actionButtons = `
                        <button data-action="update-order-status" data-order-id="${order.id}" data-new-status="Shipped" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700">Ship Order</button>
                    `;
                } else if (order.status === 'Shipped') {
                    actionButtons = `
                        <button data-action="update-order-status" data-order-id="${order.id}" data-new-status="Delivered" class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700">Mark Delivered</button>
                    `;
                } else {
                    actionButtons = `<span class="text-sm text-gray-500 italic">No actions available</span>`;
                }
            }

            return `
                <div class="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4 hover:shadow-md transition">
                    <div class="bg-gray-50 px-6 py-3 border-b border-gray-200 flex flex-wrap justify-between items-center gap-4">
                        <div class="flex gap-6 text-sm">
                            <div><span class="block text-gray-500 text-xs uppercase">Order Placed</span><span class="font-medium text-gray-900">${date}</span></div>
                            <div><span class="block text-gray-500 text-xs uppercase">Total</span><span class="font-medium text-gray-900">₹${order.total.toFixed(2)}</span></div>
                            <div><span class="block text-gray-500 text-xs uppercase">${type === 'placed' ? 'Seller' : 'Buyer'}</span><span class="font-medium text-gray-900">${type === 'placed' ? order.sellerStoreName : order.buyerName}</span></div>
                        </div>
                        <div class="flex items-center gap-3">
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
                        
                        <div class="flex flex-wrap gap-2 pt-4 border-t border-gray-100 justify-end">
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
            
            ${isSeller && received.length > 0 ? `
                <div class="mt-12 pt-8 border-t-4 border-dashed border-gray-200">
                    <h2 class="text-2xl font-bold text-gray-800 mb-4">Orders Received from Customers</h2>
                    ${renderOrderList(received, 'received')}
                </div>
            `: ''}
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
        appState.error = "Could not load user account. Check console for details.";
    } finally {
        appState.isLoading = false;
        renderApp();
    }
}

async function setupRealtimeListeners(uid, role) {
    appState.listeners.forEach(unsub => unsub());
    appState.listeners = [];
    
    const userQuery = doc(db, `artifacts/${appId}/public/data/users`, uid);
    appState.listeners.push(onSnapshot(userQuery, (doc) => {
        if (doc.exists()) {
            appState.currentUser = { ...appState.currentUser, ...doc.data() };
            renderAppDebounced(); 
        }
    }));

    const storesQuery = query(paths.stores());
    appState.listeners.push(onSnapshot(storesQuery, (snapshot) => {
        appState.stores = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (appState.currentView === 'marketplace') {
            loadMarketplaceItems();
        }
        renderAppDebounced(); 
    }, (e) => console.error("Error listening to stores:", e)));

    const productsQuery = query(paths.masterProducts());
    appState.listeners.push(onSnapshot(productsQuery, (snapshot) => {
        appState.masterProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAppDebounced(); 
    }, (e) => console.error("Error listening to products:", e)));

    if (role === 'customer') {
        const favQuery = query(paths.favorites(uid));
        appState.listeners.push(onSnapshot(favQuery, (snapshot) => {
            appState.favorites = snapshot.docs.map(doc => doc.id); 
            renderAppDebounced();
        }));
    }

    if (true) { 
        const cartQuery = query(paths.cart(uid));
        appState.listeners.push(onSnapshot(cartQuery, (snapshot) => {
            appState.cart = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            appState.cart.forEach(item => {
                if (!appState.deliveryOptions[item.storeId]) {
                    appState.deliveryOptions[item.storeId] = 'delivery';
                }
            });
            renderAppDebounced();
        }, (e) => console.error("Error listening to cart:", e)));
    }

    if (role === 'retailer' || role === 'wholesaler') {
        const invQuery = query(paths.inventory(uid)); 
        appState.listeners.push(onSnapshot(invQuery, (snapshot) => {
            appState.myInventory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderAppDebounced();
        }, (e) => console.error("Error listening to inventory:", e)));

        const couponsQuery = query(paths.coupons(uid));
        appState.listeners.push(onSnapshot(couponsQuery, (snapshot) => {
            appState.myCoupons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderAppDebounced();
        }, (e) => console.error("Error listening to coupons:", e)));
        
        const receivedOrdersQuery = query(paths.orders(), where("sellerStoreId", "==", uid));
        appState.listeners.push(onSnapshot(receivedOrdersQuery, (snapshot) => {
            appState.myOrders.received = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderAppDebounced();
        }, (e) => console.error("Error listening to received orders:", e)));
    }

    const placedOrdersQuery = query(paths.orders(), where("buyerId", "==", uid));
    appState.listeners.push(onSnapshot(placedOrdersQuery, (snapshot) => {
        appState.myOrders.placed = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAppDebounced();
    }, (e) => console.error("Error listening to placed orders:", e)));
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

    // Focus Restoration
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
    appState.currentView = view;
    appState.viewParams = params;
    appState.error = null; 
    if (view !== 'marketplace') {
        // appState.searchQuery = ''; 
    }

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
            case 'create-account': handleCreateAccount(); break;
            case 'toggle-auth': appState.authView = params.view; renderApp(); break;
            case 'register': handleRegister(); break;
            case 'logout': handleLogout(); break;
            case 'open-create-product-modal': openModal('Create New Product', renderCreateProductForm()); break;
            case 'create-master-product': handleCreateMasterProduct(); break;
            case 'open-add-inventory-modal': openModal('Add to My Inventory', renderAddInventoryForm()); break;
            case 'add-to-inventory': handleAddToInventory(); break;
            case 'delete-inventory-item': handleDeleteInventoryItem(params.itemId); break;
            case 'open-edit-inventory-modal': openModal('Edit Product', renderEditInventoryForm(params.itemId)); break;
            case 'update-inventory': handleUpdateInventory(); break;
            case 'open-create-coupon-modal': openModal('Create New Coupon', renderCreateCouponForm()); break;
            case 'create-coupon': handleCreateCoupon(); break;
            case 'delete-coupon': handleDeleteCoupon(params.couponId); break;
            case 'add-to-cart': handleAddToCart(params.itemId, params.storeId); break;
            case 'remove-from-cart': handleRemoveFromCart(params.cartId); break;
            case 'update-cart-quantity': handleUpdateCartQuantity(params.cartId, params.change); break;
            case 'apply-coupon': handleApplyCoupon(params.storeId); break;
            case 'remove-coupon': handleRemoveCoupon(params.storeId); break;
            case 'initiate-payment': handleInitiatePayment(params.storeId); break; 
            case 'process-payment': handleProcessPayment(); break; 
            case 'set-marketplace-tab': appState.marketplaceTab = params.tab; renderApp(); break;
            case 'open-map-modal': openMapModal(); break;
            case 'confirm-location': handleConfirmLocation(); break;
            case 'update-profile': handleUpdateProfile(); break; 
            case 'switch-payment-tab': switchPaymentTab(params.tab, e); break; 
            case 'cancel-order': handleCancelOrder(params.orderId); break; 
            case 'return-order': handleReturnOrder(params.orderId); break; 
            case 'toggle-wishlist': handleToggleWishlist(params.itemId); break; 
            case 'set-search-query': handleSearch(e.target.value); break; 
            case 'track-order': handleTrackOrder(params.orderId); break; 
            case 'update-order-status': handleUpdateOrderStatus(params.orderId, params.newStatus); break;
        }
    };
    
    document.onchange = (e) => {
        const radioEl = e.target.closest('[data-action="select-delivery"]');
        if (radioEl) {
            const storeId = radioEl.dataset.storeId;
            appState.deliveryOptions[storeId] = radioEl.value;
            renderApp(); 
            return;
        }
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
        if (e.target.name === 'role') {
            const storeNameContainer = document.getElementById('store-name-container');
            if(e.target.value === 'retailer' || e.target.value === 'wholesaler') {
                storeNameContainer.classList.remove('hidden');
                document.getElementById('storeName').required = true;
            } else {
                storeNameContainer.classList.add('hidden');
                document.getElementById('storeName').required = false;
            }
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

function handleSearch(query) {
    appState.searchQuery = query.toLowerCase();
    renderAppDebounced();
}

async function handleToggleWishlist(itemId) {
    if (!appState.currentUser) return navigateTo('auth');
    
    const isFav = appState.favorites.includes(itemId);
    try {
        if (isFav) {
            await deleteDoc(paths.favorite(appState.currentUser.uid, itemId));
            showToast("Removed from Wishlist");
        } else {
            await setDoc(paths.favorite(appState.currentUser.uid, itemId), { 
                addedAt: serverTimestamp(),
                itemId: itemId 
            });
            showToast("Added to Wishlist");
        }
    } catch (e) {
        console.error(e);
        showToast("Error updating wishlist", "error");
    }
}

// Helper to safely format date
function safeDate(timestamp) {
    if (!timestamp) return new Date();
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (timestamp instanceof Date) return timestamp;
    // Try parsing if string or number
    return new Date(timestamp);
}

function getEstimatedDate(order) {
    const createdAt = safeDate(order.createdAt);
    if (order.estimatedDeliveryDate) {
        return safeDate(order.estimatedDeliveryDate);
    }
    const daysToAdd = order.deliveryType === 'delivery' ? 3 : 1;
    const estDate = new Date(createdAt);
    estDate.setDate(estDate.getDate() + daysToAdd);
    return estDate;
}

function getTimelineSteps(order) {
    return [
        { 
            id: 'Placed', 
            label: 'Placed', 
            desc: 'Order placed successfully', 
            colorClass: 'text-blue-600',
            activeIcon: 'loader-2',
            completedIcon: 'check',
            pendingIcon: 'circle'
        },
        { 
            id: 'Confirmed', 
            label: 'Confirmed', 
            desc: 'Seller accepted order', 
            colorClass: 'text-indigo-600',
            activeIcon: 'loader-2',
            completedIcon: 'check',
            pendingIcon: 'circle'
        },
        { 
            id: 'Shipped', 
            label: order.deliveryType === 'pickup' ? 'Ready for Pickup' : 'Shipped', 
            desc: order.deliveryType === 'pickup' ? 'Waiting at store' : 'In transit', 
            colorClass: 'text-amber-600',
            activeIcon: 'truck',
            completedIcon: 'check',
            pendingIcon: 'circle'
        },
        { 
            id: 'Delivered', 
            label: 'Delivered', 
            desc: 'Package received', 
            colorClass: 'text-emerald-600',
            activeIcon: 'check-circle', 
            completedIcon: 'check',
            pendingIcon: 'circle'
        }
    ];
}

function handleTrackOrder(orderId) {
    const order = [...appState.myOrders.placed, ...appState.myOrders.received].find(o => o.id === orderId);
    if (!order) return showToast("Order details not found.", "error");
    
    const isCancelled = order.status === 'Cancelled' || order.status === 'Returned';
    const estDateObj = getEstimatedDate(order);
    const estDate = estDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    let timelineHtml = '';
    if (!isCancelled) {
        const steps = getTimelineSteps(order);
        timelineHtml = `<div class="step-container">`;
        
        steps.forEach(step => {
            const statusClass = getOrderStepStatus(order.status, step.id);
            let iconName = step.pendingIcon;
            if (statusClass === 'completed') iconName = step.completedIcon;
            else if (statusClass === 'active') iconName = step.activeIcon;

            let statusText = 'Pending';
            let statusTextColor = 'text-gray-400';
            if (statusClass === 'completed') { statusText = 'Completed'; statusTextColor = 'text-green-600'; }
            else if (statusClass === 'active') { statusText = 'In Progress'; statusTextColor = 'text-yellow-600'; } 

            let activeColorClass = 'text-gray-300';
            if (statusClass === 'completed') {
                activeColorClass = step.colorClass; 
            } else if (statusClass === 'active') {
                activeColorClass = 'text-yellow-500'; 
            }

            timelineHtml += `
                <div class="step-item ${statusClass} ${statusClass === 'pending' ? 'pending' : ''}" style="color: ${statusClass !== 'pending' ? 'var(--tw-text-opacity)' : ''}"> 
                    <div class="step-circle ${activeColorClass}">
                        <i data-lucide="${iconName}" class="h-5 w-5 ${statusClass === 'active' && iconName === 'loader-2' ? 'animate-spin' : ''}"></i>
                    </div>
                    <div class="step-content">
                        <div class="step-title ${activeColorClass}">${step.label}</div>
                        <div class="step-status ${statusTextColor}">${statusText}</div>
                    </div>
                </div>
            `;
        });
        timelineHtml += `</div>`;
    } else {
        timelineHtml = `<div class="p-6 bg-red-50 border border-red-200 rounded-xl text-center">
            <div class="text-red-600 font-bold text-lg mb-2">Order ${order.status}</div>
            <div class="text-red-400 text-sm">This order has been cancelled or returned.</div>
        </div>`;
    }

    const content = `
        <div class="space-y-6">
            <div class="bg-gradient-to-r from-teal-50 to-white p-6 rounded-xl border border-teal-100 shadow-sm flex justify-between items-center">
                <div>
                    <p class="text-xs font-bold text-teal-600 uppercase tracking-widest mb-1">Estimated Arrival</p>
                    <p class="text-2xl font-extrabold text-teal-900">${estDate}</p>
                </div>
                <div class="h-10 w-10 bg-teal-100 rounded-full flex items-center justify-center text-teal-600">
                    <i data-lucide="calendar" class="h-5 w-5"></i>
                </div>
            </div>

            <div class="py-2">
                 ${timelineHtml}
            </div>
            
            <div id="tracking-map" style="height: 200px; width: 100%; background-color: #eee;" class="w-full rounded-xl border border-gray-200 shadow-inner"></div>
            
            <div class="text-center">
                 <button onclick="closeModal()" class="text-gray-500 hover:text-gray-800 font-medium text-sm underline decoration-gray-300 underline-offset-4">Close Tracking</button>
            </div>
        </div>
    `;
    
    openModal(`Tracking #${order.id.slice(0,8)}`, content);
    
    setTimeout(() => {
        if (appState.trackMap) {
            appState.trackMap.remove();
            appState.trackMap = null;
        }

        const mapContainer = document.getElementById('tracking-map');
        if(!mapContainer) return;

        appState.trackMap = L.map('tracking-map').setView([20.5937, 78.9629], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(appState.trackMap);
        
        appState.trackMap.invalidateSize();

        const start = [28.6139, 77.2090]; 
        const end = [19.0760, 72.8777]; 
        L.marker(start).addTo(appState.trackMap).bindPopup("Seller Location");
        L.marker(end).addTo(appState.trackMap).bindPopup("Delivery Address").openPopup();
        const latlngs = [start, end];
        const polyline = L.polyline(latlngs, {color: '#0d9488', weight: 4, dashArray: '10, 10'}).addTo(appState.trackMap);
        appState.trackMap.fitBounds(polyline.getBounds(), {padding: [20, 20]});
        
        lucide.createIcons();
    }, 250);
}

function getOrderStepStatus(currentStatus, stepName) {
    const flow = ['Placed', 'Confirmed', 'Shipped', 'Delivered'];
    
    const currentIndex = flow.indexOf(currentStatus);
    const stepIndex = flow.indexOf(stepName);
    
    if (currentIndex === -1) return ''; 
    if (currentIndex > stepIndex) return 'completed';
    if (currentIndex === stepIndex) return 'active';
    return 'pending';
}

// -----------------------------------------------------------------
// PAYMENT LOGIC
// -----------------------------------------------------------------

async function handleProcessPayment() {
     const storeId = appState.pendingPaymentStoreId;
     const total = appState.pendingPaymentTotal;
     const container = document.getElementById('payment-form-container');
     const method = container.dataset.method || 'Card';

     if (method === 'UPI') {
        const upiInput = document.getElementById('upi-id-input');
        const upiId = upiInput ? upiInput.value.trim() : '';
        const failureIds = ['brct1507@okksbi', 'rithvik@axl', 'dkarth@okaxis'];
        
        if (failureIds.includes(upiId)) {
            showToast("Payment Failed: Bank server unreachable.", "error");
            return;
        }
     }

     if (method === 'Wallet') {
          const currentBalance = appState.currentUser.walletBalance || 0;
          if (currentBalance < total) { showToast("Insufficient wallet balance.", "error"); return; }
          const uid = appState.currentUser.uid;
          try { await updateDoc(paths.user(uid), { walletBalance: currentBalance - total }); } catch(err) { console.error(err); showToast("Wallet transaction failed.", "error"); return; }
     }
     container.classList.add('hidden');
     document.getElementById('payment-processing').classList.remove('hidden');
     setTimeout(async () => { await handlePlaceOrder(storeId, method); }, 2000);
}

async function handlePlaceOrder(sid, paymentMethod = 'Not Specified') {
    const items = appState.cart.filter(i => i.storeId === sid);
    const store = appState.stores.find(s => s.id === sid);
    const batch = writeBatch(db);
    let subtotal = 0, orderItems = [];
    
    const now = new Date();
    const deliveryOption = appState.deliveryOptions[sid] || 'delivery';
    const daysToAdd = deliveryOption === 'delivery' ? 3 : 1;
    const estimatedDate = new Date(now.setDate(now.getDate() + daysToAdd));

    try {
        for (const item of items) {
            const ref = paths.inventoryItem(sid, item.inventoryItemId);
            const snap = await getDoc(ref);
            if (!snap.exists() || snap.data().stock < item.quantity) throw new Error(`${item.name} out of stock.`);
            batch.update(ref, { stock: snap.data().stock - item.quantity });
            subtotal += item.price * item.quantity;
            orderItems.push({ name: item.name, productId: item.productId, quantity: item.quantity, price: item.price });
        }
        let discount = 0;
        const coupon = appState.appliedCoupons[sid];
        
        if (coupon) {
            if (coupon.applicableItemIds && coupon.applicableItemIds.length > 0) {
                const eligibleItems = items.filter(i => coupon.applicableItemIds.includes(i.inventoryItemId));
                const eligibleSubtotal = eligibleItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
                discount = coupon.type === 'percent' ? eligibleSubtotal * (coupon.value / 100) : Math.min(coupon.value, eligibleSubtotal);
            } else {
                discount = coupon.type === 'percent' ? subtotal * (coupon.value / 100) : coupon.value;
            }
            if (discount > subtotal) discount = subtotal;
        }

        const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
        const deliveryFee = deliveryOption === 'pickup' ? 0 : (totalQuantity * 20);
        
        // Initial status is always 'Placed' waiting for seller confirmation
        const status = 'Placed';
        
        batch.set(doc(paths.orders()), {
            buyerId: appState.currentUser.uid, 
            buyerName: appState.currentUser.name, 
            sellerStoreId: sid, 
            sellerStoreName: items[0].storeName,
            items: orderItems, 
            subtotal, 
            discount, 
            deliveryFee,
            total: subtotal - discount + deliveryFee, 
            status: status,
            deliveryType: deliveryOption, 
            shippingAddress: deliveryOption === 'delivery' ? appState.currentUser.address : null, 
            storeAddress: store.address || 'Not Available', 
            paymentMethod: paymentMethod, 
            createdAt: serverTimestamp(),
            estimatedDeliveryDate: estimatedDate
        });
        items.forEach(i => batch.delete(paths.cartItem(appState.currentUser.uid, i.id)));
        await batch.commit();
        delete appState.appliedCoupons[sid]; delete appState.deliveryOptions[sid];
        closeModal(); showToast("Order placed successfully! Waiting for seller confirmation.", "success"); navigateTo('ordersView');
    } catch (err) { console.error(err); showToast(err.message, "error"); closeModal(); } finally { appState.isLoading = false; renderApp(); }
}

async function handleCancelOrder(orderId) {
    const order = [...appState.myOrders.placed, ...appState.myOrders.received].find(o => o.id === orderId);
    if (!order) return;
    
    // Allow cancellation if Placed or Confirmed. Sellers can cancel anytime.
    if (!['Placed', 'Confirmed'].includes(order.status)) { showToast("Cannot cancel this order.", "error"); return; }
    
    if (!confirm("Cancel order? Refund to Wallet.")) return;
    appState.isLoading = true; renderApp();
    try {
        let refundAmount = 0;
        // Refund if payment was not COD
        if (order.paymentMethod !== 'Cash on Delivery') {
            refundAmount = order.total;
            const buyerRef = paths.user(order.buyerId);
            const buyerSnap = await getDoc(buyerRef);
            await updateDoc(buyerRef, { walletBalance: (buyerSnap.data().walletBalance || 0) + refundAmount });
        }
        await updateDoc(paths.order(orderId), { status: 'Cancelled', refundAmount, refundStatus: refundAmount > 0 ? 'Refunded to Wallet' : 'No Refund (COD)' });
        showToast(`Cancelled. ${refundAmount > 0 ? '₹' + refundAmount + ' refunded.' : ''}`, "success");
    } catch (err) { showToast("Failed.", "error"); } finally { appState.isLoading = false; renderApp(); }
}

async function handleUpdateOrderStatus(orderId, newStatus) {
    appState.isLoading = true;
    renderApp();
    try {
        await updateDoc(paths.order(orderId), { status: newStatus });
        showToast(`Order updated to ${newStatus}`, "success");
    } catch(e) {
        console.error(e);
        showToast("Failed to update status", "error");
    } finally {
        appState.isLoading = false;
        renderApp();
    }
}

function handleRegister() {
    // Fallback function, not used with new create-account logic but kept for safety
    console.warn("Deprecated handleRegister called");
}

async function handleCreateAccount() {
    // 1. Capture Form Data First
    const email = document.getElementById('register-email').value;
    const pass = document.getElementById('register-password').value;
    const name = document.getElementById('name').value;
    const addressDetails = document.getElementById('address-details').value;
    const pinnedLocation = document.getElementById('pinned-location').value;
    
    const roleEl = document.querySelector('input[name="role"]:checked');
    const role = roleEl ? roleEl.value : 'customer';
    
    let storeName = '';
    if (role !== 'customer') {
        storeName = document.getElementById('storeName').value;
    }

    // 2. Validate
    if (!email || !pass || !name || !addressDetails) {
        showToast("Please fill all fields", "error");
        return;
    }
    if (pass.length < 6) {
        showToast("Password must be at least 6 characters", "error");
        return;
    }
    if (role !== 'customer' && !storeName) {
        showToast("Store name is required for sellers", "error");
        return;
    }

    appState.isLoading = true;
    renderApp();

    try {
        // 3. Create Auth User
        const userCred = await createUserWithEmailAndPassword(auth, email, pass);
        const uid = userCred.user.uid;

        // 4. Prepare Data
        const fullAddress = `${addressDetails} [Pinned: ${pinnedLocation || 'None'}]`;
        const userData = {
            name,
            address: fullAddress,
            pinnedLocation: pinnedLocation || '',
            addressDetails: addressDetails,
            role,
            email: email,
            walletBalance: 0,
            createdAt: serverTimestamp()
        };

        if (storeName) userData.storeName = storeName;

        // 5. Write to Firestore immediately
        const batch = writeBatch(db);
        batch.set(paths.user(uid), userData);

        if (role !== 'customer') {
            const storeData = {
                storeName,
                ownerName: name,
                address: fullAddress,
                type: role, // retailer or wholesaler
                ownerId: uid,
                createdAt: serverTimestamp()
            };
            batch.set(paths.store(uid), storeData);
        }

        await batch.commit();
        
        showToast("Account created successfully! Logging in...", "success");
        // onAuthStateChanged will fire automatically and pick up the new data
    } catch (e) {
        console.error("Signup Error:", e);
        let msg = "Signup failed.";
        if (e.code === 'auth/email-already-in-use') msg = "Email already in use.";
        showToast(msg, "error");
        appState.isLoading = false;
        renderApp();
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
            let msg = "Login failed.";
            if (e.code === 'auth/invalid-credential') msg = "Invalid email or password.";
            if (e.code === 'auth/user-not-found') msg = "User not found.";
            if (e.code === 'auth/wrong-password') msg = "Invalid password.";
            showToast(msg, "error");
            appState.isLoading = false;
            renderApp();
        });
}

function handleUpdateProfile() {
    const name = document.getElementById('profile-name').value;
    const pinned = document.getElementById('profile-pinned-location').value;
    const details = document.getElementById('profile-address-details').value;
    const fullAddress = `${details} [Pinned: ${pinned || 'None'}]`;
    const storeNameInput = document.getElementById('profile-store-name');
    const backdropInput = document.getElementById('profile-backdrop');
    const storeName = storeNameInput ? storeNameInput.value : null;
    const backdropUrl = backdropInput ? backdropInput.value : null;

    if (!name || !details) { showToast("Fill required fields.", "error"); return; }
    if (storeNameInput && !storeName) { showToast("Store name required.", "error"); return; }
    appState.isLoading = true; renderApp();
    try {
        const uid = appState.currentUser.uid;
        const userUpdates = { name, address: fullAddress, pinnedLocation: pinned, addressDetails: details };
        
        if (storeName) userUpdates.storeName = storeName;
        if (backdropUrl !== null) userUpdates.backdropUrl = backdropUrl;

        updateDoc(paths.user(uid), userUpdates).then(async () => {
             if (storeName) await updateDoc(paths.store(uid), { ownerName: name, storeName, address: fullAddress, backdropUrl });
             await loadUserAccount(uid); 
             showToast("Updated!", "success");
        });
    } catch (err) { showToast("Failed.", "error"); appState.isLoading = false; renderApp(); }
}

function handleInitiatePayment(storeId) {
    const items = appState.cart.filter(i => i.storeId === storeId);
    let subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    
    const coupon = appState.appliedCoupons[storeId];
    let discount = 0;
    if (coupon) {
        if (coupon.applicableItemIds && coupon.applicableItemIds.length > 0) {
            const eligibleItems = items.filter(i => coupon.applicableItemIds.includes(i.inventoryItemId));
            const eligibleSubtotal = eligibleItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
            discount = coupon.type === 'percent' ? eligibleSubtotal * (coupon.value / 100) : Math.min(coupon.value, eligibleSubtotal);
        } else {
            discount = coupon.type === 'percent' ? subtotal * (coupon.value / 100) : coupon.value;
        }
        if (discount > subtotal) discount = subtotal;
    }

    const deliveryType = appState.deliveryOptions[storeId] || 'delivery';
    const deliveryFee = deliveryType === 'pickup' ? 0 : (totalQuantity * 20);

    const total = subtotal - discount + deliveryFee;
    const walletBalance = appState.currentUser.walletBalance || 0;
    appState.pendingPaymentStoreId = storeId;
    appState.pendingPaymentTotal = total;

    const modalContent = `<div id="payment-form-container"><div class="flex border-b border-gray-200 mb-6 overflow-x-auto"><button class="flex-1 pb-2 text-center text-gray-600 hover:text-teal-600 payment-tab active whitespace-nowrap px-2" onclick="switchPaymentTab('card', event)">Credit/Debit Card</button><button class="flex-1 pb-2 text-center text-gray-600 hover:text-teal-600 payment-tab whitespace-nowrap px-2" onclick="switchPaymentTab('upi', event)">UPI</button><button class="flex-1 pb-2 text-center text-gray-600 hover:text-teal-600 payment-tab whitespace-nowrap px-2" onclick="switchPaymentTab('wallet', event)">Wallet</button><button class="flex-1 pb-2 text-center text-gray-600 hover:text-teal-600 payment-tab whitespace-nowrap px-2" onclick="switchPaymentTab('cod', event)">Cash on Delivery</button></div><div id="tab-card" class="payment-content active"><div class="mb-4"><label class="block text-sm font-medium text-gray-700 mb-1">Card Number</label><input type="text" class="w-full px-3 py-2 border rounded-lg focus:ring-teal-500" placeholder="0000 0000 0000 0000"></div><div class="flex gap-4 mb-4"><div class="w-1/2"><label class="block text-sm font-medium text-gray-700 mb-1">Expiry</label><input type="text" class="w-full px-3 py-2 border rounded-lg focus:ring-teal-500" placeholder="MM/YY"></div><div class="w-1/2"><label class="block text-sm font-medium text-gray-700 mb-1">CVV</label><input type="password" class="w-full px-3 py-2 border rounded-lg focus:ring-teal-500" placeholder="123"></div></div><input type="hidden" id="selected-payment-method" value="Card"></div><div id="tab-upi" class="payment-content"><div class="mb-4"><label class="block text-sm font-medium text-gray-700 mb-1">UPI ID</label><input type="text" id="upi-id-input" class="w-full px-3 py-2 border rounded-lg focus:ring-teal-500" placeholder="username@upi"></div><input type="hidden" id="selected-payment-method" value="UPI" disabled> </div><div id="tab-wallet" class="payment-content"><div class="bg-teal-50 border border-teal-200 rounded-lg p-4 mb-4"><div class="flex justify-between mb-2"><p class="text-sm text-teal-800">Subtotal:</p><p class="text-sm font-bold">₹${subtotal.toFixed(2)}</p></div><div class="flex justify-between mb-2"><p class="text-sm text-teal-800">Delivery Fee:</p><p class="text-sm font-bold">₹${deliveryFee.toFixed(2)}</p></div><div class="flex justify-between mb-4 border-b pb-2"><p class="text-sm text-teal-800">Discount:</p><p class="text-sm font-bold text-green-600">-₹${discount.toFixed(2)}</p></div><div class="flex justify-between mb-4"><p class="text-lg font-bold text-teal-900">Total:</p><p class="text-lg font-bold text-teal-900">₹${total.toFixed(2)}</p></div><p class="text-sm text-gray-600 mt-2">Current Wallet Balance: <strong>₹${walletBalance.toFixed(2)}</strong></p></div>${walletBalance >= total ? `<p class="text-green-600 text-sm font-bold">✓ Sufficient balance to pay</p>` : `<p class="text-red-600 text-sm font-bold">✕ Insufficient balance. You need ₹${(total - walletBalance).toFixed(2)} more.</p>`}<input type="hidden" id="selected-payment-method" value="Wallet" disabled> </div><div id="tab-cod" class="payment-content"><div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800 text-sm"><div class="flex justify-between mb-2"><p>Subtotal:</p><p class="font-bold">₹${subtotal.toFixed(2)}</p></div><div class="flex justify-between mb-2"><p>Delivery Fee:</p><p class="font-bold">₹${deliveryFee.toFixed(2)}</p></div><div class="flex justify-between mb-2"><p>Discount:</p><p class="font-bold text-green-600">-₹${discount.toFixed(2)}</p></div><div class="border-t border-yellow-300 pt-2 mt-2 flex justify-between"><p class="font-bold text-lg">Total to Pay:</p><p class="font-bold text-lg">₹${total.toFixed(2)}</p></div><p class="mt-2 text-xs text-gray-500">You will pay in cash upon delivery.</p></div><input type="hidden" id="selected-payment-method" value="COD" disabled></div><div class="mt-6 flex justify-between items-center"><div class="text-lg font-bold text-gray-800">Total: ₹${total.toFixed(2)}</div><button id="btn-pay-now" data-action="process-payment" class="bg-teal-600 text-white font-bold py-2 px-6 rounded-lg shadow hover:bg-teal-700 transition-colors" ${walletBalance < total ? 'disabled' : ''}>Pay Now</button></div></div><div id="payment-processing" class="hidden text-center py-10"><div class="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-teal-600 mx-auto mb-4"></div><p class="text-lg font-semibold text-gray-700">Processing Payment...</p><p class="text-sm text-gray-500">Please do not refresh the page.</p></div>`;
    openModal('Secure Payment', modalContent);
    window.switchPaymentTab = (tabName, event) => {
        document.querySelectorAll('.payment-content').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.payment-tab').forEach(el => { el.classList.remove('active', 'border-b-2', 'border-teal-600', 'text-teal-600', 'font-bold'); el.classList.add('text-gray-600'); });
        document.getElementById(`tab-${tabName}`).style.display = 'block';
        const clickedTab = event.target;
        clickedTab.classList.add('active', 'border-b-2', 'border-teal-600', 'text-teal-600', 'font-bold');
        clickedTab.classList.remove('text-gray-600');
        let method = ''; if (tabName === 'card') method = 'Card'; else if (tabName === 'upi') method = 'UPI'; else if (tabName === 'wallet') method = 'Wallet'; else method = 'Cash on Delivery';
        document.getElementById('payment-form-container').dataset.method = method;
        const payBtn = document.getElementById('btn-pay-now');
        if (tabName === 'wallet') { if (walletBalance < total) { payBtn.disabled = true; payBtn.classList.add('opacity-50', 'cursor-not-allowed'); } else { payBtn.disabled = false; payBtn.classList.remove('opacity-50', 'cursor-not-allowed'); } } else { payBtn.disabled = false; payBtn.classList.remove('opacity-50', 'cursor-not-allowed'); }
    };
    document.getElementById('payment-form-container').dataset.method = 'Card';
}

function handleCreateMasterProduct() {
    // Admin only function usually
}

function renderCreateProductForm() { return `<div>Form Placeholder</div>`; }

function renderAddInventoryForm() { 
     return `
        <form id="add-inventory-form" class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700">Product Name</label>
                <input type="text" id="inv-name" class="w-full border p-2 rounded" placeholder="e.g., Organic Rice" required>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">Category</label>
                 <select id="inv-category" class="w-full border p-2 rounded">
                    <option value="Groceries">Groceries</option>
                    <option value="Electronics">Electronics</option>
                    <option value="Fashion">Fashion</option>
                    <option value="Home & Kitchen">Home & Kitchen</option>
                    <option value="Health">Health</option>
                </select>
            </div>
             <div>
                <label class="block text-sm font-medium text-gray-700">Image URL</label>
                <input type="text" id="inv-image" class="w-full border p-2 rounded" placeholder="https://example.com/image.jpg">
                <p class="text-xs text-gray-500 mt-1">Leave empty for auto-generated placeholder</p>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700">Price (₹)</label>
                    <input type="number" id="inv-price" class="w-full border p-2 rounded" required>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Stock Quantity</label>
                    <input type="number" id="inv-stock" class="w-full border p-2 rounded" required>
                </div>
            </div>
             ${appState.currentUser.role === 'wholesaler' ? `
            <div>
                <label class="block text-sm font-medium text-gray-700">Min Order Quantity</label>
                <input type="number" id="inv-moq" class="w-full border p-2 rounded" value="10">
            </div>` : ''}
            <div class="flex gap-3 pt-2">
                <button type="button" onclick="closeModal()" class="w-1/3 bg-gray-200 text-gray-800 font-bold py-2 rounded hover:bg-gray-300">Cancel</button>
                <button type="button" data-action="add-to-inventory" class="w-2/3 bg-teal-600 text-white font-bold py-2 rounded hover:bg-teal-700">Add Product</button>
            </div>
        </form>
    `;
}

function renderEditInventoryForm(itemId) {
    const item = appState.myInventory.find(i => i.id === itemId);
    if (!item) return '<div>Item not found</div>';
    appState.editingItemId = itemId;

    return `
        <form id="edit-inventory-form" class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700">Product Name</label>
                <input type="text" id="edit-inv-name" class="w-full border p-2 rounded" value="${item.name}" required>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">Category</label>
                 <select id="edit-inv-category" class="w-full border p-2 rounded">
                    ${['Groceries', 'Electronics', 'Fashion', 'Home & Kitchen', 'Health'].map(c => 
                        `<option value="${c}" ${item.category === c ? 'selected' : ''}>${c}</option>`
                    ).join('')}
                </select>
            </div>
             <div>
                <label class="block text-sm font-medium text-gray-700">Image URL</label>
                <input type="text" id="edit-inv-image" class="w-full border p-2 rounded" value="${item.imageUrl || ''}">
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700">Price (₹)</label>
                    <input type="number" id="edit-inv-price" class="w-full border p-2 rounded" value="${item.price}" required>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Stock Quantity</label>
                    <input type="number" id="edit-inv-stock" class="w-full border p-2 rounded" value="${item.stock}" required>
                </div>
            </div>
            <div class="flex gap-3 pt-2">
                <button type="button" onclick="closeModal()" class="w-1/3 bg-gray-200 text-gray-800 font-bold py-2 rounded hover:bg-gray-300">Cancel</button>
                <button type="button" data-action="update-inventory" class="w-2/3 bg-blue-600 text-white font-bold py-2 rounded hover:bg-blue-700">Update Product</button>
            </div>
        </form>
    `;
}

function renderCreateCouponForm() {
    const inventory = appState.myInventory || [];
    
    return `
        <form id="create-coupon-form" class="space-y-4">
            <div><label class="block text-sm font-medium">Coupon Code</label><input type="text" id="coupon-code" class="w-full border p-2 rounded uppercase" required></div>
            <div><label class="block text-sm font-medium">Type</label><select id="coupon-type" class="w-full border p-2 rounded"><option value="percent">Percentage (%)</option><option value="flat">Flat Amount (₹)</option></select></div>
            <div><label class="block text-sm font-medium">Value</label><input type="number" id="coupon-value" class="w-full border p-2 rounded" required></div>
            
            <div class="border-t pt-4">
                <label class="block text-sm font-medium mb-2">Applicable Products (Optional - Leave empty for all)</label>
                <div class="max-h-40 overflow-y-auto border rounded p-2 space-y-2 bg-gray-50">
                    ${inventory.length === 0 ? '<div class="text-xs text-gray-500">No inventory items found.</div>' : ''}
                    ${inventory.map(item => `
                        <label class="flex items-center space-x-2 text-sm cursor-pointer hover:bg-gray-100 p-1 rounded">
                            <input type="checkbox" name="coupon-product" value="${item.id}" class="rounded text-purple-600 focus:ring-purple-500">
                            <span>${item.name}</span>
                        </label>
                    `).join('')}
                </div>
                <p class="text-xs text-gray-500 mt-1">If no products are selected, coupon applies to entire order.</p>
            </div>

            <div class="flex gap-3 pt-2">
                <button type="button" onclick="closeModal()" class="w-1/3 bg-gray-200 text-gray-800 font-bold py-2 rounded hover:bg-gray-300">Cancel</button>
                <button type="button" data-action="create-coupon" class="w-2/3 bg-purple-600 text-white font-bold py-2 rounded">Create Coupon</button>
            </div>
        </form>
    `;
}

async function handleAddToCart(itemId, storeId) {
    console.log("Attempting to add to cart:", itemId, storeId);

    if (!appState.currentUser) { 
        showToast("Please login to add items", "error"); 
        navigateTo('auth'); 
        return; 
    }
    
    // Ensure items are loaded
    if (!appState.allMarketplaceItems || appState.allMarketplaceItems.length === 0) {
        console.warn("Marketplace items not loaded yet");
        await loadMarketplaceItems();
    }

    const product = appState.allMarketplaceItems.find(i => i.id === itemId);
    
    if (!product) {
        console.error("Product not found in local state:", itemId);
        showToast("Product details not found. Please refresh.", "error");
        return;
    }

    // MOQ Logic: Use minOrderQuantity or default to 100 for wholesalers, 1 for retailers/others
    const moq = product.storeType === 'wholesaler' ? (product.minOrderQuantity || 100) : 1;

    const existingCartItem = appState.cart.find(item => item.inventoryItemId === itemId && item.storeId === storeId);

    try {
        if (existingCartItem) {
            const newQty = existingCartItem.quantity + 1;
            if (newQty > product.stock) { showToast("Max stock reached", "error"); return; }
            await updateDoc(paths.cartItem(appState.currentUser.uid, existingCartItem.id), { quantity: newQty });
            
            openModal("Cart Updated", `
                <div class="text-center">
                    <div class="text-teal-500 mb-4 flex justify-center">
                        <i data-lucide="check-circle" class="h-16 w-16"></i>
                    </div>
                    <p class="text-lg text-gray-700 mb-6">Increased quantity of <strong>${product.name}</strong> in your cart.</p>
                    <div class="flex justify-center gap-3">
                        <button onclick="closeModal()" class="bg-gray-100 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-200 transition">Continue Shopping</button>
                        <button data-action="navigate" data-view="cartView" onclick="closeModal()" class="bg-teal-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-teal-700 transition">Go to Cart</button>
                    </div>
                </div>
            `);

        } else {
            const newItem = {
                inventoryItemId: itemId,
                productId: product.productId || 'unknown',
                name: product.name,
                price: Number(product.price),
                storeId: storeId,
                storeName: product.storeName,
                imageUrl: product.imageUrl || '',
                quantity: moq, // Set initial quantity to MOQ
                minOrderQuantity: moq, // Persist MOQ in cart item for validation
                addedAt: serverTimestamp()
            };
            await addDoc(paths.cart(appState.currentUser.uid), newItem);
            
            openModal("Added to Cart", `
                <div class="text-center">
                    <div class="text-green-500 mb-4 flex justify-center">
                        <i data-lucide="shopping-bag" class="h-16 w-16"></i>
                    </div>
                    <p class="text-lg text-gray-700 mb-6"><strong>${product.name}</strong> has been added to your cart with ${moq} units!</p>
                    <div class="flex justify-center gap-3">
                        <button onclick="closeModal()" class="bg-gray-100 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-200 transition">Continue Shopping</button>
                        <button data-action="navigate" data-view="cartView" onclick="closeModal()" class="bg-teal-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-teal-700 transition">Go to Cart</button>
                    </div>
                </div>
            `);
        }
    } catch (e) {
        console.error("Add to cart failed:", e);
        showToast("Failed to add to cart", "error");
    }
}

async function handleAddToInventory() {
    const name = document.getElementById('inv-name').value;
    const category = document.getElementById('inv-category').value;
    const imageUrl = document.getElementById('inv-image').value;
    const price = Number(document.getElementById('inv-price').value);
    const stock = Number(document.getElementById('inv-stock').value);
    const moq = document.getElementById('inv-moq') ? Number(document.getElementById('inv-moq').value) : 1;

    if(!name || !price || !stock) return showToast("Please fill required fields", "error");

    const item = {
        name,
        category,
        imageUrl: imageUrl || '',
        price,
        stock,
        minOrderQuantity: moq,
        storeId: appState.currentUser.uid,
        createdAt: serverTimestamp()
    };

    try {
        await addDoc(paths.inventory(appState.currentUser.uid), item);
        closeModal();
        showToast("Product added to inventory!");
    } catch(e) {
        console.error(e);
        showToast("Failed to add product", "error");
    }
}

async function handleUpdateInventory() {
    if (!appState.editingItemId) return;
    
    const name = document.getElementById('edit-inv-name').value;
    const category = document.getElementById('edit-inv-category').value;
    const imageUrl = document.getElementById('edit-inv-image').value;
    const price = Number(document.getElementById('edit-inv-price').value);
    const stock = Number(document.getElementById('edit-inv-stock').value);

    if(!name || !price || !stock) return showToast("Please fill required fields", "error");

    const updates = {
        name,
        category,
        imageUrl,
        price,
        stock
    };

    try {
        await updateDoc(paths.inventoryItem(appState.currentUser.uid, appState.editingItemId), updates);
        closeModal();
        appState.editingItemId = null;
        showToast("Product updated successfully!");
    } catch(e) {
        console.error(e);
        showToast("Failed to update product", "error");
    }
}

async function handleCreateCoupon() {
    const code = document.getElementById('coupon-code').value.toUpperCase();
    const type = document.getElementById('coupon-type').value;
    const value = Number(document.getElementById('coupon-value').value);
    
    const checkboxes = document.querySelectorAll('input[name="coupon-product"]:checked');
    const applicableItemIds = Array.from(checkboxes).map(cb => cb.value);

    if(!code || !value) return showToast("Invalid coupon details", "error");

    try {
        await addDoc(paths.coupons(appState.currentUser.uid), { 
            code, 
            type, 
            value, 
            storeId: appState.currentUser.uid,
            applicableItemIds
        });
        closeModal();
        showToast("Coupon created!");
    } catch(e) {
        showToast("Error creating coupon", "error");
    }
}

async function handleDeleteInventoryItem(id) {
    if(!confirm("Delete this item?")) return;
    await deleteDoc(paths.inventoryItem(appState.currentUser.uid, id));
}

async function handleDeleteCoupon(id) {
    if(!confirm("Delete this coupon?")) return;
    await deleteDoc(paths.coupon(appState.currentUser.uid, id));
}

function handleRemoveFromCart(cartId) {
    deleteDoc(paths.cartItem(appState.currentUser.uid, cartId));
}

function handleUpdateCartQuantity(cartId, change) {
    const item = appState.cart.find(c => c.id === cartId);
    if(item) {
        const moq = item.minOrderQuantity || 1;
        const newQty = item.quantity + Number(change);
        
        // Prevent decreasing below MOQ
        if (change < 0 && newQty < moq) {
            showToast(`Cannot decrease below Minimum Order Quantity (${moq})`, "error");
            return;
        }

        if(newQty > 0) updateDoc(paths.cartItem(appState.currentUser.uid, cartId), { quantity: newQty });
    }
}

async function handleApplyCoupon(storeId) {
    const codeInput = document.getElementById(`coupon-${storeId}`);
    if (!codeInput) return;
    const code = codeInput.value.toUpperCase();
    
    try {
        const q = query(paths.coupons(storeId), where("code", "==", code));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            showToast("Invalid coupon code", "error");
            return;
        }
        
        const coupon = snap.docs[0].data();
        appState.appliedCoupons[storeId] = coupon;
        showToast("Coupon applied!");
        renderApp();
    } catch (e) {
        console.error(e);
        showToast("Error checking coupon", "error");
    }
}

function handleRemoveCoupon(storeId) {
    delete appState.appliedCoupons[storeId];
    renderApp();
}

function openMapModal() {
    if (appState.map) {
        appState.map.remove();
        appState.map = null;
    }

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
                try {
                    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.latlng.lat}&lon=${e.latlng.lng}`);
                    const data = await response.json();
                    appState.selectedAddress = data.display_name;
                    const btn = document.getElementById('confirm-loc-btn');
                    if(btn) {
                        btn.disabled = false;
                        btn.textContent = "Confirm";
                    }
                } catch (err) { 
                    appState.selectedAddress = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`; 
                    const btn = document.getElementById('confirm-loc-btn');
                    if(btn) btn.disabled = false; 
                }
            });
        } catch (e) {
            console.error("Map initialization error:", e);
            mapContainer.innerHTML = `<div class="flex items-center justify-center h-full text-red-500">Map could not load. Please check internet connection.</div>`;
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

function handleLogout() {
    signOut(auth).then(() => {
        navigateTo('auth');
        showToast("Logged out successfully");
    });
}

// Initialize application
init();