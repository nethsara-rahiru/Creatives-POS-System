window.generateGradientSecondary = function(primaryHex, mode) {
    if (!primaryHex || typeof primaryHex !== 'string' || !primaryHex.startsWith('#')) return primaryHex;
    let r = 0, g = 0, b = 0;
    if (primaryHex.length === 4) {
        r = parseInt(primaryHex[1] + primaryHex[1], 16);
        g = parseInt(primaryHex[2] + primaryHex[2], 16);
        b = parseInt(primaryHex[3] + primaryHex[3], 16);
    } else if (primaryHex.length >= 7) {
        r = parseInt(primaryHex.slice(1, 3), 16);
        g = parseInt(primaryHex.slice(3, 5), 16);
        b = parseInt(primaryHex.slice(5, 7), 16);
    } else return primaryHex;
    r /= 255; g /= 255; b /= 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; } else {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        } h /= 6;
    }
    h = (h + 30/360) % 1;
    if (mode === 'dark') { l = Math.max(0.1, l - 0.2); s = Math.min(1, s + 0.1); }
    else { l = Math.min(0.9, l + 0.2); s = Math.max(0.2, s - 0.1); }
    let r1, g1, b1;
    if (s === 0) { r1 = g1 = b1 = l; } else {
        const h2r = (p, q, t) => {
            if (t < 0) t += 1; if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p;
        };
        let q = l < 0.5 ? l * (1+s) : l+s - l*s; let p = 2*l - q;
        r1 = h2r(p,q,h+1/3); g1 = h2r(p,q,h); b1 = h2r(p,q,h-1/3);
    }
    const th = x => { const hex=Math.round(x*255).toString(16); return hex.length===1 ? '0'+hex : hex; };
    return `#${th(r1)}${th(g1)}${th(b1)}`;
};

/**
 * Shared theme application logic for the POS system.
 * Reads branding from localStorage and applies it to the document.
 */
function applySharedTheme() {
    const raw = localStorage.getItem("BUSINESS_TRADEMARK");
    const bi = localStorage.getItem("BUSINESS_INFO");
    
    const brand = raw ? JSON.parse(raw) : {};
    const business = bi ? JSON.parse(bi) : {};

    const root = document.documentElement;

    // Apply colors
    if (brand.colour1) {
        root.style.setProperty("--brand-primary", brand.colour1);
        root.style.setProperty("--primary", brand.colour1);
    }

    const generatedFallback = brand.colour1 ? window.generateGradientSecondary(brand.colour1, brand.mode) : null;
    const secondaryColor = brand.colour2 || generatedFallback;
    if (secondaryColor) {
        root.style.setProperty("--brand-secondary", secondaryColor);
        root.style.setProperty("--secondary", secondaryColor);
    }

    // Apply mode
    if (brand.mode === "dark") {
        root.setAttribute("data-theme", "dark");
    } else {
        root.setAttribute("data-theme", "light");
    }

    // Apply Business Name and Logo Visibility to all instances
    const nameElements = document.querySelectorAll("#bizName, #brandName, .brand-name");
    const logoElements = document.querySelectorAll("#logo, #brandLogo, .brand-logo");

    const hasLogo = brand.logoLink && brand.logoLink.trim() !== "";

    logoElements.forEach(el => {
        if (hasLogo) {
            el.src = brand.logoLink;
            el.style.display = "block";
        } else {
            el.style.display = "none";
        }
    });

    nameElements.forEach(el => {
        if (hasLogo) {
            el.style.display = "none";
        } else {
            el.style.display = "block";
            el.innerText = business.businessName || brand.businessName || "Creatives POS";
        }
    });
}

// Auto-apply on load if the function exists in the global scope
document.addEventListener("DOMContentLoaded", applySharedTheme);
