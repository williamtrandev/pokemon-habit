// ===== Đấu boss THEO LƯỢT, người chơi RA LỆNH — LÕI THUẦN, không phụ thuộc UI =====
//
// Vì sao có file này: `simulateBattle` trong battle.ts tính sẵn cả trận rồi UI chỉ phát lại
// như một đoạn phim — người chơi bấm "Xuất chiến" xong không còn quyết định gì nữa, nên
// thắng/thua chỉ do chọn đội. Đây là phiên bản TƯƠNG TÁC: mỗi lượt người chơi chọn 1 hành
// động, boss BÁO TRƯỚC đòn sắp ra, và đọc đúng dự báo mới là chỗ thắng.
//
// Vòng chơi:
//   1. Boss hiện Ý ĐỒ lượt tới (đòn thường / ĐÒN NẶNG / phòng thủ / hút máu).
//   2. Người chơi chọn: Đánh · Đỡ đòn · Dồn lực · Đổi con · Quả berry.
//   3. Boss ra đòn theo đúng ý đồ đã báo (trừ khi bị đánh choáng).
//
// Bốn đòn bẩy quyết định:
//   • ĐỠ ĐÒN chặn 75% sát thương -> đáp đúng ĐÒN NẶNG thì lời to, đỡ bừa thì mất lượt.
//   • DỒN LỰC ×2.2 nhưng ăn ĐÒN NẶNG là vỡ (đỡ được thì giữ) -> dồn ở lượt boss phòng thủ.
//   • Đánh KHẮC HỆ tích thanh Áp Chế; đầy thanh -> boss CHOÁNG, mất nguyên một lượt.
//   • Boss 3 pha đổi hệ (dùng chung phasesOf/phaseAt), nên phải đổi con theo pha.
//
// Đo bằng mô phỏng: KHÔNG có "Đỡ đòn" thì bấm-Đánh-liên-tục là nước đi tối ưu tuyệt đối
// (mọi lượt không gây sát thương đều lỗ), nên trận lại thành vô nghĩa như bản tự chạy.
//
// Vẫn TẤT ĐỊNH: rng nằm TRONG state, `stepLive` là hàm thuần -> test được, phát lại khớp.
import {
  Combatant, BossPhase, phasesOf, phaseAt, rollDamage, typeMultiplier,
  ENRAGE_ATK_MUL, signatureMove,
} from './battle';

export const MAX_LINEUP = 3;      // số Pokémon mang ra đấu

// ===== Boss cho chế độ TƯƠNG TÁC =====
// Bội thêm lên máu/công của boss so với bảng BOSS_TIERS (bảng đó cân cho trận tự chạy).
// Trận tự chạy dài 5-7 lượt: chưa kịp đọc ý đồ boss lần nào thì đã xong. Nhân máu để kéo
// lên 9-12 lượt — đủ dài để mỗi quyết định đáng giá.
//
// QUAN TRỌNG: bảng khắc hệ chạy CẢ HAI CHIỀU. Hệ pha của boss được chọn ngẫu nhiên nên nó
// cũng thường xuyên khắc ×2 vào đội của người chơi (đo trên máy: một ĐÒN NẶNG Thép ăn 274
// máu của Mega Tyranitar 300 máu). Bản dò hệ số đầu tiên bỏ sót đúng chiều này nên cho số
// quá lạc quan; ×1.8/×1.2 hoá ra là 37%/15%/2% ở Khó/Cực khó/Huyền thoại — gần như không
// thắng nổi ở đúng những bậc thưởng nhiều nhất.
//
// Đo lại 60 seed, boss Thép/Siêu năng có lợi thế hệ ngược lại, đội 3 con (1×510 + 2×700):
//   chơi khéo   98% / 95% / 68% / 65% / 30%   (Dễ → Huyền thoại)
//   bấm bừa     95% / 60% / 20% /  3% /  2%
// Bấm bừa rụng từ bậc Thường, chơi đúng bài thì mọi bậc đều có đường thắng.
export const LIVE_HP_MUL = 1.4;
export const LIVE_ATK_MUL = 1.0;

// ===== Hằng số cân bằng =====
export const CHARGE_MUL = 2.2;    // dồn lực -> đòn kế tiếp
export const BERRY_HEAL = 0.35;   // berry hồi bao nhiêu phần máu tối đa
export const BERRY_COUNT = 2;     // số berry cho CẢ trận
export const STAGGER_MAX = 5;     // đầy thanh Áp Chế -> boss choáng
export const STAGGER_SUPER = 2;   // đòn ×2 tích bấy nhiêu
export const STAGGER_QUAD = 3;    // đòn ×4 tích bấy nhiêu
export const STAGGER_PARRY = 3;   // ĐỠ TRÚNG một ĐÒN NẶNG -> phản đòn, tích bấy nhiêu

// ===== TUYỆT CHIÊU (chiêu thức đặc biệt) =====
// Mỗi con có thanh NỘ riêng: +1 khi ra đòn, +1 khi TRÚNG đòn boss (giữ nguyên khi rút về).
// Đầy SPECIAL_ENERGY điểm là bung được. Khác Dồn lực ở ba chỗ, nên là nước đi riêng chứ
// không phải "Dồn lực bản to":
//   • Tích THỤ ĐỘNG qua giao tranh — không tốn lượt để nạp, không bị ĐÒN NẶNG phá vỡ.
//   • XUYÊN phòng thủ của boss (Dồn lực bung vào lượt boss guard chỉ ăn nửa).
//   • Cộng thẳng Áp Chế (kể cả khi không khắc hệ) -> đường tới choáng cho đội lệch hệ.
export const SPECIAL_ENERGY = 4;   // số nộ để đầy thanh
export const SPECIAL_MUL = 2.4;    // bội sát thương tuyệt chiêu
export const STAGGER_SPECIAL = 2;  // tuyệt chiêu cộng thẳng bấy nhiêu Áp Chế

// Trận tương tác dài hơn trận tự chạy, nên mốc "đánh chậm" của battle.ts (8 lượt/pha)
// siết quá tay: chơi phòng thủ đúng bài lại bị boss hồi máu tới mức bất khả thắng.
export const LIVE_STALL_ROUNDS = 12;
export const LIVE_STALL_REGEN = 0.04;
export const HEAVY_MUL = 1.9;     // ĐÒN NẶNG của boss
export const GUARD_TAKEN = 0.5;   // boss phòng thủ -> đòn ta yếu đi
export const DRAIN_LEECH = 0.4;   // boss hút máu = 40% sát thương gây ra
export const SWAP_TAKEN = 0.75;   // con vừa vào sân chịu đòn nhẹ hơn
export const BLOCK_TAKEN = 0.25;  // đỡ đòn chặn 75% sát thương lượt đó

// ===== Ý đồ boss (báo trước 1 lượt) =====
export type BossIntent = 'strike' | 'heavy' | 'guard' | 'drain';

export const INTENT_VI: Record<BossIntent, { label: string; hint: string; color: string }> = {
  strike: { label: 'Đòn thường', hint: 'Cứ đánh trả', color: '#94A3B8' },
  heavy: { label: 'ĐÒN NẶNG', hint: `×${HEAVY_MUL} sát thương · phá Dồn lực — nên đổi con`, color: '#EF4444' },
  guard: { label: 'Phòng thủ', hint: 'Boss không đánh · đòn ta yếu nửa — lượt để Dồn lực', color: '#3B82F6' },
  drain: { label: 'Hút máu', hint: `Boss hồi ${Math.round(DRAIN_LEECH * 100)}% sát thương gây ra`, color: '#A855F7' },
};

export type LiveAction =
  | { kind: 'attack' }
  | { kind: 'special' } // tuyệt chiêu — cần thanh nộ đầy
  | { kind: 'block' }
  | { kind: 'charge' }
  | { kind: 'swap'; index: number }
  | { kind: 'berry' };

// Một mẩu chuyện của lượt vừa rồi — UI phát lần lượt để ra animation.
export interface LiveEvent {
  kind: 'player-hit' | 'special' | 'boss-hit' | 'charge' | 'block' | 'swap' | 'berry' | 'break' | 'guard' | 'drain' | 'faint' | 'phase' | 'regen' | 'shatter';
  text: string;
  dmg?: number;
  mult?: number;
  crit?: boolean;
  heal?: number;
  key?: string; // con liên quan (vào sân / gục / được hồi)
  move?: string; // tên chiêu vừa dùng (nếu con đó có bộ chiêu) — UI hiện banner/nhật ký
}

export interface LiveState {
  team: Combatant[];
  hp: number[];          // máu RIÊNG từng con, giữ nguyên khi rút về
  active: number;
  boss: Combatant;       // boss GỐC (maxHp/atk chưa đổi theo pha)
  bossHp: number;
  phases: BossPhase[];
  phase: number;
  charge: boolean;       // đang dồn lực
  energy: number[];      // NỘ riêng từng con (0..SPECIAL_ENERGY), giữ nguyên khi rút về
  berries: number;
  stagger: number;
  intent: BossIntent;    // đòn boss SẼ ra ở lượt tới
  turn: number;
  roundsInPhase: number;
  over: null | 'win' | 'lose';
  rng: number;           // trạng thái LCG -> state thuần, test được
  log: LiveEvent[];      // sự kiện của LƯỢT vừa rồi
}

function lcgNext(s: number): number {
  return (Math.imul(s >>> 0 || 1, 1664525) + 1013904223) >>> 0;
}

// Boss ở pha hiện tại: đổi hệ, pha cuối cộng bội công.
export function bossAtPhase(boss: Combatant, phases: BossPhase[], phase: number): Combatant {
  const p = phases[phase] ?? phases[0];
  return { ...boss, types: p.types, atk: p.enraged ? Math.round(boss.atk * ENRAGE_ATK_MUL) : boss.atk };
}

// Ý đồ lượt tới. Pha nổi giận ra ĐÒN NẶNG nhiều hơn và ít phòng thủ hơn.
function pickIntent(r: number, enraged: boolean): BossIntent {
  const table: [BossIntent, number][] = enraged
    ? [['strike', 3], ['heavy', 4], ['guard', 1], ['drain', 2]]
    : [['strike', 4], ['heavy', 2], ['guard', 2], ['drain', 2]];
  const total = table.reduce((s, [, w]) => s + w, 0);
  let x = r * total;
  for (const [k, w] of table) { if (x < w) return k; x -= w; }
  return 'strike';
}

export function startLive(team: Combatant[], boss: Combatant, seed: number, auraTypes: [string, string]): LiveState {
  const phases = phasesOf(boss.types, auraTypes);
  const rng0 = lcgNext(seed);
  return {
    team,
    hp: team.map((c) => c.maxHp),
    active: 0,
    boss,
    bossHp: boss.maxHp,
    phases,
    phase: 0,
    charge: false,
    energy: team.map(() => 0),
    berries: BERRY_COUNT,
    stagger: 0,
    intent: pickIntent(rng0 / 4294967296, false),
    turn: 0,
    roundsInPhase: 0,
    over: team.length ? null : 'lose',
    rng: rng0,
    log: [],
  };
}

// Hành động có hợp lệ ở trạng thái này không (UI khoá nút theo đây).
export function canAct(s: LiveState, a: LiveAction): boolean {
  if (s.over) return false;
  switch (a.kind) {
    case 'attack': return true;
    case 'special': return (s.energy[s.active] ?? 0) >= SPECIAL_ENERGY;
    case 'block': return true;
    case 'charge': return !s.charge;
    case 'berry': return s.berries > 0 && s.hp[s.active] < s.team[s.active].maxHp;
    case 'swap': return a.index !== s.active && (s.hp[a.index] ?? 0) > 0;
  }
}

// MỘT lượt: người chơi ra tay -> boss ra tay -> xử pha/hồi máu -> báo ý đồ mới.
export function stepLive(s0: LiveState, action: LiveAction): LiveState {
  if (s0.over || !canAct(s0, action)) return s0;

  let seed = s0.rng;
  const rng = () => { seed = lcgNext(seed); return seed / 4294967296; };

  const hp = [...s0.hp];
  const energy = [...s0.energy];
  const gainEnergy = (i: number) => { energy[i] = Math.min(SPECIAL_ENERGY, (energy[i] ?? 0) + 1); };
  let { bossHp, active, charge, berries, stagger, phase, roundsInPhase } = s0;
  const log: LiveEvent[] = [];
  const intent = s0.intent;
  const boss = bossAtPhase(s0.boss, s0.phases, phase);
  const guarding = intent === 'guard';
  let over: LiveState['over'] = null;

  // ===== 1. Người chơi =====
  switch (action.kind) {
    case 'attack': {
      const me = s0.team[active];
      const r = rollDamage(me, boss, rng, {
        atkMul: charge ? CHARGE_MUL : 1,
        takenMul: guarding ? GUARD_TAKEN : 1,
      });
      bossHp = Math.max(0, bossHp - r.dmg);
      log.push({
        kind: 'player-hit', dmg: r.dmg, mult: r.mult, crit: r.crit, key: me.key, move: r.move,
        text: r.move
          ? `${me.name} dùng ${r.move}${charge ? ' DỒN LỰC' : ''}! ${r.dmg} sát thương.${r.crit ? ' Chí mạng! 💥' : ''}`
          : `${me.name} ra đòn${charge ? ' DỒN LỰC' : ''}! ${r.dmg} sát thương.${r.crit ? ' Chí mạng! 💥' : ''}`,
      });
      charge = false;
      gainEnergy(active);
      if (r.mult >= 4) stagger += STAGGER_QUAD;
      else if (r.mult >= 2) stagger += STAGGER_SUPER;
      break;
    }
    case 'special': {
      // Tuyệt chiêu: XUYÊN phòng thủ (không nhân GUARD_TAKEN), cộng thẳng Áp Chế,
      // vẫn cộng dồn với Dồn lực nếu đang giữ (hiếm khi làm được — phần thưởng xứng đáng).
      // Mang TÊN chiêu lực cao nhất của con đó (Petal Dance! Hyper Beam!...).
      const me = s0.team[active];
      const sig = signatureMove(me);
      const r = rollDamage(me, boss, rng, { atkMul: SPECIAL_MUL * (charge ? CHARGE_MUL : 1) });
      bossHp = Math.max(0, bossHp - r.dmg);
      log.push({
        kind: 'special', dmg: r.dmg, mult: r.mult, crit: r.crit, key: me.key, move: sig?.name,
        text: `${me.name} tung TUYỆT CHIÊU${sig ? ` ${sig.name}` : ''}${guarding ? ' xuyên thủng phòng thủ' : ''}! ${r.dmg} sát thương!${r.crit ? ' Chí mạng! 💥' : ''}`,
      });
      charge = false;
      energy[active] = 0;
      stagger += STAGGER_SPECIAL;
      if (r.mult >= 4) stagger += STAGGER_QUAD;
      else if (r.mult >= 2) stagger += STAGGER_SUPER;
      break;
    }
    case 'block':
      log.push({ kind: 'block', text: `${s0.team[active].name} vào thế ĐỠ ĐÒN — chặn ${Math.round((1 - BLOCK_TAKEN) * 100)}% sát thương!` });
      break;
    case 'charge':
      charge = true;
      log.push({ kind: 'charge', text: `${s0.team[active].name} dồn lực — đòn sau ×${CHARGE_MUL}!` });
      break;
    case 'swap':
      active = action.index;
      log.push({ kind: 'swap', key: s0.team[active].key, text: `Đổi con — ${s0.team[active].name} vào sân!` });
      break;
    case 'berry': {
      const me = s0.team[active];
      const heal = Math.min(Math.round(me.maxHp * BERRY_HEAL), me.maxHp - hp[active]);
      hp[active] += heal;
      berries -= 1;
      log.push({ kind: 'berry', heal, key: me.key, text: `${me.name} ăn berry — hồi ${heal} HP!` });
      break;
    }
  }

  // ===== 2. Áp Chế: đầy thanh -> boss choáng NGAY, mất lượt này =====
  let stunned = false;
  if (stagger >= STAGGER_MAX && bossHp > 0) {
    stunned = true;
    stagger = 0;
    log.push({ kind: 'break', text: 'ÁP CHẾ! Boss choáng — mất nguyên một lượt!' });
  }

  // ===== 3. Boss =====
  if (bossHp <= 0) {
    over = 'win';
  } else if (guarding) {
    log.push({ kind: 'guard', text: 'Boss phòng thủ — đòn của ta chỉ ăn một nửa.' });
  } else if (!stunned) {
    const target = s0.team[active];
    const blocking = action.kind === 'block';
    const r = rollDamage(boss, target, rng, {
      atkMul: intent === 'heavy' ? HEAVY_MUL : 1,
      takenMul: blocking ? BLOCK_TAKEN : action.kind === 'swap' ? SWAP_TAKEN : 1,
    });
    hp[active] = Math.max(0, hp[active] - r.dmg);
    if (r.dmg > 0) gainEnergy(active); // trúng đòn cũng tích nộ — bị ép phòng thủ vẫn có đường tiến
    log.push({
      kind: 'boss-hit', dmg: r.dmg, mult: r.mult, crit: r.crit, key: target.key, move: r.move,
      text: `${s0.boss.name} ${intent === 'heavy' ? `giáng ĐÒN NẶNG${r.move ? ` ${r.move}` : ''}` : r.move ? `phản công bằng ${r.move}` : 'phản công'}! ${target.name} ${blocking ? 'đỡ được, chỉ' : 'mất'} ${r.dmg} HP.${r.crit ? ' Chí mạng! 💥' : ''}`,
    });
    // Đòn nặng phá vỡ dồn lực — TRỪ KHI đỡ được. Nên lúc đang dồn mà boss báo đòn nặng
    // thì có hai đường: bung ra ngay, hoặc đỡ để giữ.
    if (intent === 'heavy' && charge && !blocking) {
      charge = false;
      log.push({ kind: 'shatter', text: 'Đòn nặng PHÁ VỠ Dồn lực!' });
    }
    // PHẢN ĐÒN: đỡ trúng đòn nặng thì tích Áp Chế. Không có luật này thì phòng thủ chỉ là
    // hoãn cái chết (đo được: đỡ đúng bài vẫn thua nhiều hơn bấm-Đánh-liên-tục), vì giảm
    // sát thương không đổi được thành sát thương gây ra.
    if (intent === 'heavy' && blocking) {
      stagger += STAGGER_PARRY;
      log.push({ kind: 'block', text: `ĐỠ TRÚNG đòn nặng! Phản lại +${STAGGER_PARRY} Áp Chế.` });
    }
    if (intent === 'drain' && r.dmg > 0) {
      const heal = Math.min(Math.round(r.dmg * DRAIN_LEECH), s0.boss.maxHp - bossHp);
      if (heal > 0) {
        bossHp += heal;
        log.push({ kind: 'drain', heal, text: `Boss hút ${heal} HP về!` });
      }
    }
    if (hp[active] <= 0) {
      log.push({ kind: 'faint', key: target.key, text: `${target.name} gục ngã!` });
      // Mất thế: gục là XOÁ thanh Áp Chế. Không có luật này thì "để nó chết cho con sau
      // vào" lại là cách đổi con RẺ NHẤT (khỏi mất lượt), và mọi lựa chọn phòng thủ thành vô nghĩa.
      stagger = 0;
      const nx = hp.findIndex((h) => h > 0);
      if (nx < 0) over = 'lose';
      else {
        active = nx;
        log.push({ kind: 'swap', key: s0.team[nx].key, text: `Tiến lên, ${s0.team[nx].name}!` });
      }
    }
  }

  // ===== 4. Đổi pha / đánh chậm bị hồi máu =====
  if (!over) {
    if (bossHp <= 0) over = 'win';
    else {
      const np = phaseAt(bossHp / s0.boss.maxHp);
      if (np !== phase) {
        phase = np;
        roundsInPhase = 0;
        const ph = s0.phases[np];
        log.push({
          kind: 'phase',
          text: ph.enraged
            ? `Pha ${np + 1}/3 — Boss NỔI GIẬN và đổi hệ!`
            : `Pha ${np + 1}/3 — Boss đổi hệ!`,
        });
      } else {
        roundsInPhase += 1;
        if (roundsInPhase > LIVE_STALL_ROUNDS) {
          const heal = Math.min(Math.round(s0.boss.maxHp * LIVE_STALL_REGEN), s0.boss.maxHp - bossHp);
          if (heal > 0) {
            bossHp += heal;
            log.push({ kind: 'regen', heal, text: `Đánh chậm quá — boss hồi ${heal} HP!` });
          }
        }
      }
    }
  }

  const enragedNext = s0.phases[phase]?.enraged ?? false;
  return {
    ...s0,
    hp, energy, active, bossHp, charge, berries, stagger, phase, roundsInPhase, over,
    intent: over ? s0.intent : pickIntent(rng(), enragedNext),
    turn: s0.turn + 1,
    rng: seed,
    log,
  };
}

// ===== Khớp hệ của MỘT con với cả 3 pha boss =====
// Tính cả hai chiều vì bảng khắc hệ chạy hai chiều: con đánh mạnh mà nhận cũng nặng thì
// không phải lựa chọn tốt. `score` dùng để xếp danh sách chọn quân.
export interface Matchup {
  mults: number[];  // đòn TA gây, theo từng pha
  taken: number[];  // đòn BOSS gây lại, theo từng pha
  cover: number;    // số pha ta gây ×2 trở lên
  risk: number;     // số pha ta nhận ×2 trở lên
  immune: number;   // số pha đòn ta vô hiệu
  score: number;    // cover − risk
}

export function matchupOf(types: string[], phases: BossPhase[]): Matchup {
  const mults = phases.map((ph) => typeMultiplier(types, ph.types));
  const taken = phases.map((ph) => typeMultiplier(ph.types, types));
  const cover = mults.filter((m) => m >= 2).length;
  const risk = taken.filter((m) => m >= 2).length;
  return { mults, taken, cover, risk, immune: mults.filter((m) => m === 0).length, score: cover - risk };
}

// ===== Nước đi tự động (nút "Tự đánh") =====
// Chơi đúng bài mà UI đã dạy, theo thứ tự ưu tiên:
//   1. Boss phòng thủ -> lượt an toàn: dồn lực (đánh vào lúc này chỉ ăn nửa).
//   2. Boss báo ĐÒN NẶNG -> đỡ đòn; đang dồn lực thì bung ra ngay cũng được.
//   3. Sắp gục -> berry.
//   4. Con dự bị khắc hệ HƠN HẲN -> đổi (đổi lắt nhắt là mất lượt vô ích).
export function autoAction(s: LiveState): LiveAction {
  const me = s.team[s.active];
  const ratio = s.hp[s.active] / Math.max(1, me.maxHp);
  const bossNow = bossAtPhase(s.boss, s.phases, s.phase);
  const myMult = typeMultiplier(me.types, bossNow.types);

  // Con dự bị khắc hệ tốt nhất ở pha này (còn sống, còn kha khá máu).
  let best = -1, bestMult = myMult;
  s.team.forEach((c, i) => {
    if (i === s.active || s.hp[i] <= 0) return;
    if (s.hp[i] / c.maxHp < 0.25) return; // con gần chết thì đổi vào chỉ để gục
    const m = typeMultiplier(c.types, bossNow.types);
    if (m > bestMult) { bestMult = m; best = i; }
  });

  // Nộ đầy thì bung: lượt boss phòng thủ là điểm bung ĐẸP NHẤT (tuyệt chiêu xuyên guard,
  // đòn thường chỉ ăn nửa), còn lại bung sớm để bắt đầu tích lại.
  if (canAct(s, { kind: 'special' }) && s.intent !== 'heavy') return { kind: 'special' };

  if (s.intent === 'guard') return s.charge ? { kind: 'attack' } : { kind: 'charge' };
  if (s.intent === 'heavy') return s.charge ? { kind: 'attack' } : { kind: 'block' };
  if (ratio < 0.3 && s.berries > 0 && canAct(s, { kind: 'berry' })) return { kind: 'berry' };

  // Đổi chỉ khi CHÊNH LỆCH đáng một lượt: gấp đôi hệ số, hoặc đòn đang vô hiệu.
  if (best >= 0 && (myMult === 0 || bestMult >= myMult * 2)) return { kind: 'swap', index: best };
  return { kind: 'attack' };
}
