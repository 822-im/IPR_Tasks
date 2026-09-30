
"use strict";

const $ = (id) => document.getElementById(id);

const form = $("presentationForm");
const topicInput = $("presentationTopic");
const audienceInput = $("audience");
const slideCountInput = $("slideCount");
const styleInput = $("presentationStyle");
const sourceText = $("sourceText");
const sourceFile = $("sourceFile");
const fileInfo = $("fileInfo");
const fileName = $("fileName");
const removeFile = $("removeFile");
const uploadBox = $("uploadBox");
const generateButton = $("generateButton");
const buttonText = $("buttonText");
const errorMessage = $("errorMessage");
const slidesOutput = $("slidesOutput");
const copyButton = $("copyButton");
const downloadButton = $("downloadButton");
const printButton = $("printButton");
const editButton = $("editButton");
const themeToggle = $("themeToggle");
const wordCount = $("wordCount");

let selectedFile = null;
let generatedSlides = [];

// API key: use the key saved by the AI Classroom dashboard.
function getApiKey() {
    const keys = [
        "AI_CLASSROOM_API_KEY",
        "groq_api_key",
        "groqApiKey",
        "apiKey",
        "GROQ_API_KEY",
        "groqKey"
    ];

    for (const storage of [sessionStorage, localStorage]) {
        try {
            for (const key of keys) {
                const value = storage.getItem(key);
                if (value && value.trim().startsWith("gsk_")) {
                    return value.trim();
                }
            }

            // Also support dashboards using a different storage key.
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);
                const value = storage.getItem(key);

                if (
                    value &&
                    value.trim().startsWith("gsk_") &&
                    !/theme|dark|color/i.test(key)
                ) {
                    return value.trim();
                }
            }
        } catch (error) {
            console.warn("Could not read browser storage:", error);
        }
    }

    return "";
}

// Theme
function applyTheme(dark) {
    document.body.classList.toggle("dark", dark);
    themeToggle.textContent = dark ? "☀" : "☾";
    themeToggle.setAttribute(
        "aria-label",
        dark ? "Switch to light mode" : "Switch to dark mode"
    );
}

try {
    applyTheme(localStorage.getItem("ai_classroom_theme") === "dark");
} catch {
    applyTheme(false);
}

themeToggle.addEventListener("click", () => {
    const dark = !document.body.classList.contains("dark");
    applyTheme(dark);

    try {
        localStorage.setItem("ai_classroom_theme", dark ? "dark" : "light");
    } catch (error) {
        console.warn("Theme preference could not be saved.");
    }
});

// Word count
function updateWordCount() {
    const count = sourceText.value.trim()
        ? sourceText.value.trim().split(/\s+/).length
        : 0;

    wordCount.textContent = `${count} ${count === 1 ? "word" : "words"}`;
}

sourceText.addEventListener("input", updateWordCount);

// Error handling
function showError(message) {
    errorMessage.textContent = message;
}

function clearError() {
    errorMessage.textContent = "";
}

// File upload
function setSelectedFile(file) {
    clearError();

    if (!file) return;

    const allowed = /\.(pdf|docx|txt|png|jpe?g|webp)$/i;

    if (!allowed.test(file.name)) {
        showError("Please upload a PDF, DOCX, TXT, PNG, JPG or WEBP file.");
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        showError("The maximum file size is 10 MB.");
        return;
    }

    selectedFile = file;
    fileName.textContent = file.name;
    fileInfo.hidden = false;
    uploadBox.classList.remove("dragover");
}

sourceFile.addEventListener("change", () => {
    setSelectedFile(sourceFile.files[0]);
});

removeFile.addEventListener("click", () => {
    selectedFile = null;
    sourceFile.value = "";
    fileInfo.hidden = true;
    fileName.textContent = "";
    clearError();
});

uploadBox.addEventListener("dragover", (event) => {
    event.preventDefault();
    uploadBox.classList.add("dragover");
});

uploadBox.addEventListener("dragleave", () => {
    uploadBox.classList.remove("dragover");
});

uploadBox.addEventListener("drop", (event) => {
    event.preventDefault();
    uploadBox.classList.remove("dragover");

    const file = event.dataTransfer.files[0];
    setSelectedFile(file);
});

// Extract text from uploaded material
async function extractFileText(file) {
    const extension = file.name.split(".").pop().toLowerCase();

    if (extension === "txt") {
        return await file.text();
    }

    if (extension === "docx") {
        if (!window.mammoth) {
            throw new Error("DOCX support could not be loaded. Refresh the page.");
        }

        const buffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        return result.value;
    }

    if (extension === "pdf") {
        if (!window.pdfjsLib) {
            throw new Error("PDF support could not be loaded. Refresh the page.");
        }

        pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({
            data: new Uint8Array(buffer)
        }).promise;

        const pages = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();

            pages.push(
                content.items.map(item => item.str).join(" ")
            );
        }

        const text = pages.join("\n\n").trim();

        if (!text) {
            throw new Error(
                "No selectable text was found in this PDF. Try a text-based PDF or paste the content."
            );
        }

        return text;
    }

    if (/\.(png|jpe?g|webp)$/i.test(file.name)) {
        if (!window.Tesseract) {
            throw new Error("Image text recognition could not be loaded.");
        }

        buttonText.textContent = "Reading image...";

        const result = await Tesseract.recognize(file, "eng");
        const text = result.data.text.trim();

        if (!text) {
            throw new Error("No readable text was found in this image.");
        }

        return text;
    }

    throw new Error("This file type is not supported.");
}

// Prompt for AI
function buildPrompt(topic, material) {
    const count = Number(slideCountInput.value);
    const audience = audienceInput.value;
    const style = styleInput.value;

    return `
Create a complete, professional ${count}-slide presentation.

TOPIC:
${topic || "Determine the topic from the supplied study material"}

TARGET AUDIENCE:
${audience}

PRESENTATION STYLE:
${style}

SOURCE MATERIAL:
${material || "No additional source material supplied."}

REQUIREMENTS:
1. Return exactly ${count} slides.
2. The first slide must be a title slide.
3. The final slide must provide a conclusion or key takeaways.
4. Organize the remaining slides logically, with a clear progression.
5. Use concise, informative bullet points rather than long paragraphs.
6. Include 3 to 5 useful bullet points on content slides.
7. Use accurate information. Prioritize the supplied material and do not invent statistics, citations or research findings.
8. Make the slides useful for the specified audience.
9. Use a short, meaningful title for each slide.
10. The title slide should have a subtitle.
11. Avoid repeating the same information across slides.
12. Return valid JSON only. Do not use Markdown code fences or introductory text.

Use this exact JSON structure:
{
  "slides": [
    {
      "title": "Presentation title",
      "subtitle": "Short subtitle",
      "bullets": [],
      "notes": "Optional speaker notes"
    },
    {
      "title": "Slide title",
      "subtitle": "",
      "bullets": [
        "First point",
        "Second point",
        "Third point"
      ],
      "notes": "Optional speaker notes"
    }
  ]
}
`;
}

// Parse model response
function parseSlides(responseText) {
    let cleaned = responseText.trim();

    cleaned = cleaned
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "");

    let parsed;

    try {
        parsed = JSON.parse(cleaned);
    } catch {
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");

        if (start === -1 || end <= start) {
            throw new Error("The AI returned an invalid presentation format. Please try again.");
        }

        try {
            parsed = JSON.parse(cleaned.slice(start, end + 1));
        } catch {
            throw new Error("The AI response could not be converted into slides. Please try again.");
        }
    }

    const slides = Array.isArray(parsed) ? parsed : parsed.slides;

    if (!Array.isArray(slides) || slides.length === 0) {
        throw new Error("No slides were returned. Please try again.");
    }

    return slides.map((slide, index) => {
        const bullets = Array.isArray(slide.bullets)
            ? slide.bullets
            : Array.isArray(slide.points)
                ? slide.points
                : [];

        return {
            title: String(slide.title || `Slide ${index + 1}`),
            subtitle: String(slide.subtitle || ""),
            bullets: bullets.map(point => String(point)),
            notes: String(slide.notes || "")
        };
    });
}

// Generate slides through Groq
async function requestPresentation(prompt, apiKey) {
    // Retry alternate supported models if the account cannot access one.
    const models = [
        "openai/gpt-oss-120b",
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "qwen/qwen3-32b"
    ];

    let lastError;

    for (const model of models) {
        const response = await fetch(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        {
                            role: "system",
                            content: "You are an expert presentation designer and educator. Follow the requested JSON format exactly."
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    temperature: 0.5,
                    max_tokens: 7000
                })
            }
        );

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
            const content = data.choices?.[0]?.message?.content;

            if (!content || !content.trim()) {
                throw new Error("The AI returned an empty response. Please try again.");
            }

            return parseSlides(content);
        }

        const message = data.error?.message || `Request failed (${response.status}).`;
        lastError = new Error(message);

        const modelUnavailable =
            response.status === 404 ||
            /model.*(not found|does not exist|decommissioned|access)/i.test(message);

        if (response.status === 401 || response.status === 403) {
            throw new Error(
                "Your Groq API key is invalid or does not have permission. Check the key in your dashboard."
            );
        }

        if (!modelUnavailable) {
            throw lastError;
        }
    }

    throw lastError || new Error("No available AI model could generate the presentation.");
}

// Safe HTML rendering
function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function renderSlides(slides) {
    slidesOutput.innerHTML = "";

    slides.forEach((slide, index) => {
        const card = document.createElement("article");
        card.className = "slide-card" + (index === 0 ? " cover-slide" : "");
        card.dataset.slideIndex = index;

        const bullets = slide.bullets.length
            ? `<ul class="slide-bullets">${slide.bullets.map(
                bullet => `<li contenteditable="true" spellcheck="true">${escapeHTML(bullet)}</li>`
            ).join("")}</ul>`
            : "";

        card.innerHTML = `
            <span class="slide-number">${String(index + 1).padStart(2, "0")}</span>
            <h3 class="slide-title" contenteditable="true" spellcheck="true">${escapeHTML(slide.title)}</h3>
            ${slide.subtitle
                ? `<p class="slide-subtitle" contenteditable="true" spellcheck="true">${escapeHTML(slide.subtitle)}</p>`
                : ""}
            ${bullets}
            <div class="slide-footer">
                <span>AI Classroom</span>
                <span>${index + 1} / ${slides.length}</span>
            </div>
        `;

        slidesOutput.appendChild(card);
    });

    copyButton.disabled = false;
    downloadButton.disabled = false;
    printButton.disabled = false;
    editButton.hidden = false;
}

function readEditedSlides() {
    return [...slidesOutput.querySelectorAll(".slide-card")].map(card => ({
        title: card.querySelector(".slide-title")?.innerText.trim() || "",
        subtitle: card.querySelector(".slide-subtitle")?.innerText.trim() || "",
        bullets: [...card.querySelectorAll(".slide-bullets li")]
            .map(li => li.innerText.trim())
            .filter(Boolean)
    }));
}

// Generate button
form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();

    const topic = topicInput.value.trim();
    const additionalText = sourceText.value.trim();

    if (!topic && !additionalText && !selectedFile) {
        showError("Enter a presentation topic, paste study material or upload a file.");
        return;
    }

    const apiKey = getApiKey();

    if (!apiKey) {
        showError(
            "Groq API key not found. Add your Groq key in the AI Classroom dashboard and try again."
        );
        return;
    }

    generateButton.disabled = true;
    buttonText.textContent = "Generating...";
    slidesOutput.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <strong>Creating your presentation...</strong>
            <span>Analyzing the content and preparing your slides.</span>
        </div>
    `;

    try {
        let material = additionalText;

        if (selectedFile) {
            buttonText.textContent = "Reading material...";
            const extracted = await extractFileText(selectedFile);
            material = [material, extracted].filter(Boolean).join("\n\n");
        }

        if (material.length > 50000) {
            material = material.slice(0, 50000);
        }

        buttonText.textContent = "Generating...";

        const prompt = buildPrompt(topic, material);
        const slides = await requestPresentation(prompt, apiKey);

        generatedSlides = slides;
        renderSlides(slides);
    } catch (error) {
        console.error("Presentation generation error:", error);

        slidesOutput.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">!</div>
                <h3>Couldn't generate the presentation</h3>
                <p>Check the error message and try again.</p>
            </div>
        `;

        showError(error.message || "Something went wrong. Please try again.");
        copyButton.disabled = true;
        downloadButton.disabled = true;
        printButton.disabled = true;
        editButton.hidden = true;
    } finally {
        generateButton.disabled = false;
        buttonText.textContent = "Generate Presentation";
    }
});

// Copy presentation outline
copyButton.addEventListener("click", async () => {
    const slides = readEditedSlides();

    const text = slides.map((slide, index) => {
        const points = slide.bullets.map(point => `• ${point}`).join("\n");
        return [
            `SLIDE ${index + 1}: ${slide.title}`,
            slide.subtitle,
            points
        ].filter(Boolean).join("\n");
    }).join("\n\n");

    try {
        await navigator.clipboard.writeText(text);
        copyButton.textContent = "Copied!";
        setTimeout(() => copyButton.textContent = "Copy", 1500);
    } catch {
        showError("Copy failed. Please allow clipboard access in your browser.");
    }
});

// Download editable PowerPoint
downloadButton.addEventListener("click", async () => {
    clearError();

    const Pptx = window.pptxgen || window.PptxGenJS;

    if (!Pptx) {
        showError("PowerPoint export could not be loaded. Refresh the page and try again.");
        return;
    }

    const slides = readEditedSlides();

    if (!slides.length) {
        showError("Generate a presentation before downloading.");
        return;
    }

    downloadButton.disabled = true;
    downloadButton.textContent = "Exporting...";

    try {
        const pptx = new Pptx();
        pptx.layout = "LAYOUT_WIDE";
        pptx.author = "AI Classroom";
        pptx.subject = topicInput.value.trim() || "AI-generated presentation";
        pptx.title = topicInput.value.trim() || "AI Presentation";
        pptx.company = "AI Classroom";
        pptx.lang = "en-US";

        pptx.theme = {
            headFontFace: "Aptos Display",
            bodyFontFace: "Aptos",
            lang: "en-US"
        };

        const themes = [
            { bg: "F5F0FF", accent: "7950DC", text: "292044" },
            { bg: "FFFFFF", accent: "344E85", text: "202038" },
            { bg: "F4F7FB", accent: "389C91", text: "202038" }
        ];

        slides.forEach((item, index) => {
            const theme = index === 0
                ? { bg: "F0EAFF", accent: "7950DC", text: "34205F" }
                : themes[(index - 1) % themes.length];

            const slide = pptx.addSlide();
            slide.background = { color: theme.bg };

            slide.addShape(pptx.ShapeType.rect, {
                x: 0,
                y: 0,
                w: 13.333,
                h: 0.12,
                line: { color: theme.accent, transparency: 100 },
                fill: { color: theme.accent }
            });

            if (index === 0) {
                slide.addText(item.title, {
                    x: 1.0,
                    y: 2.0,
                    w: 11.3,
                    h: 1.2,
                    fontFace: "Aptos Display",
                    fontSize: 32,
                    bold: true,
                    color: theme.text,
                    align: "center",
                    valign: "mid",
                    breakLine: false,
                    margin: 0.08,
                    fit: "shrink"
                });

                if (item.subtitle) {
                    slide.addText(item.subtitle, {
                        x: 1.5,
                        y: 3.4,
                        w: 10.3,
                        h: 0.7,
                        fontFace: "Aptos",
                        fontSize: 18,
                        color: "6F6688",
                        align: "center",
                        valign: "mid",
                        margin: 0.05,
                        fit: "shrink"
                    });
                }
            } else {
                slide.addText(item.title, {
                    x: 0.75,
                    y: 0.55,
                    w: 11.8,
                    h: 0.75,
                    fontFace: "Aptos Display",
                    fontSize: 25,
                    bold: true,
                    color: theme.text,
                    margin: 0.05,
                    fit: "shrink"
                });

                if (item.subtitle) {
                    slide.addText(item.subtitle, {
                        x: 0.8,
                        y: 1.4,
                        w: 11.5,
                        h: 0.45,
                        fontSize: 14,
                        color: "6F6688",
                        margin: 0.04,
                        fit: "shrink"
                    });
                }

                if (item.bullets.length) {
                    slide.addText(
                        item.bullets.map(text => ({
                            text,
                            options: {
                                bullet: { indent: 19 },
                                hanging: 4,
                                breakLine: true,
                                paraSpaceAfterPt: 13
                            }
                        })),
                        {
                            x: 0.9,
                            y: item.subtitle ? 2.05 : 1.7,
                            w: 11.2,
                            h: item.subtitle ? 4.4 : 4.8,
                            fontFace: "Aptos",
                            fontSize: 18,
                            color: theme.text,
                            valign: "top",
                            margin: 0.08,
                            breakLine: false,
                            paraSpaceAfterPt: 12,
                            fit: "shrink"
                        }
                    );
                }
            }

            slide.addText(`AI Classroom     ${index + 1} / ${slides.length}`, {
                x: 0.65,
                y: 7.15,
                w: 12,
                h: 0.2,
                fontSize: 9,
                color: "89839C",
                margin: 0,
                align: "right"
            });
        });

        const filename = (topicInput.value.trim() || "AI_Presentation")
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
            .replace(/\s+/g, "_")
            .slice(0, 70) + ".pptx";

        await pptx.writeFile({ fileName: filename });
    } catch (error) {
        console.error("PowerPoint export error:", error);
        showError("PowerPoint export failed: " + (error.message || "Please try again."));
    } finally {
        downloadButton.disabled = false;
        downloadButton.textContent = "PPTX";
    }
});

// Print or save as PDF
printButton.addEventListener("click", () => {
    if (!slidesOutput.querySelector(".slide-card")) {
        showError("Generate a presentation before printing.");
        return;
    }

    window.print();
});

// Return to the input section
editButton.addEventListener("click", () => {
    $("presentationForm").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    topicInput.focus({ preventScroll: true });
});

// Initialize
updateWordCount();