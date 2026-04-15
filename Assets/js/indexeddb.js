const DB_NAME = "POS_DB";
const DB_VERSION = 3;

window.STORES = {
  CUSTOMERS: "customers",
  PRODUCTS: "products",
  BILLS: "bills",
  SUPPLIERS: "suppliers"
};

export function openPOSDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onblocked = () => {
      console.warn("Database upgrade blocked. Please close other tabs.");
    };

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORES.CUSTOMERS)) {
        db.createObjectStore(STORES.CUSTOMERS, { keyPath: "id" });
      }
      // Recreate PRODUCTS to ensure correct keyPath
      if (db.objectStoreNames.contains(STORES.PRODUCTS)) {
        db.deleteObjectStore(STORES.PRODUCTS);
      }
      db.createObjectStore(STORES.PRODUCTS, { keyPath: "barcode" });

      if (!db.objectStoreNames.contains(STORES.BILLS)) {
        db.createObjectStore(STORES.BILLS, { keyPath: "billId" });
      }
      if (!db.objectStoreNames.contains(STORES.SUPPLIERS)) {
        db.createObjectStore(STORES.SUPPLIERS, { keyPath: "id" });
      }
    };

    request.onsuccess = (e) => {
      const db = e.target.result;
      db.onversionchange = () => {
        db.close();
        console.log("Database version changed elsewhere. Closing connection.");
      };
      resolve(db);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

/* ---------- Generic helpers ---------- */

export async function saveMany(storeName, data) {
  const db = await openPOSDB();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);

  store.clear();
  data.forEach(item => {
    if (!item.id && item.barcode) item.id = item.barcode;
    store.put(item);
  });

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAll(storeName) {
  const db = await openPOSDB();
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName);

  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function reduceStock(items) {
  const db = await openPOSDB();
  const tx = db.transaction(window.STORES.PRODUCTS, "readwrite");
  const store = tx.objectStore(window.STORES.PRODUCTS);

  for (const item of items) {
    const req = store.get(item.barcode);
    req.onsuccess = () => {
      const product = req.result;
      if (product) {
        product.stock = (product.stock || 0) - item.quantity;
        store.put(product);
      }
    };
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
