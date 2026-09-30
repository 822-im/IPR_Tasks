
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("launchForm");
    const apiKeyInput = document.getElementById("apiKey");
    const taskSelect = document.getElementById("taskSelect");
    const errorMessage = document.getElementById("errorMessage");
    const themeToggle = document.getElementById("themeToggle");
    const toggleKey = document.getElementById("toggleKey");

    const tasks = {
        "1": "tasks/task01-resume_builder/task01.html",
        "2": "tasks/task02-notes_generator/task02.html",
        "3": "tasks/task03-presentation_generator/task03.html",
        "4": "tasks/task04-mind_map/task04.html",
        "5": "tasks/task05-google_sheets/task05.html",
        "6": "tasks/task06-quiz_generator/task06.html",
        "7": "tasks/task07-doubt_chatbot/task07.html",
        "8": "tasks/task08-flashcard_generator/task08.html",
        "9": "tasks/task09-study_planner/task09.html",
        "10": "tasks/task10-photo_summarizer/task10.html"
    };

    // Apply the selected theme
    function applyTheme(theme) {
        const dark = theme === "dark";

        document.body.classList.toggle("dark", dark);
        themeToggle.textContent = dark ? "☀" : "☾";

        themeToggle.setAttribute(
            "aria-label",
            dark ? "Switch to light mode" : "Switch to dark mode"
        );
    }

    applyTheme(
        sessionStorage.getItem("AI_CLASSROOM_THEME") || "light"
    );

    // Toggle between light and dark mode
    themeToggle.addEventListener("click", () => {
        const next = document.body.classList.contains("dark")
            ? "light"
            : "dark";

        sessionStorage.setItem("AI_CLASSROOM_THEME", next);
        applyTheme(next);
    });

    // Show or hide the API key
    toggleKey.addEventListener("click", () => {
        const show = apiKeyInput.type === "password";

        apiKeyInput.type = show ? "text" : "password";
        toggleKey.textContent = show ? "Hide" : "Show";

        toggleKey.setAttribute(
            "aria-label",
            show ? "Hide API key" : "Show API key"
        );
    });

    // Always show the placeholder by default
    taskSelect.value = "";

    // Clear errors when the user changes the task
    taskSelect.addEventListener("change", () => {
        errorMessage.textContent = "";
    });

    // Clear errors when the user enters an API key
    apiKeyInput.addEventListener("input", () => {
        errorMessage.textContent = "";
    });

    // Handle form submission
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        errorMessage.textContent = "";

        const apiKey = apiKeyInput.value.trim();
        const selectedTask = taskSelect.value;

        // Validate API key
        if (!apiKey) {
            errorMessage.textContent =
                "Please enter your OpenAI API key.";
            apiKeyInput.focus();
            return;
        }

        // Validate task selection
        if (!selectedTask || !tasks[selectedTask]) {
            errorMessage.textContent =
                "Please select a valid task.";
            taskSelect.focus();
            return;
        }

        // Save session data
        try {
            sessionStorage.setItem(
                "AI_CLASSROOM_API_KEY",
                apiKey
            );

            sessionStorage.setItem(
                "AI_CLASSROOM_SELECTED_TASK",
                selectedTask
            );
        } catch (error) {
            errorMessage.textContent =
                "Unable to save your session. Check your browser settings.";
            return;
        }

        // Navigate to the selected task
        const root = new URL("./", window.location.href);
        const destination = new URL(tasks[selectedTask], root);

        window.location.assign(destination.href);
    });
});