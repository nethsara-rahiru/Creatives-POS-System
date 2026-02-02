/**
 * Shared theme application logic for the POS system.
 * Reads branding from localStorage and applies it to the document.
 */
function applySharedTheme() {
    const raw = localStorage.getItem("BUSINESS_TRADEMARK");
    const bi = localStorage.getItem("BUSINESS_INFO");
    if (!raw) return;

    const brand = JSON.parse(raw);
    const business = bi ? JSON.parse(bi) : {};

    const root = document.documentElement;

    // Apply colors
    if (brand.colour1) root.style.setProperty("--brand-primary", brand.colour1);
    // Backward compatibility for different variable names
    if (brand.colour1) root.style.setProperty("--primary", brand.colour1);

    if (brand.colour2) {
        root.style.setProperty("--brand-secondary", brand.colour2);
        root.style.setProperty("--secondary", brand.colour2);
    }

    // Apply mode
    if (brand.mode === "dark") {
        root.setAttribute("data-theme", "dark");
    } else {
        root.setAttribute("data-theme", "light");
    }

    // Apply Business Name
    const bizNameEl = document.getElementById("bizName") || document.getElementById("brandName");
    if (bizNameEl && (business.businessName || brand.businessName)) {
        bizNameEl.innerText = business.businessName || brand.businessName;
    }

    // Apply Logo
    const logoEl = document.getElementById("logo") || document.getElementById("brandLogo");

    // Safety check: ensure we don't accidentally target CreativesLogo 
    // or change index.html's primary identity logo if it's meant to stay static.
    if (logoEl && brand.logoLink && brand.logoLink.trim() !== "") {
        logoEl.src = brand.logoLink;
    }
}

// Auto-apply on load if the function exists in the global scope
document.addEventListener("DOMContentLoaded", applySharedTheme);
