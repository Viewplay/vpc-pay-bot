const PROMO_CODES = {
  viewplay10: 0.10,
  test1: 0.01,
  testpro2: 0.08,
  testpro3: 0.10,
  testpro4: 0.10,
  testpro5: 0.10,
  testpro6: 0.10,
  testpro7: 0.10,
  testpro8: 0.10,
  testpro9: 0.10,
  testpro10: 0.10
};

function volumeDiscount(usd) {
  if (usd >= 10000) return 0.10;
  if (usd >= 6000) return 0.07;
  if (usd >= 3000) return 0.05;
  if (usd >= 1000) return 0.03;
  return 0;
}

function promoDiscount(code) {
  const c = (code || "").trim().toLowerCase();
  if (!c) return 0;
  return PROMO_CODES[c] || 0;
}

export function computeDiscountRate(usd, promoCode) {
  let rate = volumeDiscount(usd) + promoDiscount(promoCode);
  if (rate > 0.2) rate = 0.2;
  if (rate < 0) rate = 0;
  return rate;
}

export function computeVpcAmount(usd, effectiveVpcPrice) {
  const vpc = Math.floor(usd / effectiveVpcPrice);
  return Number.isFinite(vpc) && vpc > 0 ? vpc : 0;
}
