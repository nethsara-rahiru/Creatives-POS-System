let firestore = null;

window.STORES = {
  CUSTOMERS: "customers",
  PRODUCTS: "products",
  SUPPLIERS: "suppliers",
  BILLS: "bills"
};

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("POS_DB", 3);

    request.onblocked = () => {
      console.warn("Database upgrade blocked. Please close other tabs.");
      alert("Database upgrade needed. Please close other open POS tabs to continue.");
    };

    request.onupgradeneeded = (e) => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains(window.STORES.CUSTOMERS)) {
        idb.createObjectStore(window.STORES.CUSTOMERS, { keyPath: "id" });
      }
      // Regenerate PRODUCTS to ensure correct keyPath
      if (idb.objectStoreNames.contains(window.STORES.PRODUCTS)) {
        idb.deleteObjectStore(window.STORES.PRODUCTS);
      }
      idb.createObjectStore(window.STORES.PRODUCTS, { keyPath: "barcode" });

      if (!idb.objectStoreNames.contains(window.STORES.SUPPLIERS)) {
        idb.createObjectStore(window.STORES.SUPPLIERS, { keyPath: "id" });
      }
      if (!idb.objectStoreNames.contains(window.STORES.BILLS)) {
        idb.createObjectStore(window.STORES.BILLS, { keyPath: "billId" });
      }
    };

    request.onsuccess = (e) => {
      const db = e.target.result;
      db.onversionchange = () => {
        db.close();
        console.log("Database version changed. Connection closed.");
      };
      resolve(db);
    };
    request.onerror = (e) => reject(e.error);
  });
}

async function saveMany(storeName, items) {
  try {
    const idb = await openDB();
    const tx = idb.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);

    store.clear(); // Always clear for full syncs
    items.forEach(item => {
      if (!item.id && item.barcode) item.id = item.barcode;
      store.put(item);
    });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("IndexedDB saveMany failed:", err);
  }
}

async function getAll(storeName) {
  try {
    const idb = await openDB();
    const tx = idb.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("IndexedDB getAll failed:", err);
    return [];
  }
}

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDo15HZRLlRdWr2V-OMZZd1lgqBg1cra8Y",
  authDomain: "creatives-ddbee.firebaseapp.com",
  projectId: "creatives-ddbee",
  storageBucket: "creatives-ddbee.appspot.com",
  messagingSenderId: "6661451516",
  appId: "1:6661451516:web:164d31f6473a0210cb3179"
};

// Global promise to signal when Firebase is fully ready
window.firebaseReady = (async function () {
  try {
    if (typeof firebase === 'undefined') {
      console.warn("Firebase SDK not found.");
      return false;
    }
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    if (typeof firebase.firestore !== 'function') {
      console.warn("Firestore SDK not found.");
      return false;
    }
    firestore = firebase.firestore();
    console.log("🔥 Firebase Connected");
    return true;
  } catch (err) {
    console.error("🔥 Firebase init error:", err.message);
    return false;
  }
})();

function monitorFirebasePing(callback, interval = 5000, timeout = 3000) {
  async function ping() {
    try {
      // Create a timeout promise
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);

      const res = await fetch("https://cloudflare.com/cdn-cgi/trace", {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal
      });

      clearTimeout(id);
      callback(res.ok);
    } catch {
      // Either fetch failed or aborted
      callback(false);
    }
  }

  ping(); // first immediate call
  return setInterval(ping, interval); // repeat
}

let wasOnline = false;

monitorFirebasePing(async (isOnline) => {

  console.log("🌐 Online status:", isOnline);

  // 🔥 Trigger ONLY on offline ➜ online transition
  if (isOnline && !wasOnline) {
    console.log("🟢 Connection restored. Starting sync...");
    const info = JSON.parse(localStorage.getItem("BUSINESS_INFO") || "{}");
    if (info.businessID) await syncUnsyncedBills(info.businessID);
  }

  wasOnline = isOnline;

}, 5000);


window.verifyBusiness = async function (businessID) {
  const cleanID = businessID.trim();
  console.log("🔍 Attempting to verify business:", cleanID);

  try {
    const isReady = await window.firebaseReady;
    if (!isReady || !firestore) {
      alert("❌ Firebase Connection Error: The database is not responding. Please check your internet.");
      return { ok: false, error: "Firebase not ready" };
    }

    // --- STAGE 1: Search by field "businessID" ---
    // Try as provided string
    let snapshot = await firestore.collection("business")
      .where("businessID", "==", cleanID)
      .limit(1)
      .get();

    // If not found, try as number if applicable
    if (snapshot.empty && /^\d+$/.test(cleanID)) {
      snapshot = await firestore.collection("business")
        .where("businessID", "==", Number(cleanID))
        .limit(1)
        .get();
    }

    // --- STAGE 2: FALLBACK - Search by Document ID ---
    let businessDoc = null;
    let businessData = null;

    if (!snapshot.empty) {
      businessDoc = snapshot.docs[0];
      businessData = businessDoc.data();
      console.log("✅ Found business via field search");
    } else {
      console.log("⚠️ Field search failed, trying Document ID search...");
      const docRef = firestore.collection("business").doc(cleanID);
      const docSnap = await docRef.get();

      if (docSnap.exists) {
        businessDoc = docSnap;
        businessData = docSnap.data();
        console.log("✅ Found business via Document ID");
      }
    }

    if (!businessDoc || !businessData) {
      console.warn("❌ All verification attempts failed for ID:", cleanID);
      // Helpful alert for the user to check their Firestore project console
      console.log("%cDEBUG TIP: %cEnsure your Firestore collection is named 'business' and has a document with either ID='" + cleanID + "' OR a field 'businessID'='" + cleanID + "'.", "font-weight: bold; color: yellow;", "color: white;");
      return { ok: false };
    }

    const businessDocId = businessDoc.id;

    // 🔥 Read Trademark subcollection
    const trademarkSnap = await firestore
      .collection("business")
      .doc(businessDocId)
      .collection("Trademark")
      .limit(1)
      .get();

    let trademark = null;
    if (!trademarkSnap.empty) {
      trademark = trademarkSnap.docs[0].data();
    }

    return {
      ok: true,
      data: {
        businessID: businessData.businessID || businessDocId,
        businessName: businessData.businessName || "Unnamed Business",
        category: businessData.category || "General",
        ownerUID: businessData.ownerUID,
        status: businessData.status,
        createdAt: businessData.createdAt,
        trademark: trademark
      }
    };

  } catch (err) {
    console.error("🔥 verifyBusiness Exception:", err);
    alert("❌ Verification Error: " + err.message);
    return { ok: false, error: err.message };
  }
};

// Scoped login to global users collection (Flat structure)
async function checkUserLogin(businessId, username, password) {
  try {
    await window.firebaseReady;
    if (!firestore) throw new Error("Firestore not initialized");

    console.log("🔑 Attempting login for user:", username);

    // 1️⃣ Search by username in TOP-LEVEL users collection
    const snap = await firestore
      .collection("users")
      .where("username", "==", username)
      .limit(1)
      .get();

    // No user
    if (snap.empty) {
      console.warn("❌ User not found in 'users' collection:", username);
      return { status: "NO_USER" };
    }

    // 2️⃣ Get user data
    const doc = snap.docs[0];
    const user = { uid: doc.id, ...doc.data() };

    // 3️⃣ Check password locally
    if (user.password !== password) {
      console.warn("❌ Incorrect password for user:", username);
      return { status: "WRONG_PASSWORD" };
    }

    console.log("✅ Login successful for:", username);
    return { status: "OK", user };

  } catch (err) {
    console.error("Firestore login error:", err);
    return { status: "ERROR", error: err.message };
  }
}



async function getUserPermissions(businessId, username) {
  try {
    await window.firebaseReady;
    if (!firestore) throw new Error("Firestore not initialized");

    console.log("🛡️ Fetching permissions for:", username);

    // 1️⃣ Find user in top-level collection
    const userSnap = await firestore
      .collection("users")
      .where("username", "==", username)
      .limit(1)
      .get();

    if (userSnap.empty) {
      console.warn("User not found during permission check:", username);
      return null;
    }

    const userData = userSnap.docs[0].data();

    // Check if role exists, otherwise default (common in current DB state)
    const userRole = userData.role || "cashier";
    console.log("👤 User role:", userRole);

    // 2️⃣ Find role in TOP-LEVEL collection
    const roleSnap = await firestore
      .collection("roles")
      .where("role", "==", userRole)
      .limit(1)
      .get();

    let rolePerms = [];
    if (!roleSnap.empty) {
      rolePerms = roleSnap.docs[0].data().permissions || [];
    } else {
      console.warn("⚠️ Role document not found in top-level 'roles' collection for:", userRole);
    }

    // 3️⃣ Apply overrides
    const extra = userData.extraPermissions || [];
    const denied = userData.deniedPermission || [];

    const finalPermissions = [...new Set([...rolePerms, ...extra])]
      .filter(p => !denied.includes(p));

    return { data: finalPermissions, user: { ...userData, role: userRole } };

  } catch (err) {
    console.error("Error fetching permissions:", err);
    return null;
  }
}

async function saveOnlineBill(businessID, bill) {

  //  Prepare bill data
  const billData = {
    billId: bill.billId,
    billNo: bill.billNo,
    storeId: bill.storeId,
    cashierId: bill.cashierId,
    customerId: bill.customerId || null,

    date: bill.date,
    timestamp: bill.timestamp,

    items: bill.items.map(i => ({
      itemId: i.itemId,
      barcode: i.barcode,
      name: i.name,
      unitPrice: Number(i.unitPrice),
      quantity: Number(i.quantity),
      discount: Number(i.discount || 0),
      subtotal: Number(i.subtotal)
    })),

    totalDiscount: Number(bill.totalDiscount || 0),
    total: Number(bill.total),

    paymentMethod: bill.paymentMethod,
    paidAmount: Number(bill.paidAmount),
    balance: Number(bill.balance),
    loanUpdate: Number(bill.loanUpdate || 0),

    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await window.firebaseReady;
    if (!firestore) {
      throw new Error("Firestore not initialized");
    }

    // 1️⃣ Find business document
    const businessSnap = await firestore
      .collection("business")
      .where("businessID", "==", businessID)
      .limit(1)
      .get();

    if (businessSnap.empty) {
      throw new Error("Business not found");
    }

    const businessDocId = businessSnap.docs[0].id;
    const batch = firestore.batch();

    // 2️⃣ Create bill doc
    const billRef = firestore
      .collection("business")
      .doc(businessDocId)
      .collection("bills")
      .doc(); // auto ID

    batch.set(billRef, billData);

    // 3️⃣ Atomic Stock Reduction
    for (const item of bill.items) {
      const productQuery = await firestore
        .collection("business")
        .doc(businessDocId)
        .collection("products")
        .where("barcode", "==", item.barcode)
        .limit(1)
        .get();

      if (!productQuery.empty) {
        const productRef = productQuery.docs[0].ref;
        batch.update(productRef, {
          stock: firebase.firestore.FieldValue.increment(-Number(item.quantity))
        });
      }
    }

    // 4️⃣ Atomic Customer Balance Update
    if (billData.customerId && billData.customerId !== "Walk-in Customer") {
      const customerRef = firestore
        .collection("business")
        .doc(businessDocId)
        .collection("customers")
        .doc(billData.customerId);

      let loanChange = 0;
      if (typeof billData.loanUpdate === 'number') {
        loanChange = billData.loanUpdate;
      } else if (billData.paymentMethod === "Loan") {
        loanChange = Number(billData.total || 0) - Number(billData.paidAmount || 0);
      } else if (billData.paymentMethod === "Cash") {
        loanChange = Math.max(0, Number(billData.total || 0) - Number(billData.paidAmount || 0));
      }

      if (loanChange !== 0) {
        console.log("🔥 Applying Online Balance Update:", loanChange, "for", billData.customerId);
        batch.update(customerRef, {
          balance: firebase.firestore.FieldValue.increment(loanChange)
        });
      }
    }

    // 5️⃣ Commit batch
    await batch.commit();

    const message = {
      type: "BILL_SAVED_ONLINE",
      billId: bill.billId,
      firestoreDocId: billRef.id
    };

    if (window.ReactNativeWebView && typeof ReactNativeWebView.postMessage === "function") {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    } else if (window.chrome?.webview) {
      window.chrome.webview.postMessage(message);
    }

    console.log("✅ Bill saved online & Stock reduced:", bill.billId, billRef.id);

    return {
      ok: true,
      billId: bill.billId,
      firestoreDocId: billRef.id
    };

  } catch (err) {

    // saving a bill copy in localStorage
    let unsyncedBills = JSON.parse(
      localStorage.getItem("UNSYNC_BILL") || "[]"
    );

    unsyncedBills.push(billData);

    localStorage.setItem(
      "UNSYNC_BILL",
      JSON.stringify(unsyncedBills)
    );

    console.error("❌ saveOnlineBill failed:", err);
    return { ok: false, error: err.message };
  }
}

async function syncUnsyncedBills(businessID) {

  let unsyncedBills = JSON.parse(
    localStorage.getItem("UNSYNC_BILL") || "[]"
  );

  if (unsyncedBills.length === 0) return;

  console.log("🔄 Syncing offline bills:", unsyncedBills.length);

  const remaining = [];

  for (const bill of unsyncedBills) {
    try {
      const result = await saveOnlineBill(businessID, bill);

      if (!result?.ok) {
        remaining.push(bill); // keep if failed
      }

    } catch (e) {
      remaining.push(bill); // keep on crash
    }
  }

  // ✅ Save only unsynced ones back
  localStorage.setItem(
    "UNSYNC_BILL",
    JSON.stringify(remaining)
  );

  console.log("✅ Sync finished. Remaining:", remaining.length);
}

async function saveCustomerOnline(name, contact, balance) {
  //  Prepare bill data
  const customerData = {
    name: name,
    contact: contact,
    balance: Number(balance || 0),
    assets: 0 // Initialize container debt
  };

  try {
    await window.firebaseReady;
    if (!firestore) {
      throw new Error("Firestore not initialized");
    }

    const businessInfo = JSON.parse(localStorage.getItem("BUSINESS_INFO"));
    const businessID = businessInfo?.businessID;


    // 1️⃣ Find business document
    const businessSnap = await firestore
      .collection("business")
      .where("businessID", "==", businessID)
      .limit(1)
      .get();

    if (businessSnap.empty) {
      throw new Error("Business not found");
    }

    const businessDocId = businessSnap.docs[0].id;

    // 3️⃣ Create doc reference FIRST
    const customerRef = firestore
      .collection("business")
      .doc(businessDocId)
      .collection("customers")
      .doc(); // auto ID

    // 4️⃣ Save customer
    await customerRef.set(customerData);

    return { ok: true, id: customerRef.id };

  } catch (err) {
    console.error("❌ saveCustomerOnline failed:", err);
    return { ok: false, error: err.message };
  }
}

async function updateCustomerBalanceOnline(customerId, amount) {
  try {
    await window.firebaseReady;
    if (!firestore) throw new Error("Firestore not initialized");

    const businessInfo = JSON.parse(localStorage.getItem("BUSINESS_INFO"));
    const businessID = businessInfo?.businessID;

    const businessSnap = await firestore
      .collection("business")
      .where("businessID", "==", businessID)
      .limit(1)
      .get();

    if (businessSnap.empty) throw new Error("Business not found");

    const businessDocId = businessSnap.docs[0].id;
    const customerRef = firestore
      .collection("business")
      .doc(businessDocId)
      .collection("customers")
      .doc(customerId);

    await customerRef.update({
      balance: firebase.firestore.FieldValue.increment(Number(amount))
    });

    return { ok: true };
  } catch (err) {
    console.error("❌ updateCustomerBalanceOnline failed:", err);
    return { ok: false, error: err.message };
  }
}

async function updateCustomerAssetsOnline(customerId, amount) {
  try {
    await window.firebaseReady;
    if (!firestore) throw new Error("Firestore not initialized");

    const businessInfo = JSON.parse(localStorage.getItem("BUSINESS_INFO"));
    const businessID = businessInfo?.businessID;

    const businessSnap = await firestore
      .collection("business")
      .where("businessID", "==", businessID)
      .limit(1)
      .get();

    if (businessSnap.empty) throw new Error("Business not found");

    const businessDocId = businessSnap.docs[0].id;
    const customerRef = firestore
      .collection("business")
      .doc(businessDocId)
      .collection("customers")
      .doc(customerId);

    await customerRef.update({
      assets: firebase.firestore.FieldValue.increment(Number(amount))
    });

    return { ok: true };
  } catch (err) {
    console.error("❌ updateCustomerAssetsOnline failed:", err);
    return { ok: false, error: err.message };
  }
}

async function saveProductOnline(barcode, name, icon, mrp, rp, stock = 0, productData = null) {
  // If productData is provided, use it (it contains all fields)
  // Otherwise, fallback to the basic flat arguments
  const finalProductData = productData || {
    barcode: barcode,
    name: name,
    icon: icon,
    mrp: Number(mrp || 0),
    rp: Number(rp || mrp),
    stock: Number(stock || 0)
  };

  // Ensure numeric fields are numbers in the final object
  finalProductData.mrp = Number(finalProductData.mrp || 0);
  finalProductData.rp = Number(finalProductData.rp || finalProductData.mrp);
  finalProductData.stock = Number(finalProductData.stock || 0);
  if (finalProductData.buyingPrice) finalProductData.buyingPrice = Number(finalProductData.buyingPrice);
  if (finalProductData.minStock) finalProductData.minStock = Number(finalProductData.minStock);

  try {
    await window.firebaseReady;
    if (!firestore) {
      throw new Error("Firestore not initialized");
    }

    const businessInfo = JSON.parse(localStorage.getItem("BUSINESS_INFO"));
    const businessID = businessInfo?.businessID;


    // 1️⃣ Find business document
    const businessSnap = await firestore
      .collection("business")
      .where("businessID", "==", businessID)
      .limit(1)
      .get();

    if (businessSnap.empty) {
      throw new Error("Business not found");
    }

    const businessDocId = businessSnap.docs[0].id;

    // 3️⃣ Create doc reference FIRST
    const productRef = firestore
      .collection("business")
      .doc(businessDocId)
      .collection("products")
      .doc(); // auto ID

    // 4️⃣ Save product
    await productRef.set(finalProductData);

    return { ok: true, id: productRef.id };

  } catch (err) {
    console.error("❌ saveProductOnline failed:", err);
    return { ok: false, error: err.message };
  }
}

async function loadCustomersOnline() {
  try {
    await window.firebaseReady;
    if (!firestore) throw new Error("Firestore not initialized");

    const businessInfo = JSON.parse(
      localStorage.getItem("BUSINESS_INFO")
    );
    const businessID = businessInfo?.businessID;
    if (!businessID) throw new Error("Missing businessID");

    // 1️⃣ Find business
    const businessSnap = await firestore
      .collection("business")
      .where("businessID", "==", businessID)
      .limit(1)
      .get();

    if (businessSnap.empty) throw new Error("Business not found");

    const businessDocId = businessSnap.docs[0].id;

    // 2️⃣ Fetch customers
    const customerSnap = await firestore
      .collection("business")
      .doc(businessDocId)
      .collection("customers")
      .get();

    const customers = customerSnap.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        ...d,
        assets: Number(d.assets || 0) // Ensure assets field is loaded
      };
    });

    // 3️⃣ SAVE TO INDEXEDDB ✅
    await saveMany(STORES.CUSTOMERS, customers);

    return { ok: true, data: customers };

  } catch (err) {
    console.error("❌ Customer fetch failed:", err);
    return { ok: false, error: err.message };
  }
}


async function loadProductsOnline() {
  try {
    await window.firebaseReady;
    if (!firestore) throw new Error("Firestore not initialized");

    const businessInfo = JSON.parse(localStorage.getItem("BUSINESS_INFO"));
    const businessID = businessInfo?.businessID;
    if (!businessID) throw new Error("Missing businessID");

    // 1️⃣ Find business
    const businessSnap = await firestore
      .collection("business")
      .where("businessID", "==", businessID)
      .limit(1)
      .get();

    if (businessSnap.empty) {
      throw new Error("Business not found");
    }

    const businessDocId = businessSnap.docs[0].id;

    // 2️⃣ Fetch products
    const productSnap = await firestore
      .collection("business")
      .doc(businessDocId)
      .collection("products")
      .get();

    // 3️⃣ Convert to plain JS objects
    const products = productSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // 4️⃣ Save to localStorage & IndexedDB
    localStorage.setItem(
      "PRODUCT_DATA",
      JSON.stringify(products)
    );
    await saveMany(window.STORES.PRODUCTS, products);

    return { ok: true, data: products };

  } catch (err) {
    console.error("❌ Product data fetch failed:", err);
    return { ok: false, error: err.message };
  }
}

async function saveSupplierOnline(name, contact, email, address, products) {
  const supplierData = {
    name: name,
    contact: contact,
    email: email,
    address: address,
    products: products || [],
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await window.firebaseReady;
    if (!firestore) throw new Error("Firestore not initialized");

    const businessInfo = JSON.parse(localStorage.getItem("BUSINESS_INFO"));
    const businessID = businessInfo?.businessID;
    if (!businessID) throw new Error("Missing businessID");

    const businessSnap = await firestore
      .collection("business")
      .where("businessID", "==", businessID)
      .limit(1)
      .get();

    if (businessSnap.empty) throw new Error("Business not found");

    const businessDocId = businessSnap.docs[0].id;

    const supplierRef = firestore
      .collection("business")
      .doc(businessDocId)
      .collection("suppliers")
      .doc();

    await supplierRef.set(supplierData);

    return { ok: true, id: supplierRef.id };

  } catch (err) {
    console.error("❌ saveSupplierOnline failed:", err);
    return { ok: false, error: err.message };
  }
}

async function loadSuppliersOnline() {
  try {
    await window.firebaseReady;
    if (!firestore) throw new Error("Firestore not initialized");

    const businessInfo = JSON.parse(localStorage.getItem("BUSINESS_INFO"));
    const businessID = businessInfo?.businessID;
    if (!businessID) throw new Error("Missing businessID");

    const businessSnap = await firestore
      .collection("business")
      .where("businessID", "==", businessID)
      .limit(1)
      .get();

    if (businessSnap.empty) throw new Error("Business not found");

    const businessDocId = businessSnap.docs[0].id;

    const supplierSnap = await firestore
      .collection("business")
      .doc(businessDocId)
      .collection("suppliers")
      .get();

    const suppliers = supplierSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    await saveMany(STORES.SUPPLIERS, suppliers);

    return { ok: true, data: suppliers };

  } catch (err) {
    console.error("❌ Supplier fetch failed:", err);
    return { ok: false, error: err.message };
  }
}

// ================== HOURLY CHART ==================
let chart = null;

function renderHourlyChart(hourlyTotals) {
  const ctx = document.getElementById('hourlyChart').getContext('2d');

  if (chart) chart.destroy(); // remove previous chart

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Array.from({ length: 24 }, (_, i) => i + ":00"),
      datasets: [{
        label: 'Sales (Rs)',
        data: hourlyTotals,
        backgroundColor: 'rgba(81, 156, 255, 0.7)',
        borderColor: 'rgba(81, 156, 255, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true },
        x: { ticks: { autoSkip: false } }
      }
    }
  });
}

// ================== LOAD SALES ==================
async function loadDailySales() {
  const date = document.getElementById("salesDate").value;
  const tbody = document.getElementById("salesTable");
  const totalElem = document.getElementById("grandTotal");

  await window.firebaseReady;
  if (!firestore) {
    alert("Firebase not initialized yet. Wait a moment.");
    return;
  }

  if (!date) {
    alert("Please select a date");
    return;
  }

  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;opacity:.6;">Loading...</td></tr>`;
  totalElem.innerText = "Rs 0";

  try {
    const businessInfo = JSON.parse(localStorage.getItem("BUSINESS_INFO"));
    if (!businessInfo?.businessID) throw new Error("Business info not found");

    /* 1️⃣ Get business document */
    const businessSnap = await firestore
      .collection("business")
      .where("businessID", "==", businessInfo.businessID)
      .limit(1)
      .get();

    if (businessSnap.empty) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty">Business not found</td></tr>`;
      renderHourlyChart(Array(24).fill(0));
      return;
    }

    const businessDocId = businessSnap.docs[0].id;

    /* 2️⃣ Fetch bills for selected date */
    const billsSnap = await firestore
      .collection("business")
      .doc(businessDocId)
      .collection("bills")
      .where("date", "==", date)
      .get();

    if (billsSnap.empty) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty">No sales found</td></tr>`;
      renderHourlyChart(Array(24).fill(0));
      return;
    }

    /* 3️⃣ Aggregation containers */
    const productMap = {};          // 🔥 unique products
    const hourlyTotals = Array(24).fill(0);
    let grandTotal = 0;
    let totalQty = 0;

    billsSnap.forEach(doc => {
      const bill = doc.data();
      if (!bill.items) return;

      const billHour = new Date(bill.timestamp).getHours();

      bill.items.forEach(item => {
        const key = item.itemId || item.barcode || item.name;

        if (!productMap[key]) {
          productMap[key] = {
            name: item.name,
            qty: 0,
            total: 0
          };
        }

        productMap[key].qty += Number(item.quantity);
        productMap[key].total += Number(item.subtotal);
      });
    });

    /* 4️⃣ Render grouped table */
    tbody.innerHTML = "";
    let idx = 1;

    Object.values(productMap).forEach(p => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${idx++}</td>
        <td>${p.name}</td>
        <td>${p.qty}</td>
        <td>Rs ${p.total.toLocaleString()}</td>
      `;
      tbody.appendChild(tr);
    });

    /* 5️⃣ Update summary */
    document.getElementById("totalBills").innerText = billsSnap.size;
    document.getElementById("totalQty").innerText = totalQty;
    totalElem.innerText = "Rs " + grandTotal.toLocaleString();

    /* 6️⃣ Render chart */
    renderHourlyChart(hourlyTotals);

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="4" class="empty">Error loading sales</td></tr>`;
    renderHourlyChart(Array(24).fill(0));
  }
}

window.loadAllBusinesses = async function () {
  try {
    const isReady = await window.firebaseReady;
    if (!isReady || !firestore) throw new Error("Firebase not ready");

    const snapshot = await firestore.collection("business").get();
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (err) {
    console.error("🔥 loadAllBusinesses error:", err);
    return [];
  }
};

window.saveBusiness = async function (businessData) {
  try {
    const isReady = await window.firebaseReady;
    if (!isReady || !firestore) throw new Error("Firebase not ready");

    const businessID = businessData.businessID;
    if (!businessID) throw new Error("Missing Business ID");

    // Check if business exists
    const docRef = firestore.collection("business").doc(businessID);
    await docRef.set({
      ...businessData,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { ok: true };
  } catch (err) {
    console.error("🔥 saveBusiness error:", err);
    return { ok: false, error: err.message };
  }
};

window.updateBusinessStatus = async function (businessID, status) {
  try {
    const isReady = await window.firebaseReady;
    if (!isReady || !firestore) throw new Error("Firebase not ready");

    // Attempt to find the correct document ID
    let docId = businessID;
    
    // First, try direct document fetch to see if businessID is the document ID
    const docRef = firestore.collection("business").doc(businessID);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      // If not found, search by businessID field
      const snapshot = await firestore.collection("business")
        .where("businessID", "==", businessID)
        .limit(1)
        .get();
      
      if (!snapshot.empty) {
        docId = snapshot.docs[0].id;
      }
    }

    await firestore.collection("business").doc(docId).update({
      status: status,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    return { ok: true };
  } catch (err) {
    console.error("🔥 updateBusinessStatus error:", err);
    return { ok: false, error: err.message };
  }
};

window.loadEmployeesOnline = async function () {
  try {
    const isReady = await window.firebaseReady;
    if (!isReady || !firestore) throw new Error("Firebase not ready");

    const businessInfo = JSON.parse(localStorage.getItem("BUSINESS_INFO"));
    const businessID = businessInfo?.businessID;
    if (!businessID) throw new Error("Missing businessID");

    const snapshot = await firestore.collection("users")
      .where("businessID", "==", businessID)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (err) {
    console.error("🔥 loadEmployeesOnline error:", err);
    return [];
  }
};

window.saveEmployeeOnline = async function (employeeData) {
  try {
    const isReady = await window.firebaseReady;
    if (!isReady || !firestore) throw new Error("Firebase not ready");

    const businessInfo = JSON.parse(localStorage.getItem("BUSINESS_INFO"));
    const businessID = businessInfo?.businessID;
    if (!businessID) throw new Error("Missing businessID");

    const uid = employeeData.id; // Using id instead of uid for consistency
    const data = { ...employeeData };
    delete data.id;

    if (uid) {
      await firestore.collection("users").doc(uid).update({
        ...data,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      await firestore.collection("users").add({
        ...data,
        businessID: businessID,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    return { ok: true };
  } catch (err) {
    console.error("🔥 saveEmployeeOnline error:", err);
    return { ok: false, error: err.message };
  }
};

window.getRolesOnline = async function () {
  try {
    const isReady = await window.firebaseReady;
    if (!isReady || !firestore) throw new Error("Firebase not ready");

    const snapshot = await firestore.collection("roles").get();
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (err) {
    console.error("🔥 getRolesOnline error:", err);
    return [];
  }
};

window.saveRoleOnline = async function (roleData) {
  try {
    const isReady = await window.firebaseReady;
    if (!isReady || !firestore) throw new Error("Firebase not ready");

    const id = roleData.id;
    const data = { ...roleData };
    delete data.id;

    if (id) {
      await firestore.collection("roles").doc(id).update({
        ...data,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      await firestore.collection("roles").add({
        ...data,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    return { ok: true };
  } catch (err) {
    console.error("🔥 saveRoleOnline error:", err);
    return { ok: false, error: err.message };
  }
};

window.loadAllUsersOnline = async function () {
  try {
    const isReady = await window.firebaseReady;
    if (!isReady || !firestore) throw new Error("Firebase not ready");

    const snapshot = await firestore.collection("users").get();
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (err) {
    console.error("🔥 loadAllUsersOnline error:", err);
    return [];
  }
};

window.saveSystemUserOnline = async function (userData) {
  try {
    const isReady = await window.firebaseReady;
    if (!isReady || !firestore) throw new Error("Firebase not ready");

    const uid = userData.id;
    const data = { ...userData };
    delete data.id;

    if (uid) {
      await firestore.collection("users").doc(uid).update({
        ...data,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      await firestore.collection("users").add({
        ...data,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    return { ok: true };
  } catch (err) {
    console.error("🔥 saveSystemUserOnline error:", err);
    return { ok: false, error: err.message };
  }
};
