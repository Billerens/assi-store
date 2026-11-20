export const OUTFIT_COST = [0, 24, 65, 135];
export const GEARS = ['magnet', 'boost'];
export const UPGRADE_COST = [16, 46, 95];
const integer = n => Number.isSafeInteger(n) && n > 0 ? n : 0;
const index = n => Number.isInteger(n) && n >= 0 && n < 4;

function boardAward(p, i) {
  return [true, p.bestBank > 0, p.bestDistance >= 1000 || p.fixed.some(r => r.meters >= 1000), p.fullWave][i];
}

export function updateBoards(p) {
  p.ownedBoards = [...new Set([...p.ownedBoards, ...[0,1,2,3].filter(i => boardAward(p, i))])].sort();
}

export function restoreEconomy(p) {
  p.wallet = integer(p.wallet);
  p.gear = Object.fromEntries(GEARS.map(id => [id, Math.min(3, integer(p.gear?.[id]))]));
  p.skin = index(p.skin) ? p.skin : 0;
  p.outfit = index(p.outfit) ? p.outfit : 0;
  const owned = (values, equipped) => [...new Set([0, equipped, ...(Array.isArray(values) ? values.filter(index) : [])])].sort();
  p.ownedOutfits = owned(p.ownedOutfits, p.outfit);
  p.ownedBoards = owned(p.ownedBoards, p.skin);
  updateBoards(p);
  const known = [p.last, ...p.rows, ...p.fixed].map(r => r?.id).filter(Boolean);
  p.settled = [...new Set([...(Array.isArray(p.settled) ? p.settled : []), ...known])];
  return p;
}

export function award(p, run) {
  if (!run?.id || !['open','fixed'].includes(run.mode) || p.settled.includes(run.id)) return false;
  p.settled.push(run.id);
  p.wallet += integer(run.tokens);
  return true;
}

// Every transaction returns a complete profile for the same save used for the race.
// Replaying a click for a level that was already bought leaves the wallet intact.
export function trade(p, type, id, expectedLevel) {
  if (type === 'outfit' && index(id)) {
    if (p.ownedOutfits.includes(id)) return id === p.outfit ? p : {...p, outfit:id};
    const price = OUTFIT_COST[id];
    return p.wallet < price ? p : {...p, wallet:p.wallet-price, ownedOutfits:[...p.ownedOutfits,id], outfit:id};
  }
  if (type === 'board' && p.ownedBoards.includes(id)) return p.skin === id ? p : {...p, skin:id};
  if (type === 'gear' && GEARS.includes(id)) {
    const level = p.gear[id], price = UPGRADE_COST[level];
    if (level !== expectedLevel || price === undefined || p.wallet < price) return p;
    return {...p, wallet:p.wallet-price, gear:{...p.gear, [id]:level+1}};
  }
  return p;
}
