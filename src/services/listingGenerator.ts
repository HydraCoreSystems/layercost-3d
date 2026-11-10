import { FilamentSpool, PrintQuoteInput } from '../engine/pricingEngine';
import { ThreeTierPricingResult } from '../engine/marketplaceFees';

export interface GeneratedListingCopy {
  etsyTitle: string;
  whatnotShowNote: string;
  descriptionBody: string;
  seoTags: string[];
}

export function generateMarketplaceListingCopy(
  quote: PrintQuoteInput,
  pricing: ThreeTierPricingResult,
  spools: FilamentSpool[]
): GeneratedListingCopy {
  const usedSpools = quote.filamentSlots
    .map((slot) => spools.find((s) => s.id === slot.spoolId))
    .filter(Boolean) as FilamentSpool[];

  const materials = Array.from(new Set(usedSpools.map((s) => s.material))).join(' & ') || 'PLA';
  const colors = Array.from(new Set(usedSpools.map((s) => s.colorName))).join(' + ') || 'Custom Color';
  const isMulticolor = quote.filamentSlots.length > 1;

  const etsyTitle = `${quote.productName} | ${isMulticolor ? 'Multi-Color ' : ''}3D Printed ${quote.category} | Custom ${colors} (${materials})`.slice(
    0,
    140
  );

  const whatnotShowNote = `🔥 ${quote.productName} (${quote.sku}) | Start Floor: $${pricing.auctionFloorWholeDollar} | Target Retail: $${pricing.suggestedRoundedRetailPrice.toFixed(2)} | ${colors} (${materials})`;

  const bomText =
    quote.bomItems.length > 0
      ? `\n• Hardware Included: ${quote.bomItems.map((b) => `${b.quantityPerUnit}x ${b.name}`).join(', ')}`
      : '';

  const descriptionBody = `✨ ${quote.productName}
Precision 3D printed in studio using premium ${materials} (${colors}).${isMulticolor ? ' Multi-material AMS fused color—no paint to chip or peel!' : ''}

📐 Highlights & Details:
• Category: ${quote.category}
• Material: Eco-conscious / high-durability ${materials}
• Colorway: ${colors}${bomText}
${quote.notes ? `• Maker Notes: ${quote.notes}\n` : ''}
📦 Packed with care and ships ready to use.`;

  const seoTags = [
    quote.productName.toLowerCase().slice(0, 20),
    '3d printed',
    quote.category.toLowerCase().slice(0, 20),
    `${materials.toLowerCase()} print`,
    isMulticolor ? 'multicolor 3d print' : 'custom 3d print',
    'maker gift',
    'desk decor',
    'handcrafted 3d',
  ];

  return {
    etsyTitle,
    whatnotShowNote,
    descriptionBody,
    seoTags,
  };
}

