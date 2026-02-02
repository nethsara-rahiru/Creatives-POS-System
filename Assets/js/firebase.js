let firestore = null;
var u;

const STORES = {
  CUSTOMERS: "customers",
  PRODUCTS: "products"
};

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("POS_DB", 1);
    request.onupgradeneeded = (e) => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains(STORES.CUSTOMERS)) {
        idb.createObjectStore(STORES.CUSTOMERS, { keyPath: "id" });
      }
      if (!idb.objectStoreNames.contains(STORES.PRODUCTS)) {
        idb.createObjectStore(STORES.PRODUCTS, { keyPath: "id" });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.error);
  });
}

async function saveMany(storeName, items) {
  try {
    const idb = await openDB();
    const tx = idb.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    items.forEach(item => {
      // Ensure every item has an ID
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
      throw new Error("Firebase SDK (firebase-app.js) is not loaded. Please check your HTML script tags.");
    }
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    firestore = firebase.firestore();
    console.log("🔥 Firebase Connected");
    return true;
  } catch (err) {
    console.error("🔥 Firebase connection failed:", err.message);
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
  try {
    await window.firebaseReady;
    if (!firestore) throw new Error("Firestore not initialized");

    // 🔍 Find the business
    const snapshot = await firestore.collection("business")
      .where("businessID", "==", businessID)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return { ok: false };
    }

    const doc = snapshot.docs[0];
    const businessData = doc.data();
    const businessDocId = doc.id;

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

    // 🧠 Combine everything
    return {
      ok: true,
      data: {
        businessID: businessData.businessID,
        businessName: businessData.businessName,
        category: businessData.category,
        ownerUID: businessData.ownerUID,
        status: businessData.status,
        createdAt: businessData.createdAt,
        trademark: trademark   // {colour1, colour2, logoLink, mode}
      }
    };

  } catch (err) {
    console.error(err);
    return { ok: false, error: err.message };
  }
};

// need to be updated
async function checkUserLogin(username, password) {
  try {
    await window.firebaseReady;
    if (!firestore) throw new Error("Firestore not initialized");

    // 1️⃣ Search by username ONLY
    const snap = await firestore
      .collection("users")
      .where("username", "==", username)
      .limit(1)
      .get();

    // No user
    if (snap.empty) {
      return { status: "NO_USER" };
    }

    // 2️⃣ Get user data
    const doc = snap.docs[0];
    const user = { uid: doc.id, ...doc.data() };

    // 3️⃣ Check password locally
    if (user.password !== password) {
      return { status: "WRONG_PASSWORD" };
    }

    // 4️⃣ Login OK
    //alert(user.username + ", " + user.fName + ", " + user.lName);
    return { status: "OK", user };

  } catch (err) {
    console.error("Firestore error:", err);
    alert("Error checking login: " + err.message);
    return { status: "ERROR", error: err.message };
  }
}



async function getUserPermissions(businessId, username) {
  try {
    await window.firebaseReady;
    if (!firestore) throw new Error("Firestore not initialized");

    // 1️⃣ Find business
    const businessSnap = await firestore
      .collection("business")
      .where("businessID", "==", businessId)
      .limit(1)
      .get();

    //alert("🅲 Business query result size = " + businessSnap.size);

    if (businessSnap.empty) {
      alert("❌ No business found with businessID = " + businessId);
      return null;
    }

    const businessDoc = businessSnap.docs[0];
    const businessDocId = businessDoc.id;

    //alert("🅳 Business found\nFirestore ID = " + businessDocId);

    // 2️⃣ Find user in this business
    //alert("🅴 Searching user inside business...");
    const userSnap = await firestore
      .collection("business")
      .doc(businessDocId)
      .collection("users")
      .where("username", "==", username)
      .limit(1)
      .get();

    //alert("🅵 User query result size = " + userSnap.size);

    if (userSnap.empty) {
      alert("❌ User NOT found in this business");
      return null;
    }

    u = userSnap.docs[0].data();
    /*
    alert("🅶 User found\nRole = " + u.role +
          "\nExtra = " + JSON.stringify(u.extraPermissions) +
          "\nDenied = " + JSON.stringify(u.deniedPermission));
    */
    // 3️⃣ Find role
    //alert("🅷 Searching role: " + u.role);
    const roleSnap = await firestore
      .collection("business")
      .doc(businessDocId)
      .collection("roles")
      .where("role", "==", u.role)
      .limit(1)
      .get();

    //alert("🅸 Role query result size = " + roleSnap.size);

    let rolePerms = [];

    if (!roleSnap.empty) {
      rolePerms = roleSnap.docs[0].data().permissions || [];
      //alert("🅹 Role permissions = " + JSON.stringify(rolePerms));
    } else {
      alert("⚠️ Role document NOT found");
    }

    // 4️⃣ Apply overrides
    const extra = u.extraPermissions || [];
    const denied = u.deniedPermission || [];   // ← FIXED

    //alert("🅻 Extra = " + JSON.stringify(extra));
    //alert("🅼 Denied = " + JSON.stringify(denied));

    const final = [...new Set([...rolePerms, ...extra])]
      .filter(p => !denied.includes(p));

    //alert("🅺 FINAL permissions = " + JSON.stringify(final));

    return { data: final, user: u };

  } catch (err) {
    alert("🔥 ERROR: " + err.message);
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

    // 3️⃣ Create doc reference FIRST
    const billRef = firestore
      .collection("business")
      .doc(businessDocId)
      .collection("bills")
      .doc(); // auto ID

    // 4️⃣ Save bill
    await billRef.set(billData);

    // 5️⃣ Send result to C#
    if (window.chrome?.webview) {
      window.chrome.webview.postMessage({
        type: "BILL_SAVED_ONLINE",
        billId: bill.billId,
        firestoreDocId: billRef.id
      });
    }

    console.log("✅ Bill saved online:", bill.billId, billRef.id);

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
    balance: Number(balance || 0)
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

    // 4️⃣ Save bill
    await customerRef.set(customerData);

    return { ok: true, id: customerRef.id };

  } catch (err) {
    console.error("❌ saveCustomerOnline failed:", err);
    return { ok: false, error: err.message };
  }
}

async function saveProductOnline(barcode, name, icon, mrp, rp, stock = 0) {
  //  Prepare bill data
  const productData = {
    barcode: barcode,
    name: name,
    icon: icon,
    mrp: Number(mrp || 0),
    rp: Number(rp || 0),
    stock: Number(stock || 0)
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
    const productRef = firestore
      .collection("business")
      .doc(businessDocId)
      .collection("products")
      .doc(); // auto ID

    // 4️⃣ Save bill
    await productRef.set(productData);

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

    const customers = customerSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

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

    // 4️⃣ Save to localStorage
    localStorage.setItem(
      "PRODUCT_DATA",
      JSON.stringify(products)
    );

    return { ok: true, data: products };

  } catch (err) {
    console.error("❌ Customer data fetch failed:", err);
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

        totalQty += Number(item.quantity);
        grandTotal += Number(item.subtotal);
        hourlyTotals[billHour] += Number(item.subtotal);
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
