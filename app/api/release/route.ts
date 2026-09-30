import { NextRequest, NextResponse } from 'next/server';
import { releaseSeats } from '@/lib/seatStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const seatId = searchParams.get('seat');

  await releaseSeats(seatId);
  return NextResponse.json({ success: true, message: '좌석이 초기화되었습니다.' });
}
