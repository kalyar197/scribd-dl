const App = {
    elements: {},
    currentRunId: null,
    pollInterval: null,

    init() {
        this.cacheElements();
        this.bindEvents();
        this.checkSavedToken();
    },

    cacheElements() {
        this.elements = {
            setupSection: document.getElementById('setup-section'),
            downloadSection: document.getElementById('download-section'),
            statusSection: document.getElementById('status-section'),
            errorSection: document.getElementById('error-section'),
            patInput: document.getElementById('pat-input'),
            savePatBtn: document.getElementById('save-pat-btn'),
            urlInput: document.getElementById('url-input'),
            downloadBtn: document.getElementById('download-btn'),
            serviceIndicator: document.getElementById('service-indicator'),
            statusMessage: document.getElementById('status-message'),
            progressFill: document.getElementById('progress-fill'),
            downloadLink: document.getElementById('download-link'),
            resultLink: document.getElementById('result-link'),
            errorMessage: document.getElementById('error-message'),
            clearTokenBtn: document.getElementById('clear-token-btn')
        };
    },

    bindEvents() {
        this.elements.savePatBtn.addEventListener('click', () => this.saveToken());
        this.elements.downloadBtn.addEventListener('click', () => this.startDownload());
        this.elements.clearTokenBtn.addEventListener('click', () => this.clearToken());
        this.elements.urlInput.addEventListener('input', () => this.detectService());
        this.elements.patInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.saveToken();
        });
        this.elements.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.startDownload();
        });
    },

    checkSavedToken() {
        const token = localStorage.getItem('github_pat');
        if (token) {
            GitHubAPI.init(token);
            this.showDownloadSection();
        }
    },

    async saveToken() {
        const token = this.elements.patInput.value.trim();
        if (!token) {
            this.showError('Please enter a token');
            return;
        }

        this.elements.savePatBtn.disabled = true;
        this.elements.savePatBtn.textContent = 'Validating...';

        GitHubAPI.init(token);
        const valid = await GitHubAPI.validateToken();

        if (valid) {
            localStorage.setItem('github_pat', token);
            this.showDownloadSection();
        } else {
            this.showError('Invalid token. Make sure it has repo and actions scope.');
        }

        this.elements.savePatBtn.disabled = false;
        this.elements.savePatBtn.textContent = 'Save Token';
    },

    clearToken() {
        localStorage.removeItem('github_pat');
        this.elements.setupSection.classList.remove('hidden');
        this.elements.downloadSection.classList.add('hidden');
        this.elements.statusSection.classList.add('hidden');
        this.elements.patInput.value = '';
    },

    showDownloadSection() {
        this.elements.setupSection.classList.add('hidden');
        this.elements.downloadSection.classList.remove('hidden');
    },

    detectService() {
        const url = this.elements.urlInput.value.trim();
        const indicator = this.elements.serviceIndicator;

        indicator.classList.remove('scribd', 'slideshare', 'everand', 'hidden');

        if (url.includes('scribd.com')) {
            indicator.textContent = 'Scribd Document';
            indicator.classList.add('scribd');
        } else if (url.includes('slideshare.net')) {
            indicator.textContent = 'SlideShare Presentation';
            indicator.classList.add('slideshare');
        } else if (url.includes('everand.com')) {
            indicator.textContent = 'Everand Podcast';
            indicator.classList.add('everand');
        } else {
            indicator.classList.add('hidden');
            return;
        }
    },

    async startDownload() {
        const url = this.elements.urlInput.value.trim();
        if (!url) {
            this.showError('Please enter a URL');
            return;
        }

        if (!this.isValidUrl(url)) {
            this.showError('Please enter a valid Scribd, SlideShare, or Everand URL');
            return;
        }

        this.hideError();
        this.elements.downloadBtn.disabled = true;
        this.elements.downloadBtn.textContent = 'Starting...';
        this.elements.statusSection.classList.remove('hidden');
        this.elements.downloadLink.classList.add('hidden');
        this.setStatus('Triggering download workflow...');
        this.setProgress('indeterminate');

        try {
            const run = await GitHubAPI.triggerWorkflow(url);
            this.currentRunId = run.id;
            this.setStatus('Workflow started. Processing...');
            this.startPolling();
        } catch (error) {
            this.showError(`Failed to start download: ${error.message}`);
            this.resetDownloadButton();
        }
    },

    isValidUrl(url) {
        const patterns = [
            /^https:\/\/www\.scribd\.com\/(document|doc|presentation|embeds)\/[0-9]+/,
            /^https:\/\/www\.slideshare\.net\//,
            /^https:\/\/www\.everand\.com\/(podcast-show|podcast|listen)/
        ];
        return patterns.some(p => p.test(url));
    },

    startPolling() {
        this.pollInterval = setInterval(() => this.checkStatus(), 10000);
    },

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    },

    async checkStatus() {
        try {
            const run = await GitHubAPI.getWorkflowRun(this.currentRunId);

            if (run.status === 'queued') {
                this.setStatus('Waiting in queue...');
            } else if (run.status === 'in_progress') {
                this.setStatus('Downloading and processing...');
            } else if (run.status === 'completed') {
                this.stopPolling();

                if (run.conclusion === 'success') {
                    this.setStatus('Download complete!');
                    this.setProgress(100);
                    await this.showDownloadLink(run.run_number);
                } else {
                    this.showError(`Workflow failed: ${run.conclusion}`);
                }
                this.resetDownloadButton();
            }
        } catch (error) {
            this.stopPolling();
            this.showError(`Error checking status: ${error.message}`);
            this.resetDownloadButton();
        }
    },

    async showDownloadLink(runNumber) {
        try {
            const tag = `download-${runNumber}`;
            const release = await GitHubAPI.getReleaseByTag(tag);

            if (release && release.assets && release.assets.length > 0) {
                const asset = release.assets[0];
                this.elements.resultLink.href = asset.browser_download_url;
                this.elements.resultLink.textContent = `Download ${asset.name}`;
                this.elements.downloadLink.classList.remove('hidden');
            }
        } catch (error) {
            this.setStatus('Download complete! Check the Releases page for your file.');
        }
    },

    setStatus(message) {
        this.elements.statusMessage.textContent = message;
    },

    setProgress(value) {
        const fill = this.elements.progressFill;
        fill.classList.remove('indeterminate');

        if (value === 'indeterminate') {
            fill.classList.add('indeterminate');
        } else {
            fill.style.width = `${value}%`;
        }
    },

    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorSection.classList.remove('hidden');
    },

    hideError() {
        this.elements.errorSection.classList.add('hidden');
    },

    resetDownloadButton() {
        this.elements.downloadBtn.disabled = false;
        this.elements.downloadBtn.textContent = 'Download';
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
