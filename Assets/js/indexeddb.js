const DB_NAME = "POS_DB";
const DB_VERSION = 1;

window.STORES = {
  CUSTOMERS: "customers",
  PRODUCTS: "products",
  BILLS: "bills"
};

export function openPOSDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = e => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains(STORES.CUSTOMERS)) {
        db.createObjectStore(STORES.CUSTOMERS, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORES.PRODUCTS)) {
        db.createObjectStore(STORES.PRODUCTS, { keyPath: "barcode" });
      }

      if (!db.objectStoreNames.contains(STORES.BILLS)) {
        db.createObjectStore(STORES.BILLS, { keyPath: "billId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* ---------- Generic helpers ---------- */

export async function saveMany(storeName, data) {
  const db = await openPOSDB();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);

  store.clear();
  data.forEach(item => store.put(item));

  return tx.complete;
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
