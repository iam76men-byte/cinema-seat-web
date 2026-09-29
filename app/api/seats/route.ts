import { NextResponse } from 'next/server';
import { getSeatsSummary, seatStore } from '@/lib/seatStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const seats = getSeatsSummary();
  return NextResponse.json({
    seats,
    lastUpdated: seatStore.lastUpdated
  });
}
