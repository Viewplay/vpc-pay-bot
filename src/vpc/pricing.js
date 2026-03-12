const PROMO_CODES = {
  viewplay10: { rate: 0.10, name: "ViewPlay" },
  test1: { rate: 0.01, name: "Test" },
  testpro2: { rate: 0.08, name: "TestPro2" },
  testpro3: { rate: 0.10, name: "TestPro3" },
  testpro4: { rate: 0.10, name: "TestPro4" },
  testpro5: { rate: 0.10, name: "TestPro5" },
  testpro6: { rate: 0.10, name: "TestPro6" },
  testpro7: { rate: 0.10, name: "TestPro7" },
  testpro8: { rate: 0.10, name: "TestPro8" },
  testpro9: { rate: 0.10, name: "TestPro9" },
  testpro10: { rate: 0.10, name: "TestPro10" },

  // Codes des parrains (mais intégrés comme promo)
  alex93: { rate: 0.05, name: "Alex93" },
  nico67: { rate: 0.05, name: "Nico67" },
  fafa203: { rate: 0.05, name: "Fafa203" }
};

function volumeDiscount(usd) {
  if (usd >= 10000) return 0.10;
  if (usd >= 6000) return 0.07;
  if (usd >= 3000) return 0.05;
  if (usd >= 1000) return 0.03;
  return 0;
}

export function getPromoData(code) {
  const c = (code || "").trim().toLowerCase();
  if (!c) return { rate: 0, name: null };

  const promo = PROMO_CODES[c];
  if (!promo) return { rate: 0, name: null };

  return promo;
}

function promoDiscount(code) {
  return getPromoData(code).rate;
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
