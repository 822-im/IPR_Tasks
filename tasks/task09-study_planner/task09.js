
document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const API_KEY = sessionStorage.getItem("AI_CLASSROOM_API_KEY");
  const SELECTED_TASK = sessionStorage.getItem("AI_CLASSROOM_SELECTED_TASK");
  const API_URL = "https://api.groq.com/openai/v1/chat/completions";
  const MODEL = "openai/gpt-oss-20b";
  const STORAGE_KEY = "AI_CLASSROOM_TASK09_PLANS";
  const THEME_KEY = "AI_CLASSROOM_THEME";

  if (!API_KEY || SELECTED_TASK !== "9") {
    window.location.href = "../../index.html";
    return;
  }

  const el = {
    backButton: $("backButton"),
    themeToggle: $("themeToggle"),
    pageHeading: $("pageHeading"),
    setupSection: $("setupSection"),
    welcomeSection: $("welcomeSection"),
    plannerSection: $("plannerSection"),
    form: $("plannerForm"),
    planTitle: $("planTitle"),
    subjects: $("subjects"),
    startDate: $("startDate"),
    examDate: $("examDate"),
    dailyHours: $("dailyHours"),
    difficulty: $("difficulty"),
    breakDuration: $("breakDuration"),
    studyStyle: $("studyStyle"),
    extraInstructions: $("extraInstructions"),
    errorMessage: $("errorMessage"),
    generateButton: $("generateButton"),
    generateIcon: $("generateIcon"),
    generateText: $("generateText"),
    savedPlans: $("savedPlans"),
    planCount: $("planCount"),
    newPlanButton: $("newPlanButton"),
    clearHistoryButton: $("clearHistoryButton"),
    resultTitle: $("resultTitle"),
    resultSubtitle: $("resultSubtitle"),
    totalSessions: $("totalSessions"),
    completedSessions: $("completedSessions"),
    totalHours: $("totalHours"),
    completionRate: $("completionRate"),
    overallProgressText: $("overallProgressText"),
    overallProgressBar: $("overallProgressBar"),
    scheduleList: $("scheduleList"),
    dayFilter: $("dayFilter"),
    savePlanButton: $("savePlanButton"),
    exportButton: $("exportButton"),
    backToSetup: $("backToSetup"),
    resetProgressButton: $("resetProgressButton"),
    regenerateButton: $("regenerateButton")
  };

  let savedPlans = loadPlans();
  let currentPlan = null;
  let currentPlanId = null;
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

  function showError(message) {
    el.errorMessage.textContent = message;
    el.errorMessage.hidden = false;
  }

  function clearError() {
    el.errorMessage.textContent = "";
    el.errorMessage.hidden = true;
  }

  function dateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseLocalDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }

  function formatDate(value, options = {}) {
    if (!value) return "Unscheduled";
    const date = parseLocalDate(value);
    if (Number.isNaN(date.getTime())) return "Unscheduled";
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...options
    });
  }

  function dayDifference(start, end) {
    const a = parseLocalDate(start);
    const b = parseLocalDate(end);
    return Math.round((b - a) / 86400000);
  }

  function loadPlans() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(data)) return [];

      return data
        .filter((plan) => plan && typeof plan.id === "string" &&
          Array.isArray(plan.sessions))
        .map((plan) => ({
          ...plan,
          sessions: plan.sessions
            .filter((session) => session &&
              typeof session.title === "string" &&
              typeof session.date === "string")
            .map((session) => ({
              ...session,
              completed: session.completed === true
            }))
        }));
    } catch {
      return [];
    }
  }

  function persistPlans() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedPlans));
      return true;
    } catch (error) {
      console.error("Could not save study plans:", error);
      showError("Unable to save the plan. Your browser storage may be full.");
      return false;
    }
  }

  function getCurrentPlan() {
    return currentPlan;
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

  // Return to dashboard
  el.backButton.addEventListener("click", () => {
    window.location.href = "../../index.html";
  });

  // View switching
  function showSetup() {
    el.pageHeading.hidden = false;
    el.setupSection.hidden = false;
    el.welcomeSection.hidden = false;
    el.plannerSection.hidden = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showPlanner() {
    el.pageHeading.hidden = true;
    el.setupSection.hidden = true;
    el.welcomeSection.hidden = true;
    el.plannerSection.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  el.backToSetup.addEventListener("click", () => {
    if (isGenerating) return;
    clearError();
    showSetup();
  });

  // Saved plans
  function renderSavedPlans() {
    el.savedPlans.innerHTML = "";
    el.planCount.textContent = String(savedPlans.length);

    if (!savedPlans.length) {
      const empty = document.createElement("p");
      empty.className = "empty-history";
      empty.textContent = "Your saved plans will appear here.";
      el.savedPlans.appendChild(empty);
      return;
    }

    const sorted = [...savedPlans].sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    );

    sorted.forEach((plan) => {
      const item = document.createElement("div");
      item.className = "saved-plan";
      if (plan.id === currentPlanId) item.classList.add("active");

      const open = document.createElement("button");
      open.type = "button";
      open.className = "saved-plan-open";

      const name = document.createElement("span");
      name.className = "saved-plan-name";
      name.textContent = plan.title || "Untitled plan";

      const meta = document.createElement("span");
      meta.className = "saved-plan-meta";
      const completed = plan.sessions.filter((s) => s.completed).length;
      meta.textContent = `${completed}/${plan.sessions.length} complete`;

      open.append(name, meta);
      open.addEventListener("click", () => openSavedPlan(plan.id));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-plan";
      remove.textContent = "×";
      remove.title = "Delete plan";
      remove.setAttribute("aria-label", `Delete ${plan.title || "plan"}`);
      remove.addEventListener("click", () => deleteSavedPlan(plan.id));

      item.append(open, remove);
      el.savedPlans.appendChild(item);
    });
  }

  function openSavedPlan(id) {
    if (isGenerating) return;
    const plan = savedPlans.find((item) => item.id === id);
    if (!plan) return;

    currentPlan = JSON.parse(JSON.stringify(plan));
    currentPlanId = plan.id;
    el.dayFilter.value = "all";
    clearError();
    showPlanner();
    renderPlan();
    renderSavedPlans();
  }

  function deleteSavedPlan(id) {
    if (isGenerating) return;
    const plan = savedPlans.find((item) => item.id === id);
    if (!plan) return;

    if (!window.confirm(`Delete "${plan.title || "this plan"}"?`)) return;

    savedPlans = savedPlans.filter((item) => item.id !== id);

    if (currentPlanId === id) {
      currentPlanId = null;
      currentPlan = null;
      showSetup();
    }

    persistPlans();
    renderSavedPlans();
  }

  el.newPlanButton.addEventListener("click", () => {
    if (isGenerating) return;
    currentPlan = null;
    currentPlanId = null;
    el.form.reset();
    setDefaultDates();
    el.dailyHours.value = "3";
    el.difficulty.value = "Intermediate";
    el.breakDuration.value = "10";
    el.studyStyle.value = "Balanced";
    el.dayFilter.value = "all";
    clearError();
    showSetup();
    renderSavedPlans();
  });

  el.clearHistoryButton.addEventListener("click", () => {
    if (isGenerating || !savedPlans.length) return;

    if (!window.confirm("Delete all saved study plans? This cannot be undone.")) {
      return;
    }

    savedPlans = [];
    currentPlanId = null;
    currentPlan = null;
    persistPlans();
    renderSavedPlans();
    showSetup();
  });

  // Default dates
  function setDefaultDates() {
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    el.startDate.value = dateString(today);
    el.examDate.value = dateString(tomorrow);
    el.startDate.min = dateString(today);
    el.examDate.min = dateString(today);
  }

  el.startDate.addEventListener("change", () => {
    el.examDate.min = el.startDate.value || dateString(new Date());
    if (el.examDate.value && el.examDate.value < el.examDate.min) {
      el.examDate.value = el.examDate.min;
    }
  });

  setDefaultDates();

  // Quick templates
  document.querySelectorAll("[data-template]").forEach((button) => {
    button.addEventListener("click", () => {
      if (isGenerating) return;

      const template = button.dataset.template;
      if (template === "semester") {
        el.planTitle.value = "Semester examination preparation";
        el.subjects.value =
          "Data Structures: Arrays, Linked Lists, Trees, Graphs, Dynamic Programming\n" +
          "DBMS: SQL, Normalization, Transactions\n" +
          "Operating Systems: Processes, Scheduling, Memory Management";
        el.dailyHours.value = "4";
        el.studyStyle.value = "Balanced";
      } else if (template === "interview") {
        el.planTitle.value = "Placement preparation";
        el.subjects.value =
          "DSA: Arrays, Strings, Linked Lists, Trees, Graphs, Dynamic Programming\n" +
          "DBMS: SQL, Keys, Normalization, Transactions\n" +
          "Operating Systems: Processes, Threads, Scheduling\n" +
          "Computer Networks: OSI, TCP/IP, HTTP";
        el.dailyHours.value = "3";
        el.studyStyle.value = "Practice-focused";
      } else if (template === "revision") {
        el.planTitle.value = "Quick revision";
        el.subjects.value =
          "Subject 1: Important definitions and key concepts\n" +
          "Subject 2: Important topics and formulas\n" +
          "Subject 3: Previous questions and practice";
        el.dailyHours.value = "3";
        el.studyStyle.value = "Revision-focused";
      }

      el.planTitle.focus();
    });
  });

  // AI response parsing
  function extractJSON(text) {
    const cleaned = text
      .replace(/```(?:json)?/gi, "")
      .trim();

    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start < 0 || end <= start) {
      throw new Error("The AI returned an invalid plan. Please try again.");
    }

    return JSON.parse(cleaned.slice(start, end + 1));
  }

  function normalizeSessions(data, startDate, endDate, dailyHours) {
    if (!data || !Array.isArray(data.sessions)) {
      throw new Error("The AI did not return a valid schedule.");
    }

    const sessions = data.sessions.map((session) => {
      const date = String(session.date || "").trim();
      const title = String(session.title || session.topic || "").trim();
      const subject = String(session.subject || "General study").trim();
      const description = String(session.description || "").trim();
      const duration = Number(session.durationMinutes ?? session.duration ?? 60);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      const parsed = parseLocalDate(date);

      if (Number.isNaN(parsed.getTime()) ||
          date < startDate || date > endDate) return null;

      if (!title || !Number.isFinite(duration) ||
          duration <= 0 || duration > 240) return null;

      return {
        id: createId(),
        date,
        subject: subject.slice(0, 120),
        title: title.slice(0, 200),
        description: description.slice(0, 500),
        durationMinutes: duration,
        completed: false
      };
    }).filter(Boolean);

    if (!sessions.length) {
      throw new Error("No valid study sessions were generated. Please try again.");
    }

    // Limit total planned study time per day to the user's availability.
    const byDate = new Map();
    sessions.forEach((session) => {
      if (!byDate.has(session.date)) byDate.set(session.date, []);
      byDate.get(session.date).push(session);
    });

    const maxMinutes = dailyHours * 60;
    const valid = [];

    for (const [date, daySessions] of byDate) {
      let used = 0;
      for (const session of daySessions) {
        if (used + session.durationMinutes <= maxMinutes) {
          valid.push(session);
          used += session.durationMinutes;
        }
      }
    }

    if (!valid.length) {
      throw new Error("The returned sessions exceeded the daily time limit. Please try again.");
    }

    return valid.sort((a, b) =>
      a.date.localeCompare(b.date) ||
      a.subject.localeCompare(b.subject)
    );
  }

  async function generateSchedule(settings) {
    const { title, subjects, startDate, endDate, dailyHours,
      difficulty, breakDuration, studyStyle, instructions } = settings;

    const dayCount = dayDifference(startDate, endDate) + 1;
    const prompt = `
Create a practical study schedule in JSON format.

Plan name: ${title}
Subjects and topics:
${subjects}

Start date: ${startDate}
Deadline: ${endDate}
Number of calendar days: ${dayCount}
Maximum available study time each day: ${dailyHours} hours
Preparation level: ${difficulty}
Break between study sessions: ${breakDuration} minutes
Study style: ${studyStyle}
Additional preferences: ${instructions || "None"}

Rules:
- Create a realistic daily study plan within the supplied date range.
- Use only the subjects and topics provided by the user.
- Spread topics across days, avoiding unnecessary repetition.
- Allocate more time to difficult or important topics when suitable.
- Include practice, revision or self-testing sessions when appropriate.
- Keep total study time per day at or below ${dailyHours * 60} minutes.
- Each session must have a duration of 15 to 240 minutes.
- Use the exact date format YYYY-MM-DD.
- Do not schedule sessions outside the given date range.
- Include multiple sessions per day when appropriate.
- Respect the selected study style and additional preferences.
- Do not include break time in session duration.
- Use concise, actionable titles and descriptions.
- Return JSON only, without Markdown fences or additional explanation.

Required structure:
{
  "sessions": [
    {
      "date": "${startDate}",
      "subject": "Subject name",
      "title": "Specific topic or activity",
      "description": "What to study or practice",
      "durationMinutes": 60
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
            content: "You are a study-planning assistant. Return only valid JSON matching the requested schema. Make realistic, organized schedules."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.4,
        max_completion_tokens: 4096
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error?.message || `AI request failed (${response.status}).`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("The AI returned an empty schedule. Please try again.");
    }

    const parsed = extractJSON(content);
    return normalizeSessions(parsed, startDate, endDate, dailyHours);
  }

  function setGenerating(loading) {
    isGenerating = loading;
    el.generateButton.disabled = loading;
    el.generateIcon.textContent = loading ? "…" : "✦";
    el.generateText.textContent = loading
      ? "Creating your study plan..."
      : "Generate study plan";
  }

  el.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isGenerating) return;
    clearError();

    const title = el.planTitle.value.trim();
    const subjects = el.subjects.value.trim();
    const startDate = el.startDate.value;
    const endDate = el.examDate.value;
    const dailyHours = Number(el.dailyHours.value);
    const difficulty = el.difficulty.value;
    const breakDuration = Number(el.breakDuration.value);
    const studyStyle = el.studyStyle.value;
    const instructions = el.extraInstructions.value.trim();

    if (!title || !subjects || !startDate || !endDate) {
      showError("Please complete the required fields.");
      return;
    }

    if (endDate < startDate) {
      showError("The deadline cannot be earlier than the start date.");
      return;
    }

    if (dayDifference(startDate, endDate) > 90) {
      showError("Please choose a planning period of 90 days or less.");
      return;
    }

    if (!Number.isFinite(dailyHours) || dailyHours < 1) {
      showError("Please select valid daily study hours.");
      return;
    }

    setGenerating(true);

    try {
      const sessions = await generateSchedule({
        title, subjects, startDate, endDate, dailyHours,
        difficulty, breakDuration, studyStyle, instructions
      });

      currentPlan = {
        id: createId(),
        title,
        startDate,
        endDate,
        dailyHours,
        difficulty,
        studyStyle,
        sessions,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      currentPlanId = null;
      el.dayFilter.value = "all";
      showPlanner();
      renderPlan();
      renderSavedPlans();
    } catch (error) {
      console.error("Study plan generation failed:", error);
      showError(error.message || "Unable to generate your plan. Please try again.");
    } finally {
      setGenerating(false);
    }
  });

  // Schedule statistics
  function getStats(plan) {
    const sessions = plan.sessions;
    const completed = sessions.filter((session) => session.completed).length;
    const minutes = sessions.reduce(
      (sum, session) => sum + Number(session.durationMinutes || 0), 0
    );

    return {
      total: sessions.length,
      completed,
      hours: (minutes / 60).toFixed(1).replace(/\.0$/, ""),
      rate: sessions.length ? Math.round(completed / sessions.length * 100) : 0
    };
  }

  function renderPlan() {
    const plan = getCurrentPlan();
    if (!plan) return;

    const stats = getStats(plan);

    el.resultTitle.textContent = plan.title;
    el.resultSubtitle.textContent =
      `${formatDate(plan.startDate)} – ${formatDate(plan.endDate)} · ${plan.dailyHours} hours/day`;

    el.totalSessions.textContent = String(stats.total);
    el.completedSessions.textContent = String(stats.completed);
    el.totalHours.textContent = String(stats.hours);
    el.completionRate.textContent = `${stats.rate}%`;
    el.overallProgressText.textContent = `${stats.rate}%`;
    el.overallProgressBar.style.width = `${stats.rate}%`;

    el.savePlanButton.textContent = currentPlanId ? "✓ Saved" : "♡ Save plan";

    renderSchedule();
  }

  // Schedule rendering and completion tracking
  function renderSchedule() {
    const plan = getCurrentPlan();
    el.scheduleList.innerHTML = "";
    if (!plan) return;

    const filter = el.dayFilter.value;
    const sessions = [...plan.sessions].sort((a, b) =>
      a.date.localeCompare(b.date) ||
      a.subject.localeCompare(b.subject)
    );

    const filtered = sessions.filter((session) => {
      if (filter === "completed") return session.completed;
      if (filter === "pending") return !session.completed;
      return true;
    });

    const groups = new Map();
    filtered.forEach((session) => {
      if (!groups.has(session.date)) groups.set(session.date, []);
      groups.get(session.date).push(session);
    });

    if (!groups.size) {
      const empty = document.createElement("div");
      empty.className = "empty-schedule";
      empty.textContent = filter === "all"
        ? "No study sessions in this plan."
        : `No ${filter} sessions to show.`;
      el.scheduleList.appendChild(empty);
      return;
    }

    for (const [date, daySessions] of groups) {
      const day = document.createElement("section");
      day.className = "schedule-day";

      const heading = document.createElement("div");
      heading.className = "day-heading";

      const dateTitle = document.createElement("strong");
      dateTitle.textContent = formatDate(date);

      const dayMinutes = daySessions.reduce(
        (sum, session) => sum + session.durationMinutes, 0
      );
      const duration = document.createElement("span");
      const dayHours = (dayMinutes / 60).toFixed(1).replace(/\.0$/, "");
      duration.textContent = `${daySessions.length} sessions · ${dayHours} hrs`;

      heading.append(dateTitle, duration);

      const list = document.createElement("div");
      list.className = "session-list";

      daySessions.forEach((session) => {
        const row = document.createElement("div");
        row.className = "session";
        if (session.completed) row.classList.add("completed");

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "session-check";
        checkbox.checked = session.completed;
        checkbox.setAttribute("aria-label", `Mark ${session.title} as completed`);

        checkbox.addEventListener("change", () => {
          session.completed = checkbox.checked;
          plan.updatedAt = Date.now();

          if (currentPlanId) {
            const saved = savedPlans.find((p) => p.id === currentPlanId);
            if (saved) {
              saved.sessions = JSON.parse(JSON.stringify(plan.sessions));
              saved.updatedAt = plan.updatedAt;
              persistPlans();
            }
          }

          renderPlan();
          renderSavedPlans();
        });

        const content = document.createElement("div");
        content.className = "session-content";

        const title = document.createElement("span");
        title.className = "session-title";
        title.textContent = session.title;

        const meta = document.createElement("div");
        meta.className = "session-meta";

        const subject = document.createElement("span");
        subject.className = "session-subject";
        subject.textContent = session.subject;

        const minutes = document.createElement("span");
        minutes.textContent = `${session.durationMinutes} min`;

        meta.append(subject, minutes);
        content.append(title, meta);

        if (session.description) {
          const description = document.createElement("div");
          description.className = "session-description";
          description.textContent = session.description;
          content.appendChild(description);
        }

        row.append(checkbox, content);
        list.appendChild(row);
      });

      day.append(heading, list);
      el.scheduleList.appendChild(day);
    }
  }

  el.dayFilter.addEventListener("change", renderSchedule);

  // Save or update current plan
  el.savePlanButton.addEventListener("click", () => {
    if (!currentPlan) return;

    if (currentPlanId) {
      const saved = savedPlans.find((plan) => plan.id === currentPlanId);
      if (saved) {
        saved.sessions = JSON.parse(JSON.stringify(currentPlan.sessions));
        saved.updatedAt = Date.now();
        if (persistPlans()) {
          renderPlan();
          renderSavedPlans();
        }
        return;
      }
    }

    const copy = JSON.parse(JSON.stringify(currentPlan));
    copy.id = createId();
    copy.createdAt = Date.now();
    copy.updatedAt = Date.now();

    savedPlans.unshift(copy);
    if (persistPlans()) {
      currentPlanId = copy.id;
      currentPlan.id = copy.id;
      renderPlan();
      renderSavedPlans();
    } else {
      savedPlans = savedPlans.filter((plan) => plan.id !== copy.id);
    }
  });

  // Reset progress
  el.resetProgressButton.addEventListener("click", () => {
    if (!currentPlan) return;

    if (!window.confirm("Mark every study session as incomplete?")) return;

    currentPlan.sessions.forEach((session) => {
      session.completed = false;
    });

    currentPlan.updatedAt = Date.now();

    if (currentPlanId) {
      const saved = savedPlans.find((plan) => plan.id === currentPlanId);
      if (saved) {
        saved.sessions = JSON.parse(JSON.stringify(currentPlan.sessions));
        saved.updatedAt = currentPlan.updatedAt;
        persistPlans();
      }
    }

    renderPlan();
    renderSavedPlans();
  });

  // Export CSV
  function csvEscape(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  el.exportButton.addEventListener("click", () => {
    if (!currentPlan || !currentPlan.sessions.length) return;

    const rows = [
      ["Date", "Subject", "Session", "Description", "Duration (minutes)", "Completed"],
      ...currentPlan.sessions.map((session) => [
        session.date,
        session.subject,
        session.title,
        session.description,
        session.durationMinutes,
        session.completed ? "Yes" : "No"
      ])
    ];

    const csv = "\uFEFF" + rows
      .map((row) => row.map(csvEscape).join(","))
      .join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const filename = (currentPlan.title || "study_plan")
      .replace(/[^a-z0-9-_]+/gi, "_")
      .replace(/^_+|_+$/g, "") || "study_plan";

    link.href = url;
    link.download = `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  // Start another plan
  el.regenerateButton.addEventListener("click", () => {
    if (isGenerating) return;
    currentPlan = null;
    currentPlanId = null;
    el.form.reset();
    setDefaultDates();
    el.dailyHours.value = "3";
    el.difficulty.value = "Intermediate";
    el.breakDuration.value = "10";
    el.studyStyle.value = "Balanced";
    el.dayFilter.value = "all";
    clearError();
    showSetup();
    renderSavedPlans();
  });

  // Initial state
  renderSavedPlans();
  showSetup();
});