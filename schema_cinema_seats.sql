-- ========================================================
-- 극장 좌석 자동화 시스템 (CinemaSeat) Supabase 테이블 스키마
-- ========================================================

-- 1. cinema_seats 테이블 생성
CREATE TABLE IF NOT EXISTS public.cinema_seats (
  id TEXT PRIMARY KEY,                       -- 좌석 ID: 'A1', 'A2', 'B1', 'B2'
  status INTEGER NOT NULL DEFAULT 0,         -- 0: 빈좌석(EMPTY), 1: 5분대기(RESERVED), 2: 점유/LED ON(OCCUPIED)
  token TEXT,                                -- 암호화된 티켓 토큰
  buyer_name TEXT,                           -- 예매자 이름
  buyer_phone TEXT,                          -- 예매자 연락처
  timer_start BIGINT NOT NULL DEFAULT 0,     -- 타이머 시작 시각 (밀리초 타임스탬프)
  duration_ms BIGINT NOT NULL DEFAULT 300000,-- 유효 기간 (기본 5분 = 300,000ms)
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Row Level Security(RLS) 설정 (모든 사용자와 API에서 읽기/쓰기 허용)
ALTER TABLE public.cinema_seats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to cinema_seats" ON public.cinema_seats;
CREATE POLICY "Allow all access to cinema_seats" 
ON public.cinema_seats 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- 3. 초기 4개 좌석 레코드 등록 (중복 방지)
INSERT INTO public.cinema_seats (id, status, timer_start, duration_ms)
VALUES 
  ('A1', 0, 0, 300000),
  ('A2', 0, 0, 300000),
  ('B1', 0, 0, 300000),
  ('B2', 0, 0, 300000)
ON CONFLICT (id) DO UPDATE 
SET status = 0, token = NULL, buyer_name = NULL, buyer_phone = NULL, timer_start = 0;
