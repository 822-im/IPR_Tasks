
"use strict";

const $ = id => document.getElementById(id);

const form = $("mindMapForm");
const topicInput = $("topic");
const syllabusInput = $("syllabus");
const sourceFile = $("sourceFile");
const uploadBox = $("uploadBox");
const fileInfo = $("fileInfo");
const fileName = $("fileName");
const removeFile = $("removeFile");
const detailLevel = $("detailLevel");
const branchCount = $("branchCount");
const generateButton = $("generateButton");
const buttonText = $("buttonText");
const errorMessage = $("errorMessage");
const wordCount = $("wordCount");

const svg = d3.select("#mindMap");
const canvas = d3.select("#mapCanvas");
const viewport = $("mapViewport");

const emptyState = $("emptyState");
const copyButton = $("copyButton");
const svgButton = $("svgButton");
const pngButton = $("pngButton");
const printButton = $("printButton");
const editButton = $("editButton");
const zoomIn = $("zoomIn");
const zoomOut = $("zoomOut");
const fitButton = $("fitButton");
const expandButton = $("expandButton");
const mapStats = $("mapStats");

const nodeDetails = $("nodeDetails");
const detailTitle = $("detailTitle");
const detailDescription = $("detailDescription");
const explainButton = $("explainButton");
const explanation = $("explanation");

let selectedFile = null;
let rootData = null;
let treeRoot = null;
let selectedNode = null;
let zoomBehavior = null;
let isGenerating = false;
let allExpanded = false;

const colors = [
    { fill: "#eee7ff", stroke: "#a78bfa", text: "#49318b" },
    { fill: "#e0f2fe", stroke: "#60a5fa", text: "#164e83" },
    { fill: "#dcfce7", stroke: "#4ade80", text: "#166534" },
    { fill: "#fef3c7", stroke: "#fbbf24", text: "#92400e" },
    { fill: "#fce7f3", stroke: "#f472b6", text: "#9d174d" },
    { fill: "#ccfbf1", stroke: "#2dd4bf", text: "#115e59" }
];

const SVG_NS = "http://www.w3.org/2000/svg";

// API key entered through the AI Classroom dashboard.
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

    $("themeToggle").textContent = dark ? "☀" : "☾";
    $("themeToggle").setAttribute(
        "aria-label",
        dark ? "Switch to light mode" : "Switch to dark mode"
    );
}

try {
    applyTheme(localStorage.getItem("ai_classroom_theme") === "dark");
} catch {
    applyTheme(false);
}

$("themeToggle").addEventListener("click", () => {
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
    const text = syllabusInput.value.trim();
    const count = text ? text.split(/\s+/).length : 0;
    wordCount.textContent = `${count} ${count === 1 ? "word" : "words"}`;
}

syllabusInput.addEventListener("input", updateWordCount);

// Error messages
function showError(message) {
    errorMessage.textContent = message;
}

function clearError() {
    errorMessage.textContent = "";
}

// Upload
function setSelectedFile(file) {
    clearError();
    if (!file) return;

    if (!/\.(pdf|docx|txt)$/i.test(file.name)) {
        showError("Please upload a PDF, DOCX or TXT file.");
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

uploadBox.addEventListener("dragover", event => {
    event.preventDefault();
    uploadBox.classList.add("dragover");
});

uploadBox.addEventListener("dragleave", () => {
    uploadBox.classList.remove("dragover");
});

uploadBox.addEventListener("drop", event => {
    event.preventDefault();
    uploadBox.classList.remove("dragover");
    setSelectedFile(event.dataTransfer.files[0]);
});

// Extract text from supported documents
async function extractFileText(file) {
    const extension = file.name.split(".").pop().toLowerCase();

    if (extension === "txt") {
        return (await file.text()).trim();
    }

    if (extension === "docx") {
        if (!window.mammoth) {
            throw new Error("DOCX support could not be loaded. Refresh the page.");
        }

        const result = await mammoth.extractRawText({
            arrayBuffer: await file.arrayBuffer()
        });

        return result.value.trim();
    }

    if (extension === "pdf") {
        if (!window.pdfjsLib) {
            throw new Error("PDF support could not be loaded. Refresh the page.");
        }

        pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        const pdf = await pdfjsLib.getDocument({
            data: new Uint8Array(await file.arrayBuffer())
        }).promise;

        const pages = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            pages.push(content.items.map(item => item.str).join(" "));
        }

        const text = pages.join("\n\n").trim();

        if (!text) {
            throw new Error(
                "No selectable text was found in this PDF. Try a text-based PDF or paste your syllabus."
            );
        }

        return text;
    }

    throw new Error("Unsupported file type.");
}

// AI prompt
function buildPrompt(topic, syllabus) {
    const levels = {
        simple: "Use a simple overview with two levels of hierarchy.",
        balanced: "Use a balanced hierarchy with two or three levels.",
        detailed: "Use a detailed hierarchy with up to four levels where useful."
    };

    return `
You are an expert academic tutor and mind-map designer.

Create a clear, accurate, useful hierarchical mind map.

CENTRAL TOPIC:
${topic || "Determine the central topic from the supplied syllabus."}

SYLLABUS OR STUDY MATERIAL:
${syllabus || "No syllabus supplied. Create a map based on the central topic."}

LEVEL OF DETAIL:
${levels[detailLevel.value]}

APPROXIMATE SUBTOPICS PER MAIN BRANCH:
${Number(branchCount.value)}

REQUIREMENTS:
- Use the given topic as the central node when one is provided.
- Organize the material into meaningful main branches.
- Preserve the supplied syllabus topics and their order where practical.
- Add relevant subtopics and short descriptions.
- Do not invent syllabus units or unsupported facts.
- Use concise node names suitable for a visual diagram.
- Keep the whole map below approximately 80 nodes.
- Include descriptions that help students understand each topic.
- Return valid JSON only. Do not use Markdown code fences.

Return this structure:
{
  "name": "Central topic",
  "description": "Brief explanation of the central topic",
  "children": [
    {
      "name": "Main branch",
      "description": "Brief explanation",
      "children": [
        {
          "name": "Subtopic",
          "description": "Brief explanation",
          "children": []
        }
      ]
    }
  ]
}
`;
}

// Parse and normalize AI response
function parseTree(responseText) {
    let text = responseText.trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "");

    let parsed;

    try {
        parsed = JSON.parse(text);
    } catch {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");

        if (start < 0 || end <= start) {
            throw new Error("The AI returned an invalid mind map. Please try again.");
        }

        try {
            parsed = JSON.parse(text.slice(start, end + 1));
        } catch {
            throw new Error("Could not read the mind map structure. Please try again.");
        }
    }

    if (Array.isArray(parsed)) {
        parsed = {
            name: topicInput.value.trim() || "Mind Map",
            children: parsed
        };
    }

    if (parsed && parsed.tree && !parsed.name) {
        parsed = parsed.tree;
    }

    function normalize(node, depth = 0) {
        if (depth > 8) return null;

        if (typeof node === "string") {
            return {
                name: node.slice(0, 100),
                description: "",
                children: []
            };
        }

        if (!node || typeof node !== "object") return null;

        const name = String(
            node.name || node.title || node.label || node.topic || ""
        ).trim();

        if (!name) return null;

        const children = Array.isArray(node.children)
            ? node.children
            : Array.isArray(node.subtopics)
                ? node.subtopics
                : Array.isArray(node.items)
                    ? node.items
                    : [];

        return {
            name: name.slice(0, 100),
            description: String(
                node.description || node.details || node.summary || ""
            ).slice(0, 1000),
            children: children
                .slice(0, 15)
                .map(child => normalize(child, depth + 1))
                .filter(Boolean)
        };
    }

    const result = normalize(parsed);

    if (!result || !result.children.length) {
        throw new Error("The AI did not return a usable mind map with subtopics.");
    }

    return result;
}

// Groq API request with model fallback
async function requestAI(prompt, apiKey, maxTokens = 7000) {
    const models = [
        "openai/gpt-oss-120b",
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "qwen/qwen3-32b"
    ];

    let lastError;

    for (const model of models) {
        let response;
        let data;

        try {
            response = await fetch(
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
                                content: "You are an accurate academic tutor. Follow the requested output format exactly."
                            },
                            { role: "user", content: prompt }
                        ],
                        temperature: 0.4,
                        max_tokens: maxTokens
                    })
                }
            );

            data = await response.json().catch(() => ({}));
        } catch (error) {
            throw new Error(
                "Could not connect to the AI service. Check your internet connection and try again."
            );
        }

        if (response.ok) {
            const content = data.choices?.[0]?.message?.content;

            if (!content) {
                throw new Error("The AI returned an empty response.");
            }

            return content.trim();
        }

        const message = data.error?.message ||
            `AI request failed (${response.status}).`;

        lastError = new Error(message);

        if (response.status === 401 || response.status === 403) {
            throw new Error(
                "Your Groq API key is invalid or does not have permission. Check the key in your dashboard."
            );
        }

        if (response.status === 429) {
            throw new Error(
                "The AI service rate limit was reached. Please wait a moment and try again."
            );
        }

        const modelUnavailable =
            response.status === 404 ||
            /model.*(not found|does not exist|decommissioned|access)/i.test(message);

        if (!modelUnavailable) {
            throw lastError;
        }
    }

    throw lastError || new Error("No available AI model could generate the mind map.");
}

// Count nodes
function countNodes(node) {
    return 1 + (node.children || []).reduce(
        (sum, child) => sum + countNodes(child), 0
    );
}

function countVisibleNodes(node) {
    return 1 + (node.children || []).reduce(
        (sum, child) => sum + countVisibleNodes(child), 0
    );
}

// Collapse and expand tree nodes
function collapse(node) {
    if (node.children?.length) {
        node._children = node.children;
        node.children = null;
    }
}

function expand(node) {
    if (node._children) {
        node.children = node._children;
        node._children = null;
    }

    (node.children || []).forEach(expand);
}

function nodeColor(depth) {
    return colors[depth % colors.length];
}

function nodeWidth(node) {
    if (node.depth === 0) return 205;
    if (node.depth === 1) return 190;
    return 180;
}

// Build tree and initially collapse deeper levels
function initializeTree(data) {
    treeRoot = d3.hierarchy(data, d => d.children);

    treeRoot.eachBefore(node => {
        if (node.depth >= 2 && node.children?.length) {
            collapse(node);
        }
    });

    selectedNode = treeRoot;
    allExpanded = false;

    renderTree();
    showNodeDetails(treeRoot);
}

// Render the complete mind map
function renderTree() {
    if (!treeRoot) return;

    const layout = d3.tree()
        .nodeSize([76, 245])
        .separation((a, b) => a.parent === b.parent ? 1 : 1.25);

    layout(treeRoot);

    const nodes = treeRoot.descendants();
    const links = treeRoot.links();

    const minX = d3.min(nodes, d => d.x) ?? 0;
    const maxX = d3.max(nodes, d => d.x) ?? 0;
    const maxY = d3.max(nodes, d => d.y) ?? 0;

    const margin = { top: 55, left: 35, right: 55, bottom: 55 };
    const mapWidth = Math.max(500, maxY + 250 + margin.left + margin.right);
    const mapHeight = Math.max(380, maxX - minX + margin.top + margin.bottom);

    svg.attr("viewBox", `0 0 ${mapWidth} ${mapHeight}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .attr("hidden", null);

    emptyState.hidden = true;

    const positioned = nodes.map(node => ({
        node,
        x: margin.left + node.y,
        y: margin.top + node.x - minX
    }));

    const positions = new Map(
        positioned.map(item => [item.node, item])
    );

    // Remove the previous drawing before creating the updated one.
    canvas.selectAll("*").remove();
    canvas.attr("transform", null);

    // Draw connecting lines from the edge of the source node.
    canvas.selectAll(".map-link")
        .data(links)
        .join("path")
        .attr("class", "map-link")
        .attr("d", link => {
            const source = positions.get(link.source);
            const target = positions.get(link.target);
            const startX = source.x + nodeWidth(link.source);
            const endX = target.x;
            const middleX = (startX + endX) / 2;

            return `M${startX},${source.y}
                    C${middleX},${source.y}
                     ${middleX},${target.y}
                     ${endX},${target.y}`;
        })
        .attr("stroke", link => nodeColor(link.target.depth).stroke);

    const groups = canvas.selectAll(".map-node")
        .data(positioned, item => {
            if (!item.node.data._mapId) {
                item.node.data._mapId =
                    "node-" + Math.random().toString(36).slice(2);
            }
            return item.node.data._mapId;
        })
        .join("g")
        .attr("class", item =>
            "map-node" +
            (selectedNode === item.node ? " selected" : "")
        )
        .attr("transform", item => `translate(${item.x},${item.y})`)
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", item => item.node.data.name)
        .on("click", (event, item) => {
            event.stopPropagation();
            selectedNode = item.node;
            renderTree();
            showNodeDetails(item.node);
        })
        .on("dblclick", (event, item) => {
            event.preventDefault();
            event.stopPropagation();
            toggleNode(item.node);
        })
        .on("keydown", (event, item) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectedNode = item.node;
                renderTree();
                showNodeDetails(item.node);
            }
        });

    groups.each(function(item) {
        const node = item.node;
        const group = d3.select(this);
        const root = node.depth === 0;
        const branch = node.depth === 1;
        const width = nodeWidth(node);
        const height = root ? 58 : branch ? 48 : 44;
        const color = nodeColor(node.depth);

        group.append("rect")
            .attr("x", 0)
            .attr("y", -height / 2)
            .attr("width", width)
            .attr("height", height)
            .attr("rx", root ? 15 : 11)
            .attr("fill", root ? "#7650d9" : color.fill)
            .attr("stroke", root ? "#7650d9" : color.stroke);

        const label = node.data.name;
        const maxChars = root ? 25 : 23;
        const words = label.split(/\s+/);
        const lines = [];
        let line = "";

        words.forEach(word => {
            const next = line ? `${line} ${word}` : word;

            if (next.length > maxChars && line) {
                lines.push(line);
                line = word;
            } else {
                line = next;
            }
        });

        if (line) lines.push(line);

        const shownLines = lines.slice(0, 2);
        const text = group.append("text")
            .attr("x", root ? width / 2 : 12)
            .attr("text-anchor", root ? "middle" : "start")
            .attr("fill", root ? "#ffffff" : color.text);

        const startY = shownLines.length === 1 ? 4 : -3;

        text.selectAll("tspan")
            .data(shownLines)
            .join("tspan")
            .attr("x", root ? width / 2 : 12)
            .attr("dy", (line, index) => index === 0 ? startY : 14)
            .text(line => line);

        const hiddenCount = node._children?.length || 0;
        const visibleCount = node.children?.length || 0;

        if (hiddenCount || visibleCount) {
            group.append("circle")
                .attr("cx", width - 12)
                .attr("cy", -height / 2 + 4)
                .attr("r", 9)
                .attr("fill", root ? "#ffffff" : color.stroke);

            group.append("text")
                .attr("class", "node-count")
                .attr("x", width - 12)
                .attr("y", -height / 2 + 7.5)
                .attr("text-anchor", "middle")
                .attr("fill", root ? "#7650d9" : "#ffffff")
                .text(hiddenCount ? "+" : "−");
        }
    });

    mapStats.textContent =
        `${countVisibleNodes(treeRoot)} visible · ${countNodes(rootData)} total topics`;

    [
        copyButton, svgButton, pngButton, printButton,
        zoomIn, zoomOut, fitButton, expandButton
    ].forEach(button => {
        button.disabled = false;
    });

    editButton.hidden = false;
    expandButton.textContent = allExpanded ? "Collapse all" : "Expand all";

    // Keep zoom behavior attached after each render.
    if (zoomBehavior) {
        svg.call(zoomBehavior);
    }
}

// Expand or collapse an individual node
function toggleNode(node) {
    if (node.children?.length) {
        node._children = node.children;
        node.children = null;
    } else if (node._children?.length) {
        node.children = node._children;
        node._children = null;
    }

    renderTree();
}

// Selected node details
function showNodeDetails(node) {
    nodeDetails.hidden = false;
    detailTitle.textContent = node.data.name;
    detailDescription.textContent =
        node.data.description || "No additional description is available for this topic.";

    explanation.hidden = true;
    explanation.textContent = "";
}

// Zoom and pan
function enableZoom() {
    if (!zoomBehavior) {
        zoomBehavior = d3.zoom()
            .scaleExtent([0.25, 4])
            .on("zoom", event => {
                canvas.attr("transform", event.transform);
            });
    }

    svg.call(zoomBehavior);
}

function fitMap() {
    if (!treeRoot || !zoomBehavior) return;

    // The viewBox already contains the entire layout.
    // Resetting zoom makes the complete map visible again.
    svg.transition()
        .duration(250)
        .call(zoomBehavior.transform, d3.zoomIdentity);
}

zoomIn.addEventListener("click", () => {
    if (zoomBehavior) {
        svg.transition().duration(180).call(zoomBehavior.scaleBy, 1.25);
    }
});

zoomOut.addEventListener("click", () => {
    if (zoomBehavior) {
        svg.transition().duration(180).call(zoomBehavior.scaleBy, 0.8);
    }
});

fitButton.addEventListener("click", fitMap);

expandButton.addEventListener("click", () => {
    if (!treeRoot) return;

    if (allExpanded) {
        treeRoot.children?.forEach(collapse);
        allExpanded = false;
    } else {
        expand(treeRoot);
        allExpanded = true;
    }

    renderTree();
    fitMap();
});

$("closeDetails").addEventListener("click", () => {
    nodeDetails.hidden = true;
});

// Generate mind map
form.addEventListener("submit", async event => {
    event.preventDefault();
    clearError();

    if (isGenerating) return;

    const topic = topicInput.value.trim();
    let syllabus = syllabusInput.value.trim();

    if (!topic && !syllabus && !selectedFile) {
        showError("Enter a topic, paste your syllabus or upload a file.");
        return;
    }

    const apiKey = getApiKey();

    if (!apiKey) {
        showError(
            "Groq API key not found. Add your key through the AI Classroom dashboard and try again."
        );
        return;
    }

    isGenerating = true;
    generateButton.disabled = true;
    buttonText.textContent = "Generating...";
    emptyState.hidden = false;
    emptyState.innerHTML = `
        <div class="spinner"></div>
        <strong>Creating your mind map...</strong>
        <span>Organizing your material into connected topics.</span>
    `;
    svg.attr("hidden", true);
    nodeDetails.hidden = true;

    [
        copyButton, svgButton, pngButton, printButton,
        zoomIn, zoomOut, fitButton, expandButton
    ].forEach(button => {
        button.disabled = true;
    });

    try {
        if (selectedFile) {
            buttonText.textContent = "Reading document...";
            const extracted = await extractFileText(selectedFile);
            syllabus = [syllabus, extracted].filter(Boolean).join("\n\n");
        }

        if (syllabus.length > 40000) {
            syllabus = syllabus.slice(0, 40000);
        }

        buttonText.textContent = "Generating map...";
        const prompt = buildPrompt(topic, syllabus);
        const response = await requestAI(prompt, apiKey);
        rootData = parseTree(response);

        initializeTree(rootData);
        enableZoom();
        fitMap();
    } catch (error) {
        console.error("Mind map generation error:", error);

        svg.attr("hidden", true);
        emptyState.hidden = false;
        emptyState.innerHTML = `
            <div class="empty-icon">!</div>
            <h3>Couldn't generate your mind map</h3>
            <p>Check the error message and try again.</p>
        `;

        showError(error.message || "Something went wrong. Please try again.");
    } finally {
        isGenerating = false;
        generateButton.disabled = false;
        buttonText.textContent = "Generate Mind Map";
    }
});

// Text outline for copying
function toOutline(node, depth = 0) {
    let result = `${"  ".repeat(depth)}- ${node.data.name}\n`;

    (node.children || []).forEach(child => {
        result += toOutline(child, depth + 1);
    });

    (node._children || []).forEach(child => {
        result += toOutline(child, depth + 1);
    });

    return result;
}

copyButton.addEventListener("click", async () => {
    if (!treeRoot) return;

    try {
        await navigator.clipboard.writeText(toOutline(treeRoot));
        copyButton.textContent = "Copied!";
        setTimeout(() => {
            copyButton.textContent = "Copy";
        }, 1500);
    } catch {
        showError("Could not copy the mind map. Allow clipboard access and try again.");
    }
});

// Export SVG without the current zoom transformation
function makeExportSVG() {
    if (!treeRoot) {
        throw new Error("Generate a mind map before exporting.");
    }

    const original = svg.node().cloneNode(true);
    const originalCanvas = original.querySelector("#mapCanvas");

    if (!originalCanvas) {
        throw new Error("The mind map is not ready to export.");
    }

    original.removeAttribute("hidden");
    originalCanvas.removeAttribute("transform");

    const viewBox = svg.attr("viewBox");
    original.setAttribute("viewBox", viewBox);

    const [x, y, width, height] = viewBox.split(/\s+/).map(Number);
    original.setAttribute("width", width);
    original.setAttribute("height", height);

    original.querySelectorAll(".map-node.selected").forEach(node => {
        node.classList.remove("selected");
    });

    original.querySelectorAll(".map-node").forEach(node => {
        node.removeAttribute("tabindex");
        node.removeAttribute("role");
    });

    const style = document.createElementNS(SVG_NS, "style");
    style.textContent = `
        .map-link { fill:none; stroke:#bba9e9; stroke-width:2; }
        .map-node text {
            font-family:Arial,sans-serif;
            font-size:12px;
            font-weight:600;
        }
    `;
    original.insertBefore(style, original.firstChild);

    const background = document.createElementNS(SVG_NS, "rect");
    background.setAttribute("x", x);
    background.setAttribute("y", y);
    background.setAttribute("width", width);
    background.setAttribute("height", height);
    background.setAttribute("fill", "#ffffff");
    original.insertBefore(background, originalCanvas);

    return original;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilename() {
    return (topicInput.value.trim() || "mind_map")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\s+/g, "_")
        .slice(0, 70);
}

// Download SVG
svgButton.addEventListener("click", () => {
    try {
        const exported = makeExportSVG();
        const source = new XMLSerializer().serializeToString(exported);

        downloadBlob(
            new Blob([source], { type: "image/svg+xml;charset=utf-8" }),
            `${safeFilename()}.svg`
        );
    } catch (error) {
        showError("SVG export failed: " + error.message);
    }
});

// Download PNG
pngButton.addEventListener("click", () => {
    let url;

    try {
        const exported = makeExportSVG();
        const source = new XMLSerializer().serializeToString(exported);
        const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });

        url = URL.createObjectURL(blob);
        const image = new Image();

        image.onload = () => {
            const width = Number(exported.getAttribute("width"));
            const height = Number(exported.getAttribute("height"));
            const scale = Math.min(2, 4096 / Math.max(width, height));

            const output = document.createElement("canvas");
            output.width = Math.ceil(width * scale);
            output.height = Math.ceil(height * scale);

            const context = output.getContext("2d");
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, output.width, output.height);
            context.drawImage(image, 0, 0, output.width, output.height);

            output.toBlob(png => {
                if (png) {
                    downloadBlob(png, `${safeFilename()}.png`);
                } else {
                    showError("PNG export failed. Please try SVG instead.");
                }
                URL.revokeObjectURL(url);
            }, "image/png");
        };

        image.onerror = () => {
            URL.revokeObjectURL(url);
            showError("Could not convert the mind map to PNG.");
        };

        image.src = url;
    } catch (error) {
        if (url) URL.revokeObjectURL(url);
        showError("PNG export failed: " + error.message);
    }
});

// Print or save as PDF
printButton.addEventListener("click", () => {
    if (!treeRoot) {
        showError("Generate a mind map before printing.");
        return;
    }

    if (zoomBehavior) {
        svg.call(zoomBehavior.transform, d3.zoomIdentity);
    }

    window.print();
});

// Explain the selected topic with AI
explainButton.addEventListener("click", async () => {
    clearError();

    if (!selectedNode) return;

    const apiKey = getApiKey();

    if (!apiKey) {
        showError("Groq API key not found. Add it through the dashboard.");
        return;
    }

    const nodeName = selectedNode.data.name;
    const description = selectedNode.data.description;
    const parentName = selectedNode.parent?.data.name || "Central topic";

    explainButton.disabled = true;
    explainButton.textContent = "Explaining...";
    explanation.hidden = false;
    explanation.textContent = "Preparing a clear explanation...";

    try {
        const prompt = `
Explain this academic mind-map topic to a student.

Central topic: ${rootData.name}
Parent topic: ${parentName}
Selected topic: ${nodeName}
Existing description: ${description || "None"}

Provide:
- A simple definition
- Important key points
- One useful example, if appropriate

Keep the explanation accurate and student-friendly.
Use short headings and plain text.
`;

        const answer = await requestAI(prompt, apiKey, 1200);
        explanation.textContent = answer;
    } catch (error) {
        explanation.textContent = "";
        explanation.hidden = true;
        showError(error.message || "Could not generate the explanation.");
    } finally {
        explainButton.disabled = false;
        explainButton.textContent = "Explain with AI";
    }
});

// Return to input section
editButton.addEventListener("click", () => {
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    topicInput.focus({ preventScroll: true });
});

// Initial state
updateWordCount();