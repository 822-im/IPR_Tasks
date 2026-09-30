
const $ = id => document.getElementById(id);

const imageInput = $("imageInput");
const uploadArea = $("uploadArea");
const previewBox = $("previewBox");
const preview = $("preview");
const fileName = $("fileName");
const fileSize = $("fileSize");
const removeBtn = $("removeBtn");
const extractBtn = $("extractBtn");
const ocrStatus = $("ocrStatus");
const ocrText = $("ocrText");
const wordCount = $("wordCount");
const copyBtn = $("copyBtn");
const clearBtn = $("clearBtn");
const message = $("message");
const themeBtn = $("themeBtn");

let selectedImage = null;
let imageURL = null;
let isExtracting = false;

const MAX_SIZE = 15 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

// Display status messages
function showMessage(text, type = "") {
  message.textContent = text;
  message.className = "message " + type;
}

// Update word count and copy button
function updateWordCount() {
  const words = ocrText.value.trim().match(/\S+/g) || [];

  wordCount.textContent =
    `${words.length} ${words.length === 1 ? "word" : "words"}`;

  copyBtn.disabled = words.length === 0;
}

ocrText.addEventListener("input", updateWordCount);

// Validate and display image
function showImage(file) {
  if (!file) return;

  if (!TYPES.includes(file.type)) {
    showMessage("Please choose a JPG, PNG or WEBP image.", "error");
    imageInput.value = "";
    return;
  }

  if (file.size > MAX_SIZE) {
    showMessage("Image must be 15 MB or smaller.", "error");
    imageInput.value = "";
    return;
  }

  if (imageURL) {
    URL.revokeObjectURL(imageURL);
  }

  selectedImage = file;
  imageURL = URL.createObjectURL(file);

  preview.src = imageURL;
  fileName.textContent = file.name;
  fileSize.textContent =
    (file.size / 1024 / 1024).toFixed(2) + " MB";

  // Hide upload area and display image preview
  uploadArea.hidden = true;
  previewBox.hidden = false;

  extractBtn.disabled = false;
  ocrStatus.textContent = "Image ready for OCR";

  ocrText.value = "";
  updateWordCount();
  showMessage("");
}

// Handle file selection
imageInput.addEventListener("change", event => {
  showImage(event.target.files[0]);
});

// Remove selected image
function removeImage() {
  if (isExtracting) return;

  if (imageURL) {
    URL.revokeObjectURL(imageURL);
    imageURL = null;
  }

  selectedImage = null;
  preview.removeAttribute("src");
  imageInput.value = "";

  previewBox.hidden = true;
  uploadArea.hidden = false;

  extractBtn.disabled = true;
  ocrStatus.textContent = "Select a photo to get started.";

  showMessage("");
}

removeBtn.addEventListener("click", removeImage);

// Drag and drop support
uploadArea.addEventListener("dragover", event => {
  event.preventDefault();
  uploadArea.style.borderColor = "var(--accent)";
});

uploadArea.addEventListener("dragleave", () => {
  uploadArea.style.borderColor = "";
});

uploadArea.addEventListener("drop", event => {
  event.preventDefault();
  uploadArea.style.borderColor = "";

  const file = event.dataTransfer.files[0];

  if (file) {
    showImage(file);
  }
});

// Extract text using Tesseract OCR
extractBtn.addEventListener("click", async () => {
  if (!selectedImage || isExtracting) return;

  if (!window.Tesseract) {
    showMessage(
      "OCR library failed to load. Check your internet connection.",
      "error"
    );
    return;
  }

  isExtracting = true;
  extractBtn.disabled = true;
  removeBtn.disabled = true;
  extractBtn.textContent = "Extracting...";
  ocrStatus.textContent = "Reading your notes...";
  showMessage("");

  let worker;

  try {
    worker = await Tesseract.createWorker("eng");

    const { data } = await worker.recognize(selectedImage);
    const extractedText = data.text.trim();

    if (!extractedText) {
      throw new Error("No text found. Try a clearer photo.");
    }

    ocrText.value = extractedText;
    updateWordCount();

    ocrStatus.textContent = "Text extracted successfully";
    showMessage(
      "Text is ready to edit or copy.",
      "success"
    );
  } catch (error) {
    console.error("OCR error:", error);

    ocrStatus.textContent = "Extraction failed";
    showMessage(
      error.message || "Unable to extract text.",
      "error"
    );
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch (error) {
        console.warn("Worker cleanup failed:", error);
      }
    }

    isExtracting = false;
    extractBtn.disabled = !selectedImage;
    removeBtn.disabled = false;
    extractBtn.textContent = "⌕ Extract text";
  }
});

// Copy extracted text
copyBtn.addEventListener("click", async () => {
  const text = ocrText.value.trim();

  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    showMessage("Text copied successfully.", "success");
  } catch (error) {
    // Fallback for browsers without clipboard access
    ocrText.focus();
    ocrText.select();

    try {
      const copied = document.execCommand("copy");

      if (!copied) {
        throw new Error("Copy failed");
      }

      showMessage("Text copied successfully.", "success");
    } catch {
      showMessage(
        "Unable to copy. Please copy the text manually.",
        "error"
      );
    }
  }
});

// Clear extracted text
clearBtn.addEventListener("click", () => {
  ocrText.value = "";
  updateWordCount();
  showMessage("Text cleared.");
});

// Toggle dark mode
themeBtn.addEventListener("click", () => {
  const dark = document.body.classList.toggle("dark");

  themeBtn.textContent = dark ? "☀" : "☾";
  themeBtn.setAttribute(
    "aria-label",
    dark ? "Switch to light mode" : "Switch to dark mode"
  );
});