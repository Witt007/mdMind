import {ITransformResult, Transformer} from 'markmap-lib';
import {IPureNode} from 'markmap-common';
import {Markmap} from 'markmap-view';
import {MarkmapSettings} from '../types';
import {CSS_CLASSES, MARKMAP_COLORS} from '../constants';

export interface MarkmapRendererOptions {
    onNodeClick?: (node: IPureNode, event: MouseEvent) => void;
    onNodeDblClick?: (node: IPureNode, event: KeyboardEvent | MouseEvent) => void;
    onNodeContextMenu?: (node: IPureNode, event: MouseEvent) => void;
    onNodeDragStart?: (node: IPureNode, event: DragEvent) => void;
    onNodeDragEnd?: (node: IPureNode, event: DragEvent) => void;
    onNodeDrop?: (node: IPureNode, event: DragEvent) => void;
}

export class MarkmapRenderer {
    private svg: SVGSVGElement | null = null;
    private markmap: Markmap | null = null;
    private transformer: Transformer;
    private container: HTMLElement;
    private settings: MarkmapSettings;
    private options: MarkmapRendererOptions;
    private currentRoot: IPureNode | null = null;
    private collapsedNodes: Set<string> = new Set();
    private nodeMap: Map<string, IPureNode> = new Map();
    private clickTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingClickNode: IPureNode | null = null;
    private pendingClickEvent: MouseEvent | null = null;
    private focusedNode: IPureNode | null = null;

    constructor(
        container: HTMLElement,
        settings: MarkmapSettings,
        options: MarkmapRendererOptions = {}
    ) {
        this.container = container;
        this.settings = settings;
        this.options = options;
        this.transformer = new Transformer();
        this.init();
    }

    assignNodeIds(): void {
        if (!this.currentRoot || !this.svg) return;

        this.nodeMap.clear();
        let counter = 0;

        const walk = (node: IPureNode) => {
            const nodeId = `mm-node-${counter++}`;
            if (!node.payload) (node as any).payload = {};
            (node.payload as any).nodeId = nodeId;
            this.nodeMap.set(nodeId, node);
            if (node.children) {
                for (const child of node.children) {
                    walk(child);
                }
            }
        };
        walk(this.currentRoot);

        // Assign data-node-id to SVG DOM elements using D3 bound data
        requestAnimationFrame(() => {
            if (!this.svg) return;
            const domNodes = this.svg.querySelectorAll('.markmap-node');
            domNodes.forEach((el) => {
                const nodeData = (el as any).__data__ as IPureNode | undefined;
                if (nodeData && (nodeData.payload as any)?.nodeId) {
                    (el as HTMLElement).dataset.nodeId = (nodeData.payload as any).nodeId;
                }
            });
        });
    }

    getNodeByNodeId(nodeId: string): IPureNode | null {
        return this.nodeMap.get(nodeId) ?? null;
    }

    findNodeByDomElement(element: Element): IPureNode | null {
        return this.findNodeByElement(element);
    }

    render(markdown: string): ITransformResult | null {
        try {
            const result = this.transformer.transform(markdown);
            this.currentRoot = result.root;

            if (this.markmap) {
                this.markmap.setData(result.root);
                this.assignNodeIds();
                this.markmap.fit();
            } else {
                this.markmap = Markmap.create(this.svg!, {
                    /* autoFit: true,
                    fitRatio: 0.8,
                    duration: 400,
                    nodeMinHeight: 24,
                    spacingVertical: 12,
                    spacingHorizontal: 48,
                    paddingX: 12,
                    color: this.getColorFn(), */
                }, result.root);

                this.assignNodeIds();

                // Setup pan/zoom after Markmap is created (Bug 3 fix)
                if (this.settings.panZoom) {
                    this.setupPanZoom();
                }
            }

            return result;
        } catch (error) {
            console.error('Failed to render markmap:', error);
            return null;
        }
    }

    updateData(root: IPureNode): void {
        this.currentRoot = root;
        if (this.markmap) {
            this.markmap.setData(root);
        }
    }

    setCollapsed(nodeId: string, collapsed: boolean): void {
        if (collapsed) {
            this.collapsedNodes.add(nodeId);
        } else {
            this.collapsedNodes.delete(nodeId);
        }
    }

    expandAll(): void {
        this.collapsedNodes.clear();
        if (this.currentRoot) {
            const clearFold = (node: IPureNode): void => {
                if (node.payload) {
                    node.payload.fold = 0;
                }
                if (node.children) {
                    node.children.forEach(clearFold);
                }
            };
            clearFold(this.currentRoot);
        }
        if (this.markmap && this.currentRoot) {
            this.markmap.setData(this.currentRoot);
        }
    }

    collapseAll(): void {
        if (!this.currentRoot) return;

        const setFold = (node: IPureNode): void => {
            if (node.children && node.children.length > 0) {
                if (!node.payload) (node as any).payload = {};
                node.payload!.fold = 1;
                this.collapsedNodes.add(this.getNodeId(node) ?? '');
                node.children.forEach(setFold);
            }
        };

        setFold(this.currentRoot);

        if (this.markmap) {
            this.markmap.setData(this.currentRoot);
        }
    }

    fit(): void {
        if (this.markmap) {
            this.markmap.fit();
        }
    }

    zoomIn(): void {
        if (this.markmap) {
            void this.markmap.rescale(1.2);
        }
    }

    zoomOut(): void {
        if (this.markmap) {
            void this.markmap.rescale(0.8);
        }
    }

    resetZoom(): void {
        if (this.markmap) {
            void this.markmap.rescale(1).then(() => this.markmap!.fit());
        }
    }

    focusNode(node: IPureNode): void {
        if (!this.markmap) return;
        void this.markmap.centerNode(node as any);
    }

    destroy(): void {
        if (this.markmap) {
            this.markmap.destroy();
            this.markmap = null;
        }
        if (this.svg && this.svg.parentNode) {
            this.svg.parentNode.removeChild(this.svg);
            this.svg = null;
        }
    }

    updateSettings(settings: MarkmapSettings): void {
        this.settings = settings;

        if (this.markmap) {
            this.markmap.setOptions({
                color: this.getColorFn(),
            });
        }
    }

    getCurrentRoot(): IPureNode | null {
        return this.currentRoot;
    }

    private init(): void {
        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svg.classList.add(CSS_CLASSES.markmapSvg);
        this.svg.style.width = '100%';
        this.svg.style.height = '100%';
        this.svg.setAttribute('tabindex', '0');
        this.container.appendChild(this.svg);

        this.setupInteractions();
    }

    private getColorFn() {
        const freezeLevel = this.settings.colorFreezeLevel;

        return (node: IPureNode): string => {
            const depth = this.getNodeDepth(node);
            const colorIndex = Math.min(depth, freezeLevel - 1) % MARKMAP_COLORS.length;
            return MARKMAP_COLORS[colorIndex];
        };
    }

    private getNodeDepth(node: IPureNode, currentDepth = 0): number {
        if (!this.currentRoot) return currentDepth;

        const findDepth = (n: IPureNode, target: IPureNode, depth: number): number => {
            if (n === target) return depth;
            if (n.children) {
                for (const child of n.children) {
                    const result = findDepth(child, target, depth + 1);
                    if (result !== -1) return result;
                }
            }
            return -1;
        };

        return findDepth(this.currentRoot, node, 0);
    }

    private setupPanZoom(): void {
        if (!this.svg || !this.markmap) return;

        // markmap-view uses d3-zoom internally; we only need to handle wheel zoom
        this.svg.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (!this.markmap) return;

            const scale = e.deltaY > 0 ? 0.9 : 1.1;
            void this.markmap.rescale(scale);
        }, {passive: false});
    }

    private findNodeElementFromEvent(e: MouseEvent): Element | null {
        // When clicking inside foreignObject HTML content, Element.closest('.markmap-node')
        // fails because it doesn't traverse across the HTML/SVG namespace boundary.
        // Walking up via parentElement crosses that boundary correctly.
        let el: Element | null = e.target as Element;
        while (el) {
            if (el.classList.contains('markmap-node')) {
                return el;
            }
            if (el === this.svg) {
                return null;
            }
            el = el.parentElement;
        }
        return null;
    }

    private setupInteractions(): void {
        if (!this.svg) return;

        this.svg.addEventListener('click', (e) => {
            const nodeEl = this.findNodeElementFromEvent(e);
            if (nodeEl) {
                const node = this.findNodeByElement(nodeEl);
                if (node) {
                    this.focusedNode = node;
                    this.svg?.focus({preventScroll: true});
                    if (this.clickTimer) {
                        clearTimeout(this.clickTimer);
                        this.clickTimer = null;
                    }
                    this.pendingClickNode = node;
                    this.pendingClickEvent = e;
                    this.clickTimer = setTimeout(() => {
                        if (this.pendingClickNode && this.options.onNodeClick) {
                            this.options.onNodeClick(this.pendingClickNode, this.pendingClickEvent!);
                            this.focusNode(this.pendingClickNode);
                        }
                        this.clickTimer = null;
                        this.pendingClickNode = null;
                        this.pendingClickEvent = null;
                    }, 250);
                }
            }
        });

        this.svg.addEventListener('keydown', (e) => {
            //@ts-ignore
            if (e.currentTarget?.nodeName.toLowerCase() === "svg" && e.key === ' ' && this.focusedNode && this.options.onNodeDblClick) {
                e.preventDefault();
                this.options.onNodeDblClick(this.focusedNode, e);
            }
        });

        this.svg.addEventListener('contextmenu', (e) => {
            const nodeEl = this.findNodeElementFromEvent(e);
            if (nodeEl) {
                const node = this.findNodeByElement(nodeEl);
                if (node && this.options.onNodeContextMenu) {
                    e.preventDefault();
                    this.options.onNodeContextMenu(node, e);
                }
            }
        });

        if (this.settings.dragEnabled) {
            this.setupDragAndDrop();
        }
    }

    private setupDragAndDrop(): void {
        if (!this.svg) return;

        let draggedNode: IPureNode | null = null;

        this.svg.addEventListener('dragstart', (e) => {
            const nodeEl = this.findNodeElementFromEvent(e as unknown as MouseEvent);
            if (nodeEl) {
                draggedNode = this.findNodeByElement(nodeEl);
                if (draggedNode && this.options.onNodeDragStart) {
                    this.options.onNodeDragStart(draggedNode, e as DragEvent);
                }
            }
        });

        this.svg.addEventListener('dragend', (e) => {
            if (draggedNode && this.options.onNodeDragEnd) {
                this.options.onNodeDragEnd(draggedNode, e as DragEvent);
            }
            draggedNode = null;
        });

        this.svg.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        this.svg.addEventListener('drop', (e) => {
            const nodeEl = this.findNodeElementFromEvent(e as unknown as MouseEvent);
            if (nodeEl) {
                const node = this.findNodeByElement(nodeEl);
                if (node && this.options.onNodeDrop) {
                    this.options.onNodeDrop(node, e as DragEvent);
                }
            }
        });
    }

    private findNodeByElement(element: Element): IPureNode | null {
        // Try dataset.nodeId first (set by assignNodeIds via requestAnimationFrame)
        const nodeId = (element as HTMLElement).dataset?.nodeId;
        if (nodeId && this.nodeMap.has(nodeId)) {
            return this.nodeMap.get(nodeId)!;
        }
        // Fallback: use D3 bound data (__data__) when dataset.nodeId is not yet available
        const nodeData = (element as any).__data__ as IPureNode | undefined;
        if (nodeData) {
            const payloadId = (nodeData.payload as any)?.nodeId;
            if (payloadId && this.nodeMap.has(payloadId)) {
                return this.nodeMap.get(payloadId)!;
            }
            // If the node data itself is in our nodeMap by reference, return it
            for (const [, node] of this.nodeMap) {
                if (node === nodeData) return node;
            }
        }
        return null;
    }

    private getNodeId(node: IPureNode): string | null {
        const content = typeof node.content === 'string'
            ? node.content.slice(0, 30).replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\u4e00-\u9fa5-]/g, '')
            : '';
        return content ? `node-${content}` : null;
    }
}

