import { BuyerInfo, TICKET_LIFETIME_MS } from './crypto';

export interface SeatItem {
  id: string;
  status: number; // 0=EMPTY, 1=RESERVED, 2=OCCUPIED
  token: string | null;
  buyer: BuyerInfo | null;
  timerStart: number;
  durationMs: number;
}

interface GlobalSeatStore {
  seats: Record<string, SeatItem>;
  lastUpdated: number;
}

// globalThis에 캐시 유지
const globalStore = globalThis as unknown as { __cinemaSeatStore?: GlobalSeatStore };

if (!globalStore.__cinemaSeatStore) {
  globalStore.__cinemaSeatStore = {
    seats: {
      A1: { id: 'A1', status: 0, token: null, buyer: null, timerStart: 0, durationMs: TICKET_LIFETIME_MS },
      A2: { id: 'A2', status: 0, token: null, buyer: null, timerStart: 0, durationMs: TICKET_LIFETIME_MS },
      B1: { id: 'B1', status: 0, token: null, buyer: null, timerStart: 0, durationMs: TICKET_LIFETIME_MS },
      B2: { id: 'B2', status: 0, token: null, buyer: null, timerStart: 0, durationMs: TICKET_LIFETIME_MS },
    },
    lastUpdated: Date.now()
  };
}

export const seatStore = globalStore.__cinemaSeatStore;

/**
 * 만료된 좌석을 자동으로 비움 상태로 정리
 */
export function purgeExpiredSeats() {
  const now = Date.now();
  for (const seat of Object.values(seatStore.seats)) {
    if (seat.status !== 0) {
      if (now - seat.timerStart >= seat.durationMs) {
        seat.status = 0;
        seat.token = null;
        seat.buyer = null;
        seat.timerStart = 0;
        seatStore.lastUpdated = now;
      }
    }
  }
}

/**
 * 좌석 상태 요약 반환 (클라이언트 및 ESP32용)
 */
export function getSeatsSummary() {
  purgeExpiredSeats();
  const now = Date.now();

  return Object.values(seatStore.seats).map(s => {
    let remaining = 0;
    if (s.status !== 0) {
      const elapsed = now - s.timerStart;
      remaining = Math.max(0, Math.floor((s.durationMs - elapsed) / 1000));
    }
    return {
      id: s.id,
      status: s.status,
      led: s.status === 2 ? 1 : 0, // 2(점유)일 때만 LED 점등
      remainingSec: remaining,
      buyerName: s.buyer ? s.buyer.name : null
    };
  });
}
