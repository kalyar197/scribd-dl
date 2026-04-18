const GitHubAPI = {
    owner: null,
    repo: null,
    token: null,

    init(token) {
        this.token = token;
        const repoInfo = this.getRepoInfo();
        this.owner = repoInfo.owner;
        this.repo = repoInfo.repo;
    },

    getRepoInfo() {
        const currentUrl = window.location.href;
        const match = currentUrl.match(/https?:\/\/([^.]+)\.github\.io\/([^/]+)/);
        if (match) {
            return { owner: match[1], repo: match[2] };
        }
        return { owner: 'majee', repo: 'scribd-dl' };
    },

    async request(endpoint, options = {}) {
        const url = `https://api.github.com${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || `GitHub API error: ${response.status}`);
        }

        if (response.status === 204) return null;
        return response.json();
    },

    async triggerWorkflow(url) {
        await this.request(`/repos/${this.owner}/${this.repo}/actions/workflows/download.yml/dispatches`, {
            method: 'POST',
            body: JSON.stringify({
                ref: 'main',
                inputs: { url }
            })
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
        const runs = await this.getWorkflowRuns();
        return runs.workflow_runs[0];
    },

    async getWorkflowRuns() {
        return this.request(`/repos/${this.owner}/${this.repo}/actions/runs?per_page=1`);
    },

    async getWorkflowRun(runId) {
        return this.request(`/repos/${this.owner}/${this.repo}/actions/runs/${runId}`);
    },

    async getLatestRelease() {
        return this.request(`/repos/${this.owner}/${this.repo}/releases/latest`);
    },

    async getReleaseByTag(tag) {
        return this.request(`/repos/${this.owner}/${this.repo}/releases/tags/${tag}`);
    },

    async validateToken() {
        try {
            await this.request('/user');
            return true;
        } catch {
            return false;
        }
    }
};
