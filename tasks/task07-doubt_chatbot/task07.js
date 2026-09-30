
document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const API_KEY = sessionStorage.getItem("AI_CLASSROOM_API_KEY");
  const SELECTED_TASK = sessionStorage.getItem("AI_CLASSROOM_SELECTED_TASK");
  const HISTORY_KEY = "AI_CLASSROOM_TASK07_HISTORY";
  const THEME_KEY = "AI_CLASSROOM_THEME";
  const API_URL = "https://api.groq.com/openai/v1/chat/completions";
  const MODEL = "openai/gpt-oss-20b";

  // Check access
  if (!API_KEY || SELECTED_TASK !== "7") {
    window.location.href = "../../index.html";
    return;
  }

  const elements = {
    messages: $("messages"),
    welcome: $("welcomeMessage"),
    input: $("userInput"),
    form: $("chatForm"),
    sendButton: $("sendButton"),
    sendIcon: $("sendIcon"),
    sendText: $("sendText"),
    error: $("errorMessage"),
    historyList: $("historyList"),
    historyCount: $("historyCount"),
    themeToggle: $("themeToggle"),
    backButton: $("backButton"),
    newChatButton: $("newChatButton"),
    clearChatButton: $("clearChatButton"),
    clearHistoryButton: $("clearHistoryButton")
  };

  let conversations = loadHistory();
  let currentChatId = null;
  let isGenerating = false;

  // Utilities
  function createId() {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function loadHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(saved)
        ? saved.filter((chat) =>
            chat &&
            typeof chat.id === "string" &&
            Array.isArray(chat.messages)
          )
        : [];
    } catch {
      return [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(conversations));
      return true;
    } catch (error) {
      console.error("Could not save chat history:", error);
      showError("Unable to save chat history. Your browser storage may be full.");
      return false;
    }
  }

  function showError(message) {
    elements.error.textContent = message;
    elements.error.hidden = false;
  }

  function clearError() {
    elements.error.textContent = "";
    elements.error.hidden = true;
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp || Date.now());
    return date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }

  function getCurrentChat() {
    return conversations.find((chat) => chat.id === currentChatId);
  }

  function getChatTitle(messages) {
    const firstUserMessage = messages.find((message) => message.role === "user");
    if (!firstUserMessage) return "New conversation";

    const title = firstUserMessage.content.replace(/\s+/g, " ").trim();
    return title.length > 38 ? title.slice(0, 38) + "…" : title;
  }

  // Basic safe Markdown rendering
  function renderMarkdown(text) {
    let html = escapeHTML(text);

    const codeBlocks = [];
    html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
      const index = codeBlocks.length;
      codeBlocks.push(code.replace(/^\w*\n/, "").trim());
      return `@@CODEBLOCK${index}@@`;
    });

    html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");
    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    html = html.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");

    const lines = html.split("\n");
    const output = [];
    let listType = null;

    function closeList() {
      if (listType) {
        output.push(`</${listType}>`);
        listType = null;
      }
    }

    for (const line of lines) {
      const unordered = line.match(/^\s*[-*]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
      const heading = line.match(/^(#{1,4})\s+(.+)$/);

      if (unordered || ordered) {
        const type = unordered ? "ul" : "ol";
        if (listType !== type) {
          closeList();
          output.push(`<${type}>`);
          listType = type;
        }
        output.push(`<li>${(unordered || ordered)[1]}</li>`);
      } else {
        closeList();
        if (heading) {
          const level = heading[1].length + 1;
          output.push(`<h${level}>${heading[2]}</h${level}>`);
        } else if (line.trim()) {
          output.push(`<p>${line}</p>`);
        }
      }
    }
    closeList();

    let result = output.join("");
    result = result.replace(/@@CODEBLOCK(\d+)@@/g, (_, index) =>
      `<pre><code>${codeBlocks[Number(index)]}</code></pre>`
    );

    return result;
  }

  // Theme
  function applyTheme() {
    const theme = localStorage.getItem(THEME_KEY) || "light";
    document.body.classList.toggle("dark", theme === "dark");
    elements.themeToggle.textContent = theme === "dark" ? "☀" : "☾";
    elements.themeToggle.setAttribute(
      "aria-label",
      theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
    );
  }

  elements.themeToggle.addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark");
    const theme = isDark ? "dark" : "light";
    localStorage.setItem(THEME_KEY, theme);
    applyTheme();
  });

  applyTheme();

  // Return to dashboard
  elements.backButton.addEventListener("click", () => {
    window.location.href = "../../index.html";
  });

  // History
  function renderHistory() {
    elements.historyList.innerHTML = "";
    elements.historyCount.textContent = String(conversations.length);

    if (conversations.length === 0) {
      const empty = document.createElement("div");
      empty.className = "history-empty";
      empty.textContent = "Your conversations will appear here.";
      elements.historyList.appendChild(empty);
      return;
    }

    const sorted = [...conversations].sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    );

    sorted.forEach((chat) => {
      const item = document.createElement("div");
      item.className = "history-item";
      if (chat.id === currentChatId) item.classList.add("active");

      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "history-open";

      const title = document.createElement("span");
      title.className = "history-title";
      title.textContent = chat.title || getChatTitle(chat.messages);

      const date = document.createElement("span");
      date.className = "history-date";
      date.textContent = formatDate(chat.updatedAt);

      openButton.append(title, date);
      openButton.addEventListener("click", () => openConversation(chat.id));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "delete-history";
      deleteButton.textContent = "×";
      deleteButton.title = "Delete conversation";
      deleteButton.setAttribute("aria-label", "Delete conversation");
      deleteButton.addEventListener("click", () => deleteConversation(chat.id));

      item.append(openButton, deleteButton);
      elements.historyList.appendChild(item);
    });
  }

  function createConversation() {
    const chat = {
      id: createId(),
      title: "New conversation",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    conversations.unshift(chat);
    currentChatId = chat.id;
    saveHistory();
    renderHistory();
    renderMessages();
    return chat;
  }

  function openConversation(id) {
    if (isGenerating) return;

    const chat = conversations.find((item) => item.id === id);
    if (!chat) return;

    currentChatId = id;
    clearError();
    renderHistory();
    renderMessages();
  }

  function deleteConversation(id) {
    if (isGenerating) return;

    const chat = conversations.find((item) => item.id === id);
    if (!chat) return;

    if (!window.confirm(`Delete "${chat.title || "this conversation"}"?`)) {
      return;
    }

    conversations = conversations.filter((item) => item.id !== id);

    if (currentChatId === id) {
      currentChatId = null;
      renderMessages();
    }

    saveHistory();
    renderHistory();
  }

  elements.newChatButton.addEventListener("click", () => {
    if (isGenerating) return;
    currentChatId = null;
    clearError();
    renderMessages();
    elements.input.focus();
  });

  elements.clearChatButton.addEventListener("click", () => {
    if (isGenerating) return;

    const chat = getCurrentChat();
    if (!chat || chat.messages.length === 0) {
      renderMessages();
      return;
    }

    if (!window.confirm("Clear all messages in the current conversation?")) {
      return;
    }

    chat.messages = [];
    chat.title = "New conversation";
    chat.updatedAt = Date.now();
    saveHistory();
    clearError();
    renderHistory();
    renderMessages();
  });

  elements.clearHistoryButton.addEventListener("click", () => {
    if (isGenerating || conversations.length === 0) return;

    if (!window.confirm("Delete all saved conversations? This cannot be undone.")) {
      return;
    }

    conversations = [];
    currentChatId = null;
    saveHistory();
    renderHistory();
    renderMessages();
    clearError();
  });

  // Chat rendering
  function renderMessages() {
    const chat = getCurrentChat();
    const messages = chat ? chat.messages : [];

    elements.messages.innerHTML = "";

    if (messages.length === 0) {
      elements.messages.appendChild(elements.welcome);
      elements.welcome.hidden = false;
      return;
    }

    elements.welcome.hidden = true;

    messages.forEach((message) => {
      addMessageToDOM(message.role, message.content, false);
    });

    elements.messages.scrollTop = elements.messages.scrollHeight;
  }

  function addMessageToDOM(role, content, scroll = true) {
    const message = document.createElement("div");
    message.className = `message ${role}`;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "YOU" : "AI";

    const wrapper = document.createElement("div");
    wrapper.className = "message-content";

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    if (role === "assistant") {
      bubble.innerHTML = renderMarkdown(content);
    } else {
      bubble.textContent = content;
    }

    wrapper.appendChild(bubble);

    if (role === "assistant") {
      const actions = document.createElement("div");
      actions.className = "message-actions";

      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "copy-button";
      copyButton.textContent = "Copy response";
      copyButton.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(content);
          copyButton.textContent = "Copied!";
          setTimeout(() => {
            copyButton.textContent = "Copy response";
          }, 1500);
        } catch {
          showError("Unable to copy. Please select and copy the text manually.");
        }
      });

      actions.appendChild(copyButton);
      wrapper.appendChild(actions);
    }

    message.append(avatar, wrapper);
    elements.messages.appendChild(message);

    if (scroll) {
      elements.messages.scrollTop = elements.messages.scrollHeight;
    }
  }

  function showTyping() {
    const message = document.createElement("div");
    message.className = "message assistant";
    message.id = "typingIndicator";

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "AI";

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    const indicator = document.createElement("div");
    indicator.className = "typing-indicator";
    indicator.innerHTML = "<span></span><span></span><span></span>";

    bubble.appendChild(indicator);
    message.append(avatar, bubble);
    elements.messages.appendChild(message);
    elements.messages.scrollTop = elements.messages.scrollHeight;
  }

  function removeTyping() {
    $("typingIndicator")?.remove();
  }

  // API
  async function getAIResponse(messages) {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful educational doubt-solving assistant. " +
              "Answer accurately and explain concepts clearly, using simple language " +
              "when appropriate. Use examples and step-by-step explanations for " +
              "complex topics. Format answers with Markdown when useful. " +
              "If a question is ambiguous, ask a clarifying question. " +
              "Do not invent facts or pretend to have checked external sources."
          },
          ...messages.map(({ role, content }) => ({ role, content }))
        ],
        temperature: 0.5,
        max_completion_tokens: 2048
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const apiMessage = data.error?.message || `Request failed (${response.status}).`;
      throw new Error(apiMessage);
    }

    const answer = data.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) {
      throw new Error("The AI returned an empty response. Please try again.");
    }

    return answer.trim();
  }

  function setLoading(loading) {
    isGenerating = loading;
    elements.sendButton.disabled = loading;
    elements.input.disabled = loading;
    elements.sendText.textContent = loading ? "Thinking..." : "Send";
    elements.sendIcon.textContent = loading ? "…" : "➤";
  }

  async function sendMessage(text) {
    const question = text.trim();
    if (!question || isGenerating) return;

    clearError();

    let chat = getCurrentChat();
    if (!chat) {
      chat = createConversation();
    }

    chat.messages.push({
      role: "user",
      content: question,
      timestamp: Date.now()
    });
    chat.title = getChatTitle(chat.messages);
    chat.updatedAt = Date.now();

    saveHistory();
    renderHistory();
    renderMessages();

    setLoading(true);
    showTyping();

    try {
      const historyForAPI = chat.messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map(({ role, content }) => ({ role, content }));

      const answer = await getAIResponse(historyForAPI);

      // The conversation may have been deleted while waiting.
      const stillExists = conversations.find((item) => item.id === chat.id);
      if (!stillExists) return;

      stillExists.messages.push({
        role: "assistant",
        content: answer,
        timestamp: Date.now()
      });
      stillExists.updatedAt = Date.now();

      saveHistory();
    } catch (error) {
      console.error("Chat request failed:", error);
      showError(
        error.message ||
        "Something went wrong while generating the answer. Please try again."
      );
    } finally {
      removeTyping();
      setLoading(false);
      renderHistory();
      renderMessages();
      elements.input.focus();
    }
  }

  // Form submission
  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = elements.input.value.trim();
    if (!question || isGenerating) return;

    elements.input.value = "";
    elements.input.style.height = "auto";
    sendMessage(question);
  });

  // Enter sends; Shift+Enter creates a new line.
  elements.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      elements.form.requestSubmit();
    }
  });

  // Auto-resize textarea
  elements.input.addEventListener("input", () => {
    elements.input.style.height = "auto";
    elements.input.style.height =
      Math.min(elements.input.scrollHeight, 150) + "px";
  });

  // Suggested questions
  document.querySelectorAll("[data-question]").forEach((button) => {
    button.addEventListener("click", () => {
      if (isGenerating) return;
      elements.input.value = button.dataset.question || "";
      elements.input.focus();
      elements.input.style.height = "auto";
      elements.input.style.height =
        Math.min(elements.input.scrollHeight, 150) + "px";
    });
  });

  // Initial display
  renderHistory();
  renderMessages();
});