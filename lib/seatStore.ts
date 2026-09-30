import { BuyerInfo, TICKET_LIFETIME_MS } from './crypto';
import { supabase } from './supabase';

export interface SeatItem {
  id: string;
  status: number; // 0=EMPTY, 1=RESERVED, 2=OCCUPIED
  token: string | null;
  buyer: BuyerInfo | null;
  timerStart: number;
  durationMs: number;
}

// 인메모리 폴백 캐시
const memoryCache: Record<string, SeatItem> = {
  A1: { id: 'A1', status: 0, token: null, buyer: null, timerStart: 0, durationMs: TICKET_LIFETIME_MS },
  A2: { id: 'A2', status: 0, token: null, buyer: null, timerStart: 0, durationMs: TICKET_LIFETIME_MS },
  B1: { id: 'B1', status: 0, token: null, buyer: null, timerStart: 0, durationMs: TICKET_LIFETIME_MS },
  B2: { id: 'B2', status: 0, token: null, buyer: null, timerStart: 0, durationMs: TICKET_LIFETIME_MS },
};

/**
 * 4개 좌석 상태 조회 (Supabase DB 우선, 실패 시 메모리 폴백)
 */
export async function getSeatsSummary() {
  const now = Date.now();

  try {
    const { data, error } = await supabase
      .from('cinema_seats')
      .select('*')
      .order('id', { ascending: true });

    if (error || !data || data.length === 0) {
      return getMemorySeatsSummary(now);
    }

    const expiredIds: string[] = [];

    const seats = data.map((row: { id: string; status: number; token: string | null; buyer_name: string | null; buyer_phone: string | null; timer_start: number; duration_ms: number }) => {
      let status = row.status;
      let remaining = 0;

      if (status !== 0) {
        const elapsed = now - Number(row.timer_start);
        const duration = Number(row.duration_ms) || TICKET_LIFETIME_MS;
        remaining = Math.max(0, Math.floor((duration - elapsed) / 1000));

        // 5분 만료 검사
        if (remaining <= 0) {
          status = 0;
          expiredIds.push(row.id);
        }
      }

      return {
        id: row.id,
        status: status,
        led: status === 2 ? 1 : 0,
        remainingSec: remaining,
        buyerName: status !== 0 ? row.buyer_name : null,
        token: row.token
      };
    });

    // 만료된 좌석 비동기 자동 초기화
    if (expiredIds.length > 0) {
      supabase
        .from('cinema_seats')
        .update({
          status: 0,
          token: null,
          buyer_name: null,
          buyer_phone: null,
          timer_start: 0,
          updated_at: new Date().toISOString()
        })
        .in('id', expiredIds)
        .then(() => {});
    }

    return seats;
  } catch {
    return getMemorySeatsSummary(now);
  }
}

/**
 * 좌석 예매 (Supabase DB 업데이트)
 */
export async function reserveSeat(seatId: string, token: string, buyer: BuyerInfo) {
  const now = Date.now();

  try {
    const { error } = await supabase
      .from('cinema_seats')
      .update({
        status: 1, // 5분 대기
        token: token,
        buyer_name: buyer.name,
        buyer_phone: buyer.phone,
        timer_start: now,
        duration_ms: TICKET_LIFETIME_MS,
        updated_at: new Date().toISOString()
      })
      .eq('id', seatId);

    if (error) {
      reserveMemory(seatId, token, buyer, now);
    }
  } catch {
    reserveMemory(seatId, token, buyer, now);
  }
}

/**
 * 좌석 QR 인증 확정 (Supabase DB 업데이트 -> 점유/LED ON)
 */
export async function verifySeat(seatId: string) {
  const now = Date.now();

  try {
    const { error } = await supabase
      .from('cinema_seats')
      .update({
        status: 2, // 점유 (LED ON)
        timer_start: now, // 관람 5분 타이머 시작
        duration_ms: TICKET_LIFETIME_MS,
        updated_at: new Date().toISOString()
      })
      .eq('id', seatId);

    if (error) {
      verifyMemory(seatId, now);
    }
  } catch {
    verifyMemory(seatId, now);
  }
}

/**
 * 좌석 초기화
 */
export async function releaseSeats(seatId?: string | null) {
  try {
    let query = supabase.from('cinema_seats').update({
      status: 0,
      token: null,
      buyer_name: null,
      buyer_phone: null,
      timer_start: 0,
      updated_at: new Date().toISOString()
    });

    if (seatId) {
      query = query.eq('id', seatId);
    } else {
      query = query.neq('id', '');
    }

    await query;
  } catch {}

  // 메모리도 리셋
  if (seatId && memoryCache[seatId]) {
    memoryCache[seatId].status = 0;
    memoryCache[seatId].token = null;
    memoryCache[seatId].buyer = null;
  } else {
    for (const s of Object.values(memoryCache)) {
      s.status = 0;
      s.token = null;
      s.buyer = null;
    }
  }
}

// ==========================================
// 인메모리 폴백 함수군
// ==========================================
function getMemorySeatsSummary(now: number) {
  return Object.values(memoryCache).map(s => {
    let remaining = 0;
    if (s.status !== 0) {
      const elapsed = now - s.timerStart;
      remaining = Math.max(0, Math.floor((s.durationMs - elapsed) / 1000));
      if (remaining <= 0) {
        s.status = 0;
        s.token = null;
        s.buyer = null;
      }
    }
    return {
      id: s.id,
      status: s.status,
      led: s.status === 2 ? 1 : 0,
      remainingSec: remaining,
      buyerName: s.status !== 0 && s.buyer ? s.buyer.name : null,
      token: s.token
    };
  });
}

function reserveMemory(seatId: string, token: string, buyer: BuyerInfo, now: number) {
  if (memoryCache[seatId]) {
    memoryCache[seatId].status = 1;
    memoryCache[seatId].token = token;
    memoryCache[seatId].buyer = buyer;
    memoryCache[seatId].timerStart = now;
    memoryCache[seatId].durationMs = TICKET_LIFETIME_MS;
  }
}

function verifyMemory(seatId: string, now: number) {
  if (memoryCache[seatId]) {
    memoryCache[seatId].status = 2;
    memoryCache[seatId].timerStart = now;
    memoryCache[seatId].durationMs = TICKET_LIFETIME_MS;
  }
}
