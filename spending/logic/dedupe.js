// One purchase, many messages: the bank's push, its SMS and the wallet's notification are glued
// into one operation; a hold and the final debit become one; a transfer out of one bank and in
// to another in the same minutes is the owner moving his own money. Pure: no Android, no native.
//
// An operation here: { id, at (ms), type, amount, currency, amountBase, card, merchant (as the bank
// wrote it), name, sender, source ('push'|'sms'|'wallet'|'manual'|'import'), balance, bank,
// rawHash, dupOf, internal, fx }.
var merchant = require('./merchant.js');

var FAMILY = {
  purchase: 'debit', hold: 'debit', fee: 'debit', transfer_out: 'out', refund: 'refund',
  transfer_in: 'in', income: 'in', cashback: 'cashback', declined: 'declined'
};

/** How much the record says: the one that says most stays, the others point to it. */
function richness(tx) {
  var score = 0;
  if (tx.merchant) score += 3;
  if (tx.card) score += 1;
  if (tx.balance !== null && tx.balance !== undefined) score += 1;
  if (tx.bank) score += 1;
  if (tx.source !== 'wallet') score += 1;
  if (tx.raw) score += 0.5;
  return score;
}

function sameMoney(a, b) {
  return (a.currency || 'RUB') === (b.currency || 'RUB') && Math.abs(Number(a.amount) - Number(b.amount)) < 0.005;
}

function cardsAgree(a, b) {
  return !a.card || !b.card || String(a.card) === String(b.card);
}

/** Shops agree when one of them is unknown (a wallet says no shop) or the names are alike. */
function namesAgree(a, b) {
  if (!a.merchant || !b.merchant) return true;
  if (a.name && b.name && a.name === b.name) return true;
  return merchant.similar(a.merchant, b.merchant);
}

function balancesAgree(a, b) {
  var x = a.balance;
  var y = b.balance;
  return x === null || x === undefined || y === null || y === undefined || Math.abs(x - y) < 0.01;
}

/**
 * The earlier record this new one repeats, or null. Repeats come from different senders (the push
 * and the SMS of one purchase); two messages of one sender are two purchases — unless they are
 * the very same text (one notification shown twice).
 */
function duplicateOf(tx, recent, windowMs) {
  var family = FAMILY[tx.type];
  var best = null;
  (recent || []).forEach(function (other) {
    if (other.id === tx.id || other.dupOf) return;
    if (FAMILY[other.type] !== family) return;
    if (Math.abs(other.at - tx.at) > windowMs) return;
    if (!sameMoney(tx, other) || !cardsAgree(tx, other) || !namesAgree(tx, other) || !balancesAgree(tx, other)) return;
    var sameText = tx.rawHash && other.rawHash && tx.rawHash === other.rawHash;
    if (!sameText && tx.sender && other.sender && String(tx.sender).toLowerCase() === String(other.sender).toLowerCase()) return;
    if (!best || Math.abs(other.at - tx.at) < Math.abs(best.at - tx.at)) best = other;
  });
  return best;
}

/** Of two records of one operation, which stays: the richer, and the earlier on a tie. */
function primary(a, b) {
  var ra = richness(a);
  var rb = richness(b);
  if (ra !== rb) return ra > rb ? a : b;
  return a.at <= b.at ? a : b;
}

/**
 * The hold this final debit closes: a hold in the same shop, from 0 to holdDays days earlier,
 * with the amount within ±tolerance percent. Or null.
 */
function holdFor(tx, holds, holdDays, tolerancePct) {
  if (tx.type !== 'purchase') return null;
  var best = null;
  (holds || []).forEach(function (hold) {
    if (hold.type !== 'hold' || hold.dupOf || hold.id === tx.id) return;
    if (hold.at > tx.at || tx.at - hold.at > holdDays * 864e5) return;
    if (!hold.merchant || !tx.merchant || !merchant.similar(hold.merchant, tx.merchant)) return;
    if (!cardsAgree(hold, tx)) return;
    var a = hold.currency === tx.currency ? hold.amount : hold.amountBase;
    var b = hold.currency === tx.currency ? tx.amount : tx.amountBase;
    if (!a || !b) return;
    var diff = Math.abs(a - b) / a * 100;
    if (diff > tolerancePct) return;
    if (!best || diff < best.diff) best = { hold: hold, diff: diff };
  });
  return best ? best.hold : null;
}

/**
 * A purchase abroad counted at the CBR rate, which this ruble debit settles: the same shop within
 * days, the ruble sum within ±tolerance percent of the estimate. Or null.
 */
function settles(tx, estimated, days, tolerancePct, baseCurrency) {
  if (tx.type !== 'purchase' || (tx.currency || 'RUB') !== (baseCurrency || 'RUB')) return null;
  var best = null;
  (estimated || []).forEach(function (other) {
    if (other.fx !== 'cbr' || other.dupOf || other.id === tx.id) return;
    if (other.at > tx.at || tx.at - other.at > days * 864e5) return;
    if (!other.merchant || !tx.merchant || !merchant.similar(other.merchant, tx.merchant)) return;
    if (!other.amountBase) return;
    var diff = Math.abs(other.amountBase - tx.amount) / other.amountBase * 100;
    if (diff > tolerancePct) return;
    if (!best || diff < best.diff) best = { tx: other, diff: diff };
  });
  return best ? best.tx : null;
}

/**
 * The other half of a transfer between the owner's own accounts: out of one bank and in to
 * another, the same amount, within the window. Or null.
 */
function internalPair(tx, recent, windowMs) {
  var wanted = tx.type === 'transfer_out' ? ['transfer_in', 'income'] : (tx.type === 'transfer_in' || tx.type === 'income') ? ['transfer_out'] : null;
  if (!wanted) return null;
  var best = null;
  (recent || []).forEach(function (other) {
    if (other.id === tx.id || other.dupOf || wanted.indexOf(other.type) < 0) return;
    if (Math.abs(other.at - tx.at) > windowMs || !sameMoney(tx, other)) return;
    // Two halves of one transfer come from two different places.
    var bankA = String(tx.bank || tx.sender || '');
    var bankB = String(other.bank || other.sender || '');
    if (bankA && bankB && bankA === bankB && tx.card && other.card && tx.card === other.card) return;
    if (!best || Math.abs(other.at - tx.at) < Math.abs(best.at - tx.at)) best = other;
  });
  return best;
}

exports.FAMILY = FAMILY;
exports.richness = richness;
exports.duplicateOf = duplicateOf;
exports.primary = primary;
exports.holdFor = holdFor;
exports.settles = settles;
exports.internalPair = internalPair;
