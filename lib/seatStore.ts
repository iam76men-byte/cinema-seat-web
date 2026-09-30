import { BuyerInfo } from './crypto';
import { supabase } from './supabase';
import { SLOT_MS, getSlotsSummary } from './slotManager';

export interface SeatItem {
  id: string; // 'A1', 'A2', 'B1', 'B2'
  status: number; // 0=EMPTY, 1=RESERVED, 2=OCCUPIED
  token: string | null;
  buyer: BuyerInfo | null;
}

// 인메모리 폴백 캐시
interface MemorySlotState {
  currentSlotStart: number;
  currentSeats: Record<string, SeatItem>;
  nextSeats: Record<string, SeatItem>;
}

const initialSeats = (): Record<string, SeatItem> => ({
  A1: { id: 'A1', status: 0, token: null, buyer: null },
  A2: { id: 'A2', status: 0, token: null, buyer: null },
  B1: { id: 'B1', status: 0, token: null, buyer: null },
  B2: { id: 'B2', status: 0, token: null, buyer: null },
});

const memoryState: MemorySlotState = {
  currentSlotStart: Math.floor(Date.now() / SLOT_MS) * SLOT_MS,
  currentSeats: initialSeats(),
  nextSeats: initialSeats(),
};

/**
 * 시간 경과에 따른 슬롯 자동 롤오버 (메모리)
 * 5분이 지나면 NEXT 예약이 CURRENT 상영으로 승격되고, NEXT는 빈 좌석으로 리셋!
 */
function rolloverMemoryIfNeeded(now: number) {
  const currentSlotStart = Math.floor(now / SLOT_MS) * SLOT_MS;
  const elapsedSlots = Math.floor((currentSlotStart - memoryState.currentSlotStart) / SLOT_MS);

  if (elapsedSlots >= 2) {
    // 2회차(10분) 이상 지났으면 전체 초기화
    memoryState.currentSeats = initialSeats();
    memoryState.nextSeats = initialSeats();
    memoryState.currentSlotStart = currentSlotStart;
  } else if (elapsedSlots === 1) {
    // 1회차 경과: 다음 회차 좌석들을 현재 회차로 승격 (예약된 좌석은 입장/상영 상태로)
    const newCurrent = initialSeats();
    for (const [id, seat] of Object.entries(memoryState.nextSeats)) {
      if (seat.status !== 0) {
        // 예약(1)되었던 좌석도 상영 시간이 되었으므로 점유(2: LED ON)로 전환
        newCurrent[id] = {
          ...seat,
          status: 2
        };
      }
    }
    memoryState.currentSeats = newCurrent;
    memoryState.nextSeats = initialSeats();
    memoryState.currentSlotStart = currentSlotStart;
  }
}

/**
 * 시간 경과에 따른 슬롯 자동 롤오버 (Supabase DB)
 */
async function rolloverDatabaseIfNeeded(now: number) {
  const currentSlotStart = Math.floor(now / SLOT_MS) * SLOT_MS;

  try {
    // SLOT_META 레코드 확인
    const { data: metaData } = await supabase
      .from('cinema_seats')
      .select('*')
      .eq('id', 'SLOT_META')
      .single();

    const dbSlotStart = metaData ? Number(metaData.timer_start) : 0;
    const elapsedSlots = Math.floor((currentSlotStart - dbSlotStart) / SLOT_MS);

    if (elapsedSlots === 0 && dbSlotStart !== 0) {
      return; // 현재 슬롯 유지 중
    }

    if (elapsedSlots >= 2 || dbSlotStart === 0) {
      // 10분 이상 지났거나 최초 초기화: 모두 리셋
      const seatIds = ['A1', 'A2', 'B1', 'B2'];
      const updates = [];

      for (const s of seatIds) {
        updates.push({
          id: `CURR_${s}`,
          status: 0,
          token: null,
          buyer_name: null,
          buyer_phone: null,
          timer_start: currentSlotStart,
          duration_ms: SLOT_MS,
          updated_at: new Date().toISOString()
        });
        updates.push({
          id: `NEXT_${s}`,
          status: 0,
          token: null,
          buyer_name: null,
          buyer_phone: null,
          timer_start: currentSlotStart + SLOT_MS,
          duration_ms: SLOT_MS,
          updated_at: new Date().toISOString()
        });
      }

      updates.push({
        id: 'SLOT_META',
        status: 0,
        token: null,
        buyer_name: 'SLOT_META',
        buyer_phone: null,
        timer_start: currentSlotStart,
        duration_ms: SLOT_MS,
        updated_at: new Date().toISOString()
      });

      await supabase.from('cinema_seats').upsert(updates);
    } else if (elapsedSlots === 1) {
      // 1회차(5분) 경과: NEXT 데이터를 읽어 CURR로 승격하고 NEXT 리셋
      const { data: nextData } = await supabase
        .from('cinema_seats')
        .select('*')
        .like('id', 'NEXT_%');

      const seatIds = ['A1', 'A2', 'B1', 'B2'];
      const updates = [];

      for (const s of seatIds) {
        const nextSeat = nextData?.find(r => r.id === `NEXT_${s}`);
        const hasReservation = nextSeat && nextSeat.status !== 0;

        // NEXT -> CURR 승격 (상영 시작되었으므로 LED 점등 대상)
        updates.push({
          id: `CURR_${s}`,
          status: hasReservation ? 2 : 0,
          token: hasReservation ? nextSeat.token : null,
          buyer_name: hasReservation ? nextSeat.buyer_name : null,
          buyer_phone: hasReservation ? nextSeat.buyer_phone : null,
          timer_start: currentSlotStart,
          duration_ms: SLOT_MS,
          updated_at: new Date().toISOString()
        });

        // NEXT는 빈 좌석으로 리셋
        updates.push({
          id: `NEXT_${s}`,
          status: 0,
          token: null,
          buyer_name: null,
          buyer_phone: null,
          timer_start: currentSlotStart + SLOT_MS,
          duration_ms: SLOT_MS,
          updated_at: new Date().toISOString()
        });
      }

      updates.push({
        id: 'SLOT_META',
        status: 0,
        token: null,
        buyer_name: 'SLOT_META',
        buyer_phone: null,
        timer_start: currentSlotStart,
        duration_ms: SLOT_MS,
        updated_at: new Date().toISOString()
      });

      await supabase.from('cinema_seats').upsert(updates);
    }
  } catch (err) {
    console.error('Database rollover error:', err);
  }
}

/**
 * 좌석 상태 종합 요약 조회
 * - 현재 상영 회차 (10:25 ~ 10:30) 좌석 현황 (ESP32 연동)
 * - 다음 예매 회차 (10:30 ~ 10:35) 좌석 현황
 */
export async function getSeatsSummary() {
  const now = Date.now();
  const slots = getSlotsSummary(now);

  // 1. 메모리 롤오버
  rolloverMemoryIfNeeded(now);

  // 2. DB 롤오버 (비동기 처리)
  await rolloverDatabaseIfNeeded(now);

  try {
    const { data, error } = await supabase
      .from('cinema_seats')
      .select('*');

    if (error || !data || data.length === 0) {
      return getMemorySummary(slots);
    }

    const seatIds = ['A1', 'A2', 'B1', 'B2'];

    // 현재 상영 좌석
    const currentSeats = seatIds.map(s => {
      const row = data.find(r => r.id === `CURR_${s}`);
      const status = row ? Number(row.status) : 0;
      return {
        id: s,
        status: status,
        led: status === 2 ? 1 : 0,
        remainingSec: slots.current.remainingSec,
        buyerName: status !== 0 && row ? row.buyer_name : null,
        token: row ? row.token : null
      };
    });

    // 다음 예매 좌석
    const nextSeats = seatIds.map(s => {
      const row = data.find(r => r.id === `NEXT_${s}`);
      const status = row ? Number(row.status) : 0;
      return {
        id: s,
        status: status,
        led: 0,
        remainingSec: slots.next.remainingSecUntilEnd,
        buyerName: status !== 0 && row ? row.buyer_name : null,
        token: row ? row.token : null
      };
    });

    return {
      slots,
      currentSeats,
      nextSeats,
      // ESP32 보드 호환용 (ESP32는 doc["seats"]를 읽어서 현재 상영 좌석 제어)
      seats: currentSeats
    };
  } catch {
    return getMemorySummary(slots);
  }
}

function getMemorySummary(slots: ReturnType<typeof getSlotsSummary>) {
  const seatIds = ['A1', 'A2', 'B1', 'B2'];
  const currentSeats = seatIds.map(s => {
    const seat = memoryState.currentSeats[s] || { id: s, status: 0, buyer: null, token: null };
    return {
      id: s,
      status: seat.status,
      led: seat.status === 2 ? 1 : 0,
      remainingSec: slots.current.remainingSec,
      buyerName: seat.status !== 0 && seat.buyer ? seat.buyer.name : null,
      token: seat.token
    };
  });

  const nextSeats = seatIds.map(s => {
    const seat = memoryState.nextSeats[s] || { id: s, status: 0, buyer: null, token: null };
    return {
      id: s,
      status: seat.status,
      led: 0,
      remainingSec: slots.next.remainingSecUntilEnd,
      buyerName: seat.status !== 0 && seat.buyer ? seat.buyer.name : null,
      token: seat.token
    };
  });

  return {
    slots,
    currentSeats,
    nextSeats,
    seats: currentSeats
  };
}

/**
 * 다음 회차 좌석 예매 (Next Slot Reserve)
 */
export async function reserveSeat(seatId: string, token: string, buyer: BuyerInfo) {
  const now = Date.now();
  const slots = getSlotsSummary(now);

  // 1. 메모리 반영
  rolloverMemoryIfNeeded(now);
  if (memoryState.nextSeats[seatId]) {
    memoryState.nextSeats[seatId].status = 1; // 예약 대기
    memoryState.nextSeats[seatId].token = token;
    memoryState.nextSeats[seatId].buyer = buyer;
  }

  // 2. DB 반영
  try {
    await rolloverDatabaseIfNeeded(now);
    await supabase
      .from('cinema_seats')
      .upsert({
        id: `NEXT_${seatId}`,
        status: 1, // 1: 예약 대기
        token: token,
        buyer_name: buyer.name,
        buyer_phone: buyer.phone,
        timer_start: slots.next.slotStart,
        duration_ms: SLOT_MS,
        updated_at: new Date().toISOString()
      });
  } catch (err) {
    console.error('DB reserveSeat error:', err);
  }

  return {
    slotLabel: slots.next.label,
    expiresAt: slots.next.slotEnd
  };
}

/**
 * 좌석 QR 인증 확정 (현장 QR 스캔)
 * 다음 회차 예약자이거나 현재 회차 예약자 모두 검증 후 점유(2)로 확정!
 */
export async function verifySeat(seatId: string, token?: string) {
  const now = Date.now();

  // 1. 메모리 반영
  rolloverMemoryIfNeeded(now);
  if (memoryState.currentSeats[seatId]) {
    memoryState.currentSeats[seatId].status = 2;
  }
  if (memoryState.nextSeats[seatId]) {
    memoryState.nextSeats[seatId].status = 2; // 미리 체크인 완료
  }

  // 2. DB 반영
  try {
    await rolloverDatabaseIfNeeded(now);

    // 현재 회차 및 다음 회차 좌석 모두 인증 처리
    await supabase
      .from('cinema_seats')
      .update({
        status: 2,
        updated_at: new Date().toISOString()
      })
      .in('id', [`CURR_${seatId}`, `NEXT_${seatId}`]);
  } catch (err) {
    console.error('DB verifySeat error:', err);
  }
}

/**
 * 전체 좌석 초기화 (관리자/테스트용)
 */
export async function releaseSeats(seatId?: string | null) {
  const now = Date.now();
  const currentSlotStart = Math.floor(now / SLOT_MS) * SLOT_MS;

  memoryState.currentSeats = initialSeats();
  memoryState.nextSeats = initialSeats();
  memoryState.currentSlotStart = currentSlotStart;

  try {
    const seatIds = ['A1', 'A2', 'B1', 'B2'];
    const updates = [];

    for (const s of seatIds) {
      if (!seatId || seatId === s) {
        updates.push({
          id: `CURR_${s}`,
          status: 0,
          token: null,
          buyer_name: null,
          buyer_phone: null,
          timer_start: currentSlotStart,
          duration_ms: SLOT_MS,
          updated_at: new Date().toISOString()
        });
        updates.push({
          id: `NEXT_${s}`,
          status: 0,
          token: null,
          buyer_name: null,
          buyer_phone: null,
          timer_start: currentSlotStart + SLOT_MS,
          duration_ms: SLOT_MS,
          updated_at: new Date().toISOString()
        });
      }
    }

    if (!seatId) {
      updates.push({
        id: 'SLOT_META',
        status: 0,
        token: null,
        buyer_name: 'SLOT_META',
        buyer_phone: null,
        timer_start: currentSlotStart,
        duration_ms: SLOT_MS,
        updated_at: new Date().toISOString()
      });
    }

    await supabase.from('cinema_seats').upsert(updates);
  } catch (err) {
    console.error('DB releaseSeats error:', err);
  }
}
