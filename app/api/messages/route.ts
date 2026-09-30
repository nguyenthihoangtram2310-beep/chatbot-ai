import { getSupabaseServerClient } from "@/lib/supabase/server";

// GET /api/messages?conversationId=... — đọc lại lịch sử tin nhắn của 1
// cuộc hội thoại, dùng khi trang chat được tải lại.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId");

    if (!conversationId) {
      return Response.json(
        { error: "Thiếu tham số 'conversationId'." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();

    const { data, error } = await supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Lỗi khi đọc lịch sử tin nhắn:", error);
      return Response.json(
        { error: "Không đọc được lịch sử hội thoại từ Supabase." },
        { status: 500 }
      );
    }

    return Response.json({ messages: data ?? [] });
  } catch (error) {
    console.error("Lỗi khi đọc lịch sử tin nhắn:", error);
    return Response.json(
      { error: "Đã xảy ra lỗi khi đọc lịch sử hội thoại." },
      { status: 500 }
    );
  }
}
