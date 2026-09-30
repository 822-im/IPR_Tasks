
document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const API_KEY = sessionStorage.getItem("AI_CLASSROOM_API_KEY");
  const SELECTED_TASK = sessionStorage.getItem("AI_CLASSROOM_SELECTED_TASK");
  const STORAGE_KEY = "AI_CLASSROOM_TASK08_SETS";
  const THEME_KEY = "AI_CLASSROOM_THEME";
  const API_URL = "https://api.groq.com/openai/v1/chat/completions";
  const MODEL = "openai/gpt-oss-20b";

  if (!API_KEY || SELECTED_TASK !== "8") {
    window.location.href = "../../index.html";
    return;
  }

  const el = {
    backButton: $("backButton"),
    themeToggle: $("themeToggle"),
    pageHeading: $("pageHeading"),
    setupSection: $("setupSection"),
    welcomeSection: $("welcomeSection"),
    form: $("flashcardForm"),
    topic: $("topic"),
    sourceText: $("sourceText"),
    difficulty: $("difficulty"),
    cardCount: $("cardCount"),
    extraInstructions: $("extraInstructions"),
    errorMessage: $("errorMessage"),
    generateButton: $("generateButton"),
    generateIcon: $("generateIcon"),
    generateText: $("generateText"),
    savedSets: $("savedSets"),
    setCount: $("setCount"),
    newSetButton: $("newSetButton"),
    clearHistoryButton: $("clearHistoryButton"),
    studySection: $("studySection"),
    setTitle: $("setTitle"),
    setDescription: $("setDescription"),
    flashcard: $("flashcard"),
    questionText: $("questionText"),
    answerText: $("answerText"),
    progressText: $("progressText"),
    knownText: $("knownText"),
    reviewText: $("reviewText"),
    progressBar: $("progressBar"),
    cardPosition: $("cardPosition"),
    previousButton: $("previousButton"),
    nextButton: $("nextButton"),
    shuffleButton: $("shuffleButton"),
    reviewButton: $("reviewButton"),
    knownButton: $("knownButton"),
    downloadButton: $("downloadButton"),
    saveSetButton: $("saveSetButton"),
    backToSetup: $("backToSetup"),
    resetProgressButton: $("resetProgressButton")
  };

  let savedSets = loadSets();
  let currentSet = null;
  let currentIndex = 0;
  let isGenerating = false;
  let currentSetId = null;

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

  function showError(message) {
    el.errorMessage.textContent = message;
    el.errorMessage.hidden = false;
  }

  function clearError() {
    el.errorMessage.textContent = "";
    el.errorMessage.hidden = true;
  }

  function loadSets() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(data)) return [];

      return data
        .filter((set) => set && typeof set.id === "string" &&
          Array.isArray(set.cards))
        .map((set) => ({
          ...set,
          cards: set.cards
            .filter((card) => card &&
              typeof card.question === "string" &&
              typeof card.answer === "string")
            .map((card) => ({
              question: card.question,
              answer: card.answer,
              status: ["known", "review"].includes(card.status)
                ? card.status : "unseen"
            }))
        }));
    } catch {
      return [];
    }
  }

  function persistSets() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedSets));
      return true;
    } catch (error) {
      console.error("Unable to save flashcards:", error);
      showError("Could not save the flashcard set. Your browser storage may be full.");
      return false;
    }
  }

  function formatDate(timestamp) {
    return new Date(timestamp || Date.now()).toLocaleDateString(
      undefined, { day: "numeric", month: "short", year: "numeric" }
    );
  }

  // Theme
  function applyTheme() {
    const theme = localStorage.getItem(THEME_KEY) || "light";
    document.body.classList.toggle("dark", theme === "dark");
    el.themeToggle.textContent = theme === "dark" ? "☀" : "☾";
    el.themeToggle.setAttribute(
      "aria-label",
      theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
    );
  }

  el.themeToggle.addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark");
    localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
    applyTheme();
  });

  applyTheme();

  // Return to main dashboard
  el.backButton.addEventListener("click", () => {
    window.location.href = "../../index.html";
  });

  // Sidebar and saved sets
  function renderSavedSets() {
    el.savedSets.innerHTML = "";
    el.setCount.textContent = String(savedSets.length);

    if (!savedSets.length) {
      const empty = document.createElement("p");
      empty.className = "empty-history";
      empty.textContent = "Your saved sets will appear here.";
      el.savedSets.appendChild(empty);
      return;
    }

    const sorted = [...savedSets].sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    );

    sorted.forEach((set) => {
      const item = document.createElement("div");
      item.className = "saved-set";
      if (set.id === currentSetId) item.classList.add("active");

      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "saved-set-open";

      const name = document.createElement("span");
      name.className = "saved-set-name";
      name.textContent = set.title || "Untitled set";

      const meta = document.createElement("span");
      meta.className = "saved-set-meta";
      meta.textContent = `${set.cards.length} cards · ${formatDate(set.updatedAt)}`;

      openButton.append(name, meta);
      openButton.addEventListener("click", () => openSavedSet(set.id));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "delete-set";
      deleteButton.textContent = "×";
      deleteButton.title = "Delete saved set";
      deleteButton.setAttribute("aria-label", `Delete ${set.title || "set"}`);
      deleteButton.addEventListener("click", () => deleteSavedSet(set.id));

      item.append(openButton, deleteButton);
      el.savedSets.appendChild(item);
    });
  }

  function openSavedSet(id) {
    const set = savedSets.find((item) => item.id === id);
    if (!set) return;

    currentSet = JSON.parse(JSON.stringify(set));
    currentSetId = set.id;
    currentIndex = 0;
    clearError();
    showStudyMode();
    renderSavedSets();
    renderCard();
  }

  function deleteSavedSet(id) {
    const set = savedSets.find((item) => item.id === id);
    if (!set) return;

    if (!window.confirm(`Delete "${set.title || "this set"}" permanently?`)) {
      return;
    }

    savedSets = savedSets.filter((item) => item.id !== id);

    if (currentSetId === id) {
      currentSetId = null;
      if (currentSet && currentSet.id === id) {
        currentSetId = null;
        currentSet = null;
        showSetupMode();
      }
    }

    persistSets();
    renderSavedSets();
  }

  el.newSetButton.addEventListener("click", () => {
    if (isGenerating) return;
    currentSet = null;
    currentSetId = null;
    currentIndex = 0;
    clearError();
    el.form.reset();
    el.difficulty.value = "Intermediate";
    el.cardCount.value = "10";
    showSetupMode();
    renderSavedSets();
  });

  el.clearHistoryButton.addEventListener("click", () => {
    if (!savedSets.length) return;

    if (!window.confirm("Delete all saved flashcard sets? This cannot be undone.")) {
      return;
    }

    savedSets = [];
    currentSetId = null;

    if (currentSet) {
      currentSetId = null;
    }

    persistSets();
    renderSavedSets();

    if (currentSet) {
      showSetupMode();
      currentSet = null;
    }
  });

  // View switching
  function showSetupMode() {
    el.pageHeading.hidden = false;
    el.setupSection.hidden = false;
    el.welcomeSection.hidden = false;
    el.studySection.hidden = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showStudyMode() {
    el.pageHeading.hidden = true;
    el.setupSection.hidden = true;
    el.welcomeSection.hidden = true;
    el.studySection.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  el.backToSetup.addEventListener("click", () => {
    if (isGenerating) return;
    clearError();
    showSetupMode();
  });

  // Flashcard generation
  function extractJSON(text) {
    const cleaned = text
      .replace(/```(?:json)?/gi, "")
      .trim();

    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start === -1 || end <= start) {
      throw new Error("The AI returned an invalid response. Please try again.");
    }

    return JSON.parse(cleaned.slice(start, end + 1));
  }

  function normalizeCards(data, requestedCount) {
    let cards = Array.isArray(data) ? data : data.cards;

    if (!Array.isArray(cards)) {
      throw new Error("No flashcards were returned. Please try again.");
    }

    cards = cards
      .map((card) => ({
        question: String(card.question ?? card.front ?? "").trim(),
        answer: String(card.answer ?? card.back ?? "").trim(),
        status: "unseen"
      }))
      .filter((card) => card.question && card.answer);

    if (!cards.length) {
      throw new Error("The AI did not return valid flashcards. Try another topic.");
    }

    return cards.slice(0, requestedCount);
  }

  async function requestFlashcards({ topic, source, difficulty, count, instructions }) {
    const prompt = `
Create exactly ${count} educational flashcards about "${topic}".

Difficulty: ${difficulty}

${source
  ? `Use this study material as the primary source. Keep the cards grounded in it. If it lacks information for a requested card, do not invent details.\n\nSTUDY MATERIAL:\n${source}`
  : "Use accurate general knowledge to create useful educational flashcards."}

Additional instructions: ${instructions || "None"}

Requirements:
- Each question must test one clear concept.
- Answers should be concise, accurate and useful for revision.
- Avoid duplicate questions.
- Include definitions, concepts, and examples where appropriate.
- Do not include markdown outside the JSON.
- Return a valid JSON object with this exact structure:
{
  "cards": [
    {
      "question": "Question here",
      "answer": "Answer here"
    }
  ]
}
`;

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
            content: "You are an educational flashcard creator. Follow the requested JSON structure exactly. Do not add commentary outside the JSON."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.4,
        max_completion_tokens: 4096
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error?.message || `AI request failed (${response.status}).`
      );
    }

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("The AI returned an empty response. Please try again.");
    }

    return normalizeCards(extractJSON(content), count);
  }

  function setGenerating(loading) {
    isGenerating = loading;
    el.generateButton.disabled = loading;
    el.generateIcon.textContent = loading ? "…" : "✦";
    el.generateText.textContent = loading
      ? "Generating flashcards..."
      : "Generate flashcards";
  }

  el.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isGenerating) return;

    clearError();

    const topic = el.topic.value.trim();
    const source = el.sourceText.value.trim();
    const difficulty = el.difficulty.value;
    const count = Number(el.cardCount.value);
    const instructions = el.extraInstructions.value.trim();

    if (!topic) {
      showError("Please enter a topic.");
      el.topic.focus();
      return;
    }

    if (source.length > 20000) {
      showError("Study material is too long. Please shorten it.");
      return;
    }

    setGenerating(true);

    try {
      const cards = await requestFlashcards({
        topic, source, difficulty, count, instructions
      });

      currentSet = {
        id: createId(),
        title: topic,
        description: `${difficulty} · ${cards.length} cards`,
        difficulty,
        cards,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      currentSetId = null;
      currentIndex = 0;
      showStudyMode();
      renderCard();
      renderSavedSets();
    } catch (error) {
      console.error("Flashcard generation failed:", error);
      showError(
        error.message || "Unable to generate flashcards. Please try again."
      );
    } finally {
      setGenerating(false);
    }
  });

  // Example topics
  document.querySelectorAll("[data-topic]").forEach((button) => {
    button.addEventListener("click", () => {
      if (isGenerating) return;
      el.topic.value = button.dataset.topic || "";
      el.topic.focus();
    });
  });

  // Study mode
  function currentCard() {
    return currentSet?.cards?.[currentIndex] || null;
  }

  function renderCard() {
    if (!currentSet || !currentSet.cards.length) {
      showSetupMode();
      return;
    }

    currentIndex = Math.max(
      0, Math.min(currentIndex, currentSet.cards.length - 1)
    );

    const card = currentCard();
    const total = currentSet.cards.length;
    const known = currentSet.cards.filter((c) => c.status === "known").length;
    const review = currentSet.cards.filter((c) => c.status === "review").length;

    el.setTitle.textContent = currentSet.title;
    el.setDescription.textContent =
      currentSet.description || `${total} flashcards`;

    el.questionText.textContent = card.question;
    el.answerText.textContent = card.answer;

    el.flashcard.classList.remove("flipped");
    el.flashcard.setAttribute("aria-pressed", "false");

    el.progressText.textContent = `Card ${currentIndex + 1} of ${total}`;
    el.cardPosition.textContent = `${currentIndex + 1} / ${total}`;
    el.knownText.textContent = String(known);
    el.reviewText.textContent = String(review);
    el.progressBar.style.width = `${((currentIndex + 1) / total) * 100}%`;

    el.previousButton.disabled = currentIndex === 0;
    el.nextButton.disabled = currentIndex === total - 1;

    el.previousButton.style.opacity = currentIndex === 0 ? ".45" : "1";
    el.nextButton.style.opacity = currentIndex === total - 1 ? ".45" : "1";

    el.knownButton.textContent =
      card.status === "known" ? "✓ Known" : "✓ I know this";
    el.reviewButton.textContent =
      card.status === "review" ? "↻ Marked for review" : "↻ Review again";

    el.saveSetButton.textContent = currentSetId
      ? "✓ Saved"
      : "♡ Save set";
  }

  function flipCard() {
    const flipped = el.flashcard.classList.toggle("flipped");
    el.flashcard.setAttribute("aria-pressed", String(flipped));
  }

  el.flashcard.addEventListener("click", flipCard);

  el.previousButton.addEventListener("click", () => {
    if (currentIndex > 0) {
      currentIndex--;
      renderCard();
    }
  });

  el.nextButton.addEventListener("click", () => {
    if (currentSet && currentIndex < currentSet.cards.length - 1) {
      currentIndex++;
      renderCard();
    }
  });

  function updateCardStatus(status) {
    const card = currentCard();
    if (!card) return;

    card.status = status;
    if (currentSetId) {
      const saved = savedSets.find((set) => set.id === currentSetId);
      if (saved) {
        saved.cards = JSON.parse(JSON.stringify(currentSet.cards));
        saved.updatedAt = Date.now();
        persistSets();
      }
    }

    renderCard();
    renderSavedSets();
  }

  el.knownButton.addEventListener("click", () => {
    const card = currentCard();
    if (!card) return;
    updateCardStatus(card.status === "known" ? "unseen" : "known");
  });

  el.reviewButton.addEventListener("click", () => {
    const card = currentCard();
    if (!card) return;
    updateCardStatus(card.status === "review" ? "unseen" : "review");
  });

  el.shuffleButton.addEventListener("click", () => {
    if (!currentSet || currentSet.cards.length < 2) return;

    // Fisher-Yates shuffle
    for (let i = currentSet.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [currentSet.cards[i], currentSet.cards[j]] =
        [currentSet.cards[j], currentSet.cards[i]];
    }

    currentIndex = 0;
    if (currentSetId) {
      const saved = savedSets.find((set) => set.id === currentSetId);
      if (saved) {
        saved.cards = JSON.parse(JSON.stringify(currentSet.cards));
        saved.updatedAt = Date.now();
        persistSets();
      }
    }
    renderCard();
    renderSavedSets();
  });

  el.resetProgressButton.addEventListener("click", () => {
    if (!currentSet) return;
    if (!window.confirm("Reset the study progress for every card in this set?")) {
      return;
    }

    currentSet.cards.forEach((card) => {
      card.status = "unseen";
    });

    if (currentSetId) {
      const saved = savedSets.find((set) => set.id === currentSetId);
      if (saved) {
        saved.cards = JSON.parse(JSON.stringify(currentSet.cards));
        saved.updatedAt = Date.now();
        persistSets();
      }
    }

    renderCard();
    renderSavedSets();
  });

  // Save current set
  el.saveSetButton.addEventListener("click", () => {
    if (!currentSet) return;

    if (currentSetId) {
      const saved = savedSets.find((set) => set.id === currentSetId);
      if (saved) {
        saved.cards = JSON.parse(JSON.stringify(currentSet.cards));
        saved.updatedAt = Date.now();
        if (persistSets()) {
          renderCard();
          renderSavedSets();
        }
        return;
      }
    }

    const savedCopy = JSON.parse(JSON.stringify(currentSet));
    savedCopy.id = createId();
    savedCopy.createdAt = Date.now();
    savedCopy.updatedAt = Date.now();

    savedSets.unshift(savedCopy);

    if (persistSets()) {
      currentSetId = savedCopy.id;
      currentSet.id = savedCopy.id;
      renderCard();
      renderSavedSets();
    } else {
      savedSets = savedSets.filter((set) => set.id !== savedCopy.id);
    }
  });

  // CSV export
  function csvEscape(value) {
    return `"${String(value).replace(/"/g, '""')}"`;
  }

  el.downloadButton.addEventListener("click", () => {
    if (!currentSet || !currentSet.cards.length) return;

    const rows = [
      ["Question", "Answer", "Status"],
      ...currentSet.cards.map((card) => [
        card.question,
        card.answer,
        card.status
      ])
    ];

    const csv = "\uFEFF" + rows
      .map((row) => row.map(csvEscape).join(","))
      .join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const filename = (currentSet.title || "flashcards")
      .replace(/[^a-z0-9-_]+/gi, "_")
      .replace(/^_+|_+$/g, "") || "flashcards";

    link.href = url;
    link.download = `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  // Initial page
  renderSavedSets();
  showSetupMode();
});