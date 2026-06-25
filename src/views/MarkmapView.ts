import {Editor, ItemView, MarkdownView, Menu, Notice, TFile, WorkspaceLeaf} from 'obsidian';
import {IPureNode} from 'markmap-common';
import {MarkmapRenderer, operationType} from '../components/MarkmapRenderer';
import {SyncEngine} from '../components/SyncEngine';
import {CommentOverlay} from '../components/CommentOverlay';
import {MarkmapSettings} from '../types';
import {CSS_CLASSES, ERROR_MESSAGES, VIEW_TYPE_MARKMAP} from '../constants';
import {Debouncer, throttle} from '../utils/debounce';
import {buildCommentIndex, computeCommentSlot, CommentSlotInfo} from '../utils/commentSlot';


export interface MarkmapToolbar {
    container: HTMLElement;
    zoomIn: () => void;
    zoomOut: () => void;
    fit: () => void;
    reset: () => void;
    expandAll: () => void;
    collapseAll: () => void;
}

export declare interface extendedSvgGEle extends SVGGElement {
    __data__: IPureNode
}

export class MarkmapView extends ItemView {
    private settings: MarkmapSettings;
    private renderer: MarkmapRenderer | null = null;
    private syncEngine: SyncEngine | null = null;
    private debouncer: Debouncer;
    private toolbar: HTMLElement | null = null;
    private file: TFile | null = null;
    private currentEditor: Editor | null = null;
    private selectedSvgNode: extendedSvgGEle | undefined = undefined;
    private newSvgNode: extendedSvgGEle | undefined = undefined;
    private editorOverlay: HTMLElement | null = null;
    private messageEl: HTMLElement | null = null;
    private markmapContainerEl: HTMLElement | null = null;
    private commentPopupLayer: HTMLElement | null = null;
    private commentOverlay: CommentOverlay | null = null;
    private commentRenderDebouncer = new Debouncer(32);
    private isEditingComment = false;
    private editingCommentNodeId: string | null = null;
    private lastCursorTrackTime = 0;

    constructor(leaf: WorkspaceLeaf, settings: MarkmapSettings) {
        super(leaf);
        this.settings = settings;
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


    }

    onload() {
        super.onload();
        this.containerEl.addClass(CSS_CLASSES.markmapContainer);
        this.contentEl.empty();

        //this.createToolbar();
        this.createMarkmapContainer();
        this.initSyncEngine();
        this.registerEventListeners();

        this.app.workspace.onLayoutReady(() => {
            this.refresh();
        });
    }


    async onClose(): Promise<void> {
        this.debouncer.cancel();
        this.updateNode_deboucer.cancel();
        this.clearNodeSelection();

        if (this.renderer) {
            this.renderer.destroy();
            this.renderer = null;
        }
        if (this.syncEngine) {
            this.syncEngine = null;
        }

        this.disposeComment();
        this.commentOverlay = null;

        if (this.commentPopupLayer) {
            this.commentPopupLayer.remove();
            this.commentPopupLayer = null;
        }
    }

    disposeComment(): void {

        if (this.commentOverlay) {
            this.commentOverlay.destroy();
            // this.commentOverlay = null;
        }
        //this.commentRenderDebouncer.cancel();
    }

    onResize(): void {
        super.onResize();
        //this.selectedSvgNode&&this.selectedSvgNode&&this.renderer?.adjustNodeWidthsOnZoom(this.selectedSvgNodethis.selectedSvgNode);

        //this.addHighlight();
        if (this.editorOverlay) {
            this.updateEditorPosition();
        }

        this.commentOverlay?.repositionActivePopup();
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
        /*   document.querySelectorAll<extendedSvgGEle>('.markmap-node').forEach((gEle: extendedSvgGEle) => {
               const depth = gEle.dataset.depth
               if (depth === '1') {
                   const line = gEle.__data__.payload?.lines as string;
   
                   this.app.workspace.getActiveViewOfType(MarkdownView)?.editor.setCursor({
                       line: Number(line.split(',')[0]),
                       ch: 0
                   });
   
               }
   
           })*/
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
            button.appendChild(this.getIconSvg(btn.icon));
            button.addEventListener('click', btn.action);
        }
    }

    private getIconSvg(icon: string): SVGSVGElement {
        const SVG_NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');

        const iconPaths: Record<string, string[]> = {
            'zoom-in': [
                'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
            ],
            'zoom-out': [
                'M3 2v6h6M3 13a9 9 0 1 0 3-7.7L3 8',
            ],
            'maximize': [
                'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
            ],
            'rotate-ccw': [
                'M3 2v6h6M3 13a9 9 0 1 0 3-7.7L3 8',
            ],
            'expand': [
                'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3',
            ],
            'collapse-all': [
                'M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7',
            ],
            'refresh-cw': [
                'M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3',
            ],
        };

        const paths = iconPaths[icon];
        if (paths) {
            for (const d of paths) {
                const path = document.createElementNS(SVG_NS, 'path');
                path.setAttribute('d', d);
                svg.appendChild(path);
            }
        }
        return svg;
    }

    private createMarkmapContainer(): void {
        const container = this.contentEl.createDiv();
        container.setCssStyles({
            width: '100%',
            height: '100%',
            position: 'relative'
        });
        // Make container focusable so it can receive keyboard events (Enter key)
        container.setAttribute('tabindex', '0');
        this.markmapContainerEl = container;

        // Dedicated overlay layer for comment popups. Hosted outside the SVG so popups
        // are not clipped/penetrated by the foreignObject's hit region and can stack
        // above all SVG nodes (SVG siblings ignore CSS z-index).
        const popupLayer = container.createDiv('markmap-comment-popup-layer');
        this.commentPopupLayer = popupLayer;

        this.commentOverlay = new CommentOverlay({
            app: this.app,
            popupLayer,
            getEditor: () => this.getMarkdownEditor(),
            getFilePath: () => this.file?.path || '',
            getView: () => this,
            onEditingChange: (isEditing, nodeId) => {
                this.isEditingComment = isEditing;
                this.editingCommentNodeId = nodeId ?? null;
            },
            onAfterEdit: () => this.onCommentEditFinished(),
            isEditing: () => this.isEditingComment,
            getEditingNodeId: () => this.editingCommentNodeId,
            getContentLines: () => this.syncEngine?.getMappingManager().getContentLines() ?? [],
        });

        this.renderer = new MarkmapRenderer(container, this.settings, {
            onNodeClick: (node, event) => this.focusNodeInEditor(node, event),
            onNodeDblClick: (node, event) => this.handleNodeDblClick(event, node),
            onNodeContextMenu: (node, event) => this.handleNodeContextMenu(node, event),
            onNodeDragStart: this.settings.dragEnabled ? (node, event) => this.handleNodeDragStart(node, event) : undefined,
            onNodeDragEnd: this.settings.dragEnabled ? (node, event) => this.handleNodeDragEnd(node, event) : undefined,
            onNodeDrop: this.settings.dragEnabled ? (node, event) => this.handleNodeDrop(node, event) : undefined,
            onZoom: () => {
                if (this.editorOverlay) {
                    this.updateEditorPosition();
                }
                //this.selectedSvgNode&&this.renderer?.adjustNodeWidthsOnZoom(this.selectedSvgNode);
                //this.addHighlight();
                //this.commentOverlay?.repositionActivePopup();
            }
            /*  onUpdate: () => {
                 //this.scheduleRenderComments()
                 if (this.editorOverlay) {
                     this.updateEditorPosition();
                 }
                 this.commentOverlay?.repositionVisiblePopups();
             } */
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
                if (leaf?.view?.getViewType() === VIEW_TYPE_MARKMAP) {
                    return;
                }

                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile !== this.file) {
                    this.resetStateOnFileChange();
                    this.commentOverlay?.destroy()
                    this.updateFromActiveFile();
                }
            })
        );

        this.registerEvent(
            this.app.workspace.on('editor-change', (editor) => {
                if (this.isActiveEditor(editor)) {

                    this.updateFromActiveFile();
                }
            })
        );

        // Ctrl+Enter/Tab etc. on the markmap container when it has focus.
        this.markmapContainerEl && this.registerDomEvent(this.markmapContainerEl, 'keydown', (e: KeyboardEvent) => {
            if (this.app.workspace.getActiveViewOfType(MarkdownView)) return;// make sure it is not triggered in markdown mode;
            e.preventDefault();
            e.stopPropagation();

            if (this.isAddCommentChord(e) && this.shouldHandleAddCommentHotkey(e)) {
                void this.addCommentToSelectedNode();
            } else if (e.key === 'Enter') {
                this.handleEnterKey(e);
            } else if (e.key === 'Tab') {
                this.handleTabKey(e);
            } else if (e.key === 'Backspace') this.handleBackspaceKey(e);
            else if (e.key === ' ') {
                this.handleNodeDblClick(e)
            } else if (['ArrowRight', 'ArrowDown', 'ArrowUp', 'ArrowLeft'].includes(e.key)) {
                void this.handleArrowKey(e);
            }
        }, {capture: false});

        /*      // Ctrl+Shift+Alt+C: capture on window so it works when the markdown editor (or another pane) has focus
             // but a markmap node is already selected in this view.
             const cmScroller = document.querySelector('.cm-contentContainer') as HTMLElement | null;
             cmScroller && this.registerDomEvent(cmScroller, 'keydown', (e: KeyboardEvent) => {
                 if (!this.isAddCommentChord(e) || !this.shouldHandleAddCommentHotkey(e)) return;
                 e.preventDefault();
                 e.stopPropagation();
                 void this.addCommentToSelectedNode();
             }, { capture: true });
      */
        // Clear selection and highlight when clicking outside any markmap node
        const svgEle = this.renderer?.getSvg() as HTMLElement | null;
        svgEle && this.markmapContainerEl && this.registerDomEvent(svgEle, 'click', (e: MouseEvent) => {
            if ((e.target as Element)?.closest('.markmap-comment-popup')) return;
            // If the click landed on a node or inside a node, don't clear
            this.selectedSvgNode = (e.target as Element).closest('g') as extendedSvgGEle | undefined;
            if (this.selectedSvgNode) {
                const node = this.getMNodeFromSvgNode();
                node && this.focusNodeInEditor(node);
            } else {
                this.clearNodeSelection();
            }

            //else this.updateFromActiveFile();
        });

        this.registerDomEvent(window, 'click', (e: MouseEvent) => {
            /* this.updateNode_deboucer.setWait(1);
             this.updateNode_deboucer.executeDebounced(()=>{
             });*/
            //if ((e.target as Element)?.closest('.markmap-comment-popup')) return;

            if ((e.target as Element).closest('.cm-contentContainer'))
                this.updateFromActiveFile();

        }, {capture: true});


    }

    private getMNodeFromSvgNode(svgNode: extendedSvgGEle | undefined = this.selectedSvgNode): IPureNode | undefined {
        return svgNode?.__data__
    }

    private shouldHandleArrowKey(e: KeyboardEvent): boolean {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return true;
        if (target.closest('.markmap-comment-textarea')) return false;
        if (target.closest(`.${CSS_CLASSES.inlineEditor} textarea`)) return false;
        if (target.closest('input, textarea, select, [contenteditable="true"]')) return false;
        return true;
    }

    private async handleArrowKey(e: KeyboardEvent): Promise<void> {
        if (!this.shouldHandleArrowKey(e)) return;

        const currentNode = this.getMNodeFromSvgNode();
        if (!currentNode) return;

        let targetNode: IPureNode | undefined;

        if (e.key === 'ArrowRight') {
            targetNode = currentNode.children?.[0];
        } else if (e.key === 'ArrowLeft') {
            targetNode = this.getParentNode(currentNode);
        } else if (e.key === 'ArrowDown') {
            targetNode = this.getSiblingNode(currentNode, 1);
        } else if (e.key === 'ArrowUp') {
            targetNode = this.getSiblingNode(currentNode, -1);
        }

        if (!targetNode) return;

        e.preventDefault();
        e.stopPropagation();
        this.focusNodeInEditor(targetNode);
    }

    private getParentNode(node: IPureNode): IPureNode | undefined {
        const directParent = (node as any).parent as IPureNode | undefined;
        if (directParent) return directParent;

        const root = this.renderer?.getCurrentRoot();
        if (!root || root === node) return undefined;

        const findParent = (parent: IPureNode): IPureNode | undefined => {
            if (parent.children?.includes(node)) return parent;
            for (const child of parent.children ?? []) {
                const found = findParent(child);
                if (found) return found;
            }
            return undefined;
        };

        return findParent(root);
    }

    private getSiblingNode(node: IPureNode, offset: 1 | -1): IPureNode | undefined {


        const parent = this.getParentNode(node);
        if (!parent?.children) return undefined;

        const nodeId = node.payload?.nodeId;
        const currentIndex = parent.children.findIndex((child) => {
            if (child === node) return true;
            return !!nodeId && child.payload?.nodeId === nodeId;
        });

        if (currentIndex === -1) return undefined;
        const nodeRe = parent.children[currentIndex + offset];
        if (nodeRe) return nodeRe;
        else {
            const mappingManager = this.syncEngine?.getMappingManager();
            if (!mappingManager) return undefined;
            const lines = (node.payload?.lines as string)?.split(',').map(Number);
            if (!lines?.length) return undefined;
            const [startLine] = lines;
            const isUp = offset === -1;
            for (let i = startLine + offset, end = isUp ? 0 : mappingManager.getLenOfContentLines() - 1; isUp ? i >= end : i < end; i += isUp ? -1 : 1) {
                const nodeid = mappingManager.getNodeIdAtLine(i);
                if (nodeid) return this.renderer?.getNodeByNodeId(nodeid) ?? undefined;
            }
        }
    }

    private getCurrentNodeForComment(): IPureNode | undefined {
        const selectedNode = this.getMNodeFromSvgNode();
        if (selectedNode) return selectedNode;

        const editor = this.getMarkdownEditor();
        if (!editor || !this.syncEngine || !this.renderer) return undefined;

        const mapping = this.syncEngine.getMappingManager().findNearestNode(editor.getCursor().line);
        if (!mapping) return undefined;

        return this.renderer.getNodeByNodeId(mapping.nodeId) ?? undefined;
    }

    /*     private selectNodeForComment(node: IPureNode): void {
            this.clearNodeSelection();
            this.selectedSvgNode = this.findSvgNodeFromMnodes(node);
            this.addHighlight();
        } */

    private isActiveEditor(editor: Editor): boolean {
        //this.app.workspace.getActiveViewOfType(MarkdownView) represents the current active view is markdown editor, but it maybe is another tab of markdown editor
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        return activeView?.editor === editor && this.file === activeView.file;
    }

    /*     private handleEditorChange(): void {
            if (this.isEditingComment) return;
            if (!this.syncEngine?.canSync()) return;
    
            if (this.settings.syncMode === 'realtime') {
                this.updateFromActiveFile();
            } else if (this.settings.syncMode === 'debounce') {
                this.debouncer.executeDebounced(() => {
                    this.updateFromActiveFile();
                });
            }
        } */

    // focus on a specific node when clicking a markdown line
    private handleCursorActivity(editor = this.getMarkdownEditor(), callback: (node: IPureNode) => void): void {
        if (!editor) return;

        const cursor = editor.getCursor();
        const mapping = this.syncEngine?.getMappingManager().findNearestNode(cursor.line);

        // Also, visually focus the node in the markmap viewport
        const node = this.renderer?.getNodeByNodeId(mapping?.nodeId || this.syncEngine!.getMappingManager().getFirstNodeId());
        if (node) {
            callback(node);
        }

    }

    private async updateMarkmapFromMarkdown(markdown: string): Promise<boolean> {
        if (!this.renderer || !this.syncEngine) return false;

        const result = await this.renderer.render(markdown, this.file?.basename);

        if (result) {
            /*  if (!result.root.children.length) return this.showMessage(ERROR_MESSAGES.NO_NODES_FOUND), false;
 
             this.hideMessage(); */
            await this.syncEngine.updateMappings(result.root, markdown);
            console.log('Markmap updated from markdown at', new Date().toString());
            //this.handleCursorActivity(); //@TODO
            /*   // Restore highlight after re-render
               requestAnimationFrame(() => {
                   requestAnimationFrame(() => {

                   });
               });*/
        }
        return Boolean(result);
    }

    // the entrance of updating markmap from markdown
    private async updateMarkmapFromEditor(editor: Editor | null, ontransitionend?: () => void, operationType: operationType = this.operationType): Promise<boolean> {
        let val = editor?.getValue();

        // Guard: if editor is non-null but getValue() returned empty, the reference may be stale.
        // Re-acquire a fresh editor reference and try again. If that also returns empty, fall back
        // to reading from vault before concluding the file is truly empty.
        if (!val) {
            const file = this.app.workspace.getActiveFile();
            if (file?.extension === 'md') {
                val = await this.app.vault.read(file);
            }else return false;
        }

        if (val?.trim() === '') {
            if (editor) {
                if (this.markmapContainerEl?.checkVisibility()) {
                    const heading = '# Main topic\n';
                    val = heading;
                    // Only write to vault if the file is truly empty (both editor and vault agree)
                    if (this.file) {
                        try {
                            await this.app.vault.modify(this.file, heading);
                        } catch {
                        }
                    }
                    this.markmapContainerEl.focus();
                }
            } else {
                return false
            }
        }

        if (ontransitionend) {
            this.renderer?.setOntransitionend(ontransitionend, this.selectedSvgNode, operationType);
        }

        return this.updateMarkmapFromMarkdown(val || '');
    }

    // 比对两个Editor对象是否完全相同
    private compareEditors(editor1: Editor | null, editor2: Editor | null): boolean {
        if (editor1 === editor2) return true;
        if (editor1 === null || editor2 === null) return false;

        // 比对editor的基本属性
        try {
            return editor1.getValue() === editor2.getValue() &&
                JSON.stringify(editor1.getCursor()) === JSON.stringify(editor2.getCursor());
        } catch {
            return false;
        }
    }

    updateNode_deboucer = new Debouncer(1);

    // the entrance of writing data from markdown to markmap
    private async updateFromActiveFile(): Promise<void> {
        if (this.isEditingComment) return;
        const now = Date.now();
        if (now - this.lastCursorTrackTime < 100) return;
        this.lastCursorTrackTime = now;


        throttle(() => {

            const activeFile = this.app.workspace.getActiveFile();

            if (!activeFile || activeFile.extension !== 'md') {
                this.file = null;
                this.currentEditor = null;
                this.showMessage(activeFile ? ERROR_MESSAGES.NOT_MARKDOWN : ERROR_MESSAGES.NO_FILE_OPEN);
                return;
            }

            this.file = activeFile;

            let currentEditor: Editor | null = null;
            // Try to get editor from active MarkdownView for bidirectional sync
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!activeView) return;
            if (activeView.file === activeFile) {
                currentEditor = activeView.editor;
            } else {
                // Try to find any MarkdownView for this file
                const mdView = this.findMarkdownView();
                if (mdView) {
                    currentEditor = mdView.editor;
                } else {
                    // No editor available, read from vault
                    currentEditor = null;
                }
            }

            // if (this.compareEditors(this.currentEditor, currentEditor)) return console.error('same editor, no need to update') ;

            this.currentEditor = currentEditor;

            if (!this.currentEditor) return this.showMessage(activeFile ? ERROR_MESSAGES.NOT_MARKDOWN : ERROR_MESSAGES.NO_FILE_OPEN);

            this.hideMessage();

            this.updateMarkmapFromEditor(this.currentEditor, () => {

                this.updateNode_deboucer.executeDebounced(() => {
                    this.handleCursorActivity(undefined, (node) => {
                        this.focusNodeInEditor(node, undefined, true);
                        this.renderComments();
                    });
                    //this.selectedSvgNode&&this.renderer?.adjustNodeWidthsOnZoom(this.selectedSvgNode);
                });

            }, 'none');
        }, 1000)();
    }

    private showMessage(text: string): void {
        if (!this.messageEl) {
            this.messageEl = this.contentEl.createDiv({cls: CSS_CLASSES.error});
            this.messageEl.setCssStyles({
                position: 'absolute',
                inset: '0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: '10'
            });
        }
        this.messageEl.setText(text);
        if (this.markmapContainerEl) {
            this.markmapContainerEl.setCssStyles({
                display: 'none'
            });
        }
    }

    private hideMessage(): void {
        if (this.messageEl) {
            this.messageEl.detach();
            this.messageEl = null;
        }
        if (this.markmapContainerEl) {
            this.markmapContainerEl.setCssStyles({
                display: ''
            });
        }
    }

    private async focusMarkmapNode(node = this.getMNodeFromSvgNode()): Promise<void> {

        if (node)
            await this.renderer?.focusNode(node);
        await this.renderer?.zoomIn();

        /*  if (nodeEl) {
             // nodeEl.setAttribute('tabindex', '0');
              nodeEl.focus();
              return;
          }*/

        //this.contentEl?.focus();
    }

    private async focusNodeInEditor(node: IPureNode, event?: MouseEvent, editingOnMarkdown = false): Promise<void> {
        const nodeId = (node.payload as any)?.nodeId as string | undefined;
        if (!nodeId) return;

        const mapping = this.syncEngine!.getMappingManager().getMappingById(nodeId);
        if (!mapping) return;

        const editor = this.getMarkdownEditor();
        if (!editor) return;

        // Set cursor to the node's line in the markdown editor
        /*  if (editor.getCursor().line !== mapping.startLine) {
              editor.setCursor({line: mapping.startLine, ch: 0});
              console.log(`Focusing node ${nodeId} at line ${mapping.startLine}`)
          }*/
        if (!editingOnMarkdown)
            editor.scrollIntoView({
                from: {line: mapping.startLine, ch: 0},
                to: {line: mapping.startLine, ch: 0}
            }, true)

        this.clearNodeSelection();
        this.selectedSvgNode = this.findSvgNodeFromMnodes(node);
        // Visually select the node in markmap
        //this.selectedNodeId = nodeId;
        this.addHighlight();
        this.app.workspace.getActiveViewOfType(MarkdownView) || this.markmapContainerEl?.focus(); //@TODO
        await this.focusMarkmapNode();

        /*  this.selectedSvgNode&&this.renderer?.adjustNodeWidthsOnZoom(this.selectedSvgNode);
          this.selectedSvgNode?.addEventListener('transitionend', (e: TransitionEvent) => {
              e.stopPropagation();
              this.addHighlight();
          },{once:true});*/
    }


    private handleNodeDblClick(event: MouseEvent | KeyboardEvent, nodefromcontextmenu?: IPureNode): void {
        if (!this.settings.editInMarkmap) return;

        const node = nodefromcontextmenu || this.getMNodeFromSvgNode()
        /*const nodeId = (node.payload as any)?.nodeId as string | undefined;*/
        if (!node) return;

        const plainContent = this.extractNodePlainText(node);


        this.showNodeEditor(plainContent, false);

    }


    private findSvgNodeFromMnodes(node: IPureNode): extendedSvgGEle | undefined {
        if (node.payload?.nodeId === this.selectedSvgNode?.__data__.payload?.nodeId) return this.selectedSvgNode;

        const allNodes: NodeListOf<extendedSvgGEle> = this.containerEl.querySelectorAll('.markmap-node');
        return Array.from(allNodes).find((el) => { //TODO optmize the query speed
            const data = (el as any).__data__;
            return data && (data.payload as any)?.nodeId === node.payload?.nodeId;
        });
    }

    private updateEditorPosition(): void {
        const overlay = this.editorOverlay;
        const newNodeEl = this.selectedSvgNode;
        if (!overlay || !newNodeEl || !this.markmapContainerEl) return;

        const input = overlay.querySelector('textarea') as HTMLTextAreaElement | null;
        if (!input) return;

        // Prefer the foreignObject inside the SVG node for precise bounds; fall back to the group bounds.
        const foreignObj = newNodeEl.querySelector('foreignObject') as HTMLElement | null;
        const rectOfNewNode = foreignObj ? foreignObj.getBoundingClientRect() : newNodeEl.getBoundingClientRect();
        const containerRect = this.markmapContainerEl.getBoundingClientRect();

        // Padding and sizing for modern chat-style input box
        const padding = 12;
        const targetWidth = Math.min(rectOfNewNode.width, containerRect.width / 3, 300)// Math.min(520, Math.floor(this.markmapContainerEl.clientWidth * 0.8));

        // Calculate position: try to center horizontally, position below the node
        let offsetLeft = rectOfNewNode.left - containerRect.left //+ (rectOfNewNode.width - targetWidth) / 2;
        let offsetTop = rectOfNewNode.top - containerRect.top //+ padding;

        // Ensure the overlay stays within container bounds
        offsetLeft = Math.max(padding, Math.min(offsetLeft, this.markmapContainerEl.clientWidth - targetWidth));
        offsetTop = Math.max(padding, Math.min(offsetTop, this.markmapContainerEl.clientHeight - rectOfNewNode.height));

        // Check if editor would go off bottom; if so, position above the node
        /* if (offsetTop + 250 > this.markmapContainerEl.clientHeight) {
             offsetTop = Math.max(padding, rectOfNewNode.top - containerRect.top - 250 - padding);
         }*/

        overlay.setCssStyles({
            left: `${offsetLeft}px`,
            top: `${offsetTop}px`,
            width: `${targetWidth}px`
        });
        /*overlay.style.minWidth = `${targetWidth}px`;
        overlay.style.maxWidth = `${targetWidth}px`;*/

        // Ensure textarea fills the overlay and adjust height to fit content
        input.setCssStyles({
            width: '100%'
        });
        const adjustHeight = () => {
            input.setCssStyles({
                height: 'auto'
            });
            const maxHeight = this.markmapContainerEl!.clientHeight - Math.max(0, offsetTop) - padding;
            const minHeight = 44;
            const scrollHeight = input.scrollHeight;

            input.setCssStyles({
                height: maxHeight + 'px',
                overflowY: 'auto'
            });
            /* if (scrollHeight > maxHeight) {
             } else if (scrollHeight < minHeight) {
                 input.style.height = minHeight + 'px';
                 input.style.overflowY = 'hidden';
             } else {
                 input.style.height = scrollHeight + 'px';
                 input.style.overflowY = 'hidden';
             }*/
        };
        adjustHeight();
    }

    private showNodeEditor(initialContent: string, isNewNode = true): void {

        this.removeEditorOverlay();
        this.renderer?.lockZoom();


        const newNodeEl = this.selectedSvgNode;
        if (!newNodeEl || !this.markmapContainerEl) return;

        // Create a floating HTML overlay positioned over the SVG container
        const overlay = document.createElement('div');
        overlay.addClass(CSS_CLASSES.inlineEditor);
        this.editorOverlay = overlay;

        const input = overlay.createEl('textarea', {
            text: initialContent, cls: 'markmap-inline-textarea'
        });
        //  input.addEventListener('input', () => this.updateEditorPosition());

        overlay.setCssStyles({
            position: 'absolute',
            zIndex: '100'
        });

        // When creating a new node, the node may be animating. Keep the overlay
        // synced to the node's left/top/width during the transition using requestAnimationFrame.
        let _rafId: number | null = null;
        let _syncing = false;

        const syncPositionToNode = () => {
            /*  const foreignObj = newNodeEl.querySelector('foreignObject') as HTMLElement | null;
              const rect = foreignObj ? foreignObj.getBoundingClientRect() : newNodeEl.getBoundingClientRect();
              const containerRect = this.markmapContainerEl!.getBoundingClientRect();
  
              const left = rect.left - containerRect.left;
              const top = rect.top - containerRect.top;
              const width = Math.min(rect.width,containerRect.width/3,300);
  
              // Apply node bounds directly to overlay and input so they track the node exactly
              overlay.setCssStyles({
                  left: `${left}px`,
                  top: `${top}px`,
                  width: `${width}px`
              });
              // Make textarea fill the overlay
              input.setCssStyles({
                  width: '100%'
              });*/
            this.updateEditorPosition()
        };

        const _tick = () => {
            syncPositionToNode();
            _rafId = requestAnimationFrame(_tick);
        };

        const startSync = () => {
            if (_syncing) return;
            _syncing = true;
            _tick();
        };

        const stopSync = () => {
            _syncing = false;
            if (_rafId !== null) {
                cancelAnimationFrame(_rafId);
                _rafId = null;
            }
        };

        // Attach transition listeners to detect animation. Always sync once immediately
        // so overlay is positioned even if there's no transition.
        syncPositionToNode();
        newNodeEl.addEventListener('transitionstart', startSync);
        newNodeEl.addEventListener('transitionend', () => {
            stopSync();
            // Ensure final position after transition
            syncPositionToNode();
        });

        // Expose a cleanup hook on the overlay so removeEditorOverlay can stop the RAF
        (overlay as any)._stopSync = () => {
            stopSync();
            try {
                newNodeEl.removeEventListener('transitionstart', startSync);
                // transitionend listener is anonymous above; safe to leave or could be removed via reference if needed
            } catch (e) {
                // ignore
            }
        };

        const commitEdit = async () => {

            const newNode = this.getMNodeFromSvgNode();
            const newContent = input.value.trim();
            if (newNode && newContent && newContent !== initialContent) {
                const editor = this.getMarkdownEditor();
                if (editor) {
                    this.syncEngine?.markmapToMarkdown(editor, newNode, 'edit', newContent);
                    // Re-render markmap to reflect the edit
                    this.updateMarkmapFromEditor(editor, () => {

                        this.focusNodeInEditor(newNode);
                    }, 'change-current');
                }
            } else cancelEdit();
        };

        const cancelEdit = () => {
            this.removeEditorOverlay();
            this.markmapContainerEl?.focus();
        };

        input.addEventListener('keydown', (e: KeyboardEvent) => {
            e.stopPropagation();
            //@ts-ignore
            if (e.currentTarget.nodeName != 'TEXTAREA') return;
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commitEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });

        this.markmapContainerEl.appendChild(overlay);
        this.updateEditorPosition();

        input.focus();
        if (isNewNode) {
            input.select();
        } else {
            input.selectionStart = input.selectionEnd = input.value.length;
        }

    }

    private removeEditorOverlay(): void {
        if (this.editorOverlay) {
            // Stop any running sync loop if present
            const stop = (this.editorOverlay as any)._stopSync;
            if (typeof stop === 'function') {
                try {
                    stop();
                } catch (e) { /* ignore */
                }
            }
            if (this.markmapContainerEl && this.markmapContainerEl.contains(this.editorOverlay)) {
                this.markmapContainerEl.removeChild(this.editorOverlay);
            }
        }
        this.editorOverlay = null;
        this.renderer?.unlockZoom();
    }

    private extractNodePlainText(node: IPureNode): string {
        const content = typeof node.content === 'string' ? node.content : '';
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            return doc.body.textContent || doc.body.innerText || content;
        } catch (e) {
            return content;
        }
    }

    private getMarkdownEditor(): Editor | null {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

        // 1. Verify cached editor is still tied to a current MarkdownView
        if (this.currentEditor && this.file) {
            const isValid = activeView?.editor === this.currentEditor ||
                this.findMarkdownView()?.editor === this.currentEditor;
            if (isValid) {
                return this.currentEditor;
            }
            // Stale reference — clear it and fall through to re-fetch
            this.currentEditor = null;
        }

        // 2. Try active view first
        if (activeView && activeView.file === this.file) {
            this.currentEditor = activeView.editor;
            return this.currentEditor;
        }

        // 3. Try to find a MarkdownView for the current file
        const mdView = this.findMarkdownView();
        if (mdView) {
            this.currentEditor = mdView.editor;
            return this.currentEditor;
        }

        // 4. No editor available
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
                item.onClick(() => this.handleNodeDblClick(event as MouseEvent, node));
            });
        }

        menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle('Indent');
            item.setIcon('indent');
            item.onClick(async () => {
                const editor = this.getMarkdownEditor();
                if (editor) {
                    this.syncEngine?.markmapToMarkdown(editor, node, 'indent');

                    this.updateMarkmapFromEditor(editor, () => {
                        this.focusNodeInEditor(node);
                    });
                }
            });
        });

        menu.addItem((item) => {
            item.setTitle('Outdent');
            item.setIcon('outdent');
            item.onClick(async () => {
                const editor = this.getMarkdownEditor();
                if (editor) {
                    this.syncEngine?.markmapToMarkdown(editor, node, 'outdent');

                    this.updateMarkmapFromEditor(editor, () => {
                        this.focusNodeInEditor(node);
                    });
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


    private handleBackspaceKey(e: KeyboardEvent): void {
        if (!this.settings.editInMarkmap) return;
        if (!this.selectedSvgNode) return;

        const node = this.getMNodeFromSvgNode();
        if (!node) return;

        const editor = this.getMarkdownEditor();
        if (!editor) return;

        // Capture deleted node's mapping before deletion (unavailable after re-render)
        const deletedNodeId = node.payload?.nodeId as string || '';

        const deletedMapping = this.syncEngine!.getMappingManager().getMappingById(deletedNodeId);

        this.syncEngine?.markmapToMarkdown(editor, node, 'delete').then(async (result) => {
            if (!result?.success) return;

            // Re-render markmap to reflect the deletion

            this.updateMarkmapFromEditor(editor, () => {
                let lastNode: IPureNode | null = null;

                if (deletedMapping) {
                    const mappingManager = this.syncEngine!.getMappingManager();
                    // Find the nearest previous same-level sibling (same parentId, startLine before deleted node)
                    const prevSibling = mappingManager.getAllMappings()
                        .filter(m => m.parentId === deletedMapping.parentId && m.startLine < deletedMapping.startLine)
                        .sort((a, b) => b.startLine - a.startLine)[0];

                    const targetId = prevSibling?.nodeId ?? deletedMapping.parentId;
                    if (targetId) {
                        lastNode = this.renderer?.getNodeByNodeId(targetId) ?? null;
                    }
                }

                lastNode && this.focusNodeInEditor(lastNode);
            }, 'delete-current');
        });
    }

    private handleEnterKey(e: KeyboardEvent): void {
        if (!this.settings.editInMarkmap) return;
        if (!this.selectedSvgNode) return;

        e.preventDefault();

        const node = this.getMNodeFromSvgNode();
        if (!node) return;

        const editor = this.getMarkdownEditor();
        if (!editor) return;

        // Insert sibling line in markdown
        this.syncEngine?.markmapToMarkdown(editor, node, 'insert-sibling').then(async (result) => {
            if (!result?.line) return;

            // 必须主动立刻重渲染，因为editor-change带有3秒debounce，直接寻找节点会导致使用的是旧DOM数据

            this.updateMarkmapFromEditor(editor, () => {
                this.findAndEditNewNode(result.line);
            }, 'insert-sibling');
        });
    }

    private operationType: "insert-child" | "insert-sibling" | "change-current" | "delete-current" = "change-current"

    private handleTabKey(e: KeyboardEvent): void {
        if (!this.settings.editInMarkmap) return;
        if (!this.selectedSvgNode) return;

        e.preventDefault();

        const node = this.getMNodeFromSvgNode();
        if (!node) return;

        const editor = this.getMarkdownEditor();
        if (!editor) return;

        this.syncEngine?.markmapToMarkdown(editor, node, 'insert-child').then(async (result) => {
            if (!result.success || result.line === undefined) return;

            this.updateMarkmapFromEditor(editor, () => {
                this.findAndEditNewNode(result.line);
            }, 'insert-child');

        });
    }


    private async findAndEditNewNode(targetLine?: number): Promise<void> {
        if (!this.renderer) return;

        const svg = this.renderer.getSvg();
        if (!svg) return;

        // If we have a target line, try to find the nodeId from mapping
        if (targetLine !== undefined) {
            // Find mappings for the target line
            const nodeId = this.syncEngine!.getMappingManager().getNodeIdAtLine(targetLine);
            console.log('idsAtLine when writing markmap to markdown.\n', nodeId, 'at line', targetLine);

            const node = this.renderer.getNodeByNodeId(nodeId);
            if (node) {

                const plainText = this.syncEngine!.getMappingManager().extractTextContent(node.content);
                // Check if it's actually the "New Node" we just added
                if (plainText === 'New Node') { //todo the if is redundant
                    this.focusNodeInEditor(node);

                    /*shownodeeditor must be called before calling focusnodeineditor, because it relies on selectednodeid */
                    this.showNodeEditor(plainText);
                    return;
                }
            }

        }

        /*     // Fallback to searching for "New Node" text if targetLine didn't work or wasn't provided
             const nodeElements = Array.from(svg.querySelectorAll('.markmap-node'));
             console.error('accurate match failed, fallback occurs, nodeElements are', nodeElements);
             for (const el of nodeElements) {
                 const node = this.renderer.findNodeByDomElement(el as Element);
                 if (node) {
                     this.focusNodeInEditor(node);
                     this.showNodeEditor(node)
                 }
             }*/
    }

    /*   private restoreHighlightFromCursor(): void {
           const editor = this.getMarkdownEditor();
           if (!editor) return;

           const cursor = editor.getCursor();
           const mapping = this.syncEngine!.getMappingManager().findNearestNode(cursor.line);

           if (mapping) {
               this.selectedNodeId = mapping.nodeId;
               this.highlightNode(mapping.nodeId);
           }
       }*/

    private addHighlight(): void {
        const svg = this.renderer?.getSvg();
        if (!svg) return;
        if (this.selectedSvgNode) {
            this.selectedSvgNode.addClass(CSS_CLASSES.highlightedNode);
            this.selectedSvgNode.addClass(CSS_CLASSES.selectedNode);
            this.renderComments();
        }
    }

    private clearNodeSelection(): void {
        this.selectedSvgNode = undefined;
        this.removeEditorOverlay();

        this.containerEl.querySelectorAll('.markmap-node').forEach((el) => {
            el.removeClass(CSS_CLASSES.highlightedNode);
            el.removeClass(CSS_CLASSES.selectedNode);
        });
        this.commentOverlay?.hideAllPopups();
        //this.scheduleRenderComments();
    }

    private resetStateOnFileChange(): void {
        this.clearNodeSelection();
        // this.commentPopupLayer?.empty();
        this.isEditingComment = false;
        this.editingCommentNodeId = null;
        this.lastCursorTrackTime = 0;
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

    private isAddCommentChord(e: KeyboardEvent): boolean {
        return e.key.toLowerCase() === 'c'
            && e.shiftKey
            && e.altKey
            && (e.ctrlKey || e.metaKey);
    }

    public shouldHandleAddCommentHotkey(e?: KeyboardEvent): boolean {
        if (!this.selectedSvgNode) return false;
        const target = e?.target;
        if (!(target instanceof HTMLElement)) return true;
        if (target.closest('.markmap-comment-textarea')) return false;
        if (target.closest(`.${CSS_CLASSES.inlineEditor} textarea`)) return false;
        return true;
    }

    /*    canAddCommentToSelection(): boolean {
           const node = this.getCurrentNodeForComment();
           if (!node || !this.syncEngine) return false;
   
           const nodeId = (node.payload as { nodeId?: string } | undefined)?.nodeId;
           if (!nodeId) return false;
   
           const mapping = this.syncEngine.getMappingManager().getMappingById(nodeId);
           if (!mapping) return false;
   
           return canAddCommentToNode(
               mapping,
               (from, to, id) => this.syncEngine!.getMappingManager().hasOtherNodeStartInRange(id, from, to)
           );
       } */

    async addCommentToSelectedNode(): Promise<void> {
        const node = this.getCurrentNodeForComment();
        if (!node) {
            new Notice('Select a markmap node or place the cursor in a node first');
            return;
        }

        const nodeId = (node.payload as { nodeId?: string } | undefined)?.nodeId;
        if (!nodeId || !this.syncEngine || !this.renderer || !this.commentOverlay) return;

        const mappingManager = this.syncEngine.getMappingManager();
        const mapping = mappingManager.getMappingById(nodeId);
        if (!mapping) return;

        const hasOther = (from: number, to: number) =>
            mappingManager.findNextNodeLine(from, to);

        /*  if (!canAddCommentToNode(mapping, hasOther)) {
             new Notice('Cannot add comment here: another node starts in this region');
             return;
         } */

        const svg = this.renderer.getSvg();
        if (!svg) return;

        const lines = mappingManager.getContentLines();
        const existingSlot = computeCommentSlot(mapping, lines, hasOther);

        if (existingSlot) {
            this.commentOverlay.openCommentEditor(nodeId, existingSlot, svg);
            return;
        }

        const editor = this.getMarkdownEditor();
        if (!editor) {
            new Notice('Open the Markdown editor for this file to add a comment');
            return;
        }

        const fromLine = mapping.startLine + 1;
        let slot: CommentSlotInfo;

        if (fromLine >= mapping.endLine) {
            const titleCh = editor.getLine(mapping.startLine).length;
            editor.replaceRange('\n', {line: mapping.startLine, ch: titleCh});
            slot = {
                nodeId,
                fromLine,
                toLine: fromLine,
                text: '',
                contentHash: `${fromLine}:${fromLine}:`,
            };
        } else {
            slot = {
                nodeId,
                fromLine,
                toLine: mapping.endLine,
                text: lines.slice(fromLine, mapping.endLine + 1).join('\n'),
                contentHash: `${fromLine}:${mapping.endLine}:`,
            };
        }

        await this.updateMarkmapFromEditor(editor);

        const refreshedMapping = mappingManager.getMappingById(nodeId);
        const refreshedLines = mappingManager.getContentLines();
        const refreshedSlot = refreshedMapping
            ? computeCommentSlot(refreshedMapping, refreshedLines, hasOther) ?? slot
            : slot;

        this.commentOverlay.openCommentEditor(nodeId, refreshedSlot, svg);
    }

    /** Refresh line mappings from the editor after a comment save (markmap view is often active, so updateFromActiveFile would no-op). */
    private onCommentEditFinished(): void {
        const editor = this.getMarkdownEditor();
        if (!editor || !this.syncEngine || !this.renderer) return;

        const root = this.renderer.getCurrentRoot();
        if (!root) return;

        this.syncEngine.updateMappings(root, editor.getValue());
        this.renderComments();
    }

    /*private scheduleRenderComments(): void {
        this.commentRenderDebouncer.executeDebounced(() => this.renderComments());
    }*/

    private renderComments(): void {
        throttle(() => {
            if (!this.renderer || !this.syncEngine || !this.commentOverlay) return;

            const svg = this.renderer.getSvg();
            if (!svg) return;

            const mappingManager = this.syncEngine.getMappingManager();
            const lines = mappingManager.getContentLines();

            if (!lines.length) {
                //this.commentOverlay.sync(svg, new Map());
                return;
            }

            const index = buildCommentIndex(
                mappingManager.getAllMappings(),
                lines,
                (from, to) => mappingManager.findNextNodeLine(from, to)
            );

            this.commentOverlay.sync(svg, index);
        }, 600)();
    }
}
