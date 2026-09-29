import { NextRequest, NextResponse } from 'next/server';
import { seatStore } from '@/lib/seatStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const seatId = searchParams.get('seat');

  if (seatId && seatStore.seats[seatId]) {
    seatStore.seats[seatId].status = 0;
    seatStore.seats[seatId].token = null;
    seatStore.seats[seatId].buyer = null;
  } else {
    for (const seat of Object.values(seatStore.seats)) {
      seat.status = 0;
      seat.token = null;
      seat.buyer = null;
    }
  }

  seatStore.lastUpdated = Date.now();
  return NextResponse.json({ success: true, message: '좌석이 초기화되었습니다.' });
}
