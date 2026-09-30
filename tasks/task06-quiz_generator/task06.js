
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const $ = id => document.getElementById(id);

    const apiKey = sessionStorage.getItem("AI_CLASSROOM_API_KEY");
    const selectedTask = sessionStorage.getItem("AI_CLASSROOM_SELECTED_TASK");

    if (!apiKey || selectedTask !== "6") {
        window.location.replace("../../index.html");
        return;
    }

    let questions = [];
    let submitted = false;
    let lastResults = null;

    // Theme
    function applyTheme(theme) {
        const dark = theme === "dark";
        document.body.classList.toggle("dark", dark);
        $("themeToggle").textContent = dark ? "☀" : "☾";
        $("themeToggle").setAttribute(
            "aria-label",
            dark ? "Switch to light mode" : "Switch to dark mode"
        );
    }

    applyTheme(sessionStorage.getItem("AI_CLASSROOM_THEME") || "light");

    $("themeToggle").addEventListener("click", () => {
        const next = document.body.classList.contains("dark")
            ? "light"
            : "dark";

        sessionStorage.setItem("AI_CLASSROOM_THEME", next);
        applyTheme(next);
    });

    // Form helpers
    function showError(message = "") {
        $("errorMessage").textContent = message;
    }

    function setLoading(loading) {
        $("generateButton").disabled = loading;
        $("buttonText").textContent = loading
            ? "Generating quiz..."
            : "Generate quiz";
    }

    function getQuestionCount() {
        return Number($("questionCount").value);
    }

    // Example topics
    document.querySelectorAll(".example-button").forEach(button => {
        button.addEventListener("click", () => {
            $("topic").value = button.dataset.topic || "";
            $("topic").focus();
        });
    });

    // Parse JSON returned by the model.
    function parseJSON(text) {
        const cleaned = String(text)
            .trim()
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, "");

        try {
            return JSON.parse(cleaned);
        } catch {
            const start = cleaned.indexOf("{");
            const end = cleaned.lastIndexOf("}");

            if (start !== -1 && end > start) {
                return JSON.parse(cleaned.slice(start, end + 1));
            }

            throw new Error(
                "The AI returned invalid quiz data. Please try again."
            );
        }
    }

    function normalizeType(type) {
        const value = String(type || "")
            .toLowerCase()
            .replace(/[\s-]/g, "_");

        if (["true_false", "truefalse", "boolean"].includes(value)) {
            return "true_false";
        }

        if (["short_answer", "shortanswer", "open_ended"].includes(value)) {
            return "short_answer";
        }

        return "mcq";
    }

    function normalizeQuestions(data) {
        const rawQuestions = Array.isArray(data)
            ? data
            : data.questions;

        if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
            throw new Error("No questions were returned. Please try again.");
        }

        return rawQuestions.map((item, index) => {
            if (!item || typeof item !== "object") {
                throw new Error(`Question ${index + 1} is invalid.`);
            }

            const type = normalizeType(item.type);
            const question = String(item.question || "").trim();
            const explanation = String(item.explanation || "").trim();

            if (!question) {
                throw new Error(
                    `Question ${index + 1} is missing its text.`
                );
            }

            if (type === "mcq") {
                const options = Array.isArray(item.options)
                    ? item.options.map(option => String(option).trim())
                    : [];

                if (options.length < 2) {
                    throw new Error(
                        `Question ${index + 1} needs at least two options.`
                    );
                }

                const answer = item.correctAnswer ?? item.answer;
                let correctIndex = -1;

                if (typeof answer === "number") {
                    correctIndex = answer;
                } else if (typeof answer === "string") {
                    const trimmed = answer.trim();
                    const letter = trimmed.match(/^([A-D])(?:[.)])?$/i);

                    if (letter) {
                        correctIndex =
                            letter[1].toUpperCase().charCodeAt(0) - 65;
                    } else {
                        correctIndex = options.findIndex(
                            option =>
                                option.toLowerCase() === trimmed.toLowerCase()
                        );
                    }
                }

                if (
                    !Number.isInteger(correctIndex) ||
                    correctIndex < 0 ||
                    correctIndex >= options.length
                ) {
                    throw new Error(
                        `Question ${index + 1} has an invalid correct answer.`
                    );
                }

                return {
                    type,
                    question,
                    options,
                    correctIndex,
                    correctAnswer: options[correctIndex],
                    explanation
                };
            }

            if (type === "true_false") {
                const answer = String(
                    item.correctAnswer ?? item.answer ?? ""
                ).toLowerCase().trim();

                if (!["true", "false"].includes(answer)) {
                    throw new Error(
                        `Question ${index + 1} must have a True or False answer.`
                    );
                }

                return {
                    type,
                    question,
                    options: ["True", "False"],
                    correctIndex: answer === "true" ? 0 : 1,
                    correctAnswer: answer === "true" ? "True" : "False",
                    explanation
                };
            }

            const correctAnswer = String(
                item.correctAnswer ?? item.answer ?? ""
            ).trim();

            if (!correctAnswer) {
                throw new Error(
                    `Question ${index + 1} is missing its suggested answer.`
                );
            }

            return {
                type,
                question,
                correctAnswer,
                explanation
            };
        });
    }

    // Build the AI prompt
    function buildPrompt() {
        const topic = $("topic").value.trim();
        const material = $("sourceText").value.trim();
        const difficulty = $("difficulty").value;
        const count = getQuestionCount();
        const type = $("questionType").value;
        const instructions = $("additionalInstructions").value.trim();

        const typeInstructions = {
            mcq: "Create only multiple-choice questions. Each question must have four distinct options and exactly one correct answer.",
            true_false: "Create only true/false questions. Each question must have a correct answer of either True or False.",
            short_answer: "Create only short-answer questions. Provide a concise suggested answer for each question.",
            mixed: "Create a balanced mix of multiple-choice, true/false and short-answer questions. Include at least one of each type. Multiple-choice questions must have four options and exactly one correct answer."
        };

        return `
Create a quiz based on the following details.

Topic: ${topic}
Difficulty: ${difficulty}
Number of questions: ${count}
Question type: ${type}

${typeInstructions[type]}

${material
    ? `Study material (use this as the primary source):
${material}`
    : "Use your general subject knowledge to create accurate questions."}

${instructions
    ? `Additional instructions:
${instructions}`
    : ""}

Return ONLY a valid JSON object in this exact structure:

{
  "questions": [
    {
      "type": "mcq",
      "question": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Brief explanation of the answer."
    },
    {
      "type": "true_false",
      "question": "Statement to evaluate",
      "correctAnswer": "True",
      "explanation": "Brief explanation."
    },
    {
      "type": "short_answer",
      "question": "Question text",
      "correctAnswer": "Suggested answer",
      "explanation": "Brief explanation."
    }
  ]
}

For multiple-choice questions, correctAnswer must be the zero-based
index of the correct option. For true/false questions, use the string
"True" or "False". For short-answer questions, use a concise answer.

Include exactly ${count} questions. Do not include Markdown fences,
text outside the JSON, or additional properties.
`;
    }

    // Groq API
    async function generateQuiz() {
        const response = await fetch(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "openai/gpt-oss-20b",
                    messages: [
                        {
                            role: "system",
                            content:
                                "You are an expert quiz creator. Return valid JSON only. Create accurate, unambiguous educational questions."
                        },
                        {
                            role: "user",
                            content: buildPrompt()
                        }
                    ],
                    reasoning_effort: "low",
                    include_reasoning: false,
                    max_completion_tokens: 4096,
                    temperature: 0.3,
                    stream: false
                })
            }
        );

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error("Unable to read the AI response.");
        }

        if (!response.ok) {
            throw new Error(
                data.error?.message ||
                `Groq API request failed (${response.status}).`
            );
        }

        const choice = data.choices?.[0];
        const content = choice?.message?.content;

        if (typeof content !== "string" || !content.trim()) {
            if (choice?.finish_reason === "length") {
                throw new Error(
                    "The response reached its token limit. Try fewer questions."
                );
            }

            throw new Error("The AI returned an empty response.");
        }

        return normalizeQuestions(parseJSON(content));
    }

    // Render questions using safe DOM methods.
    function renderQuestions() {
        const container = $("questionsContainer");
        container.replaceChildren();

        questions.forEach((question, index) => {
            const card = document.createElement("article");
            card.className = "question-card";
            card.dataset.index = String(index);

            const top = document.createElement("div");
            top.className = "question-top";

            const number = document.createElement("span");
            number.className = "question-number";
            number.textContent = `QUESTION ${index + 1}`;

            const badge = document.createElement("span");
            badge.className = "type-badge";
            badge.textContent = {
                mcq: "Multiple choice",
                true_false: "True / False",
                short_answer: "Short answer"
            }[question.type];

            top.append(number, badge);

            const title = document.createElement("p");
            title.className = "question-text";
            title.textContent = question.question;

            card.append(top, title);

            if (question.type === "short_answer") {
                const answer = document.createElement("textarea");
                answer.className = "answer-input";
                answer.dataset.question = String(index);
                answer.rows = 3;
                answer.placeholder = "Type your answer here...";
                answer.setAttribute(
                    "aria-label",
                    `Answer to question ${index + 1}`
                );
                answer.disabled = submitted;
                card.appendChild(answer);
            } else {
                const list = document.createElement("div");
                list.className = "options-list";

                question.options.forEach((option, optionIndex) => {
                    const label = document.createElement("label");
                    label.className = "option-label";

                    const input = document.createElement("input");
                    input.type = "radio";
                    input.name = `question-${index}`;
                    input.value = String(optionIndex);
                    input.dataset.question = String(index);
                    input.disabled = submitted;

                    const text = document.createElement("span");
                    text.textContent = option;

                    label.append(input, text);
                    list.appendChild(label);
                });

                card.appendChild(list);
            }

            container.appendChild(card);
        });

        updateProgress();
    }

    // Get the user's answers.
    function getAnswers() {
        return questions.map((question, index) => {
            if (question.type === "short_answer") {
                return $("questionsContainer")
                    .querySelector(
                        `textarea[data-question="${index}"]`
                    )?.value.trim() || "";
            }

            const selected = document.querySelector(
                `input[name="question-${index}"]:checked`
            );

            return selected ? Number(selected.value) : null;
        });
    }

    // Update progress
    function updateProgress() {
        const answers = getAnswers();
        const answered = answers.filter(answer =>
            answer !== null && answer !== ""
        ).length;

        $("questionCounter").textContent =
            `${answered} / ${questions.length} answered`;

        const percentage = questions.length
            ? (answered / questions.length) * 100
            : 0;

        $("progressBar").style.width = `${percentage}%`;
        $("resetAnswers").disabled = answered === 0 || submitted;
    }

    $("questionsContainer").addEventListener("change", updateProgress);
    $("questionsContainer").addEventListener("input", updateProgress);

    // Clear answers
    $("resetAnswers").addEventListener("click", () => {
        if (submitted) return;

        $("questionsContainer")
            .querySelectorAll('input[type="radio"]')
            .forEach(input => {
                input.checked = false;
            });

        $("questionsContainer")
            .querySelectorAll("textarea")
            .forEach(textarea => {
                textarea.value = "";
            });

        updateProgress();
    });

    // Calculate results.
    // Short answers require self-review.
    function calculateResults() {
        const answers = getAnswers();

        let correct = 0;
        let incorrect = 0;
        let unanswered = 0;
        let selfReview = 0;
        let objectiveTotal = 0;

        const details = questions.map((question, index) => {
            const answer = answers[index];

            if (question.type === "short_answer") {
                selfReview++;

                return {
                    question,
                    answer,
                    status: answer ? "self-review" : "unanswered"
                };
            }

            objectiveTotal++;

            if (answer === null) {
                unanswered++;
                return {
                    question,
                    answer,
                    status: "unanswered"
                };
            }

            if (answer === question.correctIndex) {
                correct++;
                return {
                    question,
                    answer,
                    status: "correct"
                };
            }

            incorrect++;
            return {
                question,
                answer,
                status: "incorrect"
            };
        });

        const percentage = objectiveTotal
            ? Math.round((correct / objectiveTotal) * 100)
            : null;

        return {
            details,
            correct,
            incorrect,
            unanswered,
            selfReview,
            objectiveTotal,
            percentage
        };
    }

    // Render answer review
    function renderReview(results) {
        const container = $("reviewContainer");
        container.replaceChildren();

        results.details.forEach((detail, index) => {
            const { question, answer, status } = detail;

            const item = document.createElement("article");
            item.className = "review-item";

            if (status === "correct") {
                item.classList.add("correct");
            } else if (status === "incorrect") {
                item.classList.add("incorrect");
            } else {
                item.classList.add("unanswered");
            }

            const statusLabel = document.createElement("span");
            statusLabel.className = "review-status";

            const statusText = {
                correct: "Correct",
                incorrect: "Incorrect",
                unanswered: "Unanswered",
                "self-review": answer
                    ? "Self-review"
                    : "Not attempted"
            }[status];

            statusLabel.textContent = statusText;

            const title = document.createElement("p");
            title.className = "review-question";
            title.textContent = `${index + 1}. ${question.question}`;

            const answerLine = document.createElement("p");
            answerLine.className = "review-line";

            const userAnswer = document.createElement("strong");
            userAnswer.textContent = "Your answer: ";

            let answerText = "Not answered";

            if (question.type === "short_answer") {
                answerText = answer || "Not answered";
            } else if (answer !== null) {
                answerText = question.options[answer];
            }

            answerLine.append(
                userAnswer,
                document.createTextNode(answerText)
            );

            const correctLine = document.createElement("p");
            correctLine.className = "review-line";

            const correctLabel = document.createElement("strong");
            correctLabel.textContent =
                question.type === "short_answer"
                    ? "Suggested answer: "
                    : "Correct answer: ";

            correctLine.append(
                correctLabel,
                document.createTextNode(question.correctAnswer)
            );

            item.append(statusLabel, title, answerLine, correctLine);

            if (question.explanation) {
                const explanation = document.createElement("div");
                explanation.className = "explanation";

                const label = document.createElement("strong");
                label.textContent = "Explanation: ";

                explanation.append(
                    label,
                    document.createTextNode(question.explanation)
                );

                item.appendChild(explanation);
            }

            container.appendChild(item);
        });
    }

    // Show the result screen
    function showResults() {
        const results = calculateResults();
        lastResults = results;

        $("correctCount").textContent = String(results.correct);
        $("incorrectCount").textContent = String(results.incorrect);
        $("unansweredCount").textContent = String(
            results.unanswered + results.selfReview
        );

        if (results.percentage === null) {
            $("scoreValue").textContent = "—";
            $("scoreMessage").textContent =
                "Review your short answers using the suggested answers below.";
        } else {
            $("scoreValue").textContent = `${results.percentage}%`;
            $("scoreMessage").textContent =
                `${results.correct} correct out of ${results.objectiveTotal} automatically graded questions.`;
        }

        renderReview(results);

        $("resultSection").hidden = false;
        $("submitQuiz").disabled = true;
        $("resetAnswers").disabled = true;

        $("questionsContainer")
            .querySelectorAll("input, textarea")
            .forEach(input => {
                input.disabled = true;
            });

        $("resultSection").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    // Submit quiz
    $("submitQuiz").addEventListener("click", () => {
        if (submitted) return;

        const answers = getAnswers();
        const answered = answers.filter(answer =>
            answer !== null && answer !== ""
        ).length;

        if (answered === 0) {
            showError(
                "Please answer at least one question before submitting."
            );
            return;
        }

        showError();
        submitted = true;
        showResults();
    });

    // Download results
    $("downloadResults").addEventListener("click", () => {
        if (!lastResults) return;

        const lines = [
            "AI Classroom - Quiz Results",
            `Topic: ${$("topic").value.trim()}`,
            `Difficulty: ${$("difficulty").value}`,
            `Score: ${lastResults.percentage === null
                ? "Self-review required"
                : `${lastResults.percentage}%`}`,
            `Correct: ${lastResults.correct}`,
            `Incorrect: ${lastResults.incorrect}`,
            `Unanswered / self-review: ${
                lastResults.unanswered + lastResults.selfReview
            }`,
            "",
            "ANSWER REVIEW",
            ""
        ];

        lastResults.details.forEach((detail, index) => {
            const question = detail.question;

            let answer = "Not answered";

            if (question.type === "short_answer") {
                answer = detail.answer || "Not answered";
            } else if (detail.answer !== null) {
                answer = question.options[detail.answer];
            }

            lines.push(
                `${index + 1}. ${question.question}`,
                `Your answer: ${answer}`,
                `Correct / suggested answer: ${question.correctAnswer}`,
                `Status: ${detail.status}`,
                `Explanation: ${question.explanation || "Not provided"}`,
                ""
            );
        });

        const blob = new Blob([lines.join("\n")], {
            type: "text/plain;charset=utf-8"
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = "quiz_results.txt";

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);
    });

    // Retake the same quiz
    $("retakeQuiz").addEventListener("click", () => {
        submitted = false;
        lastResults = null;

        $("resultSection").hidden = true;

        $("questionsContainer")
            .querySelectorAll('input[type="radio"]')
            .forEach(input => {
                input.checked = false;
                input.disabled = false;
            });

        $("questionsContainer")
            .querySelectorAll("textarea")
            .forEach(textarea => {
                textarea.value = "";
                textarea.disabled = false;
            });

        $("submitQuiz").disabled = false;
        $("resetAnswers").disabled = true;
        $("progressBar").style.width = "0%";

        updateProgress();

        $("quizSection").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    });

    // Generate a new quiz and switch to the quiz screen.
    $("quizForm").addEventListener("submit", async event => {
        event.preventDefault();
        showError();

        const topic = $("topic").value.trim();
        const material = $("sourceText").value.trim();

        if (!topic) {
            showError("Please enter a topic for your quiz.");
            $("topic").focus();
            return;
        }

        if (material.length > 12000) {
            showError(
                "Please shorten your study material to 12,000 characters or fewer."
            );
            return;
        }

        setLoading(true);

        // Hide any previously displayed quiz or results while generating.
        $("quizSection").hidden = true;
        $("resultSection").hidden = true;
        $("welcomeSection").hidden = true;

        try {
            questions = await generateQuiz();

            if (questions.length !== getQuestionCount()) {
                throw new Error(
                    `The AI returned ${questions.length} questions instead of ${getQuestionCount()}. Please generate again.`
                );
            }

            submitted = false;
            lastResults = null;

            $("quizTitle").textContent = topic;
            $("quizMeta").textContent =
                `${$("difficulty").value} · ${questions.length} questions`;

            $("submitQuiz").disabled = false;
            $("resetAnswers").disabled = true;

            renderQuestions();

            // Switch from settings to the quiz screen.
            $("pageHeading").hidden = true;
            $("setupSection").hidden = true;
            $("welcomeSection").hidden = true;
            $("resultSection").hidden = true;
            $("quizSection").hidden = false;

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        } catch (error) {
            // Keep the settings visible if quiz generation fails.
            $("pageHeading").hidden = false;
            $("setupSection").hidden = false;
            $("quizSection").hidden = true;
            $("welcomeSection").hidden = false;

            showError(
                error.message || "Unable to generate the quiz."
            );
        } finally {
            setLoading(false);
        }
    });
});