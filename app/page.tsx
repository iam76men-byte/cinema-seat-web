'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface SeatData {
  id: string;
  status: number;
  led: number;
  remainingSec: number;
  buyerName: string | null;
  token?: string | null;
}

interface SlotInfo {
  slotStart: number;
  slotEnd: number;
  label: string;
  remainingSec: number;
}

interface NextSlotInfo {
  slotStart: number;
  slotEnd: number;
  label: string;
  remainingSecUntilStart: number;
  remainingSecUntilEnd: number;
}

interface TicketData {
  seatId: string;
  token: string;
  sessionLabel: string;
  expiresAt: number;
  buyer: {
    name: string;
    phoneMasked: string;
  };
}

const STORAGE_KEY = 'cine_seat_multi_tickets_v4';

export default function CinemaSeatPage() {
  const [currentSlot, setCurrentSlot] = useState<SlotInfo>({
    slotStart: 0,
    slotEnd: 0,
    label: '현재 상영 계산 중...',
    remainingSec: 0
  });

  const [nextSlot, setNextSlot] = useState<NextSlotInfo>({
    slotStart: 0,
    slotEnd: 0,
    label: '다음 회차 계산 중...',
    remainingSecUntilStart: 0,
    remainingSecUntilEnd: 0
  });

  const [currentSeats, setCurrentSeats] = useState<SeatData[]>([
    { id: 'A1', status: 0, led: 0, remainingSec: 0, buyerName: null },
    { id: 'A2', status: 0, led: 0, remainingSec: 0, buyerName: null },
    { id: 'A3', status: 0, led: 0, remainingSec: 0, buyerName: null },
    { id: 'A4', status: 0, led: 0, remainingSec: 0, buyerName: null },
    { id: 'B1', status: 0, led: 0, remainingSec: 0, buyerName: null },
    { id: 'B2', status: 0, led: 0, remainingSec: 0, buyerName: null },
    { id: 'B3', status: 0, led: 0, remainingSec: 0, buyerName: null },
    { id: 'B4', status: 0, led: 0, remainingSec: 0, buyerName: null },
  ]);

  const [nextSeats, setNextSeats] = useState<SeatData[]>([
    { id: 'A1', status: 0, led: 0, remainingSec: 0, buyerName: null },
    { id: 'A2', status: 0, led: 0, remainingSec: 0, buyerName: null },
    { id: 'A3', status: 0, led: 0, remainingSec: 0, buyerName: null },
    { id: 'A4', status: 0, led: 0, remainingSec: 0, buyerName: null },
    { id: 'B1', status: 0, led: 0, remainingSec: 0, buyerName: null },
    { id: 'B2', status: 0, led: 0, remainingSec: 0, buyerName: null },
    { id: 'B3', status: 0, led: 0, remainingSec: 0, buyerName: null },
    { id: 'B4', status: 0, led: 0, remainingSec: 0, buyerName: null },
  ]);

  // UI 탭: 'book' (다음 회차 예매), 'current' (현재 상영 좌석 현황)
  const [activeTab, setActiveTab] = useState<'book' | 'current'>('book');

  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');

  // 회차별 티켓 맵 (Key: sessionLabel, 예: "13:10 ~ 13:15", "13:15 ~ 13:20")
  const [tickets, setTickets] = useState<Record<string, TicketData>>({});
  const [isReserving, setIsReserving] = useState(false);

  // Modals
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isQrListOpen, setIsQrListOpen] = useState(false);
  const [activeQrSeat, setActiveQrSeat] = useState<string>('A1');
  const [scannerStatus, setScannerStatus] = useState('카메라 준비 중...');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanAnimRef = useRef<number | null>(null);

  // 현재 회차 및 다음 회차 티켓 분리
  const currentTicket = tickets[currentSlot.label] || null;
  const nextTicket = tickets[nextSlot.label] || null;

  // 1. 브라우저 재접속 시 로컬 저장소(localStorage)에서 회차별 티켓 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const validTickets: Record<string, TicketData> = {};
        const now = Date.now();

        if (typeof parsed === 'object' && parsed !== null) {
          if (parsed.seatId && parsed.expiresAt) {
            // 단일 티켓 호환
            if (parsed.expiresAt > now) {
              validTickets[parsed.sessionLabel || '기존티켓'] = parsed;
            }
          } else {
            // 회차별 맵
            for (const [k, t] of Object.entries(parsed)) {
              const item = t as TicketData;
              if (item && item.expiresAt > now) {
                validTickets[k] = item;
              }
            }
          }
        }
        setTickets(validTickets);
      }

      // 기기별 저장된 사용자 프로필 불러오기
      const savedProfile = localStorage.getItem('cine_seat_user_profile');
      if (savedProfile) {
        const { name, phone } = JSON.parse(savedProfile);
        if (name) setBuyerName(name);
        if (phone) setBuyerPhone(phone);
      }
    } catch {}
  }, []);

  // 2. 서버 좌석 및 슬롯 정보 폴링 (1.2초)
  const fetchSeatData = useCallback(async () => {
    try {
      const res = await fetch('/api/seats');
      const data = await res.json();

      if (data.slots) {
        setCurrentSlot(data.slots.current);
        setNextSlot(data.slots.next);
      }
      if (data.currentSeats) {
        setCurrentSeats(data.currentSeats);
      }
      if (data.nextSeats) {
        setNextSeats(data.nextSeats);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchSeatData();
    const interval = setInterval(fetchSeatData, 1200);
    return () => clearInterval(interval);
  }, [fetchSeatData]);

  // 3. 회차 종료 시 만료된 티켓 자동 소멸 정리
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setTickets(prev => {
        let changed = false;
        const nextMap = { ...prev };
        for (const [label, t] of Object.entries(nextMap)) {
          if (t.expiresAt <= now) {
            delete nextMap[label];
            changed = true;
          }
        }
        if (changed) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(nextMap));
          } catch {}
        }
        return changed ? nextMap : prev;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  function formatSec(sec: number) {
    if (sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // 4. 다음 회차 좌석 선택 (회차별 티켓 독립 관리)
  async function handleSelectSeat(seatId: string) {
    const s = nextSeats.find(item => item.id === seatId);

    // 4-1. 이미 다음 회차(nextSlot.label)의 티켓을 가지고 있는 경우
    if (nextTicket) {
      if (nextTicket.seatId === seatId) {
        alert(`이미 다음 회차 [${nextSlot.label}]의 [${seatId}] 좌석을 예매하셨습니다.\n하단의 티켓 카드를 확인해주세요.`);
        return;
      }

      // 다른 빈 좌석을 눌러 변경하려는 경우
      const willChange = confirm(
        `현재 다음 회차 [${nextTicket.seatId}] 좌석 티켓을 보유 중입니다.\n\n[${seatId}] 좌석으로 변경하시겠습니까?\n(확인 시 기존 ${nextTicket.seatId} 좌석은 자동 취소 및 반환됩니다.)`
      );
      if (!willChange) return;

      // 기존 다음 회차 좌석 서버에서 반환
      const oldSeat = nextTicket.seatId;
      try {
        await fetch(`/api/release?seat=${oldSeat}`);
        setTickets(prev => {
          const updated = { ...prev };
          delete updated[nextSlot.label];
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          } catch {}
          return updated;
        });
      } catch {}

      setSelectedSeat(seatId);
      await fetchSeatData();
      return;
    }

    // 4-2. 다른 사람이 이미 예매/점유한 좌석인 경우
    if (s && s.status !== 0) {
      alert(`다음 회차 [${nextSlot.label}]의 ${seatId} 좌석은 이미 다른 관객이 예매했습니다.`);
      return;
    }

    // 4-3. 정상 선택
    setSelectedSeat(seatId);
  }

  // 5. 다음 회차 0원 예매 진행
  async function handleReserve() {
    if (!selectedSeat) {
      alert('예매하실 좌석을 먼저 선택해 주세요.');
      return;
    }
    const trimmedName = buyerName.trim();
    const trimmedPhone = buyerPhone.trim();
    if (!trimmedName) {
      alert('예매자 성명을 입력해 주세요.');
      return;
    }
    if (!trimmedPhone) {
      alert('휴대폰 번호를 입력해 주세요.');
      return;
    }

    setIsReserving(true);

    try {
      const res = await fetch('/api/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seat: selectedSeat,
          name: trimmedName,
          phone: trimmedPhone
        })
      });

      const data = await res.json();
      if (data.success) {
        // 해당 기기에 프로필 저장 (다음 번 예매 시 자동 입력)
        try {
          localStorage.setItem('cine_seat_user_profile', JSON.stringify({ name: trimmedName, phone: trimmedPhone }));
        } catch {}

        const newTicket: TicketData = {
          seatId: data.seatId,
          token: data.token,
          sessionLabel: data.sessionLabel,
          expiresAt: data.expiresAt,
          buyer: data.buyer
        };

        setTickets(prev => {
          const updated = { ...prev, [newTicket.sessionLabel]: newTicket };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          } catch {}
          return updated;
        });

        setSelectedSeat(null);
        alert(`🎉 [${data.sessionLabel} 회차] ${data.seatId} 좌석 예매 완료!\n\n예매자: ${data.buyer.name}\n회차 종료 시각에 모든 좌석이 한꺼번에 일괄 종료됩니다.`);
        fetchSeatData();
      } else {
        alert(`예매 실패: ${data.message}`);
      }
    } catch {
      alert('서버 통신 오류');
    } finally {
      setIsReserving(false);
    }
  }

  // 6. 특정 회차 티켓 취소 (서버 DB 좌석 정상 반환 연동)
  async function handleCancelTicket(ticketToCancel: TicketData) {
    if (!ticketToCancel) return;
    const targetSeat = ticketToCancel.seatId;
    const targetSession = ticketToCancel.sessionLabel;

    if (!confirm(`[${targetSession}] 회차의 [${targetSeat}] 좌석 티켓을 취소하시겠습니까?\n\n취소 시 좌석이 즉시 반환되어 다시 예매할 수 있게 됩니다.`)) {
      return;
    }

    setTickets(prev => {
      const updated = { ...prev };
      delete updated[targetSession];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
    setSelectedSeat(null);

    // 서버에 좌석 반환 요청
    try {
      await fetch(`/api/release?seat=${targetSeat}`);
    } catch {}

    alert(`[${targetSeat}] 좌석 예매가 취소되었으며, 좌석이 정상적으로 반환되었습니다.`);
    fetchSeatData();
  }

  // 7. 좌석 QR 인증 요청 (현장 스캔)
  const verifySeat = useCallback(async (scannedSeat: string) => {
    // 현재 상영 중 티켓 우선, 없으면 다음 회차 티켓
    const targetTicket = currentTicket || nextTicket;
    if (!targetTicket) {
      alert('보유 중인 유효한 티켓이 없습니다.');
      return;
    }

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seat: targetTicket.seatId,
          token: targetTicket.token,
          code: scannedSeat
        })
      });

      const data = await res.json();
      if (data.success) {
        alert(`✅ [${targetTicket.seatId}] 좌석 인증 완료!\n\n${data.buyer.name} 님의 본인 확인 및 암호 검증 완료.\n상영 회차 동안 보드 LED가 점등됩니다.`);
        fetchSeatData();
      } else {
        alert(`❌ 인증 실패: ${data.message}`);
      }
    } catch {
      alert('서버 응답 오류 발생');
    }
  }, [currentTicket, nextTicket, fetchSeatData]);

  // 8. 카메라 QR 스캐너 제어
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
    const targetTicket = currentTicket || nextTicket;
    if (!targetTicket) {
      alert('예매하신 티켓이 없습니다.');
      return;
    }
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
    const targetTicket = currentTicket || nextTicket;
    if (!targetTicket) {
      alert(`먼저 [${seatId}] 좌석을 0원에 예매한 후 인증을 진행해 주세요.`);
      return;
    }
    verifySeat(seatId);
  }

  // 화면에 렌더링할 티켓 결정 (현재 탭 기준)
  const displayedTicket = activeTab === 'current' ? (currentTicket || nextTicket) : (nextTicket || currentTicket);

  return (
    <div className="app-container">
      {/* Header */}
      <div className="header">
        <div className="logo-box">
          <h1>🎟️ CINE-SEAT</h1>
          <p>5분 상영관 자동화 시스템 (일괄 종료 연동)</p>
        </div>
        <div className="badge badge-cloud">
          <span className="dot"></span> ESP32 보드 연동
        </div>
      </div>

      {/* 회차 타임라인 카드 */}
      <div style={{
        background: 'rgba(22, 28, 45, 0.9)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '16px',
        padding: '14px 16px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px'
      }}>
        {/* 현재 상영 회차 */}
        <div style={{
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '12px',
          padding: '10px 12px'
        }}>
          <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>🎬 현재 상영 중</span>
            {currentTicket && <span style={{ background: '#10b981', color: '#000', fontSize: '9px', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>내 티켓</span>}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 800, marginTop: '2px', color: '#fff' }}>
            {currentSlot.label}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--subtext)', marginTop: '4px' }}>
            종료까지 <b style={{ color: '#10b981' }}>{formatSec(currentSlot.remainingSec)}</b>
          </div>
        </div>

        {/* 다음 예매 회차 */}
        <div style={{
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '12px',
          padding: '10px 12px'
        }}>
          <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>🎟️ 다음 예매 대상</span>
            {nextTicket && <span style={{ background: '#f59e0b', color: '#000', fontSize: '9px', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>예매완료</span>}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 800, marginTop: '2px', color: '#fff' }}>
            {nextSlot.label}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--subtext)', marginTop: '4px' }}>
            시작까지 <b style={{ color: '#f59e0b' }}>{formatSec(nextSlot.remainingSecUntilStart)}</b>
          </div>
        </div>
      </div>

      {/* 탭 네비게이션: 다음 회차 예매 vs 현재 상영관 좌석 현황 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        background: 'rgba(15, 23, 42, 0.6)',
        borderRadius: '12px',
        padding: '4px',
        border: '1px solid rgba(255,255,255,0.06)'
      }}>
        <button
          onClick={() => setActiveTab('book')}
          style={{
            padding: '10px 0',
            borderRadius: '8px',
            border: 'none',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            background: activeTab === 'book' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent',
            color: activeTab === 'book' ? '#000' : 'var(--subtext)',
            transition: 'all 0.2s'
          }}
        >
          🎟️ 다음 회차 좌석 예매
        </button>
        <button
          onClick={() => setActiveTab('current')}
          style={{
            padding: '10px 0',
            borderRadius: '8px',
            border: 'none',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            background: activeTab === 'current' ? 'linear-gradient(135deg, #10b981, #059669)' : 'transparent',
            color: activeTab === 'current' ? '#000' : 'var(--subtext)',
            transition: 'all 0.2s'
          }}
        >
          🎬 현재 상영 좌석 (LED)
        </button>
      </div>

      {/* TAB 1: 다음 회차 예매 화면 */}
      {activeTab === 'book' && (
        <div className="screen-section">
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--accent-gold)', fontWeight: 700 }}>
              [{nextSlot.label}] 상영분 예매
            </span>
            <p style={{ fontSize: '11px', color: 'var(--subtext)', marginTop: '2px' }}>
              상영 종료 시각({nextSlot.label.split(' ~ ')[1] || '5분 후'})에 8개 전체 좌석이 일괄 종료됩니다.
            </p>
          </div>

          <div className="screen-curve"></div>
          <div className="screen-label">SCREEN (다음 회차 예매)</div>

          <div className="seat-grid">
            {nextSeats.map((s) => {
              const isSelected = selectedSeat === s.id;
              const isMyNextSeat = nextTicket?.seatId === s.id;

              let btnClass = 'seat-btn status-empty';
              let badgeText = '예매 가능';
              let subText = '';

              if (s.status === 2) {
                // 🟢 착석 완료
                btnClass = 'seat-btn status-occupied';
                badgeText = isMyNextSeat ? '내 좌석 (착석)' : (s.buyerName ? `${s.buyerName} 착석` : '착석 완료');
                subText = '🟢 착석 (LED ON)';
              } else if (s.status === 1) {
                // 🟡 예약 대기
                btnClass = 'seat-btn status-reserved';
                badgeText = isMyNextSeat ? '내 예약 (대기)' : (s.buyerName ? `${s.buyerName} 예약` : '예약 완료');
                subText = '🟡 입장 대기';
              } else if (isSelected) {
                btnClass = 'seat-btn status-empty selected';
                badgeText = '선택됨';
                subText = '예매 진행 중';
              }

              const isClickable = s.status === 0 || isMyNextSeat;

              return (
                <button
                  key={s.id}
                  className={btnClass}
                  onClick={() => handleSelectSeat(s.id)}
                  disabled={!isClickable && s.status !== 0}
                  style={{
                    position: 'relative',
                    borderWidth: isMyNextSeat ? '2px' : undefined,
                    boxShadow: isMyNextSeat ? '0 0 16px rgba(245, 158, 11, 0.5)' : undefined
                  }}
                >
                  <span className="seat-num">{s.id}</span>
                  <span className="seat-tag" style={{ fontWeight: 700 }}>{badgeText}</span>
                  {subText && (
                    <span style={{ fontSize: '8px', marginTop: '1px', opacity: 0.9, lineHeight: 1 }}>
                      {subText}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Seat Status Legend */}
          <div className="seat-legend" style={{ flexWrap: 'wrap', gap: '12px' }}>
            <div className="legend-item">
              <span className="legend-color empty"></span> 빈좌석
            </div>
            <div className="legend-item">
              <span className="legend-color reserved"></span> 예약 대기 (미착석)
            </div>
            <div className="legend-item">
              <span className="legend-color occupied"></span> 착석 완료 (LED ON)
            </div>
            <div className="legend-item">
              <span className="legend-color selected"></span> 내 선택
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: 현재 상영 좌석 현황 화면 (ESP32 현장 LED와 100% 일치) */}
      {activeTab === 'current' && (
        <div className="screen-section">
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: '#10b981', fontWeight: 700 }}>
              [{currentSlot.label}] 실시간 상영관 좌석
            </span>
            <p style={{ fontSize: '11px', color: 'var(--subtext)', marginTop: '2px' }}>
              ESP32 보드의 실제 LED 점등 상태와 100% 동기화 중입니다.
            </p>
          </div>

          <div className="screen-curve" style={{ borderColor: 'rgba(16, 185, 129, 0.4)' }}></div>
          <div className="screen-label" style={{ color: '#10b981' }}>SCREEN (현재 상영 중)</div>

          <div className="seat-grid">
            {currentSeats.map((s) => {
              const isOccupied = s.status === 2;
              const isReserved = s.status === 1;
              const isMyCurrSeat = currentTicket?.seatId === s.id;

              let btnClass = 'seat-btn status-empty';
              let statusLabel = '빈좌석 (소등)';

              if (isOccupied) {
                btnClass = 'seat-btn status-occupied';
                statusLabel = isMyCurrSeat ? '내 좌석 (점등)' : (s.buyerName ? `${s.buyerName} (점등)` : '관람 중 (LED ON)');
              } else if (isReserved) {
                btnClass = 'seat-btn status-reserved';
                statusLabel = isMyCurrSeat ? '내 예약 (대기)' : '입장 대기';
              }

              return (
                <button
                  key={s.id}
                  className={btnClass}
                  style={{
                    cursor: 'default',
                    borderWidth: isMyCurrSeat ? '2px' : undefined,
                    boxShadow: isMyCurrSeat ? '0 0 16px rgba(16, 185, 129, 0.6)' : undefined
                  }}
                >
                  <span className="seat-num">{s.id}</span>
                  <span className="seat-tag">{statusLabel}</span>
                  {isOccupied && (
                    <span className="seat-timer">
                      종료: {formatSec(s.remainingSec)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="seat-legend" style={{ flexWrap: 'wrap', gap: '12px', marginTop: '16px' }}>
            <div className="legend-item">
              <span className="legend-color empty"></span> 빈좌석 (소등)
            </div>
            <div className="legend-item">
              <span className="legend-color reserved"></span> 입장 대기
            </div>
            <div className="legend-item">
              <span className="legend-color occupied"></span> 착석 관람 중 (LED ON)
            </div>
          </div>

          <div style={{
            marginTop: '12px',
            padding: '10px 14px',
            background: 'rgba(16, 185, 129, 0.1)',
            borderRadius: '10px',
            fontSize: '12px',
            color: '#10b981',
            textAlign: 'center'
          }}>
            ⚡ 회차 종료({currentSlot.label.split(' ~ ')[1] || '정각'}) 시 모든 좌석의 LED가 일제히 소등됩니다.
          </div>
        </div>
      )}

      {/* Buyer Input Form (다음 회차 예매 티켓이 없을 때 표시) */}
      {!nextTicket && activeTab === 'book' && (
        <div className="form-card">
          <div className="form-title">👤 예매자 정보 입력</div>
          <div className="input-row">
            <div className="input-group">
              <label>예매자 성명</label>
              <input
                type="text"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="예: 홍길동"
              />
            </div>
            <div className="input-group">
              <label>휴대폰 번호</label>
              <input
                type="tel"
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
                placeholder="예: 010-1234-5678"
              />
            </div>
          </div>
        </div>
      )}

      {/* My Ticket View (해당 탭에 맞는 티켓 표시) */}
      {displayedTicket && (() => {
        const isCurrentSessionTicket = displayedTicket.sessionLabel === currentSlot.label;
        const matchingSeats = isCurrentSessionTicket ? currentSeats : nextSeats;
        const mySeatObj = matchingSeats.find(s => s.id === displayedTicket.seatId);
        const isSeated = mySeatObj?.status === 2;
        const remainingMs = Math.max(0, displayedTicket.expiresAt - Date.now());
        const remainingSec = Math.floor(remainingMs / 1000);

        return (
          <div className="ticket-card">
            <div className="ticket-header">
              <span className="ticket-badge">
                {isCurrentSessionTicket ? '🎬 [현재 상영 중 티켓]' : '✨ [다음 회차 예매 티켓]'}
              </span>
              <span className="security-badge" title="브라우저를 닫았다 열어도 상영 종료 시까지 유지됩니다">
                💾 저장됨 · 🔐 AES-256
              </span>
            </div>

            {/* 착석 여부 실시간 상태 뱃지 */}
            <div style={{
              margin: '10px 0 4px',
              padding: '8px 12px',
              borderRadius: '10px',
              background: isSeated ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              border: isSeated ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(245, 158, 11, 0.4)',
              color: isSeated ? '#10b981' : '#f59e0b',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>
                {isSeated ? '🟢 현장 좌석 착석 완료 (LED 점등)' : '🟡 예약 대기 중 (현장 QR 미인증)'}
              </span>
              <span style={{ fontSize: '11px', opacity: 0.8 }}>
                {displayedTicket.sessionLabel}
              </span>
            </div>

            <div className="ticket-buyer-row">
              <div><b>예매자:</b> {displayedTicket.buyer.name}</div>
              <div><b>연락처:</b> {displayedTicket.buyer.phoneMasked}</div>
            </div>

            <div className="ticket-body">
              <div className="ticket-seat-box">
                <div className="lbl">내 예매 좌석</div>
                <div className="val">{displayedTicket.seatId}</div>
              </div>
              <div className="ticket-time-box">
                <div className="countdown-timer">{formatSec(remainingSec)}</div>
                <div className="countdown-lbl">회차 종료 시 일괄 자동 소멸</div>
              </div>
            </div>

            <button
              className="btn-action btn-scan"
              onClick={openScanner}
              style={{
                background: isSeated ? 'linear-gradient(135deg, #059669, #047857)' : undefined
              }}
            >
              {isSeated ? '✅ 착석 완료됨 (필요시 QR 재스캔)' : '📷 좌석 QR 찍고 착석하기 (LED 점등)'}
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button className="btn-secondary" onClick={() => setIsQrListOpen(true)}>
                🖨️ QR 코드 보기
              </button>
              <button
                className="btn-secondary"
                onClick={() => handleCancelTicket(displayedTicket)}
                style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
              >
                ❌ 티켓 취소
              </button>
            </div>
          </div>
        );
      })()}

      {/* Bottom Reservation Button (다음 회차 예매 탭에서 다음 티켓이 없을 때) */}
      {!nextTicket && activeTab === 'book' && (
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
              ? `🎟️ [${selectedSeat} 좌석] ${nextSlot.label} 0원에 예매하기`
              : '좌석을 선택해 주세요'}
          </button>
          <button className="btn-secondary" onClick={() => setIsQrListOpen(true)}>
            🔍 현장 좌석 QR 코드 보기 & 원격 인증
          </button>
        </div>
      )}

      <div className="footer">
        5분 고정 회차 타임슬롯 · AES-256-GCM 보안 봉인 · 회차 일괄 종료 연동
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, margin: '14px 0 10px' }}>
            {(['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'] as const).map(seatId => (
              <button
                key={seatId}
                onClick={() => setActiveQrSeat(seatId)}
                style={{
                  padding: '8px 4px',
                  borderRadius: '8px',
                  border: activeQrSeat === seatId ? '1px solid var(--accent-gold)' : '1px solid rgba(255,255,255,0.1)',
                  background: activeQrSeat === seatId ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)',
                  color: activeQrSeat === seatId ? 'var(--accent-gold)' : 'var(--text)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                {seatId} 좌석
              </button>
            ))}
          </div>

          {/* Active Large QR Display */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: 16,
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.08)'
          }}>
            <div style={{
              background: '#ffffff',
              padding: 12,
              borderRadius: 12,
              boxShadow: '0 8px 25px rgba(0,0,0,0.5)',
              display: 'inline-block'
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=SEAT:${activeQrSeat}`}
                alt={`${activeQrSeat} QR 코드`}
                width={200}
                height={200}
                style={{ display: 'block' }}
              />
            </div>

            <div style={{
              marginTop: 12,
              fontSize: 18,
              fontWeight: 800,
              color: 'var(--accent-gold)',
              letterSpacing: 1
            }}>
              좌석 번호: {activeQrSeat}
            </div>

            <div style={{
              marginTop: 4,
              fontSize: 11,
              color: 'var(--subtext)',
              fontFamily: 'monospace',
              background: 'rgba(0,0,0,0.4)',
              padding: '2px 8px',
              borderRadius: 4
            }}>
              QR 인코딩 내용: SEAT:{activeQrSeat}
            </div>

            <button
              className="btn-action"
              onClick={() => handleDirectVerify(activeQrSeat)}
              style={{
                marginTop: 14,
                padding: '8px 16px',
                fontSize: 13,
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff'
              }}
            >
              ⚡ 이 좌석으로 인증 (카메라 없이 즉시 테스트)
            </button>
          </div>

          <button className="btn-secondary" onClick={() => setIsQrListOpen(false)} style={{ marginTop: 12 }}>
            창 닫기
          </button>
        </div>
      </div>
    </div>
  );
}
