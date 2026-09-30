import { NextRequest, NextResponse } from 'next/server';
import { verifyAndDecryptTicket } from '@/lib/crypto';
import { getSeatsSummary, verifySeat, releaseSeats } from '@/lib/seatStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const seatId = searchParams.get('seat');
  const token = searchParams.get('token');
  const code = searchParams.get('code');

  return handleVerify(seatId, token, code);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return handleVerify(body.seat, body.token, body.code);
  } catch {
    return NextResponse.json({ success: false, message: '요청 바디 오류' }, { status: 400 });
  }
}

async function handleVerify(seatId: string | null, token: string | null, code: string | null) {
  if (!seatId || !['A1', 'A2', 'B1', 'B2'].includes(seatId)) {
    return NextResponse.json({ success: false, message: '존재하지 않는 좌석입니다.' }, { status: 404 });
  }

  if (!token || !code) {
    return NextResponse.json({ success: false, message: '토큰 또는 좌석 코드가 누락되었습니다.' }, { status: 400 });
  }

  // 1. AES-256-GCM 복호화 및 위변조/만료 검증
  const decrypted = verifyAndDecryptTicket(token);
  if (!decrypted.valid) {
    if (decrypted.expired) {
      await releaseSeats(seatId);
      return NextResponse.json({ success: false, message: decrypted.error }, { status: 410 });
    }
    return NextResponse.json({ success: false, message: `보안 검증 실패: ${decrypted.error}` }, { status: 403 });
  }

  // 2. 좌석 일치 검증
  if (decrypted.payload?.seatId !== seatId) {
    return NextResponse.json({ success: false, message: '티켓의 좌석 정보가 일치하지 않습니다.' }, { status: 403 });
  }

  // 3. 현장 QR 코드 일치 검증 ("SEAT:A1" 또는 "A1")
  const match = (code === seatId) || (code === `SEAT:${seatId}`);
  if (!match) {
    return NextResponse.json({
      success: false,
      message: `스캔한 좌석 QR과 예매한 좌석(${seatId})이 일치하지 않습니다.`
    }, { status: 400 });
  }

  // 검증 성공 -> Supabase DB에 점유(2, LED ON) 상태 영구 기록
  await verifySeat(seatId);

  return NextResponse.json({
    success: true,
    seatId: seatId,
    buyer: decrypted.payload?.buyer,
    message: `[${seatId} 좌석] ${decrypted.payload?.buyer.name} 님 인증 완료! 좌석 잠금이 해제되었습니다.`
  });
}
