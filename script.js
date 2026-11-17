// Pricing configuration (Base rates in INR)
const ZONE_RATES = {
  local: { name: "Zone A (Local)", base: 45, perHalfKg: 14, eta: { standard: "1–2 Days", express: "Same Day", priority: "4–6 Hours" } },
  regional: { name: "Zone B (Regional)", base: 65, perHalfKg: 22, eta: { standard: "2–3 Days", express: "1–2 Days", priority: "Next Day" } },
  metro: { name: "Zone C (Metro)", base: 90, perHalfKg: 34, eta: { standard: "4–5 Days", express: "2–3 Days", priority: "Next Day" } },
  rest: { name: "Zone D (Rest of India)", base: 115, perHalfKg: 42, eta: { standard: "5–7 Days", express: "3–4 Days", priority: "1–2 Days" } },
  intl: { name: "Zone E (International)", base: 1250, perHalfKg: 380, eta: { standard: "8–12 Days", express: "4–6 Days", priority: "2–3 Days" } }
};

const SERVICE_MULTIPLIERS = {
  standard: { label: "Standard Surface", mult: 1.0 },
  express: { label: "Express Air", mult: 1.65 },
  priority: { label: "Next-Day Priority", mult: 2.4 }
};

const PRESETS = {
  envelope: { weight: 0.4, length: 30, width: 22, height: 2 },
  small: { weight: 1.5, length: 25, width: 20, height: 15 },
  medium: { weight: 5.0, length: 45, width: 35, height: 30 },
  large: { weight: 14.0, length: 65, width: 50, height: 45 }
};

const INR_TO_USD = 0.0119; // 1 INR ≈ 0.0119 USD (~84 INR/USD)
const KG_TO_LBS = 2.20462;
const CM_TO_IN = 0.393701;

// App State
const state = {
  unit: "metric", // 'metric' | 'imperial'
  currency: "INR", // 'INR' | 'USD'
  savedQuotes: [],
  latestQuote: null
};

// DOM References
const els = {
  origin: document.getElementById("origin"),
  destination: document.getElementById("destination"),
  zone: document.getElementById("zone"),
  weight: document.getElementById("weight"),
  length: document.getElementById("length"),
  width: document.getElementById("width"),
  height: document.getElementById("height"),
  quantity: document.getElementById("quantity"),
  declaredValue: document.getElementById("declared-value"),
  addonFragile: document.getElementById("addon-fragile"),
  addonCod: document.getElementById("addon-cod"),
  addonInsurance: document.getElementById("addon-insurance"),
  addonPod: document.getElementById("addon-pod"),
  etaBadge: document.getElementById("eta-badge"),
  dispActualWt: document.getElementById("disp-actual-wt"),
  dispVolWt: document.getElementById("disp-vol-wt"),
  dispChargeableWt: document.getElementById("disp-chargeable-wt"),
  volumetricNote: document.getElementById("volumetric-note"),
  totalPrice: document.getElementById("total-price"),
  routeSummary: document.getElementById("route-summary"),
  deliveryPill: document.getElementById("delivery-pill"),
  billWtSummary: document.getElementById("bill-wt-summary"),
  costBase: document.getElementById("cost-base"),
  costFuel: document.getElementById("cost-fuel"),
  costAddons: document.getElementById("cost-addons"),
  costTax: document.getElementById("cost-tax"),
  toastMsg: document.getElementById("toast-msg"),
  savedCount: document.getElementById("saved-count"),
  savedQuotesBody: document.getElementById("saved-quotes-body")
};

// Helpers
function formatMoney(amountInINR) {
  const isUSD = state.currency === "USD";
  const val = isUSD ? amountInINR * INR_TO_USD : amountInINR;
  return new Intl.NumberFormat(isUSD ? "en-US" : "en-IN", {
    style: "currency",
    currency: state.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val);
}

function getSelectedService() {
  const checked = document.querySelector('input[name="service"]:checked');
  return checked ? checked.value : "express";
}

function showToast(msg) {
  els.toastMsg.textContent = msg;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    els.toastMsg.textContent = "";
  }, 3000);
}

// Core Calculation Engine
function calculateShipping() {
  const rawWeight = Math.max(0.1, parseFloat(els.weight.value) || 0.1);
  const rawL = Math.max(1, parseFloat(els.length.value) || 1);
  const rawW = Math.max(1, parseFloat(els.width.value) || 1);
  const rawH = Math.max(1, parseFloat(els.height.value) || 1);
  const qty = Math.max(1, parseInt(els.quantity.value, 10) || 1);
  const declaredVal = Math.max(0, parseFloat(els.declaredValue.value) || 0);

  // Convert inputs to metric (kg & cm) for standardized courier billing
  const actualKg = state.unit === "imperial" ? rawWeight / KG_TO_LBS : rawWeight;
  const lengthCm = state.unit === "imperial" ? rawL / CM_TO_IN : rawL;
  const widthCm = state.unit === "imperial" ? rawW / CM_TO_IN : rawW;
  const heightCm = state.unit === "imperial" ? rawH / CM_TO_IN : rawH;

  // Volumetric weight (L x W x H / 5000)
  const volKg = (lengthCm * widthCm * heightCm) / 5000;
  const maxPerBoxKg = Math.max(actualKg, volKg);

  // Round up to nearest 0.5 kg courier slab
  const billedSlabKg = Math.ceil(maxPerBoxKg * 2) / 2;

  // Zone & Service math
  const zoneKey = els.zone.value;
  const serviceKey = getSelectedService();
  const zoneData = ZONE_RATES[zoneKey];
  const serviceData = SERVICE_MULTIPLIERS[serviceKey];

  const extraSlabs = Math.max(0, (billedSlabKg - 0.5) / 0.5);
  const singleBoxBase = (zoneData.base + extraSlabs * zoneData.perHalfKg) * serviceData.mult;
  const baseFreightINR = singleBoxBase * qty;

  // Fuel surcharge (12%)
  const fuelINR = baseFreightINR * 0.12;

  // Add-ons calculation (in INR)
  let addonsINR = 0;
  const activeAddons = [];

  if (els.addonFragile.checked) {
    addonsINR += 60 * qty;
    activeAddons.push("Fragile");
  }
  if (els.addonCod.checked) {
    addonsINR += Math.max(50, declaredVal * 0.02);
    activeAddons.push("COD");
  }
  if (els.addonInsurance.checked) {
    addonsINR += declaredVal * 0.015;
    activeAddons.push("Insured");
  }
  if (els.addonPod.checked) {
    addonsINR += 35 * qty;
    activeAddons.push("OTP/POD");
  }

  const subTotalINR = baseFreightINR + fuelINR + addonsINR;
  const gstINR = subTotalINR * 0.18;
  const grandTotalINR = subTotalINR + gstINR;
  const eta = zoneData.eta[serviceKey];

  // Update Weight Telemetry UI
  const displayFactor = state.unit === "imperial" ? KG_TO_LBS : 1;
  const unitLabel = state.unit === "imperial" ? "lbs" : "kg";

  els.dispActualWt.textContent = `${(actualKg * displayFactor).toFixed(2)} ${unitLabel}`;
  els.dispVolWt.textContent = `${(volKg * displayFactor).toFixed(2)} ${unitLabel}`;
  els.dispChargeableWt.textContent = `${(billedSlabKg * displayFactor).toFixed(2)} ${unitLabel}`;

  els.volumetricNote.textContent =
    volKg > actualKg
      ? `Volumetric weight exceeds actual weight (L × W × H ÷ 5000) and is used for billing.`
      : `Actual weight is higher than volumetric weight and is used for billing.`;

  // Update Summary Card UI
  els.etaBadge.textContent = `ETA: ${eta}`;
  els.deliveryPill.textContent = eta;
  els.totalPrice.textContent = formatMoney(grandTotalINR);

  const originText = els.origin.value.trim() || "Origin";
  const destText = els.destination.value.trim() || "Destination";
  els.routeSummary.textContent = `${originText} → ${destText} • ${qty} ${qty > 1 ? "Boxes" : "Box"}`;
  els.billWtSummary.textContent = `${(billedSlabKg * displayFactor).toFixed(2)} ${unitLabel} × ${qty}`;

  els.costBase.textContent = formatMoney(baseFreightINR);
  els.costFuel.textContent = formatMoney(fuelINR);
  els.costAddons.textContent = formatMoney(addonsINR);
  els.costTax.textContent = formatMoney(gstINR);

  // Store latest quote snapshot
  state.latestQuote = {
    id: Date.now(),
    route: `${originText} → ${destText}`,
    zoneService: `${zoneData.name} • ${serviceData.label}`,
    billedWeight: `${(billedSlabKg * qty * displayFactor).toFixed(2)} ${unitLabel} (${qty} box)`,
    addons: activeAddons.length ? activeAddons.join(", ") : "None",
    eta,
    totalINR: grandTotalINR
  };
}

// Unit System Switcher (Metric <-> Imperial)
function switchUnit(newUnit) {
  if (state.unit === newUnit) return;
  const toImperial = newUnit === "imperial";

  const w = parseFloat(els.weight.value) || 0;
  const l = parseFloat(els.length.value) || 0;
  const wi = parseFloat(els.width.value) || 0;
  const h = parseFloat(els.height.value) || 0;

  els.weight.value = (toImperial ? w * KG_TO_LBS : w / KG_TO_LBS).toFixed(2);
  els.length.value = (toImperial ? l * CM_TO_IN : l / CM_TO_IN).toFixed(1);
  els.width.value = (toImperial ? wi * CM_TO_IN : wi / CM_TO_IN).toFixed(1);
  els.height.value = (toImperial ? h * CM_TO_IN : h / CM_TO_IN).toFixed(1);

  document.querySelectorAll(".unit-weight").forEach(el => (el.textContent = toImperial ? "lbs" : "kg"));
  document.querySelectorAll(".unit-dim").forEach(el => (el.textContent = toImperial ? "in" : "cm"));

  state.unit = newUnit;
  calculateShipping();
}

// Currency Switcher (INR <-> USD)
function switchCurrency(newCurrency) {
  if (state.currency === newCurrency) return;
  state.currency = newCurrency;
  document.querySelectorAll(".curr-symbol").forEach(el => (el.textContent = newCurrency === "USD" ? "$" : "₹"));
  calculateShipping();
  renderSavedQuotes();
}

// Saved Quotes Table Rendering
function renderSavedQuotes() {
  els.savedCount.textContent = state.savedQuotes.length;

  if (state.savedQuotes.length === 0) {
    els.savedQuotesBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">No quotes saved yet. Click <strong>"+ Save to Compare"</strong> to benchmark options.</td>
      </tr>
    `;
    return;
  }

  els.savedQuotesBody.innerHTML = state.savedQuotes
    .map(
      q => `
      <tr>
        <td><strong>${q.route}</strong></td>
        <td>${q.zoneService}</td>
        <td>${q.billedWeight}</td>
        <td>${q.addons}</td>
        <td>${q.eta}</td>
        <td><strong>${formatMoney(q.totalINR)}</strong></td>
        <td><button type="button" class="delete-btn" data-id="${q.id}">Remove</button></td>
      </tr>
    `
    )
    .join("");
}

// Event Listeners
document.querySelectorAll("input, select").forEach(input => {
  input.addEventListener("input", calculateShipping);
  input.addEventListener("change", calculateShipping);
});

// Service card active visual state
document.querySelectorAll('input[name="service"]').forEach(radio => {
  radio.addEventListener("change", () => {
    document.querySelectorAll(".service-card").forEach(card => card.classList.remove("active"));
    radio.closest(".service-card").classList.add("active");
    calculateShipping();
  });
});

// Unit & Currency Toggle Buttons
document.querySelectorAll("[data-unit]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-unit]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    switchUnit(btn.dataset.unit);
  });
});

document.querySelectorAll("[data-currency]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-currency]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    switchCurrency(btn.dataset.currency);
  });
});

// Box Presets
document.querySelectorAll(".preset-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const p = PRESETS[chip.dataset.preset];
    if (!p) return;

    const wFactor = state.unit === "imperial" ? KG_TO_LBS : 1;
    const dFactor = state.unit === "imperial" ? CM_TO_IN : 1;

    els.weight.value = (p.weight * wFactor).toFixed(2);
    els.length.value = (p.length * dFactor).toFixed(1);
    els.width.value = (p.width * dFactor).toFixed(1);
    els.height.value = (p.height * dFactor).toFixed(1);
    calculateShipping();
    showToast(`Applied ${chip.textContent.trim()} preset.`);
  });
});

// Save Quote
document.getElementById("save-quote-btn").addEventListener("click", () => {
  if (!state.latestQuote) return;
  state.savedQuotes.unshift({ ...state.latestQuote, id: Date.now() });
  renderSavedQuotes();
  showToast("Quote saved to comparison table!");
});

// Copy Quote to Clipboard
document.getElementById("copy-quote-btn").addEventListener("click", async () => {
  if (!state.latestQuote) return;
  const q = state.latestQuote;
  const summary = [
    `AKR_Shipping Quote`,
    `Route: ${q.route}`,
    `Service: ${q.zoneService}`,
    `Billed Weight: ${q.billedWeight}`,
    `Add-ons: ${q.addons}`,
    `Estimated Delivery: ${q.eta}`,
    `Total Freight (incl. GST): ${formatMoney(q.totalINR)}`
  ].join("\n");

  try {
    await navigator.clipboard.writeText(summary);
    showToast("Formatted quote copied to clipboard!");
  } catch {
    showToast("Unable to access clipboard.");
  }
});

// Delete Single Saved Quote
els.savedQuotesBody.addEventListener("click", e => {
  if (e.target.classList.contains("delete-btn")) {
    const id = Number(e.target.dataset.id);
    state.savedQuotes = state.savedQuotes.filter(q => q.id !== id);
    renderSavedQuotes();
  }
});

// Clear All Saved Quotes
document.getElementById("clear-quotes-btn").addEventListener("click", () => {
  state.savedQuotes = [];
  renderSavedQuotes();
});

// Reset Form
document.getElementById("reset-btn").addEventListener("click", () => {
  els.origin.value = "Mumbai — 400001";
  els.destination.value = "Bengaluru — 560001";
  els.zone.value = "metro";
  els.quantity.value = 1;
  els.declaredValue.value = 5000;
  els.addonFragile.checked = false;
  els.addonCod.checked = false;
  els.addonInsurance.checked = true;
  els.addonPod.checked = false;

  document.querySelector('input[name="service"][value="express"]').checked = true;
  document.querySelectorAll(".service-card").forEach(c => c.classList.remove("active"));
  document.querySelector('input[name="service"][value="express"]').closest(".service-card").classList.add("active");

  if (state.unit === "imperial") {
    document.querySelector('[data-unit="metric"]').click();
  }
  els.weight.value = 2.5;
  els.length.value = 35;
  els.width.value = 25;
  els.height.value = 20;

  calculateShipping();
  showToast("Calculator reset to defaults.");
});

// Initial Run
calculateShipping();