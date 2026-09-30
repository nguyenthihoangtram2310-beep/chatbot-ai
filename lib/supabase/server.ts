import { createClient } from "@supabase/supabase-js";

// Client này CHỈ dùng ở phía server (route handler), không bao giờ import
// vào file có "use client". Dùng service role key vì bảng conversations và
// messages đang bật RLS nhưng chưa có policy cho anon key — đúng như ghi
// chú trong schema.sql của Buổi 1.
export function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.local"
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
