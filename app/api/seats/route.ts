import { NextResponse } from 'next/server';
import { getSeatsSummary } from '@/lib/seatStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const seats = await getSeatsSummary();
  return NextResponse.json({
    seats,
    timestamp: Date.now()
  });
}
