import type { Order, OrderItem, RestaurantSettings } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { RESTAURANT } from "@/constants";
import { getSettings } from "@/services/settings.service";

export type PrintHeader = {
  name: string;
  location: string;
  phone: string;
  logoUrl?: string;
};

function formatOrderLabel(order: Order): string {
  const n = order.dailyOrderNumber ?? order.orderNumber;
  return `#${n}`;
}

function orderTypeLabel(type: Order["type"], source: Order["source"]): string {
  const t = type.replace("_", " ").toUpperCase();
  if (source === "website") return `${t} · ONLINE`;
  if (source === "pos") return `${t} · POS`;
  return t;
}

async function resolvePrintHeader(): Promise<PrintHeader> {
  try {
    const settings = await getSettings();
    if (settings) {
      return {
        name: settings.printerSettings?.restaurantName ?? settings.name,
        location: `${settings.address}, ${settings.city}`,
        phone: settings.phone,
        logoUrl: settings.logoUrl,
      };
    }
  } catch {
    /* use defaults */
  }
  return {
    name: RESTAURANT.name,
    location: RESTAURANT.location,
    phone: RESTAURANT.phone,
  };
}

/** Opens system print dialog with thermal-sized receipt (80mm). */
export async function printReceipt(order: Order, header?: PrintHeader): Promise<boolean> {
  const h = header ?? (await resolvePrintHeader());
  const html = buildReceiptHTML(order, h);
  return printHtml(html, "receipt");
}

/** Kitchen order ticket — 72mm thermal layout. */
export async function printKOT(order: Order): Promise<boolean> {
  const html = buildKOTHTML(order);
  return printHtml(html, "kot");
}

/**
 * Real browser print via hidden iframe (works when popups are blocked).
 * User selects thermal printer in the print dialog; set as default for one-click printing.
 */
export function printHtml(html: string, label: string): Promise<boolean> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", `print-${label}`);
    iframe.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const doc = win?.document;
    if (!doc || !win) {
      document.body.removeChild(iframe);
      resolve(false);
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    const cleanup = () => {
      setTimeout(() => {
        if (iframe.parentNode) document.body.removeChild(iframe);
      }, 500);
    };

    const triggerPrint = () => {
      try {
        win.focus();
        win.print();
        resolve(true);
      } catch {
        resolve(false);
      } finally {
        cleanup();
      }
    };

    if (doc.readyState === "complete") {
      setTimeout(triggerPrint, 150);
    } else {
      iframe.onload = () => setTimeout(triggerPrint, 150);
    }
  });
}

function itemCustomizationLine(item: OrderItem): string {
  const c = item.customization;
  if (!c) return "";
  const parts: string[] = [];
  if (c.variantName) parts.push(c.variantName);
  if (c.addonNames?.length) parts.push(c.addonNames.join(", "));
  if (c.extraCheese) parts.push("Extra cheese");
  if (c.spiceLevel) parts.push(c.spiceLevel);
  if (c.notes) parts.push(`Note: ${c.notes}`);
  if (!parts.length) return "";
  return `<div style="font-size:10px;color:#555;margin-top:2px">${escapeHtml(parts.join(" · "))}</div>`;
}

function buildReceiptHTML(order: Order, header: PrintHeader): string {
  const label = formatOrderLabel(order);
  const items = order.items
    .map(
      (i) => `
      <tr>
        <td style="padding:4px 0;vertical-align:top;width:70%">
          ${i.quantity}× ${escapeHtml(i.name)}
          ${itemCustomizationLine(i)}
        </td>
        <td style="padding:4px 0;text-align:right;white-space:nowrap;vertical-align:top">${formatCurrency(i.subtotal)}</td>
      </tr>`
    )
    .join("");

  const addr = order.deliveryAddress
    ? `<div style="margin-top:6px;font-size:11px">${escapeHtml(order.deliveryAddress.street)}, ${escapeHtml(order.deliveryAddress.area)}<br>${escapeHtml(order.deliveryAddress.city)}</div>`
    : "";

  const logo = header.logoUrl
    ? `<img src="${escapeHtml(header.logoUrl)}" alt="" style="max-height:40px;margin:0 auto 6px;display:block" />`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${label}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  @media print {
    html, body { width: 80mm; margin: 0; padding: 0; }
    .no-print { display: none !important; }
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Consolas,'Courier New',monospace;font-size:12px;width:80mm;max-width:80mm;margin:0 auto;padding:8px;color:#000;background:#fff}
  .logo{text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:8px}
  .logo h1{font-size:15px;font-weight:800}
  .logo p{font-size:10px;margin-top:2px}
  .order-no{text-align:center;font-size:26px;font-weight:900;margin:8px 0;letter-spacing:1px}
  .meta{font-size:11px;line-height:1.45;margin-bottom:8px}
  .meta strong{display:inline-block;min-width:68px}
  table.items{width:100%;border-collapse:collapse;margin:6px 0}
  table.totals{width:100%;font-size:12px}
  table.totals td{padding:2px 0}
  .total-row{font-size:15px;font-weight:800;border-top:2px solid #000;padding-top:5px!important}
  .footer{text-align:center;margin-top:10px;font-size:10px;border-top:1px dashed #666;padding-top:6px}
  hr{border:none;border-top:1px dashed #999;margin:6px 0}
  .no-print{text-align:center;padding:8px;font-family:sans-serif;font-size:11px;color:#666}
</style></head><body>
  <p class="no-print">Select your thermal printer, then print. Paper: 80mm.</p>
  <div class="logo">
    ${logo}
    <h1>${escapeHtml(header.name)}</h1>
    <p>${escapeHtml(header.location)}</p>
    <p>Tel: ${escapeHtml(header.phone)}</p>
  </div>
  <div class="order-no">ORDER ${label}</div>
  <div class="meta">
    <div><strong>Date:</strong> ${formatDate(order.createdAt)}</div>
    <div><strong>Customer:</strong> ${escapeHtml(order.customerName)}</div>
    <div><strong>Phone:</strong> ${escapeHtml(order.customerPhone)}</div>
    <div><strong>Type:</strong> ${orderTypeLabel(order.type, order.source)}</div>
    ${order.tableNumber != null ? `<div><strong>Table:</strong> ${order.tableNumber}</div>` : ""}
    ${order.deliveryNotes ? `<div><strong>Notes:</strong> ${escapeHtml(order.deliveryNotes)}</div>` : ""}
    ${addr}
  </div>
  <hr>
  <table class="items">${items}</table>
  <hr>
  <table class="totals">
    <tr><td>Subtotal</td><td style="text-align:right">${formatCurrency(order.subtotal)}</td></tr>
    ${order.discount > 0 ? `<tr><td>Discount</td><td style="text-align:right">-${formatCurrency(order.discount)}</td></tr>` : ""}
    ${order.tax > 0 ? `<tr><td>Tax</td><td style="text-align:right">${formatCurrency(order.tax)}</td></tr>` : ""}
    ${order.deliveryCharge > 0 ? `<tr><td>Delivery</td><td style="text-align:right">${formatCurrency(order.deliveryCharge)}</td></tr>` : ""}
    <tr class="total-row"><td>TOTAL</td><td style="text-align:right">${formatCurrency(order.total)}</td></tr>
    <tr><td>Payment</td><td style="text-align:right">${order.paymentMethod.toUpperCase()} · ${order.paymentStatus.toUpperCase()}</td></tr>
  </table>
  <div class="footer">
    Thank you!<br>
    ${escapeHtml(header.name)}<br>
    ${new Date().toLocaleString("en-PK")}
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.focus(); window.print(); }, 200);
    };
  <\/script>
</body></html>`;
}

function buildKOTHTML(order: Order): string {
  const label = formatOrderLabel(order);
  const items = order.items
    .map((i) => {
      const notes = i.customization?.notes
        ? `<div style="font-size:11px;color:#b45309;font-weight:600">Note: ${escapeHtml(i.customization.notes)}</div>`
        : "";
      const extras = itemCustomizationLine(i);
      return `<div style="border-bottom:2px dashed #000;padding:10px 0">
        <div style="font-size:20px;font-weight:900">${i.quantity} × ${escapeHtml(i.name)}</div>${extras}${notes}
      </div>`;
    })
    .join("");

  const sourceBadge =
    order.source === "website"
      ? '<span style="background:#1d4ed8;color:#fff;padding:3px 10px;font-size:12px;font-weight:700">ONLINE</span>'
      : '<span style="background:#15803d;color:#fff;padding:3px 10px;font-size:12px;font-weight:700">POS</span>';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>KOT ${label}</title>
<style>
  @page { size: 72mm auto; margin: 3mm; }
  @media print { html, body { width: 72mm; margin: 0; } }
  body{font-family:Arial,sans-serif;font-size:13px;width:72mm;margin:0;padding:8px;color:#000}
  h1{font-size:14px;margin:0 0 6px;font-weight:800}
  .no{font-size:36px;font-weight:900;margin:6px 0;line-height:1}
</style></head><body>
  <h1>KITCHEN ORDER</h1>
  ${sourceBadge}
  <div class="no">${label}</div>
  <p><strong>${orderTypeLabel(order.type, order.source)}</strong>
  ${order.tableNumber != null ? ` · Table <strong>${order.tableNumber}</strong>` : ""}</p>
  <p style="font-size:11px">${formatDate(order.createdAt)}</p>
  <p style="font-size:14px;margin-top:4px"><strong>${escapeHtml(order.customerName)}</strong><br>${escapeHtml(order.customerPhone)}</p>
  <hr style="border:none;border-top:2px solid #000;margin:8px 0">
  ${items}
  <script>
    window.onload = function() { setTimeout(function() { window.focus(); window.print(); }, 200); };
  <\/script>
</body></html>`;
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
