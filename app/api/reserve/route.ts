import { NextRequest, NextResponse } from 'next/server';
import { createEncryptedTicket } from '@/lib/crypto';
import { getSeatsSummary, reserveSeat } from '@/lib/seatStore';
import { getSlotsSummary } from '@/lib/slotManager';

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

async function handleReserve(seatId: string | null, name: string, phone: string) {
  if (!seatId || !['A1', 'A2', 'B1', 'B2'].includes(seatId)) {
    return NextResponse.json({ success: false, message: '존재하지 않는 좌석입니다.' }, { status: 404 });
  }

  const now = Date.now();
  const slots = getSlotsSummary(now);
  const summary = await getSeatsSummary();

  // 다음 회차 좌석 중 이미 예매된 좌석인지 검사
  const targetNextSeat = summary.nextSeats.find(s => s.id === seatId);
  if (targetNextSeat && targetNextSeat.status !== 0) {
    return NextResponse.json({
      success: false,
      message: `다음 회차 [${slots.next.label}]의 ${seatId} 좌석은 이미 예매되었습니다.`
    }, { status: 409 });
  }

  // 티켓 생성: 만료 시각은 다음 회차 종료 시각(예: 10:35:00)으로 일괄 고정!
  const { token, payload } = createEncryptedTicket(
    seatId,
    { name, phone },
    slots.next.slotEnd
  );

  // DB 및 메모리에 다음 회차 예약 기록
  const reserveResult = await reserveSeat(seatId, token, payload.buyer);

  return NextResponse.json({
    success: true,
    seatId: seatId,
    token: token,
    ticketId: payload.ticketId,
    buyer: {
      name: payload.buyer.name,
      phoneMasked: payload.buyer.phone.replace(/(\d{3})-\d{4}-(\d{4})/, '$1-****-$2')
    },
    sessionLabel: reserveResult.slotLabel, // 예: "10:30 ~ 10:35"
    expiresAt: reserveResult.expiresAt,   // 10:35:00 타임스탬프
    message: `[${reserveResult.slotLabel} 회차] 0원 예매 완료! 상영 종료(${slots.next.label.split(' ~ ')[1]}) 시 전체 일괄 종료됩니다.`
  });
}
