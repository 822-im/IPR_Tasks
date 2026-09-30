
"use strict";

/* =========================================
   GOOGLE SHEETS AI ASSISTANT - TASK 05
========================================= */

const $ = (id) => document.getElementById(id);

const form = $("spreadsheetForm");
const fileInput = $("spreadsheetFile");
const uploadArea = $("uploadArea");
const fileInfo = $("fileInfo");
const fileName = $("fileName");
const fileMeta = $("fileMeta");
const removeFile = $("removeFile");
const sheetSelect = $("sheetSelect");
const actionSelect = $("actionSelect");
const userPrompt = $("userPrompt");
const wordCount = $("wordCount");
const generateButton = $("generateButton");
const buttonText = $("buttonText");
const errorMessage = $("errorMessage");
const outputColumn = $("outputColumn");
const previewSection = $("previewSection");
const resultsSection = $("resultsSection");
const tableContainer = $("tableContainer");
const previewNote = $("previewNote");
const resultOutput = $("resultOutput");

let workbook = null;
let currentRows = [];
let currentHeaders = [];
let resultText = "";
let isGenerating = false;

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_PREVIEW_ROWS = 100;

/* =========================================
   API KEY
========================================= */

function getApiKey() {
    const possibleKeys = [
        "groq_api_key",
        "groqApiKey",
        "GROQ_API_KEY",
        "AI_CLASSROOM_API_KEY",
        "ai_api_key"
    ];

    // Also support an existing API key input if present.
    const apiKeyInput = $("apiKey");
    if (apiKeyInput?.value?.trim()) {
        return apiKeyInput.value.trim();
    }

    for (const storage of [sessionStorage, localStorage]) {
        for (const key of possibleKeys) {
            try {
                const value = storage.getItem(key);
                if (value && value.trim()) {
                    return value.trim();
                }
            } catch (error) {
                // Ignore unavailable browser storage.
            }
        }
    }

    return "";
}

/* =========================================
   ERROR HANDLING
========================================= */

function showError(message) {
    errorMessage.textContent = message;
}

function clearError() {
    errorMessage.textContent = "";
}

/* =========================================
   HTML ESCAPING
========================================= */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

/* =========================================
   WORD COUNT
========================================= */

function updateWordCount() {
    const words = userPrompt.value.trim()
        ? userPrompt.value.trim().split(/\s+/).length
        : 0;

    wordCount.textContent =
        `${words} ${words === 1 ? "word" : "words"}`;
}

/* =========================================
   RESULT RESET
========================================= */

function resetResults() {
    resultText = "";

    $("copyResult").disabled = true;
    $("downloadResult").disabled = true;
    $("copyResult").textContent = "Copy";

    resultOutput.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">✧</div>
            <h3>Ready to assist</h3>
            <p>Your AI results will appear here.</p>
        </div>
    `;
}

/* =========================================
   FILE HELPERS
========================================= */

function formatBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function showFile(file) {
    fileName.textContent = file.name;
    fileMeta.textContent = formatBytes(file.size);
    fileInfo.hidden = false;
}

/* =========================================
   CLEAR SPREADSHEET
========================================= */

function clearFile() {
    workbook = null;
    currentRows = [];
    currentHeaders = [];

    fileInput.value = "";
    fileInfo.hidden = true;

    fileName.textContent = "";
    fileMeta.textContent = "";

    sheetSelect.innerHTML =
        '<option value="">Upload a spreadsheet first</option>';

    sheetSelect.disabled = true;
    $("downloadCsv").disabled = true;

    tableContainer.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">▦</div>
            <h3>No spreadsheet uploaded</h3>
            <p>Upload a CSV or Excel file to preview your data.</p>
        </div>
    `;

    previewNote.textContent = "";
    outputColumn.hidden = true;
    previewSection.hidden = true;
    resultsSection.hidden = true;

    resetResults();
}

/* =========================================
   NORMALIZE SPREADSHEET DATA
========================================= */

function normalizeRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return {
            headers: [],
            rows: []
        };
    }

    const headers = rows[0].map((value, index) => {
        const name = String(value ?? "").trim();
        return name || `Column ${index + 1}`;
    });

    const data = rows.slice(1).filter((row) =>
        row.some((value) =>
            value !== null &&
            value !== undefined &&
            String(value).trim() !== ""
        )
    );

    return {
        headers,
        rows: data
    };
}

/* =========================================
   LOAD SELECTED WORKSHEET
========================================= */

function loadSelectedSheet() {
    if (!workbook || !sheetSelect.value) {
        return;
    }

    const worksheet = workbook.Sheets[sheetSelect.value];

    if (!worksheet) {
        showError("The selected worksheet could not be read.");
        return;
    }

    const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: false
    });

    const normalized = normalizeRows(rows);

    currentHeaders = normalized.headers;
    currentRows = normalized.rows;

    renderPreview();

    $("downloadCsv").disabled =
        currentHeaders.length === 0;
}

/* =========================================
   SPREADSHEET DATA PREVIEW
========================================= */

function renderPreview() {
    if (!currentHeaders.length) {
        tableContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">▦</div>
                <h3>Worksheet is empty</h3>
                <p>This worksheet has no data to preview.</p>
            </div>
        `;

        previewNote.textContent = "";
        return;
    }

    const visibleRows = currentRows.slice(
        0,
        MAX_PREVIEW_ROWS
    );

    const headerHTML = currentHeaders.map((header) =>
        `<th>${escapeHTML(header)}</th>`
    ).join("");

    const bodyHTML = visibleRows.map((row) => {
        const cells = currentHeaders.map((_, index) =>
            `<td>${escapeHTML(row[index] ?? "")}</td>`
        ).join("");

        return `<tr>${cells}</tr>`;
    }).join("");

    tableContainer.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>${headerHTML}</tr>
            </thead>
            <tbody>
                ${bodyHTML || `
                    <tr>
                        <td colspan="${currentHeaders.length}">
                            No data rows
                        </td>
                    </tr>
                `}
            </tbody>
        </table>
    `;

    const extra = currentRows.length > MAX_PREVIEW_ROWS
        ? ` Showing the first ${MAX_PREVIEW_ROWS} rows.`
        : "";

    previewNote.textContent =
        `${currentRows.length} rows · ` +
        `${currentHeaders.length} columns.${extra}`;
}

/* =========================================
   DOWNLOAD FILE
========================================= */

function downloadBlob(content, mimeType, filename) {
    const blob = new Blob([content], {
        type: mimeType
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* =========================================
   CSV EXPORT
========================================= */

function csvEscape(value) {
    const text = String(value ?? "");

    if (/[",\r\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
}

function exportCSV() {
    if (!currentHeaders.length) {
        return;
    }

    const allRows = [
        currentHeaders,
        ...currentRows
    ];

    const csv = allRows.map((row) =>
        currentHeaders.map((_, index) =>
            csvEscape(row[index] ?? "")
        ).join(",")
    ).join("\r\n");

    downloadBlob(
        "\uFEFF" + csv,
        "text/csv;charset=utf-8",
        "spreadsheet-export.csv"
    );
}

/* =========================================
   CREATE COMPACT DATA CONTEXT
========================================= */

function makeDataContext() {
    if (!currentHeaders.length) {
        return "No spreadsheet uploaded.";
    }

    // Only a small sample is sent to the AI.
    const sample = currentRows.slice(0, 5);

    const sampleText = [
        currentHeaders,
        ...sample
    ].map((row) =>
        currentHeaders.map((_, index) =>
            String(row[index] ?? "")
                .replace(/\s+/g, " ")
                .slice(0, 80)
        ).join(" | ")
    ).join("\n");

    return `
Worksheet: ${sheetSelect.value}
Total rows: ${currentRows.length}
Total columns: ${currentHeaders.length}
Column names: ${currentHeaders.join(", ")}

Sample data (first 5 rows):
${sampleText}
`.slice(0, 3500);
}

/* =========================================
   BUILD AI PROMPT
========================================= */

function buildPrompt() {
    const instructions = {
        analyze:
            "Analyze the spreadsheet and summarize key findings, trends and statistics.",

        formula:
            "Suggest suitable spreadsheet formulas and explain how to use them.",

        clean:
            "Identify missing values, duplicate records, inconsistent formats and other data-quality issues.",

        explain:
            "Explain the spreadsheet structure, columns and important observations.",

        custom:
            "Follow the user's instructions."
    };

    const task =
        instructions[actionSelect.value] ||
        instructions.analyze;

    return `
You are an expert spreadsheet assistant.

TASK:
${task}

USER INSTRUCTIONS:
${userPrompt.value.trim() || "Provide a concise analysis."}

SPREADSHEET:
${makeDataContext()}

OUTPUT FORMAT:
Present the main findings in a Markdown table.

For data analysis, use these columns:
Finding | Observation | Explanation

For data-quality analysis, use:
Issue | Description | How to detect | Suggested solution

For formulas, use:
Purpose | Formula | Explanation

For spreadsheet explanations, use:
Column | Description | Data observations

For custom requests, choose suitable table headings.

RULES:
1. Use a separate row for each finding.
2. Use concise, clear language.
3. Include a short summary below the table if useful.
4. Never invent statistics or values.
5. Clearly indicate when the supplied sample is insufficient.
6. Do not claim to have modified the spreadsheet.
7. Return a properly formatted Markdown table.
`;
}

/* =========================================
   MARKDOWN TO HTML
========================================= */

function renderMarkdown(text) {
    const codeBlocks = [];

    // Escape untrusted AI output before rendering.
    let html = escapeHTML(text);

    // Preserve code blocks while processing other Markdown.
    html = html.replace(
        /```(?:[^\n]*)\n?([\s\S]*?)```/g,
        (_, code) => {
            const index = codeBlocks.length;
            codeBlocks.push(code.trim());

            return `%%CODEBLOCK${index}%%`;
        }
    );

    function splitCells(line) {
        return line.trim()
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map(cell => cell.trim());
    }

    function isTableSeparator(line) {
        const cells = splitCells(line);

        return cells.length > 0 &&
            cells.every(cell => /^:?-{3,}:?$/.test(cell));
    }

    function formatInline(value) {
        return value
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.+?)\*/g, "<em>$1</em>")
            .replace(/`([^`]+)`/g, "<code>$1</code>");
    }

    function makeTable(header, rows) {
        const headings = header.map((cell) =>
            `<th>${formatInline(cell)}</th>`
        ).join("");

        const body = rows.map((row) => {
            const cells = header.map((_, index) =>
                `<td>${formatInline(row[index] || "")}</td>`
            ).join("");

            return `<tr>${cells}</tr>`;
        }).join("");

        return `
            <div class="ai-table-wrapper">
                <table class="ai-result-table">
                    <thead>
                        <tr>${headings}</tr>
                    </thead>
                    <tbody>
                        ${body}
                    </tbody>
                </table>
            </div>
        `;
    }

    const lines = html.split("\n");
    const output = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (!line) {
            continue;
        }

        // Detect Markdown tables.
        if (
            line.includes("|") &&
            i + 1 < lines.length &&
            isTableSeparator(lines[i + 1])
        ) {
            const header = splitCells(line);
            const rows = [];

            i += 2;

            while (
                i < lines.length &&
                lines[i].trim().includes("|")
            ) {
                rows.push(splitCells(lines[i]));
                i++;
            }

            i--;

            output.push(makeTable(header, rows));
            continue;
        }

        // Headings.
        if (line.startsWith("### ")) {
            output.push(
                `<h3>${formatInline(line.slice(4))}</h3>`
            );
            continue;
        }

        if (line.startsWith("## ")) {
            output.push(
                `<h3>${formatInline(line.slice(3))}</h3>`
            );
            continue;
        }

        if (line.startsWith("# ")) {
            output.push(
                `<h3>${formatInline(line.slice(2))}</h3>`
            );
            continue;
        }

        // Bullet lists.
        if (/^[-*]\s+/.test(line)) {
            output.push(
                `<p class="result-list-item">• ${formatInline(
                    line.replace(/^[-*]\s+/, "")
                )}</p>`
            );
            continue;
        }

        // Numbered lists.
        if (/^\d+\.\s+/.test(line)) {
            output.push(
                `<p class="result-list-item">${formatInline(
                    line.replace(/^\d+\.\s+/, "")
                )}</p>`
            );
            continue;
        }

        output.push(`<p>${formatInline(line)}</p>`);
    }

    html = output.join("\n");

    // Restore code blocks safely.
    return html.replace(
        /%%CODEBLOCK(\d+)%%/g,
        (_, index) => {
            const code = codeBlocks[Number(index)] ?? "";
            return `<pre><code>${escapeHTML(code)}</code></pre>`;
        }
    );
}

/* =========================================
   GROQ AI REQUEST
========================================= */

async function requestAI(prompt) {
    const apiKey = getApiKey();

    if (!apiKey) {
        throw new Error(
            "Groq API key not found. Save your API key in the AI Classroom dashboard settings."
        );
    }

    const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                messages: [
                    {
                        role: "system",
                        content:
                            "You are a concise and accurate spreadsheet assistant. Return the main findings in a Markdown table. Never invent data."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_completion_tokens: 300,
                temperature: 0.2
            })
        }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        if (
            response.status === 401 ||
            response.status === 403
        ) {
            throw new Error(
                "Invalid API key or insufficient API access. Check your Groq API key."
            );
        }

        if (response.status === 429) {
            throw new Error(
                "Groq rate limit reached. Please wait before trying again."
            );
        }

        throw new Error(
            data?.error?.message ||
            `AI request failed with status ${response.status}.`
        );
    }

    const content =
        data?.choices?.[0]?.message?.content;

    if (!content || !content.trim()) {
        throw new Error(
            "The AI returned an empty response. Please try again."
        );
    }

    return content.trim();
}

/* =========================================
   DISPLAY AI RESULTS AS A TABLE
========================================= */

function showResult(text) {
    resultText = text;

    resultOutput.innerHTML = `
        <div class="result-content">
            ${renderMarkdown(text)}
        </div>
    `;

    $("copyResult").disabled = false;
    $("downloadResult").disabled = false;
}

/* =========================================
   GENERATE RESULT
========================================= */

async function generateResult() {
    if (isGenerating) {
        return;
    }

    clearError();

    const action = actionSelect.value;
    const hasSpreadsheet = currentHeaders.length > 0;

    if (
        !hasSpreadsheet &&
        action !== "formula" &&
        action !== "custom"
    ) {
        showError(
            "Upload a spreadsheet before generating this result."
        );
        return;
    }

    if (
        (action === "formula" || action === "custom") &&
        !userPrompt.value.trim()
    ) {
        showError(
            "Please enter your instructions before generating."
        );
        userPrompt.focus();
        return;
    }

    outputColumn.hidden = false;
    previewSection.hidden = !hasSpreadsheet;
    resultsSection.hidden = false;

    if (hasSpreadsheet) {
        renderPreview();
    }

    resultText = "";

    $("copyResult").disabled = true;
    $("downloadResult").disabled = true;

    resultOutput.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">✧</div>
            <h3>Generating your result</h3>
            <p>Analyzing your request. Please wait...</p>
        </div>
    `;

    isGenerating = true;
    generateButton.disabled = true;
    buttonText.textContent = "Generating...";

    try {
        const prompt = buildPrompt();
        const answer = await requestAI(prompt);
        showResult(answer);
    } catch (error) {
        const message =
            error.message || "An unexpected error occurred.";

        resultOutput.innerHTML = `
            <div class="result-content">
                <h3>Couldn't generate the result</h3>
                <p>${escapeHTML(message)}</p>
            </div>
        `;

        showError(message);
    } finally {
        isGenerating = false;
        generateButton.disabled = false;
        buttonText.textContent = "Generate Result";
    }

    outputColumn.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
    });
}

/* =========================================
   READ SPREADSHEET
========================================= */

async function readSpreadsheet(file) {
    clearError();

    if (!file) {
        return;
    }

    const extension = file.name
        .split(".")
        .pop()
        .toLowerCase();

    if (!["csv", "xlsx", "xls"].includes(extension)) {
        showError(
            "Please upload a CSV, XLSX or XLS file."
        );
        fileInput.value = "";
        return;
    }

    if (file.size > MAX_FILE_SIZE) {
        showError(
            "The file exceeds the 15 MB size limit."
        );
        fileInput.value = "";
        return;
    }

    if (file.size === 0) {
        showError("The selected file is empty.");
        fileInput.value = "";
        return;
    }

    try {
        if (typeof XLSX === "undefined") {
            throw new Error(
                "The spreadsheet library could not be loaded. Check your internet connection and refresh the page."
            );
        }

        const buffer = await file.arrayBuffer();

        const parsed = XLSX.read(buffer, {
            type: "array",
            cellDates: true
        });

        if (!parsed.SheetNames.length) {
            throw new Error(
                "No worksheets were found in this file."
            );
        }

        workbook = parsed;
        showFile(file);

        sheetSelect.innerHTML = "";

        parsed.SheetNames.forEach((name) => {
            const option = document.createElement("option");

            option.value = name;
            option.textContent = name;

            sheetSelect.appendChild(option);
        });

        sheetSelect.disabled = false;
        sheetSelect.selectedIndex = 0;

        loadSelectedSheet();
        resetResults();

        outputColumn.hidden = true;
        previewSection.hidden = true;
        resultsSection.hidden = true;
    } catch (error) {
        clearFile();

        showError(
            error.message ||
            "Unable to read the spreadsheet. Please check that the file is valid."
        );

        console.error(error);
    }
}

/* =========================================
   FILE INPUT
========================================= */

fileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];

    if (file) {
        readSpreadsheet(file);
    }
});

removeFile.addEventListener("click", () => {
    clearError();
    clearFile();
});

/* =========================================
   DRAG AND DROP
========================================= */

uploadArea.addEventListener("dragover", (event) => {
    event.preventDefault();
    uploadArea.classList.add("dragover");
});

uploadArea.addEventListener("dragleave", () => {
    uploadArea.classList.remove("dragover");
});

uploadArea.addEventListener("drop", (event) => {
    event.preventDefault();
    uploadArea.classList.remove("dragover");

    const file = event.dataTransfer.files?.[0];

    if (file) {
        readSpreadsheet(file);
    }
});

/* =========================================
   WORKSHEET CHANGE
========================================= */

sheetSelect.addEventListener("change", () => {
    clearError();

    loadSelectedSheet();
    resetResults();

    outputColumn.hidden = true;
    previewSection.hidden = true;
    resultsSection.hidden = true;
});

/* =========================================
   FORM AND PROMPTS
========================================= */

userPrompt.addEventListener("input", updateWordCount);

actionSelect.addEventListener("change", clearError);

document.querySelectorAll(".example-button")
    .forEach((button) => {
        button.addEventListener("click", () => {
            actionSelect.value = button.dataset.action;
            userPrompt.value = button.dataset.prompt;

            updateWordCount();
            clearError();
            userPrompt.focus();
        });
    });

form.addEventListener("submit", (event) => {
    event.preventDefault();
    generateResult();
});

/* =========================================
   CSV DOWNLOAD BUTTON
========================================= */

$("downloadCsv").addEventListener("click", exportCSV);

/* =========================================
   COPY AI RESULT
========================================= */

$("copyResult").addEventListener("click", async () => {
    if (!resultText) {
        return;
    }

    try {
        if (
            navigator.clipboard &&
            window.isSecureContext
        ) {
            await navigator.clipboard.writeText(resultText);
        } else {
            const textArea =
                document.createElement("textarea");

            textArea.value = resultText;
            textArea.style.position = "fixed";
            textArea.style.opacity = "0";

            document.body.appendChild(textArea);
            textArea.select();

            const copied =
                document.execCommand("copy");

            textArea.remove();

            if (!copied) {
                throw new Error("Copy operation failed.");
            }
        }

        $("copyResult").textContent = "Copied!";

        setTimeout(() => {
            $("copyResult").textContent = "Copy";
        }, 1500);
    } catch (error) {
        showError(
            "Unable to copy. Please copy the result manually."
        );
    }
});

/* =========================================
   DOWNLOAD AI RESULT
========================================= */

$("downloadResult").addEventListener("click", () => {
    if (!resultText) {
        return;
    }

    downloadBlob(
        resultText,
        "text/plain;charset=utf-8",
        "sheets-ai-result.txt"
    );
});

/* =========================================
   DARK MODE
========================================= */

const themeToggle = $("themeToggle");

function setTheme(dark) {
    document.body.classList.toggle("dark", dark);

    themeToggle.textContent = dark ? "☀" : "☾";

    themeToggle.setAttribute(
        "aria-label",
        dark ? "Switch to light mode" : "Switch to dark mode"
    );
}

try {
    setTheme(
        localStorage.getItem("ai_classroom_theme") === "dark"
    );
} catch (error) {
    setTheme(false);
}

themeToggle.addEventListener("click", () => {
    const dark =
        !document.body.classList.contains("dark");

    setTheme(dark);

    try {
        localStorage.setItem(
            "ai_classroom_theme",
            dark ? "dark" : "light"
        );
    } catch (error) {
        // Theme remains active for this page.
    }
});

/* =========================================
   INITIALIZE
========================================= */

updateWordCount();