-- Supabase SQL Editor 에서 아래 코드를 실행해주세요.

-- 1. 푸시 알림 구독 정보 저장용 테이블 생성
CREATE TABLE push_subscriptions (
  id SERIAL PRIMARY KEY,
  subscription JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 중복 방지 인덱스 (동일 기기에서 여러 번 구독되는 것 방지)
CREATE UNIQUE INDEX idx_subscription_endpoint ON push_subscriptions ((subscription->>'endpoint'));
