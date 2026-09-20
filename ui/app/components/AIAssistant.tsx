import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, SendHorizontal, Square, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export type AISeedPrompt = { text: string; autoSend?: boolean };

interface AIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  /** 外部注入提示词（如 3D 大屏「AI 诊断」），打开面板后填入并可自动发送 */
  seedPrompt?: AISeedPrompt | null;
  onSeedConsumed?: () => void;
}

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

interface LastRequest {
  user: string;
  prompt: string;
}

const REQUEST_TIMEOUT_MS = 30000;
const TYPEWRITER_INTERVAL_MS = 36;

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const extractText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = extractText(item);
      if (text) {
        return text;
      }
    }
    return '';
  }

  if (!value || typeof value !== 'object') {
    return '';
  }

  const payload = value as Record<string, unknown>;
  const directKeys = ['content', 'message', 'text', 'delta', 'response', 'answer', 'result'];

  for (const key of directKeys) {
    const text = extractText(payload[key]);
    if (text) {
      return text;
    }
  }

  const data = payload.data as Record<string, unknown> | undefined;
  if (data) {
    const dataKeys = ['content', 'message', 'text', 'datas', 'rows', 'items', 'list'];
    for (const key of dataKeys) {
      const text = extractText(data[key]);
      if (text) {
        return text;
      }
    }
  }

  return '';
};

const toChunkText = (raw: string): string => {
  const text = raw.trim();
  if (!text) {
    return '';
  }

  try {
    const payload = JSON.parse(text);
    return extractText(payload);
  } catch {
    return text;
  }

  return '';
};

export function AIAssistant({ isOpen, onClose, seedPrompt, onSeedConsumed }: AIAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: createId(),
      role: 'assistant',
      content: '你好，我是智慧能源助手。你可以直接提问建筑能耗分析、设备异常诊断与节能建议。',
    },
  ]);
  const [input, setInput] = useState('');
  const [username, setUsername] = useState(() => localStorage.getItem('username') || 'guan');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState('');
  const [lastRequest, setLastRequest] = useState<LastRequest | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const typingResolveRef = useRef<(() => void) | null>(null);
  const seedHandledRef = useRef<string | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !isStreaming, [input, isStreaming]);

  useEffect(() => {
    if (!isOpen) {
      seedHandledRef.current = null;
      return;
    }

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (typingTimerRef.current !== null) {
        window.clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      typingResolveRef.current?.();
      typingResolveRef.current = null;
    };
  }, []);

  const stopTyping = () => {
    if (typingTimerRef.current !== null) {
      window.clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    typingResolveRef.current?.();
    typingResolveRef.current = null;
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    stopTyping();
    setIsStreaming(false);
  };

  const pushAssistantChunk = (chunk: string) => {
    if (!chunk) {
      return;
    }

    setMessages((prev) => [...prev, { id: createId(), role: 'assistant', content: chunk }]);
  };

  const typeAssistantMessage = (fullText: string) => {
    const targetText = fullText || '[空响应]';
    const assistantId = createId();

    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    return new Promise<void>((resolve) => {
      stopTyping();
      typingResolveRef.current = resolve;

      let index = 0;
      typingTimerRef.current = window.setInterval(() => {
        index += 1;
        const nextText = targetText.slice(0, index);

        setMessages((prev) =>
          prev.map((msg) => (msg.id === assistantId ? { ...msg, content: nextText } : msg)),
        );

        if (index >= targetText.length) {
          stopTyping();
        }
      }, TYPEWRITER_INTERVAL_MS);
    });
  };

  const requestAssistantReply = async (currentUser: string, prompt: string) => {
    const controller = new AbortController();
    abortRef.current = controller;

    let timeoutTriggered = false;
    const timeoutTimer = window.setTimeout(() => {
      timeoutTriggered = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const query = new URLSearchParams({
        userName: currentUser,
        message: prompt,
      });

      const response = await fetch(`/api/ai/chat?${query.toString()}`, {
        method: 'POST',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const rawText = await response.text();
      const content = toChunkText(rawText) || rawText.trim();
      await typeAssistantMessage(content || '[空响应]');
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        if (timeoutTriggered) {
          setStreamError('请求超时（30s），你可以点击“重试上一次”继续');
          pushAssistantChunk('[请求超时，请重试]');
          return;
        }

        pushAssistantChunk('[已手动停止]');
        return;
      }

      console.error('ai chat request failed:', error);
      setStreamError('请求失败，请检查 /api/ai/chat 接口是否可用');
      pushAssistantChunk('[请求失败，请稍后重试]');
    } finally {
      window.clearTimeout(timeoutTimer);
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  useEffect(() => {
    if (!isOpen || !seedPrompt?.text) {
      return;
    }

    const key = `${seedPrompt.text}::${seedPrompt.autoSend ? "1" : "0"}`;
    if (seedHandledRef.current === key) {
      return;
    }
    seedHandledRef.current = key;

    setInput(seedPrompt.text);

    if (seedPrompt.autoSend) {
      const text = seedPrompt.text;
      const run = async () => {
        const currentUser = username.trim() || "guan";
        setLastRequest({ user: currentUser, prompt: text });
        setStreamError("");
        setIsStreaming(true);
        setInput("");
        const userMessage: ChatMessage = {
          id: createId(),
          role: "user",
          content: text,
        };
        setMessages((prev) => [...prev, userMessage]);
        localStorage.setItem("username", currentUser);
        await requestAssistantReply(currentUser, text);
      };
      const t = window.setTimeout(() => {
        void run();
        onSeedConsumed?.();
      }, 280);
      return () => window.clearTimeout(t);
    }

    onSeedConsumed?.();
  }, [isOpen, seedPrompt, onSeedConsumed, username]);

  const handleSend = async (request?: LastRequest) => {
    const isRetry = Boolean(request);
    const prompt = (request?.prompt || input).trim();
    const currentUser = (request?.user || username).trim() || 'guan';

    if (!prompt || isStreaming) {
      return;
    }

    setLastRequest({ user: currentUser, prompt });
    setStreamError('');
    setIsStreaming(true);

    if (!isRetry) {
      setInput('');
      const userMessage: ChatMessage = {
        id: createId(),
        role: 'user',
        content: prompt,
      };
      setMessages((prev) => [...prev, userMessage]);
    } else {
      pushAssistantChunk('[重试中...]');
    }

    localStorage.setItem('username', currentUser);
    await requestAssistantReply(currentUser, prompt);
  };

  const handleRetry = async () => {
    if (!lastRequest || isStreaming) {
      return;
    }

    await handleSend(lastRequest);
  };

  const showWaitingTip = isStreaming;
  const hasRetry = Boolean(lastRequest) && !isStreaming;

  const handleClose = () => {
    stopStreaming();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-[#0a0a0a] border border-white/10 flex flex-col z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0a0a0a]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center">
                  <img
                    src="/a72583cc8af6a68248f6b5ce37264fe6.png"
                    alt="AI Assistant"
                    className="w-6 h-6 filter invert"
                  />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">智慧能源大模型</h3>
                  <p className="text-white/40 text-xs">普通 POST 模式</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 p-4 bg-[#0a0a0a] min-h-0 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <label className="text-xs text-white/50">用户</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-48 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
                  placeholder="userName"
                />
                <div className="text-xs text-white/30">请求: POST /api/ai/chat?userName=...&message=...</div>
              </div>

              <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto border border-white/10 rounded-xl bg-black p-4 space-y-3">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'user' ? (
                      <div className="max-w-[80%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm leading-6 bg-white text-black">
                        {msg.content}
                      </div>
                    ) : (
                      <div className="max-w-[80%] rounded-xl px-4 py-3 text-sm leading-6 bg-white/10 text-white border border-white/10 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-white/10 [&_code]:text-emerald-300 [&_pre]:bg-black/60 [&_pre]:border [&_pre]:border-white/10 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_blockquote]:border-l-2 [&_blockquote]:border-white/30 [&_blockquote]:pl-3 [&_blockquote]:text-white/60 [&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_th]:border [&_th]:border-white/20 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-white/5 [&_td]:border [&_td]:border-white/20 [&_td]:px-2 [&_td]:py-1 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mb-1 [&_strong]:font-semibold [&_a]:text-blue-400 [&_a]:underline">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                ))}

                {showWaitingTip && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm leading-6 bg-white/10 text-white border border-white/10 inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      正在生成回答...
                    </div>
                  </div>
                )}
              </div>

              {streamError && (
                <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                  <span>{streamError}</span>
                  {hasRetry && (
                    <button
                      onClick={handleRetry}
                      className="px-2 py-1 rounded border border-red-300/40 text-red-100 hover:bg-red-500/20 transition-colors"
                    >
                      重试上一次
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
                  placeholder="输入消息，回车发送"
                />

                {isStreaming ? (
                  <button
                    onClick={stopStreaming}
                    className="h-11 px-4 rounded-xl border border-red-400/40 text-red-200 hover:bg-red-500/10 transition-colors inline-flex items-center gap-2"
                  >
                    <Square size={14} />
                    停止
                  </button>
                ) : (
                  <button
                    onClick={() => handleSend()}
                    disabled={!canSend}
                    className="h-11 px-4 rounded-xl bg-white text-black hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                  >
                    <SendHorizontal size={14} />
                    发送
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
