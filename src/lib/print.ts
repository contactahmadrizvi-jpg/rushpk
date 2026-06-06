import type { Order, OrderItem } from "@/types";
import { formatCurrency, parseDate } from "@/lib/utils";
import { RESTAURANT } from "@/constants";
import { getSettings } from "@/services/settings.service";

export type PrintHeader = {
  name: string;
  location: string;
  phone: string;
  email?: string;
  logoUrl?: string;
};

let cachedHeader: PrintHeader | null = null;
let printChain: Promise<void> = Promise.resolve();
let isPrinting = false;

function formatOrderLabel(order: Order): string {
  const n = order.dailyOrderNumber ?? order.orderNumber;
  return `#${n}`;
}

function formatReceiptDateTime(iso: string): string {
  const d = parseDate(iso);
  if (!d) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function orderTypeLabel(type: Order["type"]): string {
  if (type === "dine_in") return "DINE IN";
  if (type === "takeaway") return "TAKEAWAY";
  if (type === "delivery") return "DELIVERY";
  return "ONLINE";
}

export async function preloadPrintHeader(): Promise<PrintHeader> {
  if (cachedHeader) return cachedHeader;
  cachedHeader = await resolvePrintHeader();
  return cachedHeader;
}

async function resolvePrintHeader(): Promise<PrintHeader> {
  try {
    const settings = await getSettings();
    if (settings) {
      return {
        name: (settings.printerSettings?.restaurantName ?? settings.name).toUpperCase(),
        location: RESTAURANT.location.toUpperCase(),
        phone: settings.phone,
        email: settings.email,
        logoUrl: settings.logoUrl,
      };
    }
  } catch {
    /* defaults */
  }
  return {
    name: RESTAURANT.name.toUpperCase(),
    location: RESTAURANT.location.toUpperCase(),
    phone: RESTAURANT.phone,
    email: RESTAURANT.email,
  };
}

/** One print dialog: receipt + KOT (page break). No duplicate popups. */
export async function printPosDocuments(order: Order, header?: PrintHeader): Promise<void> {
  const h = header ?? (await preloadPrintHeader());
  const html = `${buildReceiptHTML(order, h)}<div style="page-break-before:always"></div>${buildKOTBody(order)}`;
  await enqueuePrint(wrapPrintDocument(html, `Order ${formatOrderLabel(order)}`));
}

export async function printReceipt(order: Order, header?: PrintHeader): Promise<void> {
  const h = header ?? (await preloadPrintHeader());
  await enqueuePrint(wrapPrintDocument(buildReceiptHTML(order, h), `Receipt ${formatOrderLabel(order)}`));
}

export async function printKOT(order: Order): Promise<void> {
  await enqueuePrint(wrapPrintDocument(buildKOTBody(order), `KOT ${formatOrderLabel(order)}`));
}

function enqueuePrint(html: string): Promise<void> {
  // Prevent queuing a new print while one is in progress
  if (isPrinting) return Promise.resolve();
  const job = printChain.then(() => printHtmlOnce(html));
  printChain = job.catch(() => undefined);
  return job;
}

function printHtmlOnce(html: string): Promise<void> {
  if (isPrinting) return Promise.resolve();
  isPrinting = true;

  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    // Give iframe a real 58mm width (≈220px at 96dpi) so the browser renders
    // at the correct thermal-paper width. Zero width causes the browser to
    // fall back to screen width then print a huge blank A4-height page.
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:58mm;height:1px;border:0;opacity:0;pointer-events:none;";
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const doc = win?.document;
    if (!doc || !win) {
      isPrinting = false;
      iframe.remove();
      resolve();
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    // Guard: runPrint must only execute once even if both the
    // readyState===complete branch AND iframe.onload fire.
    let hasPrinted = false;
    const done = () => {
      isPrinting = false;
      setTimeout(() => iframe.remove(), 500);
      resolve();
    };

    const runPrint = () => {
      if (hasPrinted) return;
      hasPrinted = true;
      // Remove onload handler to prevent any late fires
      iframe.onload = null;
      try {
        win.focus();
        win.print();
      } finally {
        done();
      }
    };

    if (doc.readyState === "complete") {
      runPrint();
    } else {
      iframe.onload = runPrint;
    }
  });
}

function wrapPrintDocument(body: string, title: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
@page { size: 58mm auto; margin: 0mm; }
* { box-sizing: border-box; }
html, body { height: auto !important; overflow: visible !important; margin: 0; padding: 0; background: #fff; }
@media print {
  html, body { margin: 0; padding: 0; }
}
</style></head><body>${body}</body></html>`;
}

function itemExtras(item: OrderItem): string {
  const c = item.customization;
  if (!c) return "";
  const parts: string[] = [];
  if (c.variantName) parts.push(c.variantName);
  if (c.addonNames?.length) parts.push(c.addonNames.join(", "));
  if (c.extraCheese) parts.push("Extra cheese");
  if (c.spiceLevel) parts.push(c.spiceLevel);
  if (c.notes) parts.push(c.notes);
  return `<div class="item-note">${escapeHtml(parts.join(" · "))}</div>`;
}

function buildReceiptHTML(order: Order, header: PrintHeader): string {
  const label = formatOrderLabel(order);
  const dt = formatReceiptDateTime(order.createdAt);
  const tableLine =
    order.tableNumber != null
      ? `<table class="w-table"><tr><td>TABLE</td><td class="text-right">${order.tableNumber}</td></tr></table>`
      : `<table class="w-table"><tr><td>TYPE</td><td class="text-right">${orderTypeLabel(order.type)}</td></tr></table>`;

  const itemRows = order.items
    .map(
      (i) => `
    <table class="w-table item-table">
      <tr>
        <td class="item-name">${i.quantity}X ${escapeHtml(i.name.toUpperCase())}</td>
        <td class="item-price text-right">${formatCurrency(i.subtotal)}</td>
      </tr>
    </table>${itemExtras(i)}`
    )
    .join("");

  const addr = order.deliveryAddress
    ? `<div class="addr">${escapeHtml(order.deliveryAddress.street)}, ${escapeHtml(order.deliveryAddress.area)}, ${escapeHtml(order.deliveryAddress.city)}</div>`
    : "";

  const logo = header.logoUrl
    ? `<img src="${escapeHtml(header.logoUrl)}" class="logo-img" alt="" />`
    : `<div class="logo-icon">🍴</div>`;

  return `
<style>
  html { height: auto !important; overflow: visible !important; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 10px;
    width: 44mm;
    max-width: 44mm;
    height: auto !important;
    overflow: visible !important;
    margin: 0;
    padding: 0 2px 0 0;
    color: #000;
    background: #fff;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  .center { text-align: center; }
  .text-right { text-align: right; }
  .logo-icon { font-size: 16px; margin-bottom: 2px; }
  .logo-img { max-height: 28px; margin: 0 auto 4px; display: block; }
  .brand { font-size: 12px; font-weight: 800; letter-spacing: 0.04em; word-break: break-word; overflow-wrap: break-word; }
  .sub { font-size: 8px; margin-top: 1px; line-height: 1.2; font-weight: 500; word-break: break-word; overflow-wrap: break-word; }
  .rule { border: none; border-top: 1px solid #000; margin: 4px 0; }
  .rule-dash { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  .datetime { font-size: 9px; margin: 3px 0; font-weight: 500; }
  .w-table { width: 100%; border-collapse: collapse; font-size: 9px; margin: 2px 0; table-layout: fixed; }
  .w-table td { vertical-align: top; overflow-wrap: break-word; word-break: break-word; }
  .item-table { margin: 4px 0; font-size: 9px; }
  .item-name { font-weight: 700; width: 70%; }
  .item-price { font-weight: 700; width: 30%; white-space: nowrap; }
  .item-note { font-size: 8px; margin: -1px 0 3px 6px; text-transform: none; font-weight: 500; word-break: break-word; overflow-wrap: break-word; }
  .totals { margin: 3px 0; }
  .total-big td { font-size: 11px; font-weight: 800; padding-top: 3px; border-top: 1.5px solid #000; }
  .pay-grid { font-size: 9px; margin-top: 4px; }
  .footer { text-align: center; font-size: 8px; margin-top: 6px; line-height: 1.3; font-weight: 500; }
  .addr { font-size: 8px; margin: 3px 0; text-transform: none; word-break: break-word; overflow-wrap: break-word; }
  .customer { font-size: 8px; margin: 3px 0; text-transform: none; word-break: break-word; overflow-wrap: break-word; font-weight: 600; }
</style>
<div class="center" style="margin-top: 0px; padding-top: 0px;">${logo}</div>
<div class="center brand">${escapeHtml(header.name)}</div>
<div class="center sub">${escapeHtml(header.location)}</div>
<div class="center sub">PHONE: ${escapeHtml(header.phone)}</div>
${header.email ? `<div class="center sub">${escapeHtml(header.email)}</div>` : ""}
<hr class="rule" />
<div class="center datetime">${dt}</div>
<table class="w-table"><tr><td>RECEIPT</td><td class="text-right">${label}</td></tr></table>
${tableLine}
<div class="customer">${escapeHtml(order.customerName)} · ${escapeHtml(order.customerPhone)}</div>
${addr}
${order.deliveryNotes ? `<div class="customer">NOTES: ${escapeHtml(order.deliveryNotes)}</div>` : ""}
<hr class="rule-dash" />
${itemRows}
<hr class="rule" />
<div class="totals">
  <table class="w-table"><tr><td>SUBTOTAL</td><td class="text-right">${formatCurrency(order.subtotal)}</td></tr></table>
  ${order.discount > 0 ? `<table class="w-table"><tr><td>DISCOUNT</td><td class="text-right">-${formatCurrency(order.discount)}</td></tr></table>` : ""}
  ${order.tax > 0 ? `<table class="w-table"><tr><td>TAX</td><td class="text-right">${formatCurrency(order.tax)}</td></tr></table>` : ""}
  ${order.deliveryCharge > 0 ? `<table class="w-table"><tr><td>DELIVERY</td><td class="text-right">${formatCurrency(order.deliveryCharge)}</td></tr></table>` : ""}
  <table class="w-table total-big"><tr><td>TOTAL</td><td class="text-right">${formatCurrency(order.total)}</td></tr></table>
</div>
<hr class="rule-dash" />
<div class="pay-grid">
  <table class="w-table"><tr><td>PAYMENT METHOD</td><td class="text-right">${order.paymentMethod.toUpperCase()} (${order.paymentStatus.toUpperCase()})</td></tr></table>
</div>
<div class="footer">
  THANK YOU FOR YOUR VISIT!<br/>
  PLEASE COME AGAIN!
</div>
</div>`;
}

function buildKOTBody(order: Order): string {
  const label = formatOrderLabel(order);
  const items = order.items
    .map((i) => {
      const variantPart = i.customization?.variantName ? ` (${escapeHtml(i.customization.variantName)})` : "";
      const addonPart = i.customization?.addonNames?.length ? i.customization.addonNames.join(", ") : "";
      const extrasParts: string[] = [];
      if (addonPart) extrasParts.push(addonPart);
      if (i.customization?.extraCheese) extrasParts.push("Extra Cheese");
      if (i.customization?.spiceLevel) extrasParts.push(i.customization.spiceLevel);
      if (i.customization?.notes) extrasParts.push(i.customization.notes);
      const extrasLine = extrasParts.length > 0
        ? `<div class="item-note">${escapeHtml(extrasParts.join(" · "))}</div>`
        : "";
      return `
    <div class="kot-item">
      <div class="kot-qty">${i.quantity} × ${escapeHtml(i.name)}${variantPart}</div>
      ${extrasLine}
    </div>`;
    })
    .join("");
  return `
<style>
  html { height: auto !important; overflow: visible !important; }
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 10px;
    width: 44mm;
    max-width: 44mm;
    height: auto !important;
    overflow: visible !important;
    margin: 0;
    padding: 0;
    color: #000;
    text-transform: none;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  h1 { font-size: 11px; margin: 0 0 3px; font-weight: 800; }
  .badge { display: inline-block; padding: 1px 4px; font-size: 8px; font-weight: 700; color: #fff; background: ${order.source === "website" ? "#1d4ed8" : "#15803d"}; }
  .order-no { font-size: 24px; font-weight: 900; margin: 2px 0; line-height: 1; }
  .kot-item { border-bottom: 2px dashed #000; padding: 4px 0; }
  .kot-qty { font-size: 12px; font-weight: 800; word-break: break-word; overflow-wrap: break-word; white-space: normal; }
  .item-note { font-size: 10px; font-weight: 700; color: #b45309; margin-top: 2px; word-break: break-word; overflow-wrap: break-word; }
</style>
<h1 style="margin-top: 0px; padding-top: 0px;">KITCHEN ORDER TICKET</h1>
<span class="badge">${order.source === "website" ? "ONLINE" : "POS"}</span>
<div class="order-no">${label}</div>
<p><strong>${orderTypeLabel(order.type)}</strong>${order.tableNumber != null ? ` · Table ${order.tableNumber}` : ""}</p>
<p style="font-size:11px">${formatReceiptDateTime(order.createdAt)}</p>
<p><strong>${escapeHtml(order.customerName)}</strong><br/>${escapeHtml(order.customerPhone)}</p>
<hr style="border:none;border-top:2px solid #000;margin:6px 0"/>
${items}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function playOrderSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    /* ignore */
  }
}
