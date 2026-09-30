
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const $ = id => document.getElementById(id);

    const apiKey = sessionStorage.getItem("AI_CLASSROOM_API_KEY");
    const selectedTask = sessionStorage.getItem("AI_CLASSROOM_SELECTED_TASK");

    const form = $("notesForm");
    const topicInput = $("notesTopic");
    const sourceText = $("sourceText");
    const sourceFile = $("sourceFile");
    const notesStyle = $("notesStyle");
    const notesLength = $("notesLength");

    const output = $("notesOutput");
    const outputStatus = $("outputStatus");
    const errorMessage = $("errorMessage");
    const generateButton = $("generateButton");
    const buttonText = $("buttonText");

    const copyButton = $("copyButton");
    const downloadButton = $("downloadButton");
    const printButton = $("printButton");

    const fileInfo = $("fileInfo");
    const fileName = $("fileName");
    const removeFile = $("removeFile");
    const uploadBox = $("uploadBox");

    let generatedNotes = "";
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    const allowedExtensions = ["pdf", "docx", "txt", "jpg", "jpeg", "png"];

    // Session validation
    if (!apiKey || (selectedTask && selectedTask !== "2")) {
        window.location.replace("../../index.html");
        return;
    }

    // Theme
    function applyTheme(theme) {
        const dark = theme === "dark";
        document.body.classList.toggle("dark", dark);

        const toggle = $("themeToggle");
        toggle.textContent = dark ? "☀" : "☾";
        toggle.setAttribute(
            "aria-label",
            dark ? "Switch to light mode" : "Switch to dark mode"
        );
    }

    applyTheme(sessionStorage.getItem("AI_CLASSROOM_THEME") || "light");

    $("themeToggle").addEventListener("click", () => {
        const next = document.body.classList.contains("dark") ? "light" : "dark";
        sessionStorage.setItem("AI_CLASSROOM_THEME", next);
        applyTheme(next);
    });

    // Error and loading states
    function showError(message = "") {
        errorMessage.textContent = message;
    }

    function setLoading(loading) {
        generateButton.disabled = loading;
        buttonText.textContent = loading ? "Generating notes..." : "Generate Notes";
        outputStatus.textContent = loading ? "Generating your notes..." :
            (generatedNotes ? "Notes ready to edit" : "Your formatted notes will appear here.");
    }

    function setActionsEnabled(enabled) {
        copyButton.disabled = !enabled;
        downloadButton.disabled = !enabled;
        printButton.disabled = !enabled;
    }

    // Word counts
    function countWords(text) {
        const trimmed = text.trim();
        return trimmed ? trimmed.split(/\s+/).length : 0;
    }

    function updateInputCount() {
        $("wordCount").textContent =
            `${countWords(sourceText.value)} words`;
    }

    function updateOutputCount() {
        const text = getNotesText();
        $("outputWordCount").textContent = `${countWords(text)} words`;
    }

    sourceText.addEventListener("input", updateInputCount);
    updateInputCount();

    // File upload
    function getExtension(file) {
        return file.name.split(".").pop().toLowerCase();
    }

    function validateFile(file) {
        if (!file) {
            throw new Error("Please select a file.");
        }

        if (file.size > MAX_FILE_SIZE) {
            throw new Error("File size must be 10 MB or less.");
        }

        if (!allowedExtensions.includes(getExtension(file))) {
            throw new Error("Supported formats: PDF, DOCX, TXT, JPG and PNG.");
        }
    }

    function setSelectedFile(file) {
        showError();

        try {
            validateFile(file);

            const transfer = new DataTransfer();
            transfer.items.add(file);
            sourceFile.files = transfer.files;

            fileName.textContent = file.name;
            fileInfo.hidden = false;
        } catch (error) {
            sourceFile.value = "";
            fileInfo.hidden = true;
            fileName.textContent = "";
            showError(error.message);
        }
    }

    sourceFile.addEventListener("change", () => {
        const file = sourceFile.files[0];
        if (file) setSelectedFile(file);
        else fileInfo.hidden = true;
    });

    removeFile.addEventListener("click", () => {
        sourceFile.value = "";
        fileInfo.hidden = true;
        fileName.textContent = "";
        showError();
    });

    // Drag and drop
    ["dragenter", "dragover"].forEach(eventName => {
        uploadBox.addEventListener(eventName, event => {
            event.preventDefault();
            uploadBox.classList.add("dragover");
        });
    });

    ["dragleave", "drop"].forEach(eventName => {
        uploadBox.addEventListener(eventName, event => {
            event.preventDefault();
            uploadBox.classList.remove("dragover");
        });
    });

    uploadBox.addEventListener("drop", event => {
        const file = event.dataTransfer.files[0];
        if (file) setSelectedFile(file);
    });

    // File readers
    function readAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => resolve(reader.result);
            reader.onerror = () =>
                reject(new Error("Unable to read the uploaded file."));

            reader.readAsDataURL(file);
        });
    }

    async function extractFileContent(file) {
        validateFile(file);
        const extension = getExtension(file);

        if (extension === "txt") {
            return {
                type: "text",
                content: await file.text()
            };
        }

        if (extension === "docx") {
            if (!window.mammoth) {
                throw new Error("DOCX reader unavailable. Please refresh the page.");
            }

            const result = await window.mammoth.extractRawText({
                arrayBuffer: await file.arrayBuffer()
            });

            return {
                type: "text",
                content: result.value
            };
        }

        if (extension === "pdf") {
            if (!window.pdfjsLib) {
                throw new Error("PDF reader unavailable. Please refresh the page.");
            }

            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

            const pdf = await window.pdfjsLib.getDocument({
                data: new Uint8Array(await file.arrayBuffer())
            }).promise;

            const pages = [];

            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
                const page = await pdf.getPage(pageNumber);
                const content = await page.getTextContent();

                pages.push(content.items.map(item => item.str).join(" "));
            }

            return {
                type: "text",
                content: pages.join("\n\n")
            };
        }

        if (["jpg", "jpeg", "png"].includes(extension)) {
            return {
                type: "image",
                content: await readAsDataURL(file)
            };
        }

        throw new Error("Unsupported file format.");
    }

    // Safe Markdown rendering
    function escapeHTML(value) {
        return String(value).replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function renderInline(text) {
        let result = escapeHTML(text);

        result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
        result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        result = result.replace(/__(.+?)__/g, "<strong>$1</strong>");
        result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
        result = result.replace(/_(.+?)_/g, "<em>$1</em>");

        return result;
    }

    function renderMarkdown(markdown) {
        const lines = markdown.replace(/\r/g, "").split("\n");
        const html = [];
        let paragraph = [];
        let listType = "";
        let codeLines = [];
        let inCode = false;

        function flushParagraph() {
            if (!paragraph.length) return;
            html.push(`<p>${paragraph.map(renderInline).join("<br>")}</p>`);
            paragraph = [];
        }

        function closeList() {
            if (listType) {
                html.push(`</${listType}>`);
                listType = "";
            }
        }

        function closeCode() {
            html.push(`<pre><code>${escapeHTML(codeLines.join("\n"))}</code></pre>`);
            codeLines = [];
            inCode = false;
        }

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.startsWith("```")) {
                flushParagraph();
                closeList();

                if (inCode) closeCode();
                else inCode = true;

                continue;
            }

            if (inCode) {
                codeLines.push(line);
                continue;
            }

            if (!trimmed) {
                flushParagraph();
                closeList();
                continue;
            }

            const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
            if (heading) {
                flushParagraph();
                closeList();

                const level = heading[1].length;
                html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
                continue;
            }

            if (trimmed.startsWith(">")) {
                flushParagraph();
                closeList();
                html.push(`<blockquote>${renderInline(trimmed.replace(/^>\s?/, ""))}</blockquote>`);
                continue;
            }

            const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
            const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);

            if (unordered || ordered) {
                flushParagraph();
                const nextType = unordered ? "ul" : "ol";

                if (listType !== nextType) {
                    closeList();
                    html.push(`<${nextType}>`);
                    listType = nextType;
                }

                html.push(`<li>${renderInline((unordered || ordered)[1])}</li>`);
                continue;
            }

            closeList();
            paragraph.push(trimmed);
        }

        flushParagraph();
        closeList();
        if (inCode) closeCode();

        return html.join("\n");
    }

    // Display and edit generated notes
    function getNotesText() {
        const content = output.querySelector(".notes-content");
        return content ? content.innerText.trim() : "";
    }

    function showNotes(markdown) {
        output.innerHTML = "";

        const content = document.createElement("div");
        content.className = "notes-content";
        content.contentEditable = "true";
        content.setAttribute("role", "textbox");
        content.setAttribute("aria-label", "Editable generated study notes");
        content.setAttribute("aria-multiline", "true");
        content.innerHTML = renderMarkdown(markdown);

        output.appendChild(content);
        generatedNotes = markdown;

        content.addEventListener("input", () => {
            generatedNotes = content.innerText.trim();
            updateOutputCount();
            setActionsEnabled(Boolean(generatedNotes));
        });

        updateOutputCount();
        setActionsEnabled(true);
        outputStatus.textContent = "Notes ready to edit";
    }

    // AI instructions
    function buildInstructions(topic) {
        const styleInstructions = {
            detailed: "Create detailed notes with clear explanations, subheadings and useful examples.",
            concise: "Create concise notes with only the essential information and minimal repetition.",
            exam: "Create exam-oriented notes, highlighting definitions, key concepts, comparisons and important points for revision. Do not invent exam questions.",
            beginner: "Explain the material in simple language, defining unfamiliar terms and using straightforward examples.",
            revision: "Create quick revision notes with key definitions, formulas, processes and important facts."
        };

        const lengthInstructions = {
            short: "Keep the notes short and focused.",
            medium: "Use a balanced level of detail.",
            long: "Provide comprehensive notes with relevant explanations and examples."
        };

        return `You are an expert academic note-making assistant.

Create accurate, organized, readable study notes from the supplied material.

Topic: ${topic || "Identify the topic from the source material."}
Style: ${styleInstructions[notesStyle.value] || styleInstructions.detailed}
Length: ${lengthInstructions[notesLength.value] || lengthInstructions.medium}

Formatting requirements:
- Start with one clear Markdown H1 title.
- Use H2 headings for major topics and H3 for subtopics.
- Use bullet points for lists and numbered lists for processes.
- Bold important terms and definitions.
- Include formulas, examples, tables or comparisons only when useful and supported by the source.
- Preserve essential information from the supplied material.
- Remove repetition and irrelevant filler.
- Add a short key-takeaways section at the end when appropriate.
- Never invent facts, quotations or references.
- If the source is incomplete or unclear, state the limitation.
- Return only the finished notes in Markdown, without introductory commentary.`;
    }

    // Groq API request
    async function generateWithAI(instructions, input, isImage = false) {
        const model = isImage
            ? "meta-llama/llama-4-scout-17b-16e-instruct"
            : "openai/gpt-oss-20b";

        const content = isImage
            ? [
                { type: "text", text: instructions + "\n\nCreate study notes from the attached image." },
                {
                    type: "image_url",
                    image_url: { url: input }
                }
            ]
            : instructions + "\n\nSTUDY MATERIAL:\n" + input;

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
                    messages: [{ role: "user", content }],
                    temperature: 0.4,
                    max_tokens: 6000
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            const message = data.error?.message || `Request failed (${response.status}).`;
            if (response.status === 401) {
                throw new Error("The API key was rejected. Check that you entered a valid Groq API key on the start page.");
            }
            if (response.status === 429) {
                throw new Error("API rate limit reached. Please wait and try again.");
            }
            throw new Error(message);
        }

        const result = data.choices?.[0]?.message?.content?.trim();

        if (!result) {
            throw new Error("The AI returned an empty response. Please try again.");
        }

        return result;
    }

    // Generate notes
    form.addEventListener("submit", async event => {
        event.preventDefault();
        showError();

        const topic = topicInput.value.trim();
        const material = sourceText.value.trim();
        const file = sourceFile.files[0];

        if (!topic && !material && !file) {
            showError("Enter a topic, paste study material or upload a file.");
            topicInput.focus();
            return;
        }

        setLoading(true);
        setActionsEnabled(false);
        outputStatus.textContent = "Preparing your study material...";

        try {
            let input = material;
            let isImage = false;

            if (file) {
                outputStatus.textContent = "Reading uploaded material...";
                const extracted = await extractFileContent(file);

                if (extracted.type === "image") {
                    isImage = true;
                    input = extracted.content;
                } else {
                    const fileText = extracted.content.trim();

                    if (!fileText && !material && !topic) {
                        throw new Error("No readable text was found in the uploaded file.");
                    }

                    input = [
                        material ? `ADDITIONAL MATERIAL:\n${material}` : "",
                        fileText ? `UPLOADED FILE CONTENT:\n${fileText.slice(0, 50000)}` : ""
                    ].filter(Boolean).join("\n\n");
                }
            }

            const instructions = buildInstructions(topic);

            outputStatus.textContent = "Generating your notes...";
            const result = await generateWithAI(instructions, input, isImage);

            showNotes(result);
        } catch (error) {
            showError(error.message || "Something went wrong. Please try again.");
            outputStatus.textContent = "Unable to generate notes";
            setActionsEnabled(false);
        } finally {
            setLoading(false);
        }
    });

    // Copy
    copyButton.addEventListener("click", async () => {
        const text = getNotesText();
        if (!text) return;

        try {
            await navigator.clipboard.writeText(text);
            copyButton.textContent = "Copied!";
            setTimeout(() => {
                copyButton.textContent = "Copy";
            }, 1500);
        } catch {
            showError("Unable to copy automatically. Select the notes and copy them.");
        }
    });

    // Download TXT
    downloadButton.addEventListener("click", () => {
        const text = getNotesText();
        if (!text) return;

        const safeTopic = (topicInput.value.trim() || "AI_Study_Notes")
            .replace(/[^a-z0-9_-]/gi, "_")
            .slice(0, 60);

        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = `${safeTopic}_Notes.txt`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    });

    // Print / Save as PDF
    printButton.addEventListener("click", () => {
        if (getNotesText()) window.print();
    });

    setActionsEnabled(false);
});