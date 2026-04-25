import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";

/**
 * Chat thread page.
 * Loads thread by :thread param and renders the chat interface.
 * ChatBot / ChatBotService components will be wired in Phase 4.
 */
export default function ChatThreadPage() {
  const { thread: threadId } = useParams<{ thread: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!threadId) {
      navigate("/", { replace: true });
    }
  }, [threadId, navigate]);

  if (!threadId) return null;

  return (
    <div className="flex flex-col h-full" data-thread-id={threadId}>
      {/* ChatBot component will be mounted here in Phase 4 */}
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Loading thread {threadId}…
      </div>
    </div>
  );
}
