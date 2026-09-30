
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const $ = id => document.getElementById(id);

    const apiKey = sessionStorage.getItem("AI_CLASSROOM_API_KEY");
    const selectedTask = sessionStorage.getItem("AI_CLASSROOM_SELECTED_TASK");

    if (!apiKey || selectedTask !== "1") {
        window.location.replace("../../index.html");
        return;
    }

    const tabs = document.querySelectorAll(".tab");
    const builderPanel = $("builderPanel");
    const analyzerPanel = $("analyzerPanel");
    const builderGrid = $("builderGrid");
    const builderFormCard = $("builderFormCard");
    const builderForm = $("builderForm");
    const analyzerForm = $("analyzerForm");
    const resumePreview = $("resumePreview");
    const previewCard = $("previewCard");

    const buildButton = $("buildButton");
    const analyzeButton = $("analyzeButton");
    const builderFile = $("existingResume");
    const autofillButton = $("autofillResume");

    let currentResume = "";

    // Theme
    function applyTheme(theme) {
        const dark = theme === "dark";
        document.body.classList.toggle("dark", dark);

        const toggle = $("themeToggle");
        if (toggle) {
            toggle.textContent = dark ? "☀" : "☾";
            toggle.setAttribute(
                "aria-label",
                dark ? "Switch to light mode" : "Switch to dark mode"
            );
        }
    }

    applyTheme(sessionStorage.getItem("AI_CLASSROOM_THEME") || "light");

    $("themeToggle")?.addEventListener("click", () => {
        const next = document.body.classList.contains("dark")
            ? "light"
            : "dark";

        sessionStorage.setItem("AI_CLASSROOM_THEME", next);
        applyTheme(next);
    });

    // Tabs
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const isBuilder = tab.dataset.tab === "builder";

            tabs.forEach(item => {
                const active = item === tab;
                item.classList.toggle("active", active);
                item.setAttribute("aria-selected", String(active));
            });

            builderPanel.hidden = !isBuilder;
            analyzerPanel.hidden = isBuilder;
        });
    });

    // Messages and helpers
    function showMessage(element, message) {
        if (element) element.textContent = message;
    }

    function setLoading(button, textElement, loading, text) {
        if (!button) return;

        button.disabled = loading;

        if (textElement) {
            textElement.textContent = loading ? "Please wait..." : text;
        }
    }

    function getField(id) {
        return $(id)?.value?.trim() || "";
    }

    function setField(id, value) {
        const element = $(id);

        if (element && typeof value === "string") {
            element.value = value;
        }
    }

    // AI API: supports Groq and OpenAI keys
    async function callAI(instructions, input) {
        const isGroq = apiKey.startsWith("gsk_");

        const url = isGroq
            ? "https://api.groq.com/openai/v1/chat/completions"
            : "https://api.openai.com/v1/responses";

        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        };

        const body = isGroq
            ? {
                model: "openai/gpt-oss-120b",
                messages: [
                    {
                        role: "system",
                        content: instructions
                    },
                    {
                        role: "user",
                        content: input
                    }
                ],
                temperature: 0.3,
                max_completion_tokens: 4096
            }
            : {
                model: "gpt-4.1-mini",
                instructions,
                input
            };

        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(body)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            let error = data.error?.message ||
                `AI request failed (${response.status}).`;

            // Never expose the API key in an error message.
            error = error.split(apiKey).join("[hidden API key]");

            if (response.status === 401) {
                throw new Error(
                    "Invalid API key. Check your Groq or OpenAI API key."
                );
            }

            if (response.status === 403) {
                throw new Error(
                    "API access denied. Check your key permissions."
                );
            }

            if (response.status === 429) {
                throw new Error(
                    "API rate limit or quota reached. Try again later."
                );
            }

            if (response.status === 404 && isGroq) {
                throw new Error(
                    "The Groq model is unavailable. Check the model " +
                    "name and your account's model access."
                );
            }

            throw new Error(error);
        }

        let result = "";

        if (isGroq) {
            result = data.choices?.[0]?.message?.content?.trim() || "";
        } else {
            result = (data.output || [])
                .flatMap(item => item.content || [])
                .filter(item => item.type === "output_text")
                .map(item => item.text)
                .join("\n")
                .trim();
        }

        if (!result) {
            throw new Error("The AI returned an empty response.");
        }

        return result;
    }

    // File handling
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    const SUPPORTED_EXTENSIONS = ["pdf", "docx", "txt"];

    function getExtension(file) {
        return file.name.split(".").pop().toLowerCase();
    }

    function validateFile(file) {
        if (!file) {
            throw new Error("Please select a file.");
        }

        if (file.size > MAX_FILE_SIZE) {
            throw new Error("The file must be 10 MB or smaller.");
        }

        if (!SUPPORTED_EXTENSIONS.includes(getExtension(file))) {
            throw new Error("Please upload a PDF, DOCX or TXT file.");
        }
    }

    // Extract text from supported files
    async function extractText(file) {
        validateFile(file);

        const extension = getExtension(file);

        if (extension === "txt") {
            return await file.text();
        }

        if (extension === "docx") {
            if (!window.mammoth) {
                throw new Error(
                    "DOCX reader failed to load. Refresh the page."
                );
            }

            const result = await window.mammoth.extractRawText({
                arrayBuffer: await file.arrayBuffer()
            });

            return result.value;
        }

        if (extension === "pdf") {
            if (!window.pdfjsLib) {
                throw new Error(
                    "PDF reader failed to load. Refresh the page."
                );
            }

            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

            const pdf = await window.pdfjsLib.getDocument({
                data: new Uint8Array(await file.arrayBuffer())
            }).promise;

            const pages = [];

            for (
                let pageNumber = 1;
                pageNumber <= pdf.numPages;
                pageNumber++
            ) {
                const page = await pdf.getPage(pageNumber);
                const content = await page.getTextContent();

                pages.push(
                    content.items.map(item => item.str).join(" ")
                );
            }

            return pages.join("\n\n");
        }

        throw new Error("Unsupported file format.");
    }

    async function getResumeInput(file, prompt) {
        const text = await extractText(file);

        if (!text.trim()) {
            throw new Error(
                "No selectable text was found. Scanned PDFs may need OCR."
            );
        }

        return {
            input: `${prompt}\n\nRESUME CONTENT:\n${text.slice(0, 45000)}`,
            resumeText: text
        };
    }
    
// Format the generated resume into a clean, professional layout.
function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function formatResume(resume) {
    const lines = resume.replace(/\r/g, "").split("\n");
    const sections = [
        "PROFESSIONAL SUMMARY", "SUMMARY", "OBJECTIVE",
        "EDUCATION", "TECHNICAL SKILLS", "SKILLS",
        "EXPERIENCE", "WORK EXPERIENCE", "INTERNSHIPS",
        "PROJECTS", "CERTIFICATIONS",
        "CERTIFICATIONS AND ACHIEVEMENTS", "ACHIEVEMENTS",
        "AWARDS", "PUBLICATIONS", "LANGUAGES"
    ];

    const inline = text => escapeHTML(text)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`([^`]+)`/g, "<code>$1</code>");

    let html = "";
    let listOpen = false;
    let firstLine = true;

    const closeList = () => {
        if (listOpen) {
            html += "</ul>";
            listOpen = false;
        }
    };

    for (const raw of lines) {
        const line = raw.trim();
        if (!line || /^-{3,}$/.test(line)) {
            closeList();
            continue;
        }

        const heading = line.match(/^#{1,3}\s+(.+)$/);
        const content = (heading ? heading[1] : line)
            .replace(/^\*\*(.*?)\*\*$/, "$1").trim();

        const normalized = content
            .replace(/[*_]/g, "")
            .replace(/:$/, "")
            .trim()
            .toUpperCase();

        if (firstLine) {
            closeList();
            html += `<h1 style="font-size:25px;text-align:center;margin:0 0 8px;color:#20243a;">${inline(content)}</h1>`;
            firstLine = false;
            continue;
        }

        if (heading || sections.includes(normalized)) {
            closeList();
            html += `<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#4338a8;border-bottom:1px solid #dfe3ec;padding-bottom:5px;margin:20px 0 8px;">${inline(content)}</h2>`;
            continue;
        }

        const bullet = line.match(/^(?:[-*•]\s+|\d+[.)]\s+)(.+)$/);
        if (bullet) {
            if (!listOpen) {
                html += '<ul style="margin:5px 0 10px;padding-left:22px;">';
                listOpen = true;
            }
            html += `<li style="font-size:12px;line-height:1.6;margin-bottom:5px;">${inline(bullet[1])}</li>`;
            continue;
        }

        closeList();

        const contact = /@|linkedin\.com|github\.com/i.test(line);
        html += `<p style="font-size:12px;line-height:1.55;margin:${contact ? "2px" : "5px"} 0;color:#283044;">${inline(line)}</p>`;
    }

    closeList();

    return `<div class="resume-document" style="max-width:820px;margin:auto;padding:30px 38px;background:white;color:#20243a;font-family:Arial,sans-serif;line-height:1.55;">${html}</div>`;
}

    // Show generated resume in full-width view
    function showGeneratedResume() {
        builderFormCard.hidden = true;
        previewCard.hidden = false;
        builderGrid.classList.add("generated-view");

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }

    // Return to the form
    function editResume() {
        previewCard.hidden = true;
        builderFormCard.hidden = false;
        builderGrid.classList.remove("generated-view");

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }

    $("editResume")?.addEventListener("click", editResume);

    // Generate resume
    builderForm.addEventListener("submit", async event => {
        event.preventDefault();

        const error = $("builderError");
        showMessage(error, "");

        if (!builderForm.reportValidity()) return;

        const fields = {
            name: getField("fullName"),
            email: getField("email"),
            phone: getField("phone"),
            location: getField("location"),
            linkedin: getField("linkedin"),
            role: getField("targetRole"),
            education: getField("education"),
            skills: getField("skills"),
            experience: getField("experience"),
            projects: getField("projects"),
            certifications: getField("certifications"),
            jobDescription: getField("jobDescription")
        };

        if (!fields.name || !fields.email || !fields.role) {
            showMessage(
                error,
                "Please provide your name, email and target job role."
            );
            return;
        }

        const input = `
Create a resume using the following candidate information.

PERSONAL INFORMATION
Name: ${fields.name}
Email: ${fields.email}
Phone: ${fields.phone || "Not provided"}
Location: ${fields.location || "Not provided"}
LinkedIn/Portfolio: ${fields.linkedin || "Not provided"}

TARGET ROLE
${fields.role}

EDUCATION
${fields.education || "Not provided"}

TECHNICAL SKILLS
${fields.skills || "Not provided"}

EXPERIENCE
${fields.experience || "Not provided"}

PROJECTS
${fields.projects || "Not provided"}

CERTIFICATIONS AND ACHIEVEMENTS
${fields.certifications || "Not provided"}

JOB DESCRIPTION
${fields.jobDescription || "Not provided"}
`;

        const instructions = `
You are a professional resume writer and career-document editor.

Create a professional, ATS-friendly resume.

Follow these guidelines:
- Use a simple, single-column layout.
- Put the most relevant information first.
- Use standard section headings.
- Use action-oriented and concise bullet points.
- Tailor the content to the target role and job description.
- Use reverse chronological order when dates are available.
- Keep the resume readable and professional.
- Avoid tables, graphics, icons and unnecessary decoration.
- Use relevant keywords naturally.
- Include measurable achievements only when supported by facts.
- Omit empty sections.
- Do not invent employers, dates, qualifications,
  certifications, skills, achievements or metrics.
- Do not add information that the candidate has not supplied.
- Use plain text with clear section headings.
- Keep the resume concise and suitable for a professional CV.

Return only the resume text, starting with the candidate's name.
`;

        setLoading(
            buildButton,
            $("buildButtonText"),
            true,
            "Generate Resume"
        );

        showMessage(error, "Creating your resume. Please wait.");

        try {
            currentResume = await callAI(instructions, input);
            resumePreview.innerHTML = formatResume(currentResume);

            $("copyResume").disabled = false;
            $("printResume").disabled = false;

            showGeneratedResume();
            showMessage(error, "");
        } catch (err) {
            showMessage(
                error,
                err.message || "Unable to generate resume."
            );
        } finally {
            setLoading(
                buildButton,
                $("buildButtonText"),
                false,
                "Generate Resume"
            );
        }
    });

    // Autofill from an uploaded resume
    async function autofillResume() {
        const error = $("uploadError");
        showMessage(error, "");

        const file = builderFile.files[0];

        try {
            validateFile(file);
        } catch (err) {
            showMessage(error, err.message);
            return;
        }

        setLoading(
            autofillButton,
            $("autofillText"),
            true,
            "Extract details & fill form"
        );

        try {
            const prompt = `
Extract the candidate's information from this resume.

Return ONLY a valid JSON object with these keys:
{
  "name": "",
  "email": "",
  "phone": "",
  "location": "",
  "linkedin": "",
  "role": "",
  "education": "",
  "skills": "",
  "experience": "",
  "projects": "",
  "certifications": ""
}

Instructions:
- Extract only information actually present in the resume.
- Preserve qualifications and dates.
- Do not invent missing details.
- Use an empty string for missing fields.
- Return valid JSON only, without Markdown fences.
`;

            const prepared = await getResumeInput(file, prompt);

            const raw = await callAI(
                "Extract resume information into valid JSON. " +
                "Never fabricate details.",
                prepared.input
            );

            const cleaned = raw
                .replace(/^```(?:json)?\s*/i, "")
                .replace(/\s*```$/, "")
                .trim();

            let data;

            try {
                data = JSON.parse(cleaned);
            } catch {
                const start = cleaned.indexOf("{");
                const end = cleaned.lastIndexOf("}");

                if (start === -1 || end <= start) {
                    throw new Error(
                        "The AI could not extract the resume information."
                    );
                }

                data = JSON.parse(cleaned.slice(start, end + 1));
            }

            const mappings = {
                name: "fullName",
                email: "email",
                phone: "phone",
                location: "location",
                linkedin: "linkedin",
                role: "targetRole",
                education: "education",
                skills: "skills",
                experience: "experience",
                projects: "projects",
                certifications: "certifications"
            };

            let filledCount = 0;

            Object.entries(mappings).forEach(([key, id]) => {
                if (typeof data[key] === "string" && data[key].trim()) {
                    setField(id, data[key].trim());
                    filledCount++;
                }
            });

            if (!filledCount) {
                throw new Error(
                    "No usable information could be extracted."
                );
            }

            showMessage(
                error,
                `Successfully filled ${filledCount} fields. ` +
                "Review them before generating."
            );
        } catch (err) {
            showMessage(
                error,
                err.message || "Unable to extract resume details."
            );
        } finally {
            setLoading(
                autofillButton,
                $("autofillText"),
                false,
                "Extract details & fill form"
            );
        }
    }

    autofillButton.addEventListener("click", autofillResume);

    // Clear form
    $("clearForm").addEventListener("click", () => {
        builderForm.reset();
        builderFile.value = "";

        showMessage($("builderError"), "");
        showMessage($("uploadError"), "");

        currentResume = "";
        resumePreview.textContent = "";

        $("copyResume").disabled = true;
        $("printResume").disabled = true;

        editResume();
    });

    // Analyze resume
    analyzerForm.addEventListener("submit", async event => {
        event.preventDefault();

        const error = $("analysisError");
        showMessage(error, "");

        const file = $("resumeFile").files[0];
        const role = getField("analysisRole");
        const jobDescription = getField("analysisJD");

        try {
            validateFile(file);
        } catch (err) {
            showMessage(error, err.message);
            return;
        }

        setLoading(
            analyzeButton,
            $("analyzeButtonText"),
            true,
            "Analyze Resume"
        );

        $("analysisOutput").textContent =
            "Reading and assessing your resume...";

        $("copyAnalysis").disabled = true;

        try {
            const prompt = `
Review this resume using professional resume-writing principles.

TARGET ROLE: ${role || "Not specified"}

JOB DESCRIPTION:
${jobDescription || "Not supplied"}

Assess:
1. Content and relevant sections.
2. Achievement descriptions and evidence.
3. ATS-friendly structure and readability.
4. Relevance to the target role.
5. Clarity, grammar and consistency.
6. Completeness and contact information.

Provide an advisory score from 0 to 100 for each dimension
and a weighted overall advisory score, using these weights:
Content 20%, Achievements 20%, ATS 20%, Relevance 20%,
Readability 10%, Completeness 10%.

Include:
- Overall advisory score and limitations.
- Score breakdown.
- Content and formatting issues.
- ATS parsing concerns evident from the supplied content.
- Missing or weak sections.
- Grammar and wording suggestions.
- Relevant job-description keywords, if provided.
- Three to five practical improvements.
- Improved bullet examples where sufficient information exists.

Never invent missing accomplishments or metrics.
Do not guarantee ATS success, interviews or job offers.
`;

            const prepared = await getResumeInput(file, prompt);

            const report = await callAI(
                "You are a professional resume reviewer. " +
                "Give a detailed, evidence-based assessment. " +
                "Never fabricate resume details.",
                prepared.input
            );

            $("analysisOutput").textContent = report;
            $("copyAnalysis").disabled = false;
        } catch (err) {
            $("analysisOutput").textContent = "";

            showMessage(
                error,
                err.message || "Unable to analyze resume."
            );
        } finally {
            setLoading(
                analyzeButton,
                $("analyzeButtonText"),
                false,
                "Analyze Resume"
            );
        }
    });

    // Copy generated resume or analysis
    async function copyText(text, button, originalLabel, errorElement) {
        if (!text.trim()) return;

        try {
            await navigator.clipboard.writeText(text);

            button.textContent = "Copied!";

            setTimeout(() => {
                button.textContent = originalLabel;
            }, 1500);
        } catch {
            showMessage(
                errorElement,
                "Copy failed. Select the text and copy it manually."
            );
        }
    }

    $("copyResume").addEventListener("click", () => {
        copyText(
            resumePreview.innerText || "",
            $("copyResume"),
            "Copy",
            $("builderError")
        );
    });

    $("copyAnalysis").addEventListener("click", () => {
        copyText(
            $("analysisOutput").innerText || "",
            $("copyAnalysis"),
            "Copy report",
            $("analysisError")
        );
    });

    // Keep copy and print enabled when the resume is edited
    resumePreview.addEventListener("input", () => {
        currentResume = resumePreview.innerText.trim();

        $("copyResume").disabled = !currentResume;
        $("printResume").disabled = !currentResume;
    });

    // Print or save as PDF
    $("printResume").addEventListener("click", () => {
        if (currentResume.trim()) {
            window.print();
        }
    });
});