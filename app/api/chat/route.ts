import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages: IncomingMessage[] | undefined = body?.messages;
    const conversationIdFromClient: string | undefined = body?.conversationId;

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json(
        {
          error:
            "Thiếu trường 'messages' (mảng các lượt hội thoại) trong body.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();

    // Có sẵn conversationId từ client thì dùng lại, chưa có thì tạo hội
    // thoại mới — tiêu đề tạm lấy từ tin nhắn đầu tiên của user.
    let conversationId = conversationIdFromClient;
    if (!conversationId) {
      const firstUserMessage = messages.find((m) => m.role === "user");
      const title = (firstUserMessage?.content ?? "Hội thoại mới")
        .slice(0, 80)
        .trim();

      const { data: conversation, error: createError } = await supabase
        .from("conversations")
        .insert({ title })
        .select("id")
        .single();

      if (createError || !conversation) {
        console.error("Lỗi khi tạo conversation:", createError);
        return Response.json(
          { error: "Không tạo được cuộc hội thoại mới trong Supabase." },
          { status: 500 }
        );
      }

      conversationId = conversation.id as string;
    }

    // Lưu tin nhắn cuối cùng của user (tin vừa gửi lên) vào Supabase.
    // Không lưu lại toàn bộ mảng messages để tránh insert trùng những tin
    // đã lưu ở các lượt trước.
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === "user") {
      const { error: insertUserError } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          role: "user",
          content: lastMessage.content,
        });

      if (insertUserError) {
        console.error("Lỗi khi lưu tin nhắn user:", insertUserError);
        // Không chặn chat nếu lưu lịch sử thất bại — vẫn tiếp tục gọi Claude.
      }
    }

    const completion = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const reply = completion.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const { error: insertAssistantError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role: "assistant",
        content: reply,
      });

    if (insertAssistantError) {
      console.error("Lỗi khi lưu tin nhắn assistant:", insertAssistantError);
    }

    return Response.json({ reply, conversationId });
  } catch (error) {
    console.error("Lỗi khi gọi Claude API:", error);
    // Trả thẳng message lỗi thật (nếu có) lên client thay vì câu chung
    // chung — để giao diện nhận diện được lỗi hết credit / lỗi cấu hình
    // mà không phải mở terminal xem log mỗi lần.
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Đã xảy ra lỗi khi gọi Claude API.";
    return Response.json({ error: message }, { status: 500 });
  }
}
