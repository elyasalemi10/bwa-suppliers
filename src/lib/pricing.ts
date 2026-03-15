import type { Supplier, GstExemptionKeyword } from "./types";

export function calculatePrices(
  costPrice: number,
  supplier: Supplier,
  rowData: Record<string, string>,
  exemptionKeywords: GstExemptionKeyword[]
): { regularPrice: number; vipPrice: number } {
  // Step 1: Start with cost_price
  let basePrice = costPrice;

  // Step 2: Remove GST if supplier prices include GST
  if (supplier.gst_included) {
    basePrice = basePrice / 1.1;
  }

  // Step 3: Apply manufacturer discount
  let discountedPrice: number;
  if (supplier.discount_type === "percentage") {
    discountedPrice = basePrice * (1 - supplier.discount_value / 100);
  } else {
    discountedPrice = basePrice - supplier.discount_value;
  }

  // Step 4: Add GST back (10%) unless product is GST-exempt
  const isExempt = exemptionKeywords.some((rule) => {
    const columnValue = rowData[rule.target_column];
    if (!columnValue) return false;
    return columnValue.toLowerCase().includes(rule.keyword.toLowerCase());
  });

  let priceWithGst: number;
  if (!isExempt) {
    priceWithGst = discountedPrice * 1.1;
  } else {
    priceWithGst = discountedPrice;
  }

  // Step 5: Apply regular customer markup
  let regularPrice: number;
  if (supplier.regular_markup_type === "percentage") {
    regularPrice = priceWithGst * (1 + supplier.regular_markup_value / 100);
  } else {
    regularPrice = priceWithGst + supplier.regular_markup_value;
  }

  // Step 6: Apply VIP customer markup
  let vipPrice: number;
  if (supplier.vip_markup_type === "percentage") {
    vipPrice = priceWithGst * (1 + supplier.vip_markup_value / 100);
  } else {
    vipPrice = priceWithGst + supplier.vip_markup_value;
  }

  return {
    regularPrice: Math.round(regularPrice * 100) / 100,
    vipPrice: Math.round(vipPrice * 100) / 100,
  };
}
