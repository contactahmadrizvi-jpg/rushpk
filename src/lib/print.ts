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
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:220px;height:1px;border:0;opacity:0;pointer-events:none;";
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
  // html and body must be height:auto so the browser only prints
  // as much paper as the content requires — prevents blank leading paper.
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>html,body{height:auto!important;overflow:visible!important;}</style></head><body>${body}</body></html>`;
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
  if (!parts.length) return "";
  return `<div class="item-note">${escapeHtml(parts.join(" · "))}</div>`;
}

function buildReceiptHTML(order: Order, header: PrintHeader): string {
  const label = formatOrderLabel(order);
  const dt = formatReceiptDateTime(order.createdAt);
  const tableLine =
    order.tableNumber != null
      ? `<div class="row"><span>TABLE</span><span>${order.tableNumber}</span></div>`
      : `<div class="row"><span>TYPE</span><span>${orderTypeLabel(order.type)}</span></div>`;

  const itemRows = order.items
    .map(
      (i) => `
    <div class="item-row">
      <span class="item-name">${i.quantity}X ${escapeHtml(i.name.toUpperCase())}</span>
      <span class="item-price">${formatCurrency(i.subtotal)}</span>
    </div>${itemExtras(i)}`
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
  @page { size: 58mm auto; margin: 0; }
  html { height: auto !important; overflow: visible !important; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Courier New", Courier, monospace;
    font-size: 10px;
    width: 50mm;
    max-width: 50mm;
    height: auto !important;
    overflow: visible !important;
    margin: 0 auto;
    padding: 2px 2px;
    color: #000;
    background: #fff;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .center { text-align: center; }
  .logo-icon { font-size: 18px; margin-bottom: 3px; }
  .logo-img { max-height: 28px; margin: 0 auto 4px; display: block; }
  .brand { font-size: 12px; font-weight: 700; letter-spacing: 0.06em; }
  .sub { font-size: 8px; margin-top: 2px; line-height: 1.3; font-weight: 400; }
  .rule { border: none; border-top: 1px solid #000; margin: 6px 0; }
  .rule-dash { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  .datetime { font-size: 9px; margin: 4px 0; }
  .row { display: flex; justify-content: space-between; font-size: 9px; margin: 2px 0; }
  .item-row { display: flex; justify-content: space-between; gap: 4px; margin: 4px 0; font-size: 10px; }
  .item-name { flex: 1; font-weight: 700; }
  .item-price { white-space: nowrap; font-weight: 700; }
  .item-note { font-size: 8px; margin: -1px 0 3px 6px; text-transform: none; font-weight: 400; }
  .totals .row { margin: 3px 0; }
  .total-big { font-size: 12px; font-weight: 900; margin-top: 3px; padding-top: 3px; border-top: 2px solid #000; }
  .pay-grid { font-size: 8px; margin-top: 5px; }
  .pay-grid .row { margin: 2px 0; }
  .footer { text-align: center; font-size: 8px; margin-top: 8px; line-height: 1.4; font-weight: 400; }
  .addr { font-size: 8px; margin: 3px 0; text-transform: none; }
  .customer { font-size: 9px; margin: 3px 0; text-transform: none; }
</style>
<div class="center">${logo}</div>
<div class="center brand">${escapeHtml(header.name)}</div>
<div class="center sub">${escapeHtml(header.location)}</div>
<div class="center sub">PHONE: ${escapeHtml(header.phone)}</div>
${header.email ? `<div class="center sub">${escapeHtml(header.email)}</div>` : ""}
<hr class="rule" />
<div class="center datetime">${dt}</div>
<div class="row"><span>RECEIPT</span><span>${label}</span></div>
${tableLine}
<div class="customer">${escapeHtml(order.customerName)} · ${escapeHtml(order.customerPhone)}</div>
${addr}
${order.deliveryNotes ? `<div class="customer">NOTES: ${escapeHtml(order.deliveryNotes)}</div>` : ""}
<hr class="rule-dash" />
${itemRows}
<hr class="rule" />
<div class="totals">
  <div class="row"><span>SUBTOTAL</span><span>${formatCurrency(order.subtotal)}</span></div>
  ${order.discount > 0 ? `<div class="row"><span>DISCOUNT</span><span>-${formatCurrency(order.discount)}</span></div>` : ""}
  ${order.tax > 0 ? `<div class="row"><span>TAX</span><span>${formatCurrency(order.tax)}</span></div>` : ""}
  ${order.deliveryCharge > 0 ? `<div class="row"><span>DELIVERY</span><span>${formatCurrency(order.deliveryCharge)}</span></div>` : ""}
  <div class="row total-big"><span>TOTAL</span><span>${formatCurrency(order.total)}</span></div>
</div>
<hr class="rule-dash" />
<div class="pay-grid">
  <div class="row"><span>METHOD</span><span>${order.paymentMethod.toUpperCase()}</span></div>
  <div class="row"><span>STATUS</span><span>${order.paymentStatus.toUpperCase()}</span></div>
  <div class="row"><span>SOURCE</span><span>${order.source === "website" ? "ONLINE" : "POS"}</span></div>
</div>
<hr class="rule-dash" />
<div class="footer">
  TIP IS NOT INCLUDED.<br/>
  PLEASE COME AGAIN!<br/>
  THANK YOU FOR DINING WITH US!
</div>`;
}

function buildKOTBody(order: Order): string {
  const label = formatOrderLabel(order);
  const items = order.items
    .map(
      (i) => `
    <div class="kot-item">
      <div class="kot-qty">${i.quantity} × ${escapeHtml(i.name)}</div>
      ${itemExtras(i)}
    </div>`
    )
    .join("");

  return `
<style>
  @page { size: 58mm auto; margin: 0; }
  html { height: auto !important; overflow: visible !important; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 10px; width: 50mm; height: auto !important; overflow: visible !important; margin: 0 auto; padding: 2px 2px; color: #000; text-transform: none; }
  h1 { font-size: 11px; margin: 0 0 4px; font-weight: 800; }
  .badge { display: inline-block; padding: 1px 4px; font-size: 8px; font-weight: 700; color: #fff; background: ${order.source === "website" ? "#1d4ed8" : "#15803d"}; }
  .order-no { font-size: 24px; font-weight: 900; margin: 3px 0; }
  .kot-item { border-bottom: 2px dashed #000; padding: 4px 0; }
  .kot-qty { font-size: 14px; font-weight: 800; }
  .item-note { font-size: 9px; color: #b45309; margin-top: 2px; }
</style>
<h1>KITCHEN ORDER TICKET</h1>
<span class="badge">${order.source === "website" ? "ONLINE" : "POS"}</span>
<div class="order-no">${label}</div>
<p><strong>${orderTypeLabel(order.type)}</strong>${order.tableNumber != null ? ` · Table ${order.tableNumber}` : ""}</p>
<p style="font-size:11px">${formatReceiptDateTime(order.createdAt)}</p>
<p><strong>${escapeHtml(order.customerName)}</strong><br/>${escapeHtml(order.customerPhone)}</p>
<hr style="border:none;border-top:2px solid #000;margin:8px 0"/>
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
