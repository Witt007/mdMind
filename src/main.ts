import { Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { MarkmapView } from './views/MarkmapView';
import { MarkmapSettingTab } from './settings';
import { DEFAULT_SETTINGS, MarkmapSettings } from './types';
import { VIEW_TYPE_MARKMAP } from './constants';

export default class MarkmapSyncPlugin extends Plugin {
    settings!: MarkmapSettings;
    private markmapLeaf: WorkspaceLeaf | null = null;

    get activeFile(): TFile | null {
        return this.app.workspace.getActiveFile();
    }

    get currentMarkmapView(): MarkmapView | null {
        const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_MARKMAP)[0];
        return leaf ? leaf.view as MarkmapView : null;
    }

    async onload(): Promise<void> {
        await this.loadSettings();

        console.log('wittmap plugin loaded')
        this.addSettingTab(new MarkmapSettingTab(this.app, this));

        this.registerView(
            VIEW_TYPE_MARKMAP,
            (leaf: WorkspaceLeaf) => new MarkmapView(leaf, this.settings)
        );

        this.addRibbonIcon('git-branch', 'Open Markmap', () => {
            this.openMarkmapView();
        });

        this.addCommand({
            id: 'open-markmap',
            name: 'Open Markmap View',
            callback: () => this.openMarkmapView(),
        });

        this.addCommand({
            id: 'toggle-markmap-sidebar',
            name: 'Toggle Markmap Sidebar',
            callback: () => this.toggleMarkmapSidebar(),
        });

        this.addCommand({
            id: 'refresh-markmap',
            name: 'Refresh Markmap',
            callback: () => this.refreshMarkmap(),
        });

        this.addCommand({
            id: 'sync-to-markmap',
            name: 'Sync Markdown to Markmap (Manual)',
            callback: () => this.syncToMarkmap(),
        });

        this.addCommand({
            id: 'add-comment-to-markmap',
            name: 'Add comment to selected markmap node',
            checkCallback: (checking) => {
                const view = this.currentMarkmapView;
                if (!view || !view.shouldHandleAddCommentHotkey()) {
                    return false;
                }
                if (!checking) {
                    void view.addCommentToSelectedNode();
                }
                return true;
            },
        });

        this.app.workspace.onLayoutReady(() => {
            if (this.settings.openOnStartup) {
                void this.initializeMarkmapView();
            }
        });
    }

    onunload(): void {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_MARKMAP);
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);

        this.app.workspace.getLeavesOfType(VIEW_TYPE_MARKMAP).forEach((leaf) => {
            const view = leaf.view as MarkmapView;
            if (view) {
                view.updateSettings(this.settings);
            }
        });
    }

    private async initializeMarkmapView(): Promise<void> {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MARKMAP);

        if (leaves.length > 0) {
            this.markmapLeaf = leaves[0];
            return;
        }

        // Create leaf in right sidebar using workspace API
        this.markmapLeaf = this.app.workspace.getLeaf('split', 'vertical');
        if (this.markmapLeaf) {
            await this.markmapLeaf.setViewState({
                type: VIEW_TYPE_MARKMAP,
                active: false,
            });
        }
    }

    private async openMarkmapView(): Promise<void> {
        const { workspace } = this.app;

        const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_MARKMAP);
        if (existingLeaves.length > 0) {
            workspace.revealLeaf(existingLeaves[0]);
            return;
        }

        const leaf = workspace.getLeaf('split', 'vertical');
        await leaf.setViewState({
            type: VIEW_TYPE_MARKMAP,
            active: true,
        });
    }

    private async toggleMarkmapSidebar(): Promise<void> {
        const { workspace } = this.app;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_MARKMAP);

        if (leaves.length > 0) {
            leaves.forEach(leaf => leaf.detach());
        } else {
            await this.openMarkmapView();
        }
    }

    private refreshMarkmap(): void {
        this.app.workspace.getLeavesOfType(VIEW_TYPE_MARKMAP).forEach((leaf) => {
            const view = leaf.view as MarkmapView;
            if (view) {
                view.refresh();
            }
        });

        new Notice('Markmap refreshed');
    }

    private syncToMarkmap(): void {
        this.refreshMarkmap();
        new Notice('Synced Markdown to Markmap');
    }
}
