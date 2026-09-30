// ========================================================
// 5분 단위 상영 회차 (Time Slot) 관리 모듈
// 극장 데모: 5분 = 1회 상영 시간 (300,000ms)
// ========================================================

export const SLOT_MS = 5 * 60 * 1000; // 5분 = 300,000 밀리초

export interface SlotInfo {
  slotStart: number;
  slotEnd: number;
  label: string; // 예: "10:25 ~ 10:30"
  remainingSec: number; // 회차 종료까지 남은 초
}

export interface NextSlotInfo {
  slotStart: number;
  slotEnd: number;
  label: string; // 예: "10:30 ~ 10:35"
  remainingSecUntilStart: number; // 상영 시작까지 남은 초
  remainingSecUntilEnd: number;   // 상영 종료까지 남은 초
}

export interface SlotsSummary {
  current: SlotInfo;
  next: NextSlotInfo;
  serverTime: number;
}

/**
 * 한국 표준시(KST) 기준 "HH:mm" 포맷 변환
 */
export function formatKSTTime(timestamp: number): string {
  const date = new Date(timestamp);
  const opt: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };
  return new Intl.DateTimeFormat('ko-KR', opt).format(date);
}

/**
 * 슬롯 라벨 생성: "10:25 ~ 10:30"
 */
export function getSlotLabel(startMs: number, endMs: number): string {
  return `${formatKSTTime(startMs)} ~ ${formatKSTTime(endMs)}`;
}

/**
 * 현재 시각 기준 [현재 상영 슬롯]과 [다음 예매 슬롯] 계산
 */
export function getSlotsSummary(now = Date.now()): SlotsSummary {
  // 현재 슬롯의 시작 시각: 5분(300,000ms) 단위로 내림(floor)
  const currentSlotStart = Math.floor(now / SLOT_MS) * SLOT_MS;
  const currentSlotEnd = currentSlotStart + SLOT_MS;

  // 다음 슬롯의 시작 및 종료 시각
  const nextSlotStart = currentSlotEnd;
  const nextSlotEnd = nextSlotStart + SLOT_MS;

  const currentRemainingSec = Math.max(0, Math.floor((currentSlotEnd - now) / 1000));
  const nextRemainingSecUntilStart = Math.max(0, Math.floor((nextSlotStart - now) / 1000));
  const nextRemainingSecUntilEnd = Math.max(0, Math.floor((nextSlotEnd - now) / 1000));

  return {
    current: {
      slotStart: currentSlotStart,
      slotEnd: currentSlotEnd,
      label: getSlotLabel(currentSlotStart, currentSlotEnd),
      remainingSec: currentRemainingSec
    },
    next: {
      slotStart: nextSlotStart,
      slotEnd: nextSlotEnd,
      label: getSlotLabel(nextSlotStart, nextSlotEnd),
      remainingSecUntilStart: nextRemainingSecUntilStart,
      remainingSecUntilEnd: nextRemainingSecUntilEnd
    },
    serverTime: now
  };
}
