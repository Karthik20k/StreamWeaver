/**
 * StreamWeaver - Advanced Auto-Mapping Engine
 * Features case-insensitive normalization, synonym expansion, token overlap, and Levenshtein fuzzy matching
 */

import { normalizeKey } from './targetSchemas.js';

/**
 * Standard synonym dictionary mapping canonical semantic concepts
 */
export const SYNONYM_DICTIONARY = {
  // IDs & Keys
  id: ['orderid', 'txnid', 'userid', 'eventid', 'identifier', 'code', 'key', 'ref', 'reference'],
  orderid: ['id', 'ordernumber', 'orderno', 'order_num', 'purchaseid', 'ordercode', 'order_id'],
  txnid: ['id', 'transid', 'transactionid', 'reference', 'ref', 'tx_id', 'entryid'],
  userid: ['id', 'custid', 'customerid', 'accountid', 'clientid', 'user_id', 'memberid'],
  customerid: ['userid', 'custid', 'clientid', 'accountid', 'buyerid'],
  sku: ['itemcode', 'productcode', 'skucode', 'partnumber', 'itemid', 'partno'],
  
  // Names & Descriptions
  productname: ['itemname', 'merchandisename', 'title', 'product', 'item', 'description', 'desc'],
  firstname: ['givenname', 'fname', 'first', 'forename'],
  lastname: ['surname', 'lname', 'last', 'familyname'],
  fullname: ['name', 'personname', 'customername'],
  category: ['dept', 'department', 'type', 'genre', 'class', 'classification', 'group'],
  
  // Financial & Numerical
  unitprice: ['price', 'cost', 'itemprice', 'unitcost', 'rate', 'sellingprice', 'amount', 'amt'],
  debitamount: ['debit', 'dr', 'dramt', 'debitsum', 'outgoing'],
  creditamount: ['credit', 'cr', 'cramt', 'creditsum', 'incoming'],
  quantity: ['qty', 'count', 'units', 'numberofitems', 'volume'],
  currency: ['curr', 'currencycode', 'isocurrency', 'curr_code'],
  value: ['val', 'reading', 'metric', 'metricvalue', 'amount'],
  
  // Dates & Timestamps
  timestamp: ['date', 'time', 'datetime', 'createdat', 'orderdate', 'timestamputc', 'eventtime'],
  valuedate: ['settlementdate', 'postingdate', 'clearingdate', 'accrualdate', 'date'],
  registeredat: ['createdat', 'registrationdate', 'signupdate', 'joinedat'],
  
  // Contact & Status
  email: ['emailaddress', 'mail', 'contactemail'],
  phonenumber: ['phone', 'telephone', 'mobile', 'cell', 'tel'],
  status: ['state', 'condition', 'stage', 'fulfillmentstatus', 'orderstatus']
};

/**
 * Calculate Levenshtein Distance between two normalized strings
 */
export function levenshteinDistance(a, b) {
  if (!a || !b) return (a || b) ? Math.max((a || '').length, (b || '').length) : 0;
  
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,       // deletion
        dp[i][j - 1] + 1,       // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Normalized similarity score between 0.0 (completely different) and 1.0 (identical)
 */
export function calculateStringSimilarity(strA, strB) {
  const normA = normalizeKey(strA);
  const normB = normalizeKey(strB);

  if (normA === normB) return 1.0;
  if (!normA || !normB) return 0.0;

  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(normA, normB);
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Tokenize string into semantic words (supports camelCase, snake_case, spaces, dashes)
 */
export function tokenize(str) {
  if (!str) return [];
  return String(str)
    .replace(/([a-z])([A-Z])/g, '$1 $2') // split camelCase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Calculate Jaccard token overlap similarity
 */
export function calculateTokenOverlap(strA, strB) {
  const tokensA = new Set(tokenize(strA));
  const tokensB = new Set(tokenize(strB));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Multi-Tier Auto-Mapping Heuristic Algorithm
 * 
 * @param {string[]} sourceColumns Array of CSV header strings
 * @param {object[]} targetFields Array of target schema field objects
 * @param {object} options Configuration options
 * @returns {object} { mappings, matchDetails, summary }
 */
export function performSmartAutoMatch(sourceColumns = [], targetFields = [], options = {}) {
  const {
    fuzzyThreshold = 0.72,
    preferRequired = true
  } = options;

  const mappings = {};
  const matchDetails = [];
  const usedTargets = new Set();
  const unmappedSources = new Set(sourceColumns);

  // ------------------------------------------------------------------------
  // Pass 1: Tier 1 - Exact Normalized Match (100% confidence)
  // ------------------------------------------------------------------------
  for (const src of sourceColumns) {
    const normSrc = normalizeKey(src);

    for (const target of targetFields) {
      if (usedTargets.has(target.name)) continue;

      const normTarget = normalizeKey(target.name);
      const normLabel = normalizeKey(target.label);

      if (normSrc === normTarget || normSrc === normLabel) {
        mappings[src] = target.name;
        usedTargets.add(target.name);
        unmappedSources.delete(src);

        matchDetails.push({
          sourceColumn: src,
          targetField: target.name,
          targetLabel: target.label || target.name,
          targetType: target.type,
          isRequired: Boolean(target.required),
          matchType: 'exact',
          confidence: 1.0,
          confidencePercent: 100,
          scoreLabel: 'Exact Match'
        });
        break;
      }
    }
  }

  // ------------------------------------------------------------------------
  // Pass 2: Tier 2 - Semantic Synonym & Abbreviation Expansion (90-95% confidence)
  // ------------------------------------------------------------------------
  for (const src of Array.from(unmappedSources)) {
    const normSrc = normalizeKey(src);

    for (const target of targetFields) {
      if (usedTargets.has(target.name)) continue;

      const normTarget = normalizeKey(target.name);
      const targetSynonyms = SYNONYM_DICTIONARY[normTarget] || [];
      const srcSynonyms = SYNONYM_DICTIONARY[normSrc] || [];

      const isSynonymMatch = targetSynonyms.includes(normSrc) || srcSynonyms.includes(normTarget);

      if (isSynonymMatch) {
        mappings[src] = target.name;
        usedTargets.add(target.name);
        unmappedSources.delete(src);

        matchDetails.push({
          sourceColumn: src,
          targetField: target.name,
          targetLabel: target.label || target.name,
          targetType: target.type,
          isRequired: Boolean(target.required),
          matchType: 'synonym',
          confidence: 0.95,
          confidencePercent: 95,
          scoreLabel: 'Synonym Match'
        });
        break;
      }
    }
  }

  // ------------------------------------------------------------------------
  // Pass 3: Tier 3 - Token Overlap & Substring Match (80-88% confidence)
  // ------------------------------------------------------------------------
  for (const src of Array.from(unmappedSources)) {
    let bestCandidate = null;
    let highestScore = 0;

    for (const target of targetFields) {
      if (usedTargets.has(target.name)) continue;

      const overlapScore = calculateTokenOverlap(src, target.name);
      const labelOverlap = calculateTokenOverlap(src, target.label || '');
      const maxOverlap = Math.max(overlapScore, labelOverlap);

      // Check substring containment if length > 3
      const normSrc = normalizeKey(src);
      const normTarget = normalizeKey(target.name);
      const isSubstring = (normSrc.length >= 4 && normTarget.includes(normSrc)) ||
                          (normTarget.length >= 4 && normSrc.includes(normTarget));

      const score = isSubstring ? Math.max(maxOverlap, 0.85) : maxOverlap;

      if (score >= 0.5 && score > highestScore) {
        highestScore = score;
        bestCandidate = target;
      }
    }

    if (bestCandidate && highestScore >= 0.5) {
      mappings[src] = bestCandidate.name;
      usedTargets.add(bestCandidate.name);
      unmappedSources.delete(src);

      matchDetails.push({
        sourceColumn: src,
        targetField: bestCandidate.name,
        targetLabel: bestCandidate.label || bestCandidate.name,
        targetType: bestCandidate.type,
        isRequired: Boolean(bestCandidate.required),
        matchType: 'token',
        confidence: Math.round(highestScore * 100) / 100,
        confidencePercent: Math.round(highestScore * 100),
        scoreLabel: `${Math.round(highestScore * 100)}% Token Overlap`
      });
    }
  }

  // ------------------------------------------------------------------------
  // Pass 4: Tier 4 - Levenshtein Distance Fuzzy Match (>= fuzzyThreshold)
  // ------------------------------------------------------------------------
  for (const src of Array.from(unmappedSources)) {
    let bestCandidate = null;
    let highestFuzzyScore = 0;

    for (const target of targetFields) {
      if (usedTargets.has(target.name)) continue;

      const nameSimilarity = calculateStringSimilarity(src, target.name);
      const labelSimilarity = calculateStringSimilarity(src, target.label || '');
      const sim = Math.max(nameSimilarity, labelSimilarity);

      if (sim >= fuzzyThreshold && sim > highestFuzzyScore) {
        highestFuzzyScore = sim;
        bestCandidate = target;
      }
    }

    if (bestCandidate) {
      mappings[src] = bestCandidate.name;
      usedTargets.add(bestCandidate.name);
      unmappedSources.delete(src);

      matchDetails.push({
        sourceColumn: src,
        targetField: bestCandidate.name,
        targetLabel: bestCandidate.label || bestCandidate.name,
        targetType: bestCandidate.type,
        isRequired: Boolean(bestCandidate.required),
        matchType: 'fuzzy',
        confidence: Math.round(highestFuzzyScore * 100) / 100,
        confidencePercent: Math.round(highestFuzzyScore * 100),
        scoreLabel: `${Math.round(highestFuzzyScore * 100)}% Fuzzy Match`
      });
    }
  }

  // ------------------------------------------------------------------------
  // Summary Metrics
  // ------------------------------------------------------------------------
  const unmatchedTargets = targetFields.filter(f => !usedTargets.has(f.name));
  const unmatchedSourceList = Array.from(unmappedSources);

  const exactCount = matchDetails.filter(m => m.matchType === 'exact').length;
  const synonymCount = matchDetails.filter(m => m.matchType === 'synonym').length;
  const tokenCount = matchDetails.filter(m => m.matchType === 'token').length;
  const fuzzyCount = matchDetails.filter(m => m.matchType === 'fuzzy').length;

  const requiredCount = targetFields.filter(f => f.required).length;
  const matchedRequiredCount = matchDetails.filter(m => m.isRequired).length;
  const missingRequired = unmatchedTargets.filter(f => f.required);

  return {
    mappings,
    matchDetails,
    summary: {
      totalSource: sourceColumns.length,
      totalTarget: targetFields.length,
      matchedCount: Object.keys(mappings).length,
      unmatchedSourceCount: unmatchedSourceList.length,
      unmatchedSources: unmatchedSourceList,
      unmatchedTargets: unmatchedTargets.map(f => f.name),
      missingRequiredTargets: missingRequired.map(f => f.name),
      requiredCount,
      matchedRequiredCount,
      isAllRequiredMatched: missingRequired.length === 0,
      breakdown: {
        exact: exactCount,
        synonym: synonymCount,
        token: tokenCount,
        fuzzy: fuzzyCount
      }
    }
  };
}
