-- Schema cho chatbot-ai — Tuần 3, Buổi 1
-- Chạy toàn bộ file này trong Supabase Dashboard → SQL Editor → New query → Run

-- Bật extension tạo UUID (Supabase thường đã bật sẵn, chạy lại cũng không sao)
create extension if not exists pgcrypto;

-- Bảng "conversations": mỗi dòng là 1 cuộc hội thoại
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  title text,                          -- tiêu đề hội thoại, có thể tự đặt từ câu hỏi đầu tiên
  created_at timestamptz not null default now()
);

-- Bảng "messages": mỗi dòng là 1 lượt nhắn, thuộc về 1 conversation
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- Index để lấy tin nhắn theo đúng thứ tự thời gian trong 1 hội thoại cho nhanh
create index if not exists messages_conversation_id_created_at_idx
  on messages (conversation_id, created_at);

-- Bật Row Level Security (RLS) — bắt buộc bật trước khi cho phép truy cập từ
-- client bằng anon key. Ở Buổi 2 mình sẽ chỉ gọi 2 bảng này từ server (route
-- handler) bằng service role key nên tạm thời CHƯA cần policy cho anon key.
alter table conversations enable row level security;
alter table messages enable row level security;
