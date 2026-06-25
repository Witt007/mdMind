import { App, Editor, ItemView, MarkdownRenderer, Notice } from 'obsidian';
import { IPureNode } from 'markmap-common';
import { CSS_CLASSES } from '../constants';
import { CommentSlotInfo } from '../utils/commentSlot';

const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvgIcon(paths: string[], size = 14): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    for (const d of paths) {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
    }
    return svg;
}

const COMMENT_ICON = createSvgIcon([
    'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    'M13 8H7',
    'M17 12H7'
], 12);
const SAVE_ICON = createSvgIcon(['M20 6 9 17l-5-5']);
const CANCEL_ICON = createSvgIcon(['M18 6 6 18', 'M6 6l12 12']);
const EDIT_ICON = createSvgIcon(['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z']);
const COMMENT_HEADING_PATTERN = /^\s{0,3}#{1,6}(?:\s|$)/m;
const COMMENT_HEADING_REPLACE_PATTERN = /^(\s{0,3})#{1,6}(?:\s+|$)/gm;

export interface CommentOverlayOptions {
    app: App;
    popupLayer: HTMLElement;
    getEditor: () => Editor | null;
    getFilePath: () => string;
    getView: () => ItemView;
    onEditingChange: (isEditing: boolean, nodeId?: string) => void;
    onAfterEdit: () => void;
    isEditing: () => boolean;
    getEditingNodeId: () => string | null;
    getContentLines: () => string[];
}

interface NodeIconState {
    nodeEl: Element;
    foreign: Element;
    container: HTMLElement | null;
    iconSpan: HTMLElement | null;
    slot: CommentSlotInfo | null;
    isHoveredIcon: boolean;
    isEditing: boolean;
    suppressPopupUntilHover: boolean;
    hideTimer: ReturnType<typeof setTimeout> | null;
}

export class CommentOverlay {
    readonly options: CommentOverlayOptions;
    readonly app: App;
    private nodeStates = new Map<string, NodeIconState>();
    private activePopup: HTMLElement | null = null;
    private activeNodeId: string | null = null;
    private isHoveredPopup = false;
    private activeHideTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(options: CommentOverlayOptions) {
        this.options = options;
        this.app = options.app;
    }

    getPopupLayer(): HTMLElement {
        return this.options.popupLayer;
    }

    // ── Icon Management ──

    private attachIconIfNeeded(state: NodeIconState): void {
        if (state.container) return;

        state.container = document.createElement('div');
        state.container.className = 'markmap-comment-container';

        state.iconSpan = document.createElement('span');
        state.iconSpan.className = 'markmap-comment-icon';
        state.iconSpan.appendChild(COMMENT_ICON.cloneNode(true));
        state.container.appendChild(state.iconSpan);
        state.foreign.appendChild(state.container);

        state.iconSpan.addEventListener('mouseenter', () => {
            state.suppressPopupUntilHover = false;
            state.isHoveredIcon = true;
            this.clearActiveHideTimer();
            this.showPopupForNode(state);
        });
        state.iconSpan.addEventListener('mouseleave', () => {
            state.isHoveredIcon = false;
            this.delayHidePopup(state);
        });
    }

    private removeIcon(state: NodeIconState): void {
        if (state.container) {
            state.container.remove();
            state.container = null;
            state.iconSpan = null;
        }
    }

    // ── Per-node helpers ──

    private clearActiveHideTimer(): void {
        if (this.activeHideTimer) {
            clearTimeout(this.activeHideTimer);
            this.activeHideTimer = null;
        }
    }

    private isNodeSelected(state: NodeIconState): boolean {
        return state.nodeEl.classList.contains(CSS_CLASSES.selectedNode)
            || state.nodeEl.classList.contains(CSS_CLASSES.highlightedNode);
    }

    /** Keep slot.text in sync with the editor (source of truth after edits).
     private refreshSlotFromEditor(slot: CommentSlotInfo): void {
     const editor = this.options.getEditor();
     if (!editor) return;

     const lines = editor.getValue().split('\n');
     const from = slot.fromLine;
     let to = slot.toLine;

     if (from > to || from >= lines.length) {
     slot.text = '';
     slot.contentHash = `${from}:${to}:`;
     return;
     }

     to = Math.min(to, lines.length - 1);
     slot.toLine = to;
     const text = lines.slice(from, to + 1).join('\n');
     slot.text = text;
     slot.contentHash = `${from}:${to}:${text}`;
     } */

    private delayHidePopup(state: NodeIconState): void {
        this.clearActiveHideTimer();

        if (!state.isEditing && !state.isHoveredIcon && !this.isHoveredPopup && !this.isNodeSelected(state)) {
            if (this.activePopup) {
                this.activePopup.removeClass('is-active');
                this.activeHideTimer = setTimeout(() => {
                    if (!state.isEditing && !state.isHoveredIcon && !this.isHoveredPopup && !this.isNodeSelected(state)) {
                        this.hidePopup();
                        // If a node is selected, show its popup after hiding the hovered one
                        for (const s of this.nodeStates.values()) {
                            if (this.isNodeSelected(s) && s.slot?.text?.trim()) {
                                this.showPopupForNode(s);
                                break;
                            }
                        }
                    }
                }, 220);
            }
        } else if (!state.isEditing && !state.isHoveredIcon && !this.isHoveredPopup && this.isNodeSelected(state)) {
            // Node is still selected — keep it
            this.clearActiveHideTimer();
        }
    }

    // ── Singleton Popup Lifecycle ──

    private hidePopup(): void {
        if (this.activePopup) {
            for (const [, s] of this.nodeStates) {
                if (s.iconSpan) {
                    s.iconSpan.removeClass('is-active');
                }
            }
            this.activePopup.removeClass('is-active');
            this.activePopup.removeClass('is-editing');
            this.activePopup.empty();
            this.activePopup.remove();
            this.activePopup = null;
        }
        this.activeNodeId = null;
        this.isHoveredPopup = false;
    }

    private showPopupForNode(state: NodeIconState): void {
        if (!state.iconSpan) return;

        const slot = state.slot;
        if (!slot) return;

        if (!slot.text.trim() && !state.isEditing) {
            this.hidePopup();
            return;
        }

        if (this.options.isEditing() && this.options.getEditingNodeId() !== this.getNodeId(state)) {
            return;
        }

        this.ensurePopup();

        const nodeId = this.getNodeId(state);
        const isDifferentNode = this.activeNodeId !== nodeId;
        if (isDifferentNode) {
            const prevState = this.activeNodeId ? this.nodeStates.get(this.activeNodeId) : undefined;
            if (prevState?.iconSpan) {
                prevState.iconSpan.removeClass('is-active');
            }
            this.activeNodeId = nodeId;
        }

        state.iconSpan.addClass('is-active');

        if (state.isEditing) {
            if (!this.activePopup!.querySelector('.markmap-comment-textarea')) {
                this.setupEditMode(this.activePopup!, state);
            }
        } else {
            this.renderPreview(this.activePopup!, slot);
        }

        this.repositionActivePopup();
        requestAnimationFrame(() => {
            this.activePopup?.addClass('is-active');
        });
    }

    private ensurePopup(): HTMLElement {
        if (this.activePopup) return this.activePopup;

        this.activePopup = document.createElement('div');
        this.activePopup.className = 'markmap-comment-popup';

        this.activePopup.addEventListener('click', (e) => e.stopPropagation());
        this.activePopup.addEventListener('dblclick', (e) => e.stopPropagation());
        this.activePopup.addEventListener('contextmenu', (e) => e.stopPropagation());
        this.activePopup.addEventListener('mousedown', (e) => e.stopPropagation());
        this.activePopup.addEventListener('wheel', (e) => {
            e.stopPropagation();
        }, { passive: true });

        this.activePopup.addEventListener('mouseenter', () => {
            this.isHoveredPopup = true;
            this.clearActiveHideTimer();
            this.activePopup?.addClass('is-active');
        });
        this.activePopup.addEventListener('mouseleave', () => {
            this.isHoveredPopup = false;
            const state = this.activeNodeId ? this.nodeStates.get(this.activeNodeId) : undefined;
            if (state) {
                this.delayHidePopup(state);
            }
        });

        this.options.popupLayer.appendChild(this.activePopup);
        return this.activePopup;
    }

    private getNodeId(state: NodeIconState): string {
        //@ts-ignore
        return state.nodeEl?.__data__.payload.nodeId ?? '';
        /* for (const [id, s] of this.nodeStates) {
             if (s === state) return id;
         }
         return '';*/
    }

    // ── Rendering ──

    private renderPreview(popup: HTMLElement, slot: CommentSlotInfo): void {
        // if (popup.dataset.contentHash === slot.contentHash) return;

        popup.removeClass('is-editing');
        popup.empty();
        popup.dataset.contentHash = slot.contentHash;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'markmap-comment-content';
        contentDiv.classList.add('content-enter');
        popup.appendChild(contentDiv);
        MarkdownRenderer.render(this.options.app,
            slot.text,
            contentDiv,
            this.options.getFilePath(),
            this.options.getView()
        );

        const editBtn = document.createElement('button');
        editBtn.className = 'markmap-comment-edit-btn';
        editBtn.appendChild(EDIT_ICON.cloneNode(true));
        popup.appendChild(editBtn);

        const state = this.activeNodeId ? this.nodeStates.get(this.activeNodeId) : undefined;
        if (state) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                state.isEditing = true;
                this.showPopupForNode(state);
            });
            contentDiv.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                state.isEditing = true;
                this.showPopupForNode(state);
            });
        }
    }

    private setupEditMode(popup: HTMLElement, state: NodeIconState): void {
        const slot = state.slot;
        if (!slot) return;

        const lines = this.options.getContentLines();
        if (!lines.length) return;

        state.isEditing = true;
        const nodeId = this.getNodeId(state);
        this.options.onEditingChange(true, nodeId);
        popup.empty();
        popup.addClass('is-editing');

        const initialRawText = slot.text;

        let currentStartLine = slot.fromLine;
        let currentEndLine = slot.toLine;
        let hasNotifiedHeadingFilter = false;

        const textarea = document.createElement('textarea');
        textarea.className = 'markmap-comment-textarea';
        textarea.value = initialRawText;
        textarea.placeholder = 'Type comment (Markdown supported)...';
        popup.appendChild(textarea);

        const actions = document.createElement('div');
        actions.className = 'markmap-comment-actions';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'markmap-comment-btn save';
        saveBtn.appendChild(SAVE_ICON.cloneNode(true));

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'markmap-comment-btn cancel';
        cancelBtn.appendChild(CANCEL_ICON.cloneNode(true));

        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);
        popup.appendChild(actions);

        textarea.focus();

        const applyToEditor = (val: string) => {
            const editor = this.options.getEditor();
            if (!editor) return;
            if (COMMENT_HEADING_PATTERN.test(val)) {
                if (!hasNotifiedHeadingFilter) {
                    new Notice('Heading markers (# to ######) are removed from comments');
                    hasNotifiedHeadingFilter = true;
                }
                val = val.replace(COMMENT_HEADING_REPLACE_PATTERN, '$1');

                textarea.value = val;

            }

            /*    const lastLineText = editor.getLine(currentEndLine) || '';
                if (currentEndLine >= currentStartLine) {
                    const from = {line: currentStartLine, ch: 0};
                    const to = {line: currentEndLine, ch: lastLineText.length};
                    editor.replaceRange('', from, to);
                } else {
                }*/
            editor.replaceRange(val + '\n', { line: currentStartLine, ch: 0 }, { line: currentEndLine, ch: 0 });
        };

        textarea.addEventListener('input', () => {
            applyToEditor(textarea.value);
        });

        const endEditSession = () => {
            state.isEditing = false;
            this.options.onEditingChange(false);
        };

        const exitEditMode = (apply: () => void, dismissAfter = false) => {
            if (!this.options.isEditing()) return;
            endEditSession();
            apply();
            this.activePopup?.removeClass('is-editing');
            this.options.onAfterEdit();
            /*     if (dismissAfter) {
                     state.suppressPopupUntilHover = true;
                     this.isHoveredPopup = false;
                     this.hidePopup();
                 } else {
                     const p = this.activePopup;
                     if (p) {
                         p.removeClass('is-editing');
                         p.dataset.contentHash = '';
                         p.textContent = '';
                     }
                 }*/
        };

        const commitAndClose = () => exitEditMode(() => applyToEditor(textarea.value), true);
        const cancelAndClose = () => exitEditMode(() => applyToEditor(initialRawText), false);

        saveBtn.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });
        cancelBtn.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });
        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            commitAndClose();
        });
        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            cancelAndClose();
        });
        textarea.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                commitAndClose();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cancelAndClose();
            }
        });
    }

    // ── Positioning (fixed corner) ──

    public repositionActivePopup(): void {
        const popup = this.activePopup;
        if (!popup) return;

        const layer = this.options.popupLayer;
        const layerRect = layer.getBoundingClientRect();
        if (layerRect.width === 0 || layerRect.height === 0) return;

        const MARGIN = 16;
        const POPUP_W = 320;
        const POPUP_H = 220;
        /*
                let x = layerRect.width - POPUP_W - MARGIN;
                let y = layerRect.height - POPUP_H - RGIN;
                /*x = Math.max(MARGIN, x);
               y = Math.max(MARGIN, y);

               /pup.style.left = `${Math.round(x)}px`;
               popup.style.top = `${layerRect.height - popup.clientHeight - 30}px`;*/
        popup.setCssStyles({
            width: `${Math.round(POPUP_W)}px`,
            maxHeight: `${Math.round(POPUP_H)}px`,
            transform: 'none'
        });
    }

    // ── Public API ──

    sync(svg: Element, index: Map<string, CommentSlotInfo>): void {
        const editingNodeId = this.options.getEditingNodeId();
        //const activeNodeIds = new Set<string>();

        const nodeElements = svg.querySelectorAll('.markmap-node');

        for (const nodeEl of Array.from(nodeElements)) {
            const nodeData = (nodeEl as { __data__?: IPureNode }).__data__;
            const nodeId = (nodeData?.payload as { nodeId?: string } | undefined)?.nodeId;
            if (!nodeId) continue;

            const slot = index.get(nodeId);
            if (!slot) {
                const state = this.nodeStates.get(nodeId);
                if (state) { // make sure the irrelevant nodes and their states are cleaned up in time
                    //if (editingNodeId !== nodeId) {  }
                    this.removeIcon(state);
                    /*  if (this.activeNodeId === nodeId) {
                     } */
                    this.hidePopup();
                    this.nodeStates.delete(nodeId);

                }
                continue;
            }

            //activeNodeIds.add(nodeId);

            const foreign = nodeEl.querySelector('.markmap-foreign');
            if (!foreign) continue;

            let state = this.nodeStates.get(nodeId);
            if (!state) {
                state = {
                    nodeEl,
                    foreign,
                    container: null,
                    iconSpan: null,
                    slot: null,
                    isHoveredIcon: false,
                    isEditing: false,
                    suppressPopupUntilHover: false,
                    hideTimer: null,
                };
                this.nodeStates.set(nodeId, state);
            } else {
                state.nodeEl = nodeEl;
                state.foreign = foreign;
            }

            /* if (editingNodeId === nodeId && this.options.isEditing()) {
                 continue;
             }*/

            state.slot = slot;
            this.attachIconIfNeeded(state);
        }

        /* for (const [nodeId, state] of this.nodeStates) {
             if (!activeNodeIds.has(nodeId) && editingNodeId !== nodeId) {
                 this.removeIcon(state);
                 if (this.activeNodeId === nodeId) {
                     this.hidePopup();
                 }
                 this.nodeStates.delete(nodeId);
             }
         }*/

        let selectedState: NodeIconState | null = null;
        for (const state of this.nodeStates.values()) {
            if (this.isNodeSelected(state) && state.slot?.text?.trim()) {
                selectedState = state;
                break;
            }
        }

        if (this.activePopup && this.activeNodeId) {
            const activeState = this.nodeStates.get(this.activeNodeId);
            const isHoveringActive = activeState?.isHoveredIcon || this.isHoveredPopup;

            if (!activeState || !activeState.slot?.text?.trim()) {
                if (!activeState?.isEditing) {
                    this.hidePopup();
                    if (selectedState) this.showPopupForNode(selectedState);
                }
            } else if (!this.options.isEditing()) {
                // If not hovering current, and another is selected, switch
                if (!isHoveringActive && selectedState && this.activeNodeId !== this.getNodeId(selectedState)) {
                    this.showPopupForNode(selectedState);
                } else {
                    this.renderPreview(this.activePopup, activeState.slot);
                    this.repositionActivePopup();
                }
            }
        } else if (!this.activePopup && !this.options.isEditing() && selectedState) {
            this.showPopupForNode(selectedState);
        }
    }

    openCommentEditor(nodeId: string, slot: CommentSlotInfo, svg: Element): boolean {
        const nodeEl = this.findNodeElement(svg, nodeId);
        if (!nodeEl) return false;

        const foreign = nodeEl.querySelector('.markmap-foreign');
        if (!foreign) return false;

        let state = this.nodeStates.get(nodeId);
        if (!state) {
            state = {
                nodeEl,
                foreign,
                container: null,
                iconSpan: null,
                slot: null,
                isHoveredIcon: false,
                isEditing: false,
                suppressPopupUntilHover: false,
                hideTimer: null,
            };
            this.nodeStates.set(nodeId, state);
        } else {
            state.nodeEl = nodeEl;
            state.foreign = foreign;
        }

        this.options.onEditingChange(true, nodeId);
        state.slot = slot;
        state.isEditing = true;
        this.attachIconIfNeeded(state);
        this.showPopupForNode(state);
        return true;
    }

    private findNodeElement(svg: Element, nodeId: string): Element | null {
        for (const nodeEl of Array.from(svg.querySelectorAll('.markmap-node'))) {
            const data = (nodeEl as { __data__?: IPureNode }).__data__;
            const id = (data?.payload as { nodeId?: string } | undefined)?.nodeId;
            if (id === nodeId) return nodeEl;
        }
        return null;
    }

    hideAllPopups(): void {
        if (this.activePopup && !this.activePopup.classList.contains('is-editing')) {
            this.hidePopup();
        }
    }

    destroy(): void {
        for (const state of this.nodeStates.values()) {
            this.removeIcon(state);
        }
        this.nodeStates.clear();
        if (this.activePopup) {
            this.activePopup.remove();
            this.activePopup = null;
        }
        this.activeNodeId = null;
        this.options.popupLayer.empty();
    }
}
