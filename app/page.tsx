"use client";

import { useEffect, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
};

const CONVERSATION_ID_STORAGE_KEY = "chatbot-ai:conversationId";

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Luôn cuộn xuống tin nhắn mới nhất.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Dọn interval hiệu ứng gõ chữ nếu component bị huỷ giữa chừng.
  useEffect(() => {
    return () => {
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
    };
  }, []);

  // Khi trang được tải: nếu trình duyệt này đã có conversationId lưu từ
  // trước (localStorage), đọc lại lịch sử tin nhắn từ Supabase qua
  // /api/messages. Chưa có thì để trống, cuộc hội thoại mới sẽ được tạo
  // ở lượt chat đầu tiên (xem route /api/chat).
  useEffect(() => {
    (async () => {
      const storedId = window.localStorage.getItem(
        CONVERSATION_ID_STORAGE_KEY
      );
      if (!storedId) {
        setIsHistoryLoading(false);
        return;
      }

      setConversationId(storedId);

      try {
        const res = await fetch(
          `/api/messages?conversationId=${encodeURIComponent(storedId)}`
        );
        const data = await res.json();

        if (!res.ok) {
          console.error("Không đọc được lịch sử hội thoại:", data?.error);
          return;
        }

        type StoredMessage = {
          id: string;
          role: "user" | "assistant";
          content: string;
        };

        const history: ChatMessage[] = (data.messages as StoredMessage[]).map(
          (m) => ({ id: m.id, role: m.role, content: m.content })
        );
        setMessages(history);
      } catch (error) {
        console.error("Không kết nối được để đọc lịch sử hội thoại:", error);
      } finally {
        setIsHistoryLoading(false);
      }
    })();
  }, []);

  // Hiệu ứng "streaming" giả lập: hiện chữ dần dần thay vì hiện nguyên câu một lúc.
  // Route /api/chat hiện trả JSON nguyên khối (chưa stream thật từ server),
  // nên phần này chỉ mô phỏng cảm giác gõ chữ ở phía giao diện.
  function revealReplyGradually(fullText: string) {
    const assistantId = makeId();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    let charIndex = 0;
    const charsPerTick = Math.max(1, Math.round(fullText.length / 80));

    streamTimerRef.current = setInterval(() => {
      charIndex += charsPerTick;
      const nextSlice = fullText.slice(0, charIndex);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: nextSlice } : m
        )
      );

      if (charIndex >= fullText.length) {
        if (streamTimerRef.current) clearInterval(streamTimerRef.current);
      }
    }, 20);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      content: trimmed,
    };
    // Ghép tin nhắn mới vào lịch sử hiện có ngay tại đây (không chỉ setState)
    // để có mảng đầy đủ gửi lên server làm "bộ nhớ hội thoại trong phiên".
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages
            .filter((m) => m.role !== "error")
            .map((m) => ({ role: m.role, content: m.content })),
          conversationId: conversationId ?? undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const rawError: string = data?.error ?? "Đã có lỗi xảy ra.";
        const friendly = rawError.toLowerCase().includes("credit")
          ? "Tài khoản Anthropic API chưa đủ credit để trả lời. Chị nạp credit tại console.anthropic.com rồi thử lại nhé."
          : rawError;
        setMessages((prev) => [
          ...prev,
          { id: makeId(), role: "error", content: friendly },
        ]);
        return;
      }

      // Lượt chat đầu tiên: server tạo conversation mới và trả id về —
      // lưu lại vào state + localStorage để các lượt sau và các lần tải
      // trang tiếp theo dùng chung 1 cuộc hội thoại.
      if (data.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
        window.localStorage.setItem(
          CONVERSATION_ID_STORAGE_KEY,
          data.conversationId
        );
      }

      revealReplyGradually(data.reply ?? "");
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "error",
          content: "Không kết nối được tới server. Chị kiểm tra lại kết nối mạng.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-black">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Chatbot AI
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Trò chuyện với Claude qua API do Chị tự dựng
        </p>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4">
        <div className="flex-1 overflow-y-auto py-6">
          {isHistoryLoading && (
            <p className="mt-10 text-center text-sm text-zinc-400 dark:text-zinc-600">
              Đang tải lại lịch sử hội thoại...
            </p>
          )}

          {!isHistoryLoading && messages.length === 0 && (
            <p className="mt-10 text-center text-sm text-zinc-400 dark:text-zinc-600">
              Chưa có tin nhắn nào. Gõ gì đó bên dưới để bắt đầu trò chuyện.
            </p>
          )}

          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                      : m.role === "error"
                        ? "border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                        : "bg-white text-zinc-800 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-2xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
                </div>
              </div>
            )}
          </div>
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 border-t border-zinc-200 py-4 dark:border-zinc-800"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Nhập tin nhắn... (Enter để gửi, Shift+Enter xuống dòng)"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Gửi
          </button>
        </form>
      </main>
    </div>
  );
}
