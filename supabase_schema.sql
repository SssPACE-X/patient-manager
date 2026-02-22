-- Supabase SQL Editor 에서 아래 코드를 실행해주세요.

-- 1. patients 테이블 생성
CREATE TABLE patients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  reg_number TEXT NOT NULL,
  allocation TEXT NOT NULL DEFAULT 'unassigned',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  discharged_at TIMESTAMP WITH TIME ZONE,
  memo TEXT,
  treatment_daily_status TEXT DEFAULT 'none',
  treatment_updated_at TIMESTAMP WITH TIME ZONE
);

-- 2. 실시간 동기화(Realtime) 켜기
ALTER PUBLICATION supabase_realtime ADD TABLE patients;
