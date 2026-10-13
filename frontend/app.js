// ReelSave Frontend Logic
document.addEventListener("DOMContentLoaded", () => {
    // Determine Backend API Base URL from .env (Vite) with fallback
    const envApiBase = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL)
        ? import.meta.env.VITE_API_BASE_URL
        : null;

    const API_BASE = envApiBase || (
        (window.location.origin.includes(":8000") || (window.location.protocol.startsWith("http") && !window.location.port))
            ? window.location.origin
            : "http://127.0.0.1:8000"
    );

    // DOM Elements
    const reelUrlInput = document.getElementById("reelUrlInput");
    const pasteBtn = document.getElementById("pasteBtn");
    const clearBtn = document.getElementById("clearBtn");
    const fetchBtn = document.getElementById("fetchBtn");
    const btnText = fetchBtn.querySelector(".btn-text");
    const btnLoader = fetchBtn.querySelector(".btn-loader");

    const apiStatusText = document.getElementById("apiStatusText");
    const errorBanner = document.getElementById("errorBanner");
    const errorTitle = document.getElementById("errorTitle");
    const errorMessage = document.getElementById("errorMessage");
    const closeErrorBtn = document.getElementById("closeErrorBtn");

    const resultCard = document.getElementById("resultCard");
    const videoPreview = document.getElementById("videoPreview");
    const thumbnailPreview = document.getElementById("thumbnailPreview");
    const playOverlay = document.getElementById("playOverlay");
    const mediaPlatformTag = document.getElementById("mediaPlatformTag");
    const mediaDuration = document.getElementById("mediaDuration");
    const authorName = document.getElementById("authorName");
    const mediaTitle = document.getElementById("mediaTitle");
    const mediaQualityBadge = document.getElementById("mediaQualityBadge");
    const directDownloadBtn = document.getElementById("directDownloadBtn");
    const audioDownloadBtn = document.getElementById("audioDownloadBtn");
    const copyLinkBtn = document.getElementById("copyLinkBtn");
    const toast = document.getElementById("toast");
    const platformChips = document.querySelectorAll(".platform-chip");

    // VIP Membership Elements
    const openVipModalBtn = document.getElementById("openVipModalBtn");
    const closeVipModalBtn = document.getElementById("closeVipModalBtn");
    const vipModal = document.getElementById("vipModal");
    const upiQrImage = document.getElementById("upiQrImage");
    const displayUpiId = document.getElementById("displayUpiId");
    const copyUpiBtn = document.getElementById("copyUpiBtn");
    const utrInput = document.getElementById("utrInput");
    const verifyUtrBtn = document.getElementById("verifyUtrBtn");
    const toggleKeyLoginBtn = document.getElementById("toggleKeyLoginBtn");
    const keyLoginForm = document.getElementById("keyLoginForm");
    const existingKeyInput = document.getElementById("existingKeyInput");
    const submitExistingKeyBtn = document.getElementById("submitExistingKeyBtn");

    let currentMediaData = null;
    let selectedFormatUrl = null;
    let selectedFilename = "reelsave_video.mp4";

    // VIP Membership State
    // Set to true to re-enable the 2-free-downloads limit and the VIP popup
    const PAYWALL_ENABLED = false;
    const FREE_DOWNLOADS_LIMIT = PAYWALL_ENABLED ? 2 : Infinity; // Allow 2 free trial downloads
    if (!PAYWALL_ENABLED && openVipModalBtn) openVipModalBtn.style.display = "none";
    let downloadCount = parseInt(localStorage.getItem("reelsave_dl_count") || "0", 10);
    let vipPassKey = localStorage.getItem("reelsave_vip_key") || null;
    let isVipUser = Boolean(vipPassKey);
    let upiDetails = { upi_id: "your-upi@oksbi", payee_name: "ReelSave", price: 20 };

    // Update VIP button if already VIP
    function updateVipUI() {
        if (isVipUser && openVipModalBtn) {
            openVipModalBtn.innerHTML = `👑 VIP Member`;
            openVipModalBtn.style.background = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
            openVipModalBtn.style.borderColor = "rgba(16, 185, 129, 0.4)";
        }
    }
    updateVipUI();

    // Fetch UPI Payment Details from Backend
    async function loadVipInfo() {
        try {
            const res = await fetch(`${API_BASE}/api/vip/info`);
            if (res.ok) {
                upiDetails = await res.json();
                if (displayUpiId) displayUpiId.textContent = upiDetails.upi_id;
            }
        } catch (e) {
            console.warn("Using default VIP info:", e);
        }
    }
    loadVipInfo();

    function getUpiUrl(app = "upi") {
        const upiId = upiDetails.upi_id || "mahalesoumya@axl";
        const payeeName = upiDetails.payee_name || "SOUMYVINAYAK MAHALE";
        const amount = upiDetails.price || 20;
        const note = "ReelSave VIP Lifetime Pass";
        const params = `pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;

        if (app === "phonepe") {
            return `phonepe://pay?${params}`;
        } else if (app === "paytm") {
            return `paytmmp://pay?${params}`;
        } else if (app === "gpay") {
            return `tez://upi/pay?${params}`;
        }
        return `upi://pay?${params}`;
    }

    function triggerUpiPayment(app = "upi") {
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 800);
        const upiUrl = getUpiUrl(app);

        if (isMobile) {
            showToast("Opening UPI app... Please complete ₹20 payment");
            window.location.href = upiUrl;

            // Fallback for Android Chrome browser
            if (app !== "upi") {
                setTimeout(() => {
                    if (document.hasFocus()) {
                        window.location.href = getUpiUrl("upi");
                    }
                }, 1000);
            }
        } else {
            // Desktop/Laptop user
            const qrWrapper = document.querySelector(".qr-wrapper");
            if (qrWrapper) {
                qrWrapper.classList.add("pulse-highlight");
                qrWrapper.scrollIntoView({ behavior: "smooth", block: "center" });
                setTimeout(() => qrWrapper.classList.remove("pulse-highlight"), 3500);
            }
            showToast("📱 On PC: Please scan QR code with PhonePe, Paytm, or GPay on your mobile!");
        }
    }

    const directPayLink = document.getElementById("directPayUpiLink");
    if (directPayLink) {
        directPayLink.addEventListener("click", (e) => {
            e.preventDefault();
            triggerUpiPayment("upi");
        });
    }

    const appPayChips = document.querySelectorAll(".app-pay-chip");
    appPayChips.forEach(chip => {
        chip.addEventListener("click", (e) => {
            e.preventDefault();
            const app = chip.dataset.app || "upi";
            triggerUpiPayment(app);
        });
    });

    function generateUpiQr(upiId, name, amount) {
        if (upiQrImage && !upiQrImage.src) {
            upiQrImage.src = "/my_upi_qr.png";
        }
    }

    // Copy UPI ID
    if (copyUpiBtn) {
        copyUpiBtn.addEventListener("click", () => {
            const upiId = upiDetails.upi_id || "mahalesoumya@axl";
            if (navigator.clipboard) {
                navigator.clipboard.writeText(upiId).then(() => showToast("UPI ID Copied!"));
            } else {
                prompt("Copy UPI ID:", upiId);
            }
        });
    }

    // Modal open/close handlers
    if (openVipModalBtn) openVipModalBtn.addEventListener("click", () => vipModal.classList.remove("hidden"));
    if (closeVipModalBtn) closeVipModalBtn.addEventListener("click", () => vipModal.classList.add("hidden"));
    if (vipModal) {
        vipModal.addEventListener("click", (e) => {
            if (e.target === vipModal) vipModal.classList.add("hidden");
        });
    }

    // Toggle key login
    if (toggleKeyLoginBtn && keyLoginForm) {
        toggleKeyLoginBtn.addEventListener("click", () => keyLoginForm.classList.toggle("hidden"));
    }

    // Verify UTR
    if (verifyUtrBtn) {
        verifyUtrBtn.addEventListener("click", async () => {
            const utr = utrInput.value.trim();
            if (!utr || utr.length < 6) {
                showToast("Please enter a valid 12-digit UPI UTR number.");
                return;
            }

            verifyUtrBtn.disabled = true;
            verifyUtrBtn.textContent = "Verifying...";

            try {
                const res = await fetch(`${API_BASE}/api/vip/verify-payment`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ utr: utr, upi_id: upiDetails.upi_id })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    isVipUser = true;
                    localStorage.setItem("reelsave_vip_key", data.key);
                    updateVipUI();
                    vipModal.classList.add("hidden");
                    showToast(`🎉 VIP Activated! Your Key: ${data.key}`);
                } else {
                    showToast(data.detail || "Verification failed. Check your UTR.");
                }
            } catch (err) {
                showToast("Error verifying payment. Try again.");
            } finally {
                verifyUtrBtn.disabled = false;
                verifyUtrBtn.textContent = "Unlock VIP 🚀";
            }
        });
    }

    // Submit Existing Key
    if (submitExistingKeyBtn) {
        submitExistingKeyBtn.addEventListener("click", async () => {
            const key = existingKeyInput.value.trim();
            if (!key) return showToast("Please enter your VIP Key");

            try {
                const res = await fetch(`${API_BASE}/api/vip/validate-key`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ key: key })
                });
                const data = await res.json();
                if (res.ok && data.valid) {
                    isVipUser = true;
                    localStorage.setItem("reelsave_vip_key", data.key);
                    updateVipUI();
                    vipModal.classList.add("hidden");
                    showToast("🎉 VIP Pass Key Activated!");
                } else {
                    showToast("Invalid VIP Pass Key.");
                }
            } catch (e) {
                showToast("Cannot validate key.");
            }
        });
    }

    // Check Backend API Health on Load
    async function checkApiHealth() {
        try {
            const res = await fetch(`${API_BASE}/api/health`);
            if (res.ok) {
                if (apiStatusText) {
                    apiStatusText.textContent = "Engine Ready";
                    apiStatusText.parentElement.style.color = "var(--text-secondary)";
                }
            }
        } catch (e) {
            console.warn("Backend not yet running at", API_BASE);
        }
    }
    checkApiHealth();

    // Input changes
    reelUrlInput.addEventListener("input", () => {
        if (reelUrlInput.value.trim().length > 0) {
            clearBtn.classList.remove("hidden");
        } else {
            clearBtn.classList.add("hidden");
        }
        hideError();
    });

    // Clear input
    clearBtn.addEventListener("click", () => {
        reelUrlInput.value = "";
        clearBtn.classList.add("hidden");
        reelUrlInput.focus();
        hideError();
    });

    // Paste from clipboard
    pasteBtn.addEventListener("click", async () => {
        try {
            if (navigator.clipboard && navigator.clipboard.readText) {
                const text = await navigator.clipboard.readText();
                if (text) {
                    reelUrlInput.value = text.trim();
                    clearBtn.classList.remove("hidden");
                    showToast("Pasted from clipboard!");
                    // Auto-trigger if looks like Instagram URL
                    if (text.includes("instagram.com") || text.includes("tiktok.com") || text.includes("youtu")) {
                        handleFetch();
                    }
                }
            } else {
                showToast("Clipboard access not supported. Please paste manually (Ctrl+V)");
            }
        } catch (err) {
            showToast("Clipboard permission denied. Please paste manually.");
        }
    });

    // Enter key triggers download
    reelUrlInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            handleFetch();
        }
    });

    // Fetch Reel / Video Details
    fetchBtn.addEventListener("click", handleFetch);

    async function handleFetch() {
        const url = reelUrlInput.value.trim();
        if (!url) {
            showError("Empty URL", "Please enter or paste an Instagram Reel or video link.");
            reelUrlInput.focus();
            return;
        }

        // Set Loading State
        setLoading(true);
        hideError();
        resultCard.classList.add("hidden");

        try {
            const response = await fetch(`${API_BASE}/api/extract`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ url: url })
            });

            const json = await response.json();

            if (!response.ok || !json.success) {
                const errMsg = json.detail || json.message || "Could not retrieve video from the provided link.";
                showError("Extraction Error", errMsg);
                return;
            }

            // Successfully received media details
            renderMediaResult(json.data);
            showToast("Reel loaded successfully! 🚀");
            resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });

        } catch (err) {
            console.error("Fetch error:", err);
            showError("Network Error", `Cannot reach server at ${API_BASE}. Make sure the FastAPI backend is running.`);
        } finally {
            setLoading(false);
        }
    }

    // Render result card with media details (Single Highest Quality)
    function renderMediaResult(data) {
        currentMediaData = data;
        selectedFormatUrl = data.direct_url;
        selectedFilename = `${data.title || "reelsave_video"}.mp4`;

        // Title & metadata
        mediaTitle.textContent = data.title || "Instagram Reel";
        authorName.textContent = data.author || "Creator";
        mediaPlatformTag.textContent = (data.platform || "Instagram").toUpperCase();
        mediaQualityBadge.textContent = `✨ ${data.quality || "Full HD (1080p)"}`;

        // Duration formatting
        if (data.duration && data.duration > 0) {
            const minutes = Math.floor(data.duration / 60);
            const seconds = Math.floor(data.duration % 60);
            mediaDuration.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
            mediaDuration.classList.remove("hidden");
        } else {
            mediaDuration.classList.add("hidden");
        }

        // Setup Video / Thumbnail Preview (Prefer stream with audio for preview)
        const previewSrc = data.preview_url || data.direct_url;
        if (previewSrc) {
            videoPreview.src = previewSrc;
            videoPreview.poster = data.thumbnail || "";
            videoPreview.classList.remove("hidden");
            thumbnailPreview.classList.add("hidden");
            playOverlay.classList.remove("hidden");
        } else if (data.thumbnail) {
            thumbnailPreview.src = data.thumbnail;
            thumbnailPreview.classList.remove("hidden");
            videoPreview.classList.add("hidden");
            playOverlay.classList.add("hidden");
        }

        resultCard.classList.remove("hidden");
    }

    // Play Overlay Interaction
    playOverlay.addEventListener("click", () => {
        playOverlay.classList.add("hidden");
        videoPreview.play().catch(() => {});
    });

    videoPreview.addEventListener("play", () => {
        playOverlay.classList.add("hidden");
    });

    videoPreview.addEventListener("pause", () => {
        playOverlay.classList.remove("hidden");
    });

    // Download Highest Quality HD Video (Guaranteed Sound)
    directDownloadBtn.addEventListener("click", () => {
        // Enforce VIP membership if free trial downloads exceeded
        if (!isVipUser && downloadCount >= FREE_DOWNLOADS_LIMIT) {
            vipModal.classList.remove("hidden");
            showToast("Free trial completed! Unlock Lifetime VIP for ₹20 👑");
            return;
        }

        if (!selectedFormatUrl && (!currentMediaData || !currentMediaData.source_url)) {
            showToast("No download stream available.");
            return;
        }

        // Increment download count for non-VIP
        if (!isVipUser) {
            downloadCount++;
            localStorage.setItem("reelsave_dl_count", downloadCount.toString());
        }

        let titleClean = (currentMediaData && currentMediaData.title) ? currentMediaData.title : "reelsave_video";
        let finalFilename = `${titleClean}.mp4`;

        let downloadUrl = `${API_BASE}/api/download?filename=${encodeURIComponent(finalFilename)}`;
        if (selectedFormatUrl) {
            downloadUrl += `&url=${encodeURIComponent(selectedFormatUrl)}`;
        }
        if (currentMediaData && currentMediaData.audio_url) {
            downloadUrl += `&audio_url=${encodeURIComponent(currentMediaData.audio_url)}`;
        }
        if (currentMediaData && currentMediaData.source_url) {
            downloadUrl += `&source_url=${encodeURIComponent(currentMediaData.source_url)}`;
        }
        if (currentMediaData && currentMediaData.needs_merge) {
            downloadUrl += `&needs_merge=true`;
        }
        
        // Trigger browser file download
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = finalFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        showToast("Downloading HD Video with Audio! 🔊");
    });

    // Download Audio Track (MP3)
    audioDownloadBtn.addEventListener("click", () => {
        // Enforce VIP membership if free trial downloads exceeded
        if (!isVipUser && downloadCount >= FREE_DOWNLOADS_LIMIT) {
            vipModal.classList.remove("hidden");
            showToast("Free trial completed! Unlock Lifetime VIP for ₹20 👑");
            return;
        }

        const audioUrl = (currentMediaData && currentMediaData.audio_url) ? currentMediaData.audio_url : selectedFormatUrl;
        if (!audioUrl) {
            showToast("Audio stream not available.");
            return;
        }

        // Increment download count for non-VIP
        if (!isVipUser) {
            downloadCount++;
            localStorage.setItem("reelsave_dl_count", downloadCount.toString());
        }

        let titleClean = (currentMediaData && currentMediaData.title) ? currentMediaData.title : "reelsave_audio";
        let finalFilename = `${titleClean}.mp3`;

        let downloadUrl = `${API_BASE}/api/download?url=${encodeURIComponent(audioUrl)}&filename=${encodeURIComponent(finalFilename)}&is_audio=true`;
        
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = finalFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        showToast("Downloading Audio (MP3)... 🎵");
    });

    // Copy Direct Link
    copyLinkBtn.addEventListener("click", () => {
        if (!selectedFormatUrl) return;
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(selectedFormatUrl).then(() => {
                showToast("Video stream link copied to clipboard!");
            });
        } else {
            prompt("Copy video URL:", selectedFormatUrl);
        }
    });

    // Platform Filter Chips (Optional)
    if (platformChips && platformChips.length > 0) {
        platformChips.forEach(chip => {
            chip.addEventListener("click", () => {
                platformChips.forEach(c => c.classList.remove("active"));
                chip.classList.add("active");
                const platform = chip.dataset.platform;
                if (platform === "tiktok") {
                    reelUrlInput.placeholder = "Paste TikTok video URL here...";
                } else if (platform === "shorts") {
                    reelUrlInput.placeholder = "Paste YouTube Shorts or Video URL here...";
                } else if (platform === "audio") {
                    reelUrlInput.placeholder = "Paste Reel or Video URL to extract MP3 audio...";
                } else {
                    reelUrlInput.placeholder = "Paste Instagram Reel or Video URL here...";
                }
                reelUrlInput.focus();
            });
        });
    }

    // Close Error Banner
    closeErrorBtn.addEventListener("click", hideError);

    function showError(title, msg) {
        errorTitle.textContent = title;
        errorMessage.textContent = msg;
        errorBanner.classList.remove("hidden");
    }

    function hideError() {
        errorBanner.classList.add("hidden");
    }

    function setLoading(isLoading) {
        if (isLoading) {
            fetchBtn.disabled = true;
            btnText.classList.add("hidden");
            btnLoader.classList.remove("hidden");
        } else {
            fetchBtn.disabled = false;
            btnText.classList.remove("hidden");
            btnLoader.classList.add("hidden");
        }
    }

    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.remove("hidden");
        setTimeout(() => {
            toast.classList.add("hidden");
        }, 3200);
    }

    // Category tabs handling (if present)
    const categoryTabs = document.querySelectorAll(".media-tab");
    if (categoryTabs && categoryTabs.length > 0) {
        const dynamicHeroTitle = document.getElementById("dynamicHeroTitle");
        const dynamicHeroSubtitle = document.getElementById("dynamicHeroSubtitle");
        const intentPanels = document.querySelectorAll(".intent-seo-panel");

        const categoryConfig = {
            reels: {
                title: `Instagram Reels & Audio <span class="gradient-text">Downloader</span>`,
                subtitle: "Download Instagram Reels in 1080p HD with guaranteed sound. Free & Unlimited.",
                placeholder: "Paste Instagram Reel link here (e.g. https://www.instagram.com/reel/...)",
                btnText: "Get Reel",
                panelId: "panel-reels"
            },
            stories: {
                title: `Instagram Stories & Highlights <span class="gradient-text">Downloader</span>`,
                subtitle: "Download Stories and Highlights anonymously in Full HD. 100% Free & Fast.",
                placeholder: "Paste Instagram Story or Highlight link here...",
                btnText: "Get Story",
                panelId: "panel-stories"
            },
            photos: {
                title: `Instagram Photos & Post <span class="gradient-text">Downloader</span>`,
                subtitle: "Download high-resolution photos and multi-image carousel slides in original quality.",
                placeholder: "Paste Instagram Photo or Post URL here...",
                btnText: "Get Photo",
                panelId: "panel-photos"
            },
            video: {
                title: `Instagram Video & IGTV <span class="gradient-text">Downloader</span>`,
                subtitle: "Save long IGTV and feed videos in high definition MP4 without watermarks.",
                placeholder: "Paste Instagram Video or IGTV URL here...",
                btnText: "Get Video",
                panelId: "panel-video"
            },
            audio: {
                title: `Instagram MP3 Audio <span class="gradient-text">Extractor</span>`,
                subtitle: "Extract background music and viral songs from any Reel into 192kbps MP3.",
                placeholder: "Paste Instagram Reel or Video URL to extract MP3...",
                btnText: "Get Audio",
                panelId: "panel-audio"
            }
        };

        function switchCategory(type, updateHash = true) {
            const config = categoryConfig[type] || categoryConfig.reels;
            
            categoryTabs.forEach(tab => {
                const isActive = tab.dataset.type === type;
                tab.classList.toggle("active", isActive);
                tab.setAttribute("aria-selected", isActive ? "true" : "false");
            });

            if (dynamicHeroTitle) dynamicHeroTitle.innerHTML = config.title;
            if (dynamicHeroSubtitle) dynamicHeroSubtitle.textContent = config.subtitle;
            if (reelUrlInput) reelUrlInput.placeholder = config.placeholder;
            if (btnText) {
                const dlIcon = btnText.querySelector(".icon-dl");
                btnText.innerHTML = "";
                if (dlIcon) btnText.appendChild(dlIcon);
                btnText.append(` ${config.btnText}`);
            }

            intentPanels.forEach(panel => {
                panel.classList.toggle("active-panel", panel.id === config.panelId);
            });

            if (updateHash && window.location.hash !== `#${type}`) {
                history.replaceState(null, "", `#${type}`);
            }
        }

        categoryTabs.forEach(tab => {
            tab.addEventListener("click", () => {
                const type = tab.dataset.type;
                switchCategory(type);
            });
        });

        const initialHash = window.location.hash.replace("#", "").toLowerCase();
        if (initialHash && categoryConfig[initialHash]) {
            switchCategory(initialHash, false);
        }
    }

    // =========================================================================
    // SOCIAL SHARING (WhatsApp, Telegram, X, Facebook, Copy)
    // =========================================================================
    const currentUrl = window.location.origin + "/";
    const shareText = "Download Instagram Reels, Stories & MP3 Audio in 1080p HD for free with ReelSave:";

    const shareWhatsapp = document.getElementById("shareWhatsapp");
    if (shareWhatsapp) {
        shareWhatsapp.addEventListener("click", () => {
            window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + " " + currentUrl)}`, "_blank");
        });
    }

    const shareTelegram = document.getElementById("shareTelegram");
    if (shareTelegram) {
        shareTelegram.addEventListener("click", () => {
            window.open(`https://t.me/share/url?url=${encodeURIComponent(currentUrl)}&text=${encodeURIComponent(shareText)}`, "_blank");
        });
    }

    const shareTwitter = document.getElementById("shareTwitter");
    if (shareTwitter) {
        shareTwitter.addEventListener("click", () => {
            window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(currentUrl)}`, "_blank");
        });
    }

    const shareFacebook = document.getElementById("shareFacebook");
    if (shareFacebook) {
        shareFacebook.addEventListener("click", () => {
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}`, "_blank");
        });
    }

    const shareCopy = document.getElementById("shareCopy");
    if (shareCopy) {
        shareCopy.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(currentUrl);
                showToast("🔗 Link copied to clipboard!");
            } catch (e) {
                prompt("Copy link:", currentUrl);
            }
        });
    }

    // =========================================================================
    // STICKY BOTTOM AD BAR DISMISS
    // =========================================================================
    const stickyAdBar = document.getElementById("stickyAdBar");
    const closeStickyAdBtn = document.getElementById("closeStickyAdBtn");
    if (closeStickyAdBtn && stickyAdBar) {
        closeStickyAdBtn.addEventListener("click", () => {
            stickyAdBar.classList.add("dismissed");
        });
    }

    // =========================================================================
    // LEGAL / TRUST MODAL (Privacy, Terms, DMCA, Contact)
    // =========================================================================
    const legalModal = document.getElementById("legalModal");
    const legalModalTitle = document.getElementById("legalModalTitle");
    const legalModalBody = document.getElementById("legalModalBody");
    const closeLegalModalBtn = document.getElementById("closeLegalModalBtn");
    const footerLinkBtns = document.querySelectorAll(".footer-link-btn");

    const legalContents = {
        privacyModal: {
            title: "Privacy Policy",
            html: `
                <h4>1. Information We Do Not Collect</h4>
                <p>ReelSave is designed for maximum user privacy. We do not require account registration, email addresses, or phone numbers. We do not store or archive your downloaded media or downloaded files on our servers.</p>
                <h4>2. Server Logs & Analytics</h4>
                <p>Like standard web servers, anonymous traffic information such as browser type, referring pages, and access timestamps may be logged to safeguard against automated abuse and DDoS attempts.</p>
                <h4>3. Third-Party Advertising</h4>
                <p>We may partner with third-party advertising networks (e.g., Google AdSense, Monetag, Adsterra). These partners may use cookies to serve personalized advertisements based on previous visits to this or other websites.</p>
            `
        },
        termsModal: {
            title: "Terms of Service",
            html: `
                <h4>1. Acceptance of Terms</h4>
                <p>By using ReelSave, you agree to comply with these terms. ReelSave is provided solely for personal, non-commercial media downloading and archival purposes.</p>
                <h4>2. Copyright Compliance</h4>
                <p>Users are strictly required to respect the intellectual property rights of content creators. You must not download, redistribute, or monetize copyrighted material without the explicit consent of the copyright owner.</p>
                <h4>3. Disclaimer of Warranty</h4>
                <p>ReelSave is provided "as is" without warranty of any kind. We do not guarantee uninterrupted access or availability of third-party platform streams.</p>
            `
        },
        disclaimerModal: {
            title: "DMCA & Disclaimer of Affiliation",
            html: `
                <h4>1. No Affiliation with Instagram / Meta</h4>
                <p>ReelSave is an independent web utility and is NOT affiliated, associated, authorized, endorsed by, or in any way officially connected with Instagram, Meta Platforms, Inc., or any of their subsidiaries.</p>
                <h4>2. Trademark Notice</h4>
                <p>The name "Instagram" as well as related names, marks, and logos are registered trademarks of Meta Platforms, Inc. All other trademarks are the property of their respective owners.</p>
                <h4>3. DMCA Takedown Requests</h4>
                <p>ReelSave does not host copyrighted media on its servers; all streams are fetched directly from public CDN endpoints. If you believe your copyright is being infringed, contact us at <strong>dmca@reelsave.app</strong> for prompt assistance.</p>
            `
        },
        contactModal: {
            title: "Contact Us & Support",
            html: `
                <h4>Get in Touch</h4>
                <p>Have questions, business inquiries, advertising proposals, or bug reports? Feel free to reach out:</p>
                <p>📧 <strong>Email:</strong> support@reelsave.app</p>
                <p>⚡ <strong>Response Time:</strong> Typically within 24-48 business hours.</p>
            `
        }
    };

    footerLinkBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const modalKey = btn.dataset.modal;
            const content = legalContents[modalKey];
            if (content && legalModal) {
                legalModalTitle.textContent = content.title;
                legalModalBody.innerHTML = content.html;
                legalModal.classList.remove("hidden");
            }
        });
    });

    if (closeLegalModalBtn && legalModal) {
        closeLegalModalBtn.addEventListener("click", () => {
            legalModal.classList.add("hidden");
        });
        legalModal.addEventListener("click", (e) => {
            if (e.target === legalModal) {
                legalModal.classList.add("hidden");
            }
        });
    }
});
