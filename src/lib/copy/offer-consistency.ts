function safeText(value: unknown) {
  return (value ?? "").toString().trim();
}

function normalize(value: string) {
  return safeText(value)
    .toLowerCase()
    .replace(/\bplus\b/g, "+")
    .replace(/[^\w\s+$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceCase(value: string) {
  const text = safeText(value);

  if (!text) {
    return "";
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function meaningfulOfferTokens(offer: string) {
  return normalize(offer)
    .split(/\s+/)
    .filter((token) => token.length > 3 || /^\d{3,4}\+?$/.test(token));
}

function criticalOfferTokens(offer: string) {
  return meaningfulOfferTokens(offer).filter((token) =>
    /guarante|approv|qualif|credit|fico|mortgage|^\d{3,4}\+?$/.test(token),
  );
}

export function textPreservesOfferConcept(text: string | null | undefined, offer: string | null | undefined) {
  const normalizedText = normalize(safeText(text));
  const normalizedOffer = normalize(safeText(offer));

  if (!normalizedText || !normalizedOffer) {
    return false;
  }

  if (normalizedText.includes(normalizedOffer)) {
    return true;
  }

  const criticalTokens = criticalOfferTokens(normalizedOffer);

  if (criticalTokens.length > 0) {
    return criticalTokens.every((token) => normalizedText.includes(token));
  }

  const tokens = meaningfulOfferTokens(normalizedOffer);
  const matchedTokens = tokens.filter((token) => normalizedText.includes(token));
  return tokens.length > 0 && matchedTokens.length / tokens.length >= 0.65;
}

export function buildOfferFirstHeadline(params: {
  headline?: string | null;
  offer?: string | null;
  market?: string | null;
}) {
  const headline = safeText(params.headline);
  const offer = safeText(params.offer);
  const market = safeText(params.market);

  if (!offer || textPreservesOfferConcept(headline, offer)) {
    return headline;
  }

  const offerHeadline = sentenceCase(offer);
  return market && !normalize(offerHeadline).includes(normalize(market))
    ? `${offerHeadline} in ${market}`
    : offerHeadline;
}

export function buildOfferFirstBody(params: {
  body?: string | null;
  offer?: string | null;
}) {
  const body = safeText(params.body);
  const offer = safeText(params.offer);

  if (!offer || textPreservesOfferConcept(body, offer)) {
    return body;
  }

  return body ? `${sentenceCase(offer)}. ${body}` : sentenceCase(offer);
}
