import { NextRequest, NextResponse } from 'next/server';
import { createEncryptedTicket, TICKET_LIFETIME_MS } from '@/lib/crypto';
import { seatStore, purgeExpiredSeats } from '@/lib/seatStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const seatId = searchParams.get('seat');
  const name = searchParams.get('name') || '홍길동';
  const phone = searchParams.get('phone') || '010-1234-5678';

  return handleReserve(seatId, name, phone);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return handleReserve(body.seat, body.name, body.phone);
  } catch {
    return NextResponse.json({ success: false, message: '요청 바디 오류' }, { status: 400 });
  }
}

function handleReserve(seatId: string | null, name: string, phone: string) {
  purgeExpiredSeats();

  if (!seatId || !seatStore.seats[seatId]) {
    return NextResponse.json({ success: false, message: '존재하지 않는 좌석입니다.' }, { status: 404 });
  }

  const seat = seatStore.seats[seatId];
  if (seat.status !== 0) {
    return NextResponse.json({ success: false, message: '이미 예매되었거나 사용 중인 좌석입니다.' }, { status: 409 });
  }

  const { token, payload } = createEncryptedTicket(seatId, { name, phone });

  seat.status = 1; // 5분 인증 대기
  seat.token = token;
  seat.buyer = payload.buyer;
  seat.timerStart = Date.now();
  seat.durationMs = TICKET_LIFETIME_MS;
  seatStore.lastUpdated = Date.now();

  return NextResponse.json({
    success: true,
    seatId: seat.id,
    token: token,
    ticketId: payload.ticketId,
    buyer: {
      name: payload.buyer.name,
      phoneMasked: payload.buyer.phone.replace(/(\d{3})-\d{4}-(\d{4})/, '$1-****-$2')
    },
    lifetimeSec: 300,
    expiresAt: payload.expiresAt,
    message: '0원 예매 완료! 5분 이내에 현장 좌석 QR을 스캔해주세요.'
  });
}
