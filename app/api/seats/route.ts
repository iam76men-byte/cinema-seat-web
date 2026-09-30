import { NextResponse } from 'next/server';
import { getSeatsSummary } from '@/lib/seatStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const summary = await getSeatsSummary();
  return NextResponse.json({
    slots: summary.slots,
    currentSeats: summary.currentSeats,
    nextSeats: summary.nextSeats,
    // ESP32 하드웨어 호환용 (ESP32는 seats의 id와 led를 읽어서 현재 상영 좌석을 제어함)
    seats: summary.seats,
    timestamp: Date.now()
  });
}
