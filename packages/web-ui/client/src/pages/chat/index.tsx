import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Chat home page.
 * Generates a new thread ID and navigates to it, or renders the default chat UI.
 * ChatBot / ChatBotService components will be wired in Phase 4.
 */
export default function ChatIndexPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Generate a UUID for the new thread
    const id = crypto.randomUUID();
    navigate(`/chat/${id}`, { replace: true });
  }, [navigate]);

  return null;
}
