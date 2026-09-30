import crypto from 'crypto';

const SERVER_SECRET_KEY = crypto.createHash('sha256').update('CINEMA_VERCEL_SECRET_2026_!@#$').digest();
const ALGORITHM = 'aes-256-gcm';
export const TICKET_LIFETIME_MS = 5 * 60 * 1000; // 5분 (300초)

export interface BuyerInfo {
  name: string;
  phone: string;
  userId?: string;
}

export interface TicketPayload {
  ticketId: string;
  seatId: string;
  buyer: BuyerInfo;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

/**
 * 구매자 정보 및 좌석 정보를 AES-256-GCM으로 암호화하여 토큰 생성
 * customExpiresAt이 주어지면 해당 슬롯 종료 시각(예: 10:35:00)을 만료 시각으로 사용
 */
export function createEncryptedTicket(
  seatId: string, 
  buyerInfo: BuyerInfo, 
  customExpiresAt?: number
): { token: string; payload: TicketPayload } {
  const now = Date.now();
  const expiresAt = customExpiresAt || (now + TICKET_LIFETIME_MS);
  const nonce = crypto.randomBytes(8).toString('hex');

  const payload: TicketPayload = {
    ticketId: `TKT-${seatId}-${nonce.toUpperCase()}`,
    seatId: seatId,
    buyer: {
      name: buyerInfo.name || '익명 관객',
      phone: buyerInfo.phone || '010-****-0000',
      userId: buyerInfo.userId || `GUEST-${Math.floor(1000 + Math.random() * 9000)}`
    },
    issuedAt: now,
    expiresAt: expiresAt,
    nonce: nonce
  };

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, SERVER_SECRET_KEY, iv);
  
  let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag().toString('base64');

  const token = `${iv.toString('base64url')}.${Buffer.from(tag, 'base64').toString('base64url')}.${Buffer.from(encrypted, 'base64').toString('base64url')}`;

  return { token, payload };
}

/**
 * 암호화된 토큰 복호화 및 유효성/만료 검증
 */
export function verifyAndDecryptTicket(tokenString: string): { valid: boolean; expired?: boolean; error?: string; payload?: TicketPayload } {
  try {
    const parts = tokenString.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: '잘못된 토큰 형식입니다.' };
    }

    const iv = Buffer.from(parts[0], 'base64url');
    const tag = Buffer.from(parts[1], 'base64url');
    const encryptedText = Buffer.from(parts[2], 'base64url');

    const decipher = crypto.createDecipheriv(ALGORITHM, SERVER_SECRET_KEY, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]).toString('utf8');

    const payload: TicketPayload = JSON.parse(decrypted);

    if (Date.now() > payload.expiresAt) {
      return { valid: false, expired: true, error: '티켓 유효시간(5분)이 만료되었습니다.', payload };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, error: '토큰 복호화 실패 또는 위변조 감지!' };
  }
}
