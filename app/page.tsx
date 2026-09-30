'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface SeatData {
  id: string;
  status: number;
  remainingSec: number;
  buyerName: string | null;
}

interface TicketData {
  seatId: string;
  token: string;
  expiresAt: number;
  buyer: {
    name: string;
    phoneMasked: string;
  };
}

export default function CinemaSeatPage() {
  const [seats, setSeats] = useState<SeatData[]>([
    { id: 'A1', status: 0, remainingSec: 0, buyerName: null },
    { id: 'A2', status: 0, remainingSec: 0, buyerName: null },
    { id: 'B1', status: 0, remainingSec: 0, buyerName: null },
    { id: 'B2', status: 0, remainingSec: 0, buyerName: null },
  ]);
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);
  const [buyerName, setBuyerName] = useState('홍길동');
  const [buyerPhone, setBuyerPhone] = useState('010-1234-5678');
  const [myTicket, setMyTicket] = useState<TicketData | null>(null);
  const [countdownText, setCountdownText] = useState('05:00');
  const [progressPercent, setProgressPercent] = useState(100);
  const [isReserving, setIsReserving] = useState(false);

  // Modals
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isQrListOpen, setIsQrListOpen] = useState(false);
  const [activeQrSeat, setActiveQrSeat] = useState<'A1' | 'A2' | 'B1' | 'B2'>('A1');
  const [scannerStatus, setScannerStatus] = useState('카메라 준비 중...');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanAnimRef = useRef<number | null>(null);

  // 1-1. 브라우저 재접속 시 로컬 저장소(localStorage)에서 티켓 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cine_seat_ticket_v1');
      if (saved) {
        const parsed: TicketData = JSON.parse(saved);
        if (parsed.expiresAt > Date.now()) {
          setMyTicket(parsed);
        } else {
          localStorage.removeItem('cine_seat_ticket_v1');
        }
      }
    } catch {}
  }, []);

  // 1-2. 좌석 상태 폴링 (1.5초)
  const fetchSeats = useCallback(async () => {
    try {
      const res = await fetch('/api/seats');
      const data = await res.json();
      if (data.seats) {
        setSeats(data.seats);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchSeats();
    const interval = setInterval(fetchSeats, 1500);
    return () => clearInterval(interval);
  }, [fetchSeats]);

  // 2. 5분 카운트다운 타이머
  useEffect(() => {
    if (!myTicket) return;

    const timer = setInterval(() => {
      const remMs = Math.max(0, myTicket.expiresAt - Date.now());
      const remSec = Math.floor(remMs / 1000);

      const m = Math.floor(remSec / 60);
      const s = remSec % 60;
      setCountdownText(`${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`);
      setProgressPercent(Math.min(100, (remMs / (5 * 60 * 1000)) * 100));

      if (remSec <= 0) {
        alert('⚠️ 티켓 유효시간(5분)이 만료되어 좌석이 자동 회수되었습니다.');
        try {
          localStorage.removeItem('cine_seat_ticket_v1');
        } catch {}
        setMyTicket(null);
        setSelectedSeat(null);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [myTicket]);

  function formatSec(sec: number) {
    if (sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // 3. 좌석 클릭 선택
  function handleSelectSeat(seatId: string) {
    const s = seats.find(item => item.id === seatId);
    if (s && s.status !== 0) {
      alert(`${seatId} 좌석은 이미 예매되었거나 사용 중입니다.`);
      return;
    }
    setSelectedSeat(seatId);
  }

  // 4. 0원 예매 진행
  async function handleReserve() {
    if (!selectedSeat) return;
    setIsReserving(true);

    try {
      const res = await fetch('/api/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seat: selectedSeat,
          name: buyerName.trim() || '홍길동',
          phone: buyerPhone.trim() || '010-1234-5678'
        })
      });

      const data = await res.json();
      if (data.success) {
        const ticketData: TicketData = {
          seatId: data.seatId,
          token: data.token,
          expiresAt: data.expiresAt,
          buyer: data.buyer
        };
        try {
          localStorage.setItem('cine_seat_ticket_v1', JSON.stringify(ticketData));
        } catch {}
        setMyTicket(ticketData);
        setSelectedSeat(null);
        alert(`🎉 [${data.seatId} 좌석] 0원 예매 완료!\n\n예매자: ${data.buyer.name}\nAES-256-GCM 암호화 티켓이 발급되었습니다.\n(브라우저를 닫았다 열어도 5분 동안 티켓이 유지됩니다.)`);
        fetchSeats();
      } else {
        alert(`예매 실패: ${data.message}`);
      }
    } catch {
      alert('서버 통신 오류');
    } finally {
      setIsReserving(false);
    }
  }

  // 4-1. 티켓 취소 / 좌석 반환
  function handleCancelTicket() {
    if (!confirm('현재 티켓을 취소하시겠습니까?\n취소 시 브라우저에서 티켓이 삭제되며, 좌석은 만료 시간 또는 리셋 후 다시 예매 가능합니다.')) return;
    try {
      localStorage.removeItem('cine_seat_ticket_v1');
    } catch {}
    setMyTicket(null);
    setSelectedSeat(null);
  }

  // 5. 좌석 QR 인증 요청
  const verifySeat = useCallback(async (scannedSeat: string) => {
    if (!myTicket) return;

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seat: myTicket.seatId,
          token: myTicket.token,
          code: scannedSeat
        })
      });

      const data = await res.json();
      if (data.success) {
        alert(`✅ [${myTicket.seatId}] 좌석 인증 완료!\n\n${data.buyer.name} 님의 본인 확인 및 암호 검증 완료.\n보드로 잠금 해제 신호가 전달되었습니다 (LED 점등).`);
        fetchSeats();
      } else {
        alert(`❌ 인증 실패: ${data.message}`);
      }
    } catch {
      alert('서버 응답 오류 발생');
    }
  }, [myTicket, fetchSeats]);

  // 6. 카메라 QR 스캐너 제어
  const closeScanner = useCallback(() => {
    if (scanAnimRef.current) cancelAnimationFrame(scanAnimRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsScannerOpen(false);
  }, []);

  const scanQRCode = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win = window as any;
        if (win.jsQR) {
          const code = win.jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });
          if (code && code.data) {
            closeScanner();
            verifySeat(code.data.replace('SEAT:', '').trim());
            return;
          }
        }
      }
    }
    scanAnimRef.current = requestAnimationFrame(scanQRCode);
  }, [closeScanner, verifySeat]);

  async function openScanner() {
    if (!myTicket) return;
    setIsScannerOpen(true);
    setScannerStatus('카메라 준비 중...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.play();
        setScannerStatus('좌석 QR 코드를 비춰주세요.');
        scanQRCode();
      }
    } catch {
      setScannerStatus('카메라 접근 권한 오류. [QR 목록]의 [직접 인증]을 이용하세요.');
    }
  }

  function handleDirectVerify(seatId: string) {
    setIsQrListOpen(false);
    if (!myTicket) {
      alert(`먼저 [${seatId}] 좌석을 0원에 예매한 후 인증을 진행해 주세요.`);
      return;
    }
    verifySeat(seatId);
  }

  return (
    <div className="app-container">
      {/* Header */}
      <div className="header">
        <div className="logo-box">
          <h1>🎟️ CINE-SEAT</h1>
          <p>인터넷 클라우드 서버 (Vercel 배포판)</p>
        </div>
        <div className="badge badge-cloud">
          <span className="dot"></span> 실시간 클라우드
        </div>
      </div>

      {/* Screen & Seat Grid */}
      <div className="screen-section">
        <div className="screen-curve"></div>
        <div className="screen-label">SCREEN</div>

        <div className="seat-grid">
          {seats.map(s => {
            const isSelected = selectedSeat === s.id;
            let statusClass = 'status-empty';
            let tagText = '예매 가능';

            if (s.status === 1) {
              statusClass = 'status-reserved';
              tagText = s.buyerName ? `[${s.buyerName}] 대기` : '5분 대기';
            } else if (s.status === 2) {
              statusClass = 'status-occupied';
              tagText = '점유 (LED ON)';
            }

            return (
              <button
                key={s.id}
                id={`btn-seat-${s.id}`}
                className={`seat-btn ${statusClass}`}
                style={isSelected ? { outline: '3px solid #f59e0b' } : {}}
                onClick={() => handleSelectSeat(s.id)}
              >
                <span className="seat-num">{s.id}</span>
                <span className="seat-tag">{tagText}</span>
                {s.status !== 0 && (
                  <span className="seat-timer">{formatSec(s.remainingSec)}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="seat-legend">
          <div className="legend-item"><span className="legend-color" style={{ background: '#334155' }}></span> 빈 좌석</div>
          <div className="legend-item"><span className="legend-color" style={{ background: '#f59e0b' }}></span> 5분 미사용시 자동회수</div>
          <div className="legend-item"><span className="legend-color" style={{ background: '#10b981' }}></span> 점유(LED ON)</div>
        </div>
      </div>

      {/* Buyer Info Input Form */}
      {!myTicket && (
        <div className="form-card">
          <div className="form-title">👤 예매자 정보 (암호화 전송 보호)</div>
          <div className="input-row">
            <div className="input-group">
              <label>이름</label>
              <input
                type="text"
                value={buyerName}
                onChange={e => setBuyerName(e.target.value)}
                placeholder="예: 홍길동"
              />
            </div>
            <div className="input-group">
              <label>휴대폰 번호</label>
              <input
                type="tel"
                value={buyerPhone}
                onChange={e => setBuyerPhone(e.target.value)}
                placeholder="예: 010-1234-5678"
              />
            </div>
          </div>
        </div>
      )}

      {/* My Ticket View */}
      {myTicket && (
        <div className="ticket-card">
          <div className="ticket-header">
            <span className="ticket-badge">✨ 모바일 예매권 (0원)</span>
            <span className="security-badge" title="브라우저를 닫았다 열어도 5분간 유지됩니다">
              💾 저장됨 · 🔐 AES-256-GCM
            </span>
          </div>

          <div className="ticket-buyer-row">
            <div><b>예매자:</b> {myTicket.buyer.name}</div>
            <div><b>연락처:</b> {myTicket.buyer.phoneMasked}</div>
          </div>

          <div className="ticket-body">
            <div className="ticket-seat-box">
              <div className="lbl">내 좌석 번호</div>
              <div className="val">{myTicket.seatId}</div>
            </div>
            <div className="ticket-time-box">
              <div className="countdown-timer">{countdownText}</div>
              <div className="countdown-lbl">5분 내 미인증시 자동 회수</div>
            </div>
          </div>

          <div className="progress-track">
            <div className="progress-bar" style={{ width: `${progressPercent}%` }}></div>
          </div>

          <button className="btn-action btn-scan" onClick={openScanner}>
            📷 좌석 QR 찍고 잠금 풀기
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button className="btn-secondary" onClick={() => setIsQrListOpen(true)}>
              🖨️ QR 코드 보기
            </button>
            <button 
              className="btn-secondary" 
              onClick={handleCancelTicket}
              style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
            >
              ❌ 티켓 취소
            </button>
          </div>
        </div>
      )}

      {/* Bottom Reservation Button */}
      {!myTicket && (
        <div>
          <button
            className="btn-action"
            onClick={handleReserve}
            disabled={!selectedSeat || isReserving}
            style={{ opacity: selectedSeat ? 1 : 0.5 }}
          >
            {isReserving
              ? '암호화 티켓 발급 중...'
              : selectedSeat
              ? `🎟️ [${selectedSeat} 좌석] 0원에 예매하기`
              : '좌석을 선택해 주세요'}
          </button>
          <button className="btn-secondary" onClick={() => setIsQrListOpen(true)}>
            🔍 좌석 QR 코드 목록 & 원격 인증 테스트
          </button>
        </div>
      )}

      <div className="footer">
        Protected with AES-256-GCM Authenticated Encryption & 5-min Auto Expire
      </div>

      {/* Modal 1: Camera Scanner */}
      <div className={`modal-overlay ${isScannerOpen ? 'open' : ''}`}>
        <div className="modal-box">
          <div className="modal-title">📷 좌석 QR 코드 스캔</div>
          <p style={{ fontSize: 13, color: 'var(--subtext)', marginBottom: 12 }}>
            좌석에 부착된 QR 코드를 사각형 안에 비춰주세요.
          </p>
          <div className="video-container">
            <video ref={videoRef} playsInline></video>
            <div className="scan-guide-box"></div>
          </div>
          <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
          <p style={{ fontSize: 13, color: 'var(--accent-cyan)', fontWeight: 600, minHeight: 20 }}>
            {scannerStatus}
          </p>
          <button className="btn-secondary" onClick={closeScanner} style={{ marginTop: 10 }}>
            닫기
          </button>
        </div>
      </div>

      {/* Modal 2: QR Codes List (Large View with Tabs) */}
      <div className={`modal-overlay ${isQrListOpen ? 'open' : ''}`}>
        <div className="modal-box">
          <div className="modal-title">🖨️ 현장 좌석 부착용 대형 QR 코드</div>
          <p style={{ fontSize: 12, color: 'var(--subtext)' }}>
            스마트폰 카메라로 멀리서도 쉽게 스캔할 수 있도록 확대되었습니다.
          </p>

          {/* Seat Tab Switcher */}
          <div className="qr-tabs">
            {(['A1', 'A2', 'B1', 'B2'] as const).map(seatId => (
              <button
                key={seatId}
                className={`qr-tab-btn ${activeQrSeat === seatId ? 'active' : ''}`}
                onClick={() => setActiveQrSeat(seatId)}
              >
                좌석 {seatId}
              </button>
            ))}
          </div>

          {/* Active Large QR Card */}
          <div className="qr-single-card">
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent-cyan)' }}>
              좌석 [{activeQrSeat}] 부착용 QR
            </span>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=SEAT:${activeQrSeat}`}
              alt={`대형 QR ${activeQrSeat}`}
            />

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--subtext)', marginBottom: 4 }}>
                QR 코드 내장 텍스트 데이터:
              </div>
              <div className="qr-code-data-badge">
                SEAT:{activeQrSeat}
              </div>
            </div>

            <div className="qr-btn-group">
              <button
                className="btn-action btn-scan"
                onClick={() => handleDirectVerify(activeQrSeat)}
              >
                ⚡ 지금 바로 인증 테스트
              </button>
            </div>
          </div>

          <button className="btn-secondary" onClick={() => setIsQrListOpen(false)} style={{ marginTop: 14 }}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
