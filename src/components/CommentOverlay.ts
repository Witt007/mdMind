import { App, Editor, ItemView, MarkdownRenderer, Notice } from 'obsidian';
import { IPureNode } from 'markmap-common';
import { CSS_CLASSES } from '../constants';
import { CommentSlotInfo } from '../utils/commentSlot';
import { debounce } from '../utils/debounce';

const COMMENT_ICON_SVG = `<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M13 8H7"/><path d="M17 12H7"/></svg>`;
const SAVE_ICON_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
const CANCEL_ICON_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>`;
const EDIT_ICON_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
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

interface PopupEntry {
    popup: HTMLElement;
    iconSpan: HTMLElement;
    nodeEl: Element;
}

class CommentNodeController {
    nodeId: string;
    nodeEl: Element;
    foreign: Element;
    container: HTMLElement | null = null;
    iconSpan: HTMLElement | null = null;

    slot: CommentSlotInfo | null = null;
    isHoveredIcon = false;
    isHoveredPopup = false;
    isEditing = false;
    hideTimer: ReturnType<typeof setTimeout> | null = null;
    /** After save, keep popup hidden until the user hovers the icon or node again. */
    private suppressPopupUntilHover = false;

    private popupEntry: PopupEntry | null = null;

    constructor(
        nodeId: string,
        nodeEl: Element,
        foreign: Element,
        private readonly overlay: CommentOverlay
    ) {
        this.nodeId = nodeId;
        this.nodeEl = nodeEl;
        this.foreign = foreign;
    }

    attachIfNeeded(): void {
        if (this.container) return;

        this.container = document.createElement('div');
        this.container.className = 'markmap-comment-container';

        this.iconSpan = document.createElement('span');
        this.iconSpan.className = 'markmap-comment-icon';
        this.iconSpan.innerHTML = COMMENT_ICON_SVG;
        this.container.appendChild(this.iconSpan);
        this.foreign.appendChild(this.container);

        this.iconSpan.addEventListener('mouseenter', () => {
            this.suppressPopupUntilHover = false;
            this.isHoveredIcon = true;
            this.clearHideTimer();
            this.updatePopupDom();
        });
        this.iconSpan.addEventListener('mouseleave', () => {
            this.isHoveredIcon = false;
            this.delayHidePopup();
        });

        /*     this.nodeEl.addEventListener('mouseenter', () => {
                this.suppressPopupUntilHover = false;
                this.isHoveredNode = true;
                this.clearHideTimer();
                this.updatePopupDom();
            });
            this.nodeEl.addEventListener('mouseleave', () => {
                this.isHoveredNode = false;
                this.delayHidePopup();
            }); */
    }

    removeIcon(): void {
        if (this.container) {
            this.container.remove();
            this.container = null;
            this.iconSpan = null;
        }
    }

    /*  setSlot(slot: CommentSlotInfo | null): void {
         this.slot = slot;
     } */

    /** Keep this.slot.text in sync with the editor (source of truth after edits). */
    private refreshSlotFromEditor(): void {
        const slot = this.slot;
        if (!slot) return;

        const editor = this.overlay.options.getEditor();
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
    }

    syncSlot(slot: CommentSlotInfo): void {
        this.slot = slot;
        if (!slot.text.trim()) return;
        this.refreshSlotFromEditor();
        if (this.container && !this.foreign.contains(this.container)) {
            this.container = null;
            this.iconSpan = null;
        }
        this.attachIfNeeded();
        this.updatePopupDom();
    }

    private clearHideTimer(): void {
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
    }

    private isNodeSelected(): boolean {
        return this.nodeEl.classList.contains(CSS_CLASSES.selectedNode)
            || this.nodeEl.classList.contains(CSS_CLASSES.highlightedNode);
    }

    private shouldBeVisible(): boolean {
        if (this.suppressPopupUntilHover && !this.isEditing) {
            return false;
        }
        if (!this.isEditing && (!this.slot || !this.slot.text.trim())) {
            return false;
        }
        return this.isHoveredIcon
            || this.isHoveredPopup
            || this.isNodeSelected()
            || this.isEditing;
    }

    private dismissPopup(): void {
        this.clearHideTimer();
        const popup = this.getPopup();
        if (!popup) return;
        popup.removeClass('is-active');
        popup.removeClass('is-editing');
        this.overlay.unregisterVisiblePopup(popup);
        popup.remove();
        this.popupEntry = null;
    }

    private getPopup(): HTMLElement | null {
        return this.overlay.getPopupForNode(this.nodeId);
    }

    private delayHidePopup(): void {
        this.clearHideTimer();
        // this.hideTimer = setTimeout(() => {  }, 300);
        if (!this.isEditing && !this.isHoveredIcon && !this.isHoveredPopup && !this.isNodeSelected()) {
            const popup = this.getPopup();
            if (popup) {
                popup.removeClass('is-active');
                this.hideTimer = setTimeout(() => {
                    if (!this.isEditing && !this.isHoveredIcon && !this.isHoveredPopup && !this.isNodeSelected()) {
                        this.overlay.unregisterVisiblePopup(popup);
                        popup.remove();
                        this.popupEntry = null;
                    }
                }, 220);
            }
        }

    }

    private ensurePopup(): HTMLElement {
        let popup = this.getPopup();
        if (!popup) {
            popup = document.createElement('div');
            popup.className = 'markmap-comment-popup';
            popup.dataset.nodeId = this.nodeId;

            popup.addEventListener('click', (e) => e.stopPropagation());
            popup.addEventListener('dblclick', (e) => e.stopPropagation());
            popup.addEventListener('contextmenu', (e) => e.stopPropagation());
            popup.addEventListener('mousedown', (e) => e.stopPropagation());
            popup.addEventListener('wheel', (e) => {
                e.stopPropagation();
            }, { passive: true });

            /*popup.addEventListener('mouseenter', () => {
                this.isHoveredPopup = true;
                this.clearHideTimer();
                popup?.addClass('is-active');
            });
            popup.addEventListener('mouseleave', () => {
                this.isHoveredPopup = false;
                this.delayHidePopup();
            });*/

            this.overlay.getPopupLayer().appendChild(popup);
        }

        if (this.iconSpan) {
            const entry: PopupEntry = { popup, iconSpan: this.iconSpan, nodeEl: this.nodeEl };

            if (!this.popupEntry || this.popupEntry.popup !== popup) {
                if (this.popupEntry) {
                    this.overlay.unregisterVisiblePopup(this.popupEntry.popup);
                }
                this.popupEntry = entry;
                this.overlay.registerVisiblePopup(entry);
            } else {
                this.popupEntry.nodeEl = this.nodeEl;
            }
        }

        return popup;
    }

    private setupEditMode(popup: HTMLElement): void {
        const slot = this.slot;
        if (!slot) return;

        const lines = this.overlay.options.getContentLines();
        if (!lines.length) return;

        this.isEditing = true;
        this.overlay.options.onEditingChange(true, this.nodeId);
        popup.innerHTML = '';
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
        saveBtn.innerHTML = SAVE_ICON_SVG;

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'markmap-comment-btn cancel';
        cancelBtn.innerHTML = CANCEL_ICON_SVG;

        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);
        popup.appendChild(actions);

        textarea.focus();

        /*  const adjustTextareaHeight = () => {
             //textarea.style.height = 'auto';
             textarea.style.height = `${textarea.scrollHeight}px`;
         };
         adjustTextareaHeight();
         textarea.addEventListener('input', adjustTextareaHeight); */

        const applyToEditor = (val: string) => {
            const editor = this.overlay.options.getEditor();
            const activeSlot = this.slot;
            if (!editor || !activeSlot) return;
            if (COMMENT_HEADING_PATTERN.test(val)) {
                if (!hasNotifiedHeadingFilter) {
                    new Notice('Heading markers (# to ######) are removed from comments');
                    hasNotifiedHeadingFilter = true;
                }
                val = val.replace(COMMENT_HEADING_REPLACE_PATTERN, '$1');
                if (textarea.value !== val) {
                    textarea.value = val;
                    // adjustTextareaHeight();
                }
            }

            const lastLineText = editor.getLine(currentEndLine) || '';
            if (currentEndLine >= currentStartLine) {
                const from = { line: currentStartLine, ch: 0 };
                const to = { line: currentEndLine, ch: lastLineText.length };
                editor.replaceRange('', from, to);
            } else {
                editor.replaceRange('\n' + val, { line: currentEndLine, ch: 0 }, { line: currentEndLine, ch: 0 });
            }
        };

        const debouncedApply = debounce((val: unknown) => applyToEditor(val as string), 60);

        textarea.addEventListener('input', () => {
            applyToEditor(textarea.value);
        });

        const endEditSession = () => {
            this.isEditing = false;
            this.overlay.options.onEditingChange(false);
        };

        const exitEditMode = (apply: () => void, dismissAfter = false) => {
            if (!this.overlay.options.isEditing()) return;
            endEditSession();
            apply();
            //this.refreshSlotFromEditor();
            this.overlay.options.onAfterEdit();
            if (dismissAfter) {
                this.suppressPopupUntilHover = true;
                this.isHoveredPopup = false;
                this.dismissPopup();
            } else {
                const popup = this.getPopup();
                if (popup) {
                    popup.removeClass('is-editing');
                    popup.dataset.contentHash = '';
                    popup.innerHTML = '';
                }
                // this.updatePopupDom();
            }
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
                cancelAndClose();
            }
        });
        /*  textarea.addEventListener('blur', () => {
             clearBlurCloseTimer();
             blurCloseTimer = setTimeout(() => {
                 blurCloseTimer = null;
                 if (!this.overlay.options.isEditing()) return;
                 if (closeIntent === 'cancel') {
                     cancelAndClose();
                 } else {
                     commitAndClose();
                 }
                 closeIntent = null;
             }, 150);
         }); */
    }

    private renderPreview(popup: HTMLElement, slot: CommentSlotInfo): void {
        if (popup.dataset.contentHash === slot.contentHash) return;

        popup.removeClass('is-editing');
        popup.innerHTML = '';
        popup.dataset.contentHash = slot.contentHash;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'markmap-comment-content';
        popup.appendChild(contentDiv);
        MarkdownRenderer.render(this.overlay.app,
            slot.text,
            contentDiv,
            this.overlay.options.getFilePath(),
            this.overlay.options.getView()
        );

        const editBtn = document.createElement('button');
        editBtn.className = 'markmap-comment-edit-btn';
        editBtn.innerHTML = EDIT_ICON_SVG;
        popup.appendChild(editBtn);

        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.isEditing = true;
            this.updatePopupDom();
        });
        contentDiv.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.isEditing = true;
            this.updatePopupDom();
        });
    }

    updatePopupDom(): void {
        const slot = this.slot;
        if (!slot || !this.iconSpan) return;

        const editingFromGlobal = this.overlay.options.isEditing()
            && this.overlay.options.getEditingNodeId() === this.nodeId;
        if (editingFromGlobal) {
            this.isEditing = true;
        }

        const shouldBeVisible = this.shouldBeVisible();
        let popup = this.getPopup();

        if (shouldBeVisible) {
            popup = this.ensurePopup();

            if (this.isEditing) {
                if (!popup.querySelector('.markmap-comment-textarea')) {
                    this.setupEditMode(popup);
                }
            } else {
                this.renderPreview(popup, slot);
            }

            requestAnimationFrame(() => {
                const p = this.getPopup();
                if (p) p.addClass('is-active');
            });
        } else {
            const hasText = !!slot?.text?.trim();
            if (!hasText && !this.isEditing) {
                if (popup) {
                    //controller.removeIcon();
                    this.overlay.unregisterVisiblePopup(popup);
                    popup.remove();
                    this.popupEntry = null;
                }
            } else if (popup && !this.isEditing) {
                popup.removeClass('is-active');
                const currentPopup = popup;
                setTimeout(() => {
                    if (!this.isEditing && !this.isHoveredIcon && !this.isHoveredPopup && !this.isNodeSelected()) {
                        this.overlay.unregisterVisiblePopup(currentPopup);
                        currentPopup.remove();
                        this.popupEntry = null;
                    }
                }, 220);
            }
        }
    }

    removePopupUnlessEditing(): void {
        const popup = this.getPopup();
        if (popup && !popup.classList.contains('is-editing')) {
            this.overlay.unregisterVisiblePopup(popup);
            popup.remove();
            this.popupEntry = null;
        }
    }

    beginEditing(slot: CommentSlotInfo): void {
        this.slot = slot;
        this.isEditing = true;
        this.clearHideTimer();
        if (this.container && !this.foreign.contains(this.container)) {
            this.container = null;
            this.iconSpan = null;
        }
        this.attachIfNeeded();
        this.updatePopupDom();
    }
}

export class CommentOverlay {
    readonly options: CommentOverlayOptions;
    readonly app: App;
    private controllers = new Map<string, CommentNodeController>();
    private visiblePopups = new Set<PopupEntry>();

    constructor(options: CommentOverlayOptions) {
        this.options = options;
        this.app = options.app;
    }

    getPopupLayer(): HTMLElement {
        return this.options.popupLayer;
    }

    getPopupForNode(nodeId: string): HTMLElement | null {
        return this.options.popupLayer.querySelector(
            `.markmap-comment-popup[data-node-id="${CSS.escape(nodeId)}"]`
        ) as HTMLElement | null;
    }

    registerVisiblePopup(entry: PopupEntry): void {
        this.visiblePopups.add(entry);
        this.repositionVisiblePopups();
    }

    unregisterVisiblePopup(popup: HTMLElement): void {
        this.lastChosenDirection.delete(popup);
        for (const entry of this.visiblePopups) {
            if (entry.popup === popup) {
                this.visiblePopups.delete(entry);
                break;
            }
        }
    }

    /** Per-popup memory of the last chosen candidate index to enable sticky direction. */
    private lastChosenDirection = new Map<HTMLElement, number>();

    repositionVisiblePopups(): void {
        const layer = this.options.popupLayer;
        const layerRect = layer.getBoundingClientRect();
        if (layerRect.width === 0 || layerRect.height === 0) return;

        // Design constants
        const GAP = 8;               // gap between node/children and popup
        const MIN_W = 200;
        const MIN_H = 80;
        const MAX_W = 380;
        const MAX_H = 320;
        const HYSTERESIS = 0.25;     // current direction keeps unless new one is 25% bigger

        for (const entry of this.visiblePopups) {
            const { popup, nodeEl } = entry;

            // ── 1. Compute the exclusion zone (node + visible children) ──

            const nodeRect = nodeEl.getBoundingClientRect();
            // Start with the node itself
            let exLeft = nodeRect.left;
            let exTop = nodeRect.top;
            let exRight = nodeRect.right;
            let exBottom = nodeRect.bottom;

            // Expand to include direct children bounding boxes
            const nodeData = (nodeEl as { __data__?: IPureNode }).__data__;
            if (nodeData?.children?.length) {
                const svg = nodeEl.closest('svg');
                if (svg) {
                    for (const child of nodeData.children) {
                        const childNodeId = (child.payload as { nodeId?: string } | undefined)?.nodeId;
                        if (!childNodeId) continue;
                        // Find the child SVG element
                        for (const el of Array.from(svg.querySelectorAll('.markmap-node'))) {
                            const d = (el as { __data__?: IPureNode }).__data__;
                            const id = (d?.payload as { nodeId?: string } | undefined)?.nodeId;
                            if (id === childNodeId) {
                                const cr = el.getBoundingClientRect();
                                exLeft = Math.min(exLeft, cr.left);
                                exTop = Math.min(exTop, cr.top);
                                exRight = Math.max(exRight, cr.right);
                                exBottom = Math.max(exBottom, cr.bottom);
                                break;
                            }
                        }
                    }
                }
            }

            // Convert exclusion zone to layer-local coordinates
            const exL = exLeft - layerRect.left;
            const exT = exTop - layerRect.top;
            const exR = exRight - layerRect.left;
            const exB = exBottom - layerRect.top;

            const layerW = layerRect.width;
            const layerH = layerRect.height;

            // Node center in layer coords (for vertical/horizontal centering)
            const nodeCX = (nodeRect.left + nodeRect.right) / 2 - layerRect.left;
            const nodeCY = (nodeRect.top + nodeRect.bottom) / 2 - layerRect.top;

            // ── 2. Build 4 candidate placement regions ──
            // Each candidate: { dir index, available width, available height, x, y }

            interface Candidate {
                dir: number;       // 0=right, 1=left, 2=bottom, 3=top
                availW: number;
                availH: number;
                x: number;         // popup left (layer-local)
                y: number;         // popup top  (layer-local)
            }

            const candidates: Candidate[] = [];

            // RIGHT of exclusion zone
            {
                const availW = layerW - exR - GAP;
                const availH = layerH;
                if (availW >= MIN_W) {
                    const x = exR + GAP;
                    // Vertically center on the node, clamped
                    const popH = Math.min(Math.max(MIN_H, availH), MAX_H);
                    let y = nodeCY - popH / 2;
                    y = Math.max(0, Math.min(y, layerH - popH));
                    candidates.push({ dir: 0, availW: Math.min(availW, MAX_W), availH: popH, x, y });
                }
            }

            // LEFT of exclusion zone
            {
                const availW = exL - GAP;
                const availH = layerH;
                if (availW >= MIN_W) {
                    const popW = Math.min(availW, MAX_W);
                    const x = exL - GAP - popW;
                    const popH = Math.min(Math.max(MIN_H, availH), MAX_H);
                    let y = nodeCY - popH / 2;
                    y = Math.max(0, Math.min(y, layerH - popH));
                    candidates.push({ dir: 1, availW: popW, availH: popH, x: Math.max(0, x), y });
                }
            }

            // BOTTOM of exclusion zone
            {
                const availH = layerH - exB - GAP;
                const availW = layerW;
                if (availH >= MIN_H) {
                    const popW = Math.min(Math.max(MIN_W, availW), MAX_W);
                    let x = nodeCX - popW / 2;
                    x = Math.max(0, Math.min(x, layerW - popW));
                    const y = exB + GAP;
                    candidates.push({ dir: 2, availW: popW, availH: Math.min(availH, MAX_H), x, y });
                }
            }

            // TOP of exclusion zone
            {
                const availH = exT - GAP;
                const availW = layerW;
                if (availH >= MIN_H) {
                    const popW = Math.min(Math.max(MIN_W, availW), MAX_W);
                    let x = nodeCX - popW / 2;
                    x = Math.max(0, Math.min(x, layerW - popW));
                    const popH = Math.min(availH, MAX_H);
                    const y = exT - GAP - popH;
                    candidates.push({ dir: 3, availW: popW, availH: popH, x, y: Math.max(0, y) });
                }
            }

            // ── 3. Pick the best candidate with hysteresis ──

            if (candidates.length === 0) {
                // Fallback: place below node, clamped to layer
                const popW = Math.min(MAX_W, layerW);
                const popH = Math.min(MAX_H, layerH);
                let x = nodeCX - popW / 2;
                x = Math.max(0, Math.min(x, layerW - popW));
                let y = exB + GAP;
                y = Math.max(0, Math.min(y, layerH - popH));

                this.applyPopupPosition(popup, x, y, popW, popH);
                this.lastChosenDirection.set(popup, 2);
                continue;
            }

            // Score each candidate by available area
            const scored = candidates.map(c => ({
                ...c,
                area: c.availW * c.availH,
            }));
            scored.sort((a, b) => b.area - a.area);

            const lastDir = this.lastChosenDirection.get(popup);
            let chosen = scored[0];

            if (lastDir !== undefined) {
                const currentDirCandidate = scored.find(c => c.dir === lastDir);
                if (currentDirCandidate) {
                    const bestArea = scored[0].area;
                    const currentArea = currentDirCandidate.area;
                    // Stick with current direction unless the best is significantly better
                    if (currentArea > 0 && (bestArea - currentArea) / currentArea < HYSTERESIS) {
                        chosen = currentDirCandidate;
                    }
                }
            }

            this.lastChosenDirection.set(popup, chosen.dir);

            // ── 4. Apply position and size ──
            this.applyPopupPosition(popup, chosen.x, chosen.y, chosen.availW, chosen.availH);
        }
    }

    private applyPopupPosition(
        popup: HTMLElement,
        x: number,
        y: number,
        w: number,
        h: number,
    ): void {
        // Override CSS defaults: remove the centering transform
        popup.style.transform = 'none';
        popup.style.left = `${Math.round(x)}px`;
        popup.style.top = `${Math.round(y)}px`;
        popup.style.width = `${Math.round(w)}px`;
        popup.style.maxHeight = `${Math.round(h)}px`;
    }


    sync(svg: Element, index: Map<string, CommentSlotInfo>): void {
        const layer = this.options.popupLayer;
        const editingNodeId = this.options.getEditingNodeId();
        const activeNodeIds = new Set<string>();

        const nodeElements = svg.querySelectorAll('.markmap-node');

        for (const nodeEl of Array.from(nodeElements)) {
            const nodeData = (nodeEl as { __data__?: IPureNode }).__data__;
            const nodeId = (nodeData?.payload as { nodeId?: string } | undefined)?.nodeId;
            if (!nodeId) continue;

            const slot = index.get(nodeId);
            if (!slot?.text?.trim()) {
                const controller = this.controllers.get(nodeId);
                if (controller) {
                    if (editingNodeId !== nodeId) {
                        //controller.removeIcon();
                        controller.removePopupUnlessEditing();
                        this.controllers.delete(nodeId);
                    }
                }
                continue;
            }

            activeNodeIds.add(nodeId);

            const foreign = nodeEl.querySelector('.markmap-foreign');
            if (!foreign) continue;

            let controller = this.controllers.get(nodeId);
            if (!controller) {
                controller = new CommentNodeController(nodeId, nodeEl, foreign, this);
                this.controllers.set(nodeId, controller);
            } else {
                controller.nodeEl = nodeEl;
                controller.foreign = foreign;
            }

            // Do not replace controller.slot while editing — applyToEditor must keep mutating this.slot.
            if (editingNodeId === nodeId && this.options.isEditing()) {
                continue;
            }

            controller.syncSlot(slot);
        }

        for (const [nodeId, controller] of this.controllers) {
            if (!activeNodeIds.has(nodeId) && editingNodeId !== nodeId) {
                // controller.removeIcon();
                controller.removePopupUnlessEditing();
                this.controllers.delete(nodeId);
            }
        }

        layer.querySelectorAll('.markmap-comment-popup').forEach((p) => {
            const el = p as HTMLElement;
            const nid = el.dataset.nodeId;
            if (!nid || !activeNodeIds.has(nid)) {
                if (!el.classList.contains('is-editing')) {
                    this.unregisterVisiblePopup(el);
                    el.remove();
                }
            }
        });
    }

    openCommentEditor(nodeId: string, slot: CommentSlotInfo, svg: Element): boolean {
        //if (!slot.text?.trim()) return false;
        const nodeEl = this.findNodeElement(svg, nodeId);
        if (!nodeEl) return false;

        const foreign = nodeEl.querySelector('.markmap-foreign');
        if (!foreign) return false;

        let controller = this.controllers.get(nodeId);
        if (!controller) {
            controller = new CommentNodeController(nodeId, nodeEl, foreign, this);
            this.controllers.set(nodeId, controller);
        } else {
            controller.nodeEl = nodeEl;
            controller.foreign = foreign;
        }

        this.options.onEditingChange(true, nodeId);
        controller.beginEditing(slot);
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
        for (const controller of this.controllers.values()) {
            controller.removePopupUnlessEditing();
        }
    }
    destroy(): void {
        this.visiblePopups.clear();
        this.lastChosenDirection.clear();
        for (const controller of this.controllers.values()) {
            controller.removeIcon();
            controller.removePopupUnlessEditing();
        }
        this.controllers.clear();
        this.options.popupLayer.empty();
    }
}
