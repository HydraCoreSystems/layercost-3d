import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import {
  analyzePrintQuote,
  FilamentSpool,
  PrinterProfile,
  PrintQuoteInput,
} from '../engine/pricingEngine';
import { calculateThreeTierPricing } from '../engine/marketplaceFees';

export async function exportSingleQuotePdf(
  quote: PrintQuoteInput,
  printer: PrinterProfile,
  spools: FilamentSpool[]
): Promise<void> {
  const analysis = analyzePrintQuote(quote, printer, spools);
  const pricing = calculateThreeTierPricing(analysis.activeUnit, quote);
  const u = analysis.activeUnit;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>LayerCost 3D Quote — ${quote.productName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0F172A; padding: 32px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #10B981; padding-bottom: 16px; margin-bottom: 24px; }
    .brand { font-size: 24px; font-weight: 800; color: #047857; letter-spacing: -0.5px; }
    .sub { font-size: 13px; color: #64748B; margin-top: 4px; }
    .cards { display: flex; gap: 14px; margin-bottom: 24px; }
    .card { flex: 1; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px; background: #F8FAFC; }
    .card.highlight { border: 2px solid #10B981; background: #ECFDF5; }
    .card-label { font-size: 11px; text-transform: uppercase; font-weight: 700; color: #475569; letter-spacing: 0.6px; }
    .card-price { font-size: 28px; font-weight: 800; color: #0F172A; margin: 6px 0; }
    .card-note { font-size: 12px; color: #475569; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #E2E8F0; font-size: 14px; }
    th { background: #F1F5F9; font-weight: 700; color: #334155; }
    .right { text-align: right; }
    .total-row td { font-weight: 800; background: #F8FAFC; border-top: 2px solid #0F172A; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">LayerCost 3D — Production & Pricing Sheet</div>
      <div class="sub">Product: <strong>${quote.productName}</strong> (${quote.sku || 'No SKU'}) • Printer: ${printer.name}</div>
    </div>
    <div style="text-align: right; font-size: 12px; color: #64748B;">
      Date: ${new Date().toLocaleDateString()}<br/>
      Batch Plate Size: <strong>${u.batchSize} unit(s)</strong>
    </div>
  </div>

  <div class="cards">
    <div class="card">
      <div class="card-label">Live Auction Floor (Break-Even)</div>
      <div class="card-price">$${pricing.auctionFloorWholeDollar}.00</div>
      <div class="card-note">Exact break-even: $${pricing.breakEvenPrice.toFixed(2)} • Cash floor: $${pricing.hardCashFloorPrice.toFixed(2)}</div>
    </div>
    <div class="card">
      <div class="card-label">Wholesale B2B (${quote.wholesaleMultiplier}x)</div>
      <div class="card-price">$${pricing.wholesalePrice.toFixed(2)}</div>
      <div class="card-note">Net Profit: $${pricing.wholesaleNetProfit.toFixed(2)} (${pricing.wholesaleMarginPercent.toFixed(0)}% margin)</div>
    </div>
    <div class="card highlight">
      <div class="card-label">Retail Price (${pricing.marketplace.shortName})</div>
      <div class="card-price">$${pricing.retailEvaluation.listingPrice.toFixed(2)}</div>
      <div class="card-note">Net Profit: <strong>$${pricing.retailEvaluation.netProfit.toFixed(2)}</strong> (${pricing.retailEvaluation.netMarginPercent.toFixed(0)}% margin)</div>
    </div>
  </div>

  <h3>Unit Cost Breakdown (Plate of ${u.batchSize})</h3>
  <table>
    <thead>
      <tr>
        <th>Cost Component</th>
        <th>Details</th>
        <th class="right">Cost / Unit</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Model & Support Filament</td>
        <td>${(u.modelGramsPerUnit + u.supportGramsPerUnit).toFixed(1)}g per unit</td>
        <td class="right">$${(u.modelFilamentCost + u.supportFilamentCost).toFixed(2)}</td>
      </tr>
      <tr>
        <td>AMS Purge / Flush & Tower Waste</td>
        <td>${u.purgeGramsPerUnit.toFixed(1)}g per unit (amortized across ${u.batchSize} on plate)</td>
        <td class="right">$${u.purgeFilamentCost.toFixed(2)}</td>
      </tr>
      <tr>
        <td>Machine Power, Depreciation & Wear</td>
        <td>${u.printHoursPerUnitEffective.toFixed(2)} hrs/unit @ ${printer.powerWatts}W</td>
        <td class="right">$${u.totalMachineCost.toFixed(2)}</td>
      </tr>
      <tr>
        <td>Hardware / BOM & Packaging</td>
        <td>${quote.bomItems.length} hardware item(s) + packaging</td>
        <td class="right">$${(u.hardwareBomCost + u.packagingCost).toFixed(2)}</td>
      </tr>
      <tr>
        <td>Hands-On Prep & Post-Processing Labor</td>
        <td>$${quote.laborRatePerHour.toFixed(2)}/hr labor rate</td>
        <td class="right">$${u.totalLaborCost.toFixed(2)}</td>
      </tr>
      <tr>
        <td>Failure / Scrap Buffer (${quote.scrapRatePercent}%)</td>
        <td>Print failure risk reserve</td>
        <td class="right">$${u.scrapBufferCost.toFixed(2)}</td>
      </tr>
      <tr class="total-row">
        <td>True Landed Production Cost</td>
        <td>Total Grams: ${u.totalGramsPerUnit.toFixed(1)}g/unit (${u.totalGramsForPlate.toFixed(0)}g full plate)</td>
        <td class="right">$${u.trueUnitCost.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 250);
      return;
    }
  }

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Share ${quote.productName} Quote PDF`,
    });
  }
}

export async function exportCatalogCheatSheetPdf(
  catalog: PrintQuoteInput[],
  printers: PrinterProfile[],
  spools: FilamentSpool[]
): Promise<void> {
  const rowsHtml = catalog
    .map((item) => {
      const printer = printers.find((p) => p.id === item.printerId) || printers[0];
      const analysis = analyzePrintQuote(item, printer, spools);
      const pricing = calculateThreeTierPricing(analysis.activeUnit, item);
      const u = analysis.activeUnit;
      return `<tr>
        <td><strong>${item.productName}</strong><br/><span style="color:#64748B;font-size:11px;">${item.sku} • Plate of ${u.batchSize} (${u.totalGramsPerUnit.toFixed(0)}g/ea)</span></td>
        <td class="right">$${u.trueUnitCost.toFixed(2)}</td>
        <td class="right" style="color:#B45309;font-weight:700;">$${pricing.auctionFloorWholeDollar}.00</td>
        <td class="right">$${pricing.wholesalePrice.toFixed(2)}</td>
        <td class="right" style="color:#047857;font-weight:800;">$${pricing.retailEvaluation.listingPrice.toFixed(2)}</td>
        <td class="right">$${pricing.retailEvaluation.netProfit.toFixed(2)} (${pricing.retailEvaluation.netMarginPercent.toFixed(0)}%)</td>
      </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>LayerCost 3D — Live Auction & Craft Show Master Price Sheet</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0F172A; padding: 28px; }
    h1 { color: #047857; margin-bottom: 4px; font-size: 22px; }
    .sub { color: #64748B; font-size: 13px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #CBD5E1; font-size: 13px; text-align: left; }
    th { background: #0F172A; color: #F8FAFC; font-weight: 700; }
    .right { text-align: right; }
  </style>
</head>
<body>
  <h1>LayerCost 3D — Live Show & Retail Price Sheet</h1>
  <div class="sub">Generated ${new Date().toLocaleDateString()} • Keep beside your phone during Whatnot / PalmStreet live shows or craft markets</div>
  <table>
    <thead>
      <tr>
        <th>Product / SKU</th>
        <th class="right">True Cost</th>
        <th class="right">Auction Floor</th>
        <th class="right">Wholesale</th>
        <th class="right">Retail Price</th>
        <th class="right">Net Profit</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
</body>
</html>`;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 250);
      return;
    }
  }

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Share Master Price Sheet PDF',
    });
  }
}

