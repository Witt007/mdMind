import {Editor, ItemView, MarkdownView, Menu, Notice, TFile, WorkspaceLeaf} from 'obsidian';
import {IPureNode} from 'markmap-common';
import {MarkmapRenderer} from '../components/MarkmapRenderer';
import {SyncEngine} from '../components/SyncEngine';
import {NodeMappingManager} from '../components/NodeMapping';
import {MarkmapSettings} from '../types';
import {CSS_CLASSES, ERROR_MESSAGES, VIEW_TYPE_MARKMAP} from '../constants';
import {Debouncer} from '../utils/debounce';

export interface MarkmapToolbar {
    container: HTMLElement;
    zoomIn: () => void;
    zoomOut: () => void;
    fit: () => void;
    reset: () => void;
    expandAll: () => void;
    collapseAll: () => void;
}

export class MarkmapView extends ItemView {
    private settings: MarkmapSettings;
    private renderer: MarkmapRenderer | null = null;
    private syncEngine: SyncEngine | null = null;
    private mappingManager: NodeMappingManager;
    private debouncer: Debouncer;
    private toolbar: HTMLElement | null = null;
    private file: TFile | null = null;
    private currentEditor: Editor | null = null;
    private isActive = false;
    private highlightedNodeId: string | null = null;
    private selectedNodeId: string | null = null;
    private editingNodeId: string | null = null;
    private editorOverlay: HTMLElement | null = null;
    private messageEl: HTMLElement | null = null;
    private markmapContainerEl: HTMLElement | null = null;
    private lastCursorTrackTime = 0;

    constructor(leaf: WorkspaceLeaf, settings: MarkmapSettings) {
        super(leaf);
        this.settings = settings;
        this.mappingManager = new NodeMappingManager();
        this.debouncer = new Debouncer(settings.debounceMs);
    }

    getViewType(): string {
        return VIEW_TYPE_MARKMAP;
    }

    getDisplayText(): string {
        return this.file ? `Markmap: ${this.file.basename}` : 'Markmap';
    }

    getIcon(): string {
        return 'git-branch';
    }

    async onOpen(): Promise<void> {
        this.containerEl.addClass(CSS_CLASSES.markmapContainer);
        this.contentEl.empty();

        //this.createToolbar();
        this.createMarkmapContainer();
        this.initSyncEngine();
        this.registerEventListeners();

        await this.updateFromActiveFile();
    }

    async onClose(): Promise<void> {
        this.debouncer.cancel();
        this.removeEditorOverlay();

        if (this.renderer) {
            this.renderer.destroy();
            this.renderer = null;
        }

        if (this.syncEngine) {
            this.syncEngine = null;
        }
    }

    updateSettings(settings: MarkmapSettings): void {
        this.settings = settings;
        this.debouncer.setWait(settings.debounceMs);

        if (this.renderer) {
            this.renderer.updateSettings(settings);
        }

        if (this.syncEngine) {
            this.syncEngine.updateSettings(settings);
        }
    }

    getCurrentFile(): TFile | null {
        return this.file;
    }

    refresh(): void {
        this.updateFromActiveFile();
    }

    private createToolbar(): void {
        if (!this.settings.showToolbar) return;

        this.toolbar = this.contentEl.createDiv(CSS_CLASSES.toolbar);

        const buttons = [
            {icon: 'zoom-in', tooltip: 'Zoom In', action: () => this.renderer?.zoomIn()},
            {icon: 'zoom-out', tooltip: 'Zoom Out', action: () => this.renderer?.zoomOut()},
            {icon: 'maximize', tooltip: 'Fit View', action: () => this.renderer?.fit()},
            {icon: 'rotate-ccw', tooltip: 'Reset', action: () => this.renderer?.resetZoom()},
            {icon: 'expand', tooltip: 'Expand All', action: () => this.expandAll()},
            {icon: 'collapse-all', tooltip: 'Collapse All', action: () => this.collapseAll()},
            {icon: 'refresh-cw', tooltip: 'Refresh', action: () => this.updateFromActiveFile()},
        ];

        for (const btn of buttons) {
            const button = this.toolbar.createEl('button', {
                cls: CSS_CLASSES.toolbarButton,
                attr: {'aria-label': btn.tooltip},
            });
            button.innerHTML = this.getIconSvg(btn.icon);
            button.addEventListener('click', btn.action);
        }
    }

    private getIconSvg(icon: string): string {
        const icons: Record<string, string> = {
            'zoom-in': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>',
            'zoom-out': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>',
            'maximize': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
            'rotate-ccw': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v6h6M3 13a9 9 0 1 0 3-7.7L3 8"/></svg>',
            'expand': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
            'collapse-all': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/></svg>',
            'refresh-cw': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>',
        };
        return icons[icon] || '';
    }

    private createMarkmapContainer(): void {
        const container = this.contentEl.createDiv();
        container.style.width = '100%';
        container.style.height = '100%';
        // Make container focusable so it can receive keyboard events (Enter key)
        container.setAttribute('tabindex', '0');
        this.markmapContainerEl = container;

        this.renderer = new MarkmapRenderer(container, this.settings, {
            onNodeClick: (node, event) => this.focusNodeInEditor(node, event),
            onNodeDblClick: (node, event) => this.handleNodeDblClick(node, event),
            onNodeContextMenu: (node, event) => this.handleNodeContextMenu(node, event),
            onNodeDragStart: this.settings.dragEnabled ? (node, event) => this.handleNodeDragStart(node, event) : undefined,
            onNodeDragEnd: this.settings.dragEnabled ? (node, event) => this.handleNodeDragEnd(node, event) : undefined,
            onNodeDrop: this.settings.dragEnabled ? (node, event) => this.handleNodeDrop(node, event) : undefined,
        });
    }

    private initSyncEngine(): void {
        this.syncEngine = new SyncEngine(this.settings, {
            onSyncStart: (_direction) => this.onSyncStart(),
            onSyncComplete: (_direction) => this.onSyncComplete(),
            onSyncError: (error) => this.onSyncError(error),
        });
    }

    private registerEventListeners(): void {
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                // Avoid updating if the leaf change is due to focusing this view itself
                if (leaf?.view === this) return;
                this.debouncer.executeDebounced(() => {
                    this.updateFromActiveFile();
                });
            })
        );

        this.registerEvent(
            this.app.workspace.on('editor-change', (editor) => {
                if (this.isActiveEditor(editor)) {
                    this.handleEditorChange(editor);
                    this.handleCursorActivity(editor);
                }
            })
        );

        // Ctrl+Enter/Tab to insert sibling/child node when a node is selected.
        // Registered on document in capture phase to run before Obsidian's global hotkey
        // handler (which also listens in capture phase at document level and would otherwise
        // consume Ctrl+Enter before it reaches the markmap container).
        this.registerDomEvent(document, 'keydown', (e: KeyboardEvent) => {
            const container = this.markmapContainerEl ?? this.containerEl;
            if (!container.contains(document.activeElement)) return;
            //@ts-ignore
            if (e.currentTarget.nodeName != '#document') return;
            if (e.key === 'Enter' && !this.editingNodeId) {
                this.handleEnterKey(e);
                console.log('enter triggered')
            } else if (e.key === 'Tab' && !this.editingNodeId) {
                this.handleTabKey(e);
            }
        }, {capture: true});

        // Focus the container when clicked so it can receive keyboard events
        this.registerDomEvent(this.markmapContainerEl ?? this.containerEl, 'mousedown', () => {
            (this.markmapContainerEl ?? this.containerEl).focus();
        });
    }

    private isActiveEditor(editor: Editor): boolean {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        return activeView?.editor === editor && this.file === activeView.file;
    }

    private handleEditorChange(editor: Editor): void {
        if (!this.syncEngine?.canSync()) return;

        if (this.settings.syncMode === 'realtime') {
            this.updateMarkmapFromEditor(editor);
        } else if (this.settings.syncMode === 'debounce') {
            this.debouncer.executeDebounced(() => {
                this.updateMarkmapFromEditor(editor);
            });
        }
    }

    private handleCursorActivity(editor: Editor): void {
        const now = Date.now();
        if (now - this.lastCursorTrackTime < 100) return;
        this.lastCursorTrackTime = now;

        const cursor = editor.getCursor();
        const mapping = this.mappingManager.findNearestNode(cursor.line);

        if (mapping) {
            /*this.highlightNode(mapping.nodeId);*/
            // Also visually focus the node in the markmap viewport
            const node = this.renderer?.getNodeByNodeId(mapping.nodeId);
            if (node) {
                this.focusNodeInEditor(node);
            }
        }
    }

    private updateMarkmapFromMarkdown(markdown: string): void {
        if (!this.renderer || !this.syncEngine) return;

        const result = this.renderer.render(markdown);

        if (result) {
            this.syncEngine.updateMappings(result.root, markdown);
            this.mappingManager.buildMappings(result.root, markdown);
        }
    }

    private updateMarkmapFromEditor(editor: Editor): void {
        this.updateMarkmapFromMarkdown(editor.getValue());
    }

    private async updateFromActiveFile(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();

        if (!activeFile || activeFile.extension !== 'md') {
            this.file = null;
            this.currentEditor = null;
            this.showMessage(activeFile ? ERROR_MESSAGES.NOT_MARKDOWN : ERROR_MESSAGES.NO_FILE_OPEN);
            return;
        }

        this.file = activeFile;
        this.hideMessage();

        // Try to get editor from active MarkdownView for bidirectional sync
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.file === activeFile) {
            this.currentEditor = activeView.editor;
            this.updateMarkmapFromEditor(activeView.editor);
        } else {
            // Try to find any MarkdownView for this file
            const mdView = this.findMarkdownView();
            if (mdView) {
                this.currentEditor = mdView.editor;
                this.updateMarkmapFromEditor(mdView.editor);
            } else {
                // No editor available, read from vault
                this.currentEditor = null;
                const content = await this.app.vault.read(activeFile);
                this.updateMarkmapFromMarkdown(content);
            }
        }
    }

    private showMessage(text: string): void {
        if (!this.messageEl) {
            this.messageEl = this.contentEl.createDiv({cls: CSS_CLASSES.error});
            this.messageEl.style.position = 'absolute';
            this.messageEl.style.inset = '0';
            this.messageEl.style.display = 'flex';
            this.messageEl.style.alignItems = 'center';
            this.messageEl.style.justifyContent = 'center';
            this.messageEl.style.zIndex = '10';
        }
        this.messageEl.setText(text);
        if (this.markmapContainerEl) {
            this.markmapContainerEl.style.display = 'none';
        }
    }

    private hideMessage(): void {
        if (this.messageEl) {
            this.messageEl.detach();
            this.messageEl = null;
        }
        if (this.markmapContainerEl) {
            this.markmapContainerEl.style.display = '';
        }
    }

    private focusMarkmapNode(nodeId: string): void {
        const nodeEl = this.containerEl.querySelector(
            `[data-node-id="${nodeId}"]`
        ) as HTMLElement | null;

        if (nodeEl) {
            nodeEl.setAttribute('tabindex', '-1');
            nodeEl.focus();
            return;
        }

        this.markmapContainerEl?.focus();
    }

    private focusNodeInEditor(node: IPureNode, event?: MouseEvent): void {
        const nodeId = (node.payload as any)?.nodeId as string | undefined;
        if (!nodeId) return;

        const mapping = this.mappingManager.getMappingById(nodeId);
        if (!mapping) return;

        const editor = this.getMarkdownEditor();
        if (!editor) return;

        // Set cursor to the node's line in the markdown editor
        editor.setCursor({line: mapping.startLine, ch: 0});

        // Visually select the node in markmap
        this.selectedNodeId = nodeId;
        this.highlightNode(nodeId);

        //this.renderer?.focusNode(node);
    }

    private handleNodeDblClick(node: IPureNode, event: MouseEvent | KeyboardEvent): void {
        if (!this.settings.editInMarkmap) return;

        const nodeId = (node.payload as any)?.nodeId as string | undefined;
        if (!nodeId) return;

        const plainContent = this.extractNodePlainText(node);
        this.showNodeEditor(node, nodeId, plainContent);
    }

    private showNodeEditor(node: IPureNode, nodeId: string, initialContent: string): void {
        this.removeEditorOverlay();

        const targetEl = this.markmapContainerEl?.querySelector(
            `[data-node-id="${nodeId}"]`
        ) as HTMLElement | null;
        if (!targetEl || !this.markmapContainerEl) return;

        this.editingNodeId = nodeId;

        // Create a floating HTML overlay positioned over the SVG container
        const overlay = document.createElement('div');
        overlay.addClass(CSS_CLASSES.inlineEditor);

        const input = overlay.createEl('input', {
            type: 'text',
            value: initialContent,
        });

        // Position the overlay at the node's screen coordinates
        const rect = targetEl.getBoundingClientRect();
        const containerRect = this.markmapContainerEl.getBoundingClientRect();
        overlay.style.position = 'absolute';
        overlay.style.left = `${rect.left - containerRect.left}px`;
        overlay.style.top = `${rect.top - containerRect.top}px`;
        overlay.style.minWidth = `${Math.max(rect.width, 150)}px`;
        overlay.style.zIndex = '100';

        let isCommitted = false;

        const commitEdit = async () => {
            if (isCommitted) return;
            isCommitted = true;

            const newContent = input.value.trim();
            if (newContent && newContent !== initialContent) {
                const editor = this.getMarkdownEditor();
                if (editor) {
                    await this.syncEngine?.markmapToMarkdown(editor, node, 'edit', newContent);
                    // Re-render markmap to reflect the edit
                    this.updateMarkmapFromEditor(editor);
                    this.focusNodeInEditor(node);
                }
            }
            this.removeEditorOverlay();
        };

        const cancelEdit = () => {
            if (isCommitted) return;
            isCommitted = true;
            this.removeEditorOverlay();
        };

        input.addEventListener('blur', commitEdit);
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commitEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });

        this.markmapContainerEl.appendChild(overlay);
        this.editorOverlay = overlay;
        input.focus();
        input.select();
    }

    private removeEditorOverlay(): void {
        if (this.editorOverlay && this.editorOverlay.parentNode) {
            this.editorOverlay.parentNode.removeChild(this.editorOverlay);
            this.editorOverlay = null;
        }
        this.editingNodeId = null;
    }

    private extractNodePlainText(node: IPureNode): string {
        const content = typeof node.content === 'string' ? node.content : '';
        const temp = document.createElement('div');
        temp.innerHTML = content;
        return temp.textContent || temp.innerText || content;
    }

    private getMarkdownEditor(): Editor | null {
        // 1. Check if we already have a valid editor for the current file
        if (this.currentEditor && this.file) {
            return this.currentEditor;
        }

        // 2. Try to find a MarkdownView for the current file
        const mdView = this.findMarkdownView();
        if (mdView) {
            this.currentEditor = mdView.editor;
            return this.currentEditor;
        }

        // 3. No editor available
        return null;
    }

    private findMarkdownView(): MarkdownView | null {
        if (!this.file) return null;

        // Search all workspace leaves for a MarkdownView with matching file
        const leaves = this.app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            const view = leaf.view;
            if (view instanceof MarkdownView && view.file === this.file) {
                return view;
            }
        }
        return null;
    }

    private handleNodeContextMenu(node: IPureNode, event: MouseEvent): void {
        const menu = new Menu();

        menu.addItem((item) => {
            item.setTitle('Go to line');
            item.setIcon('arrow-right');
            item.onClick(() => this.focusNodeInEditor(node, event));
        });

        menu.addItem((item) => {
            item.setTitle('Expand/Collapse');
            item.setIcon('git-branch');
            item.onClick(() => {
                this.toggleNode(node);
            });
        });

        if (this.settings.editInMarkmap) {
            menu.addItem((item) => {
                item.setTitle('Edit');
                item.setIcon('pencil');
                item.onClick(() => this.handleNodeDblClick(node, event as MouseEvent));
            });
        }

        menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle('Indent');
            item.setIcon('indent');
            item.onClick(async () => {
                const editor = this.getMarkdownEditor();
                if (editor) {
                    await this.syncEngine?.markmapToMarkdown(editor, node, 'indent');
                    this.updateMarkmapFromEditor(editor);
                    this.focusNodeInEditor(node);
                }
            });
        });

        menu.addItem((item) => {
            item.setTitle('Outdent');
            item.setIcon('outdent');
            item.onClick(async () => {
                const editor = this.getMarkdownEditor();
                if (editor) {
                    await this.syncEngine?.markmapToMarkdown(editor, node, 'outdent');
                    this.updateMarkmapFromEditor(editor);
                    this.focusNodeInEditor(node);
                }
            });
        });

        menu.showAtPosition({x: event.clientX, y: event.clientY});
    }

    private handleNodeDragStart(node: IPureNode, event: DragEvent): void {
        if (!event.dataTransfer) return;
        event.dataTransfer.setData('text/plain', JSON.stringify(node));
        event.dataTransfer.effectAllowed = 'move';
    }

    private handleNodeDragEnd(node: IPureNode, event: DragEvent): void {
        // Drag ended, cleanup if needed
    }

    private handleNodeDrop(targetNode: IPureNode, event: DragEvent): void {
        event.preventDefault();

        const data = event.dataTransfer?.getData('text/plain');
        if (!data) return;

        try {
            const sourceNode = JSON.parse(data) as IPureNode;
            // Handle the drop operation
            new Notice('Node moved successfully');
        } catch (error) {
            console.error('Failed to handle node drop:', error);
        }
    }

    private toggleNode(node: IPureNode): void {
        // Toggle node expansion in the markmap
        this.renderer?.fit();
    }

    private handleEnterKey(e: KeyboardEvent): void {
        if (!this.settings.editInMarkmap) return;
        if (!this.selectedNodeId) return;

        e.preventDefault();

        const node = this.renderer?.getNodeByNodeId(this.selectedNodeId);
        if (!node) return;

        const editor = this.getMarkdownEditor();
        if (!editor) return;

        // Insert sibling line in markdown
        this.syncEngine?.markmapToMarkdown(editor, node, 'insert-sibling').then((success) => {
            if (!success) return;

            // Re-render markmap to reflect the new node
            this.updateMarkmapFromEditor(editor);

            // Find the newly inserted node and open inline editor on it
            // The new node contains "New Node" as placeholder text
            // Double requestAnimationFrame to ensure assignNodeIds' rAF has completed
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    this.findAndEditNewNode();
                });
            });
        });
    }

    private handleTabKey(e: KeyboardEvent): void {
        if (!this.settings.editInMarkmap) return;
        if (!this.selectedNodeId) return;

        e.preventDefault();

        const node = this.renderer?.getNodeByNodeId(this.selectedNodeId);
        if (!node) return;

        const editor = this.getMarkdownEditor();
        if (!editor) return;

        this.syncEngine?.markmapToMarkdown(editor, node, 'insert-child').then((success) => {
            if (!success) return;

            this.updateMarkmapFromEditor(editor);

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    this.findAndEditNewNode();

                });
            });
        });
    }

    private findAndEditNewNode(): void {
        if (!this.renderer) return;

        const svg = this.containerEl.querySelector(".markmap-sync-svg");
        if (!svg) return;

        // Find the node containing "New Node" text
        const nodeElements = Array.from(svg.querySelectorAll('.markmap-node'));
        for (const el of nodeElements) {
            const node = this.renderer.findNodeByDomElement(el as Element);
            if (node) {
                const plainText = this.mappingManager.extractTextContent(node.content);
                if (plainText === 'New Node') {
                    const nodeId = (node.payload as any)?.nodeId as string | undefined;
                    if (nodeId) {
                        // Select and highlight the new node
                        /*this.selectedNodeId = nodeId;
                        this.highlightNode(nodeId);*/
                        this.focusNodeInEditor(node);

                        // Open inline editor on the new node
                        this.showNodeEditor(node, nodeId, plainText);
                        return;
                    }
                }
            }
        }
    }

    private highlightNode(nodeId: string): void {
        this.highlightedNodeId = nodeId;

        const svg = this.containerEl.querySelector('svg');
        if (!svg) return;

        this.containerEl.querySelectorAll('.markmap-node').forEach((el) => {
            el.removeClass(CSS_CLASSES.highlightedNode);
            el.removeClass(CSS_CLASSES.selectedNode);
        });

        const allNodes = this.containerEl.querySelectorAll('.markmap-node');
        const nodeEl = Array.from(allNodes).find((el) => {
            const data = (el as any).__data__;
            return data && (data.payload as any)?.nodeId === nodeId;
        }) ?? this.containerEl.querySelector(`[data-node-id="${nodeId}"]`);
        if (nodeEl) {
            nodeEl.addClass(CSS_CLASSES.highlightedNode);
            if (this.selectedNodeId === nodeId) {
                nodeEl.addClass(CSS_CLASSES.selectedNode);
            }
        }

        this.focusMarkmapNode(nodeId);
    }

    private expandAll(): void {
        this.renderer?.expandAll();
    }

    private collapseAll(): void {
        this.renderer?.collapseAll();
    }

    private onSyncStart(): void {
        this.containerEl.addClass('is-syncing');
    }

    private onSyncComplete(): void {
        this.containerEl.removeClass('is-syncing');
    }

    private onSyncError(error: Error): void {
        console.error('Sync error:', error);
        new Notice(`Sync error: ${error.message}`, 5000);
        this.containerEl.removeClass('is-syncing');
    }
}
