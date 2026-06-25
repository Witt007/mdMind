import { ITransformResult, Transformer } from 'markmap-lib';
import { IPureNode, INode } from 'markmap-common';
import { Markmap } from 'markmap-view';
import { MarkmapSettings } from '../types';
import { CSS_CLASSES, MARKMAP_COLORS } from '../constants';
import * as d3 from 'd3';
import { BaseType, Transition } from "d3";
import { extendedSvgGEle } from "../views/MarkmapView";
import { Debouncer } from "../utils/debounce";

export type operationType = "insert-child" | "insert-sibling" | "change-current" | "delete-current" | "none"

export interface MarkmapRendererOptions {
    onNodeClick?: (node: IPureNode, event: MouseEvent) => void;
    onNodeDblClick?: (node: IPureNode, event: KeyboardEvent | MouseEvent) => void;
    onNodeContextMenu?: (node: IPureNode, event: MouseEvent) => void;
    onNodeDragStart?: (node: IPureNode, event: DragEvent) => void;
    onNodeDragEnd?: (node: IPureNode, event: DragEvent) => void;
    onNodeDrop?: (node: IPureNode, event: DragEvent) => void;
    onZoom?: () => void;
    onUpdate?: () => void;
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
    private isZoomedIn = false;
    private zoomLocked = false;

    constructor(
        container: HTMLElement,
        settings: MarkmapSettings,
        options: MarkmapRendererOptions = {}
    ) {
        this.resetMarkmapTransition();
        this.container = container;
        this.settings = settings;
        this.options = options;
        this.transformer = new Transformer();
        this.init();
    }

    getSvg(): SVGElement | null {
        return this.svg;
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
        // requestAnimationFrame(() => {   });
        /*      if (!this.svg) return;
              const domNodes = this.svg.querySelectorAll('.markmap-node');
              domNodes.forEach((el) => {
                  const nodeData = (el as any).__data__ as IPureNode | undefined;
                  if (nodeData && (nodeData.payload as any)?.nodeId) {
                      (el as HTMLElement).dataset.nodeId = (nodeData.payload as any).nodeId;
                  }
              });*/

    }

    getNodeByNodeId(nodeId: string): IPureNode | null {
        return this.nodeMap.get(nodeId) ?? null;
    }

    findNodeByDomElement(element: Element): IPureNode | null {
        return this.findNodeByElement(element);
    }

    transitionTime = 0

    setOntransitionend(callack: () => void, selectedSvgNode: extendedSvgGEle | undefined, operationType: typeof this.operationType) {
        if (!this.markmap) return;
        console.log('setOntransitionen called at ', new Date().toString());
        this.ontransitionend = callack;
        if (selectedSvgNode)
            this.selectedSvgNode = selectedSvgNode;
        this.operationType = operationType;
    }

    ontransitionend: () => void = () => {
    }

    private selectedSvgNode: extendedSvgGEle | null = null;
    private operationType: operationType = "none";
    private debouncer = new Debouncer(1);

    private resetMarkmapTransition() {
        const self = this;
        Markmap.prototype.transition = function (t) {
            let { duration: r } = this.options;
            const transition = t.transition().duration(r);
            transition.on('end', function (datum, index, groups) {
                const mnode = datum as IPureNode
                const foreignObj = Array.from(groups).find(g => (<SVGForeignObjectElement>g)?.nodeName === 'foreignObject') as extendedSvgGEle | undefined;

                if (!foreignObj) return;

                const execution = () => {
                    console.log('transition end execution called at ', new Date().toString());
                    self.debouncer.executeDebounced(() => {
                        self.ontransitionend();
                        self.selectedSvgNode = null;
                        self.ontransitionend = () => {
                        };
                    })
                }
                if (self.operationType == 'none') return execution();

                let currentNode: any = self.selectedSvgNode;
                if (self.operationType == 'insert-sibling') currentNode = self.selectedSvgNode?.nextElementSibling;
                else if (self.operationType == 'insert-child') currentNode = self.selectedSvgNode?.previousElementSibling;
                else if (self.operationType == 'delete-current') (() => {
                    let prevNode = self.selectedSvgNode?.previousElementSibling as SVGSVGElement;
                    if (!prevNode) return;
                    let currDepth = self.selectedSvgNode?.dataset.depth;
                    let isFound = false;
                    while (!isFound) {
                        if (prevNode && prevNode.dataset?.depth === currDepth) {
                            isFound = true;
                            currentNode = prevNode;
                        }
                        prevNode = prevNode?.previousElementSibling as SVGSVGElement;
                    }
                })()

                const selectednodeid = currentNode?.__data__?.payload?.nodeId
                const isChangeCurrent = self.operationType == 'change-current' ? mnode?.content !== currentNode?.__data__?.content : mnode?.content === currentNode?.__data__?.content;
                //make sure it only is invoked once
                if ((mnode?.payload?.nodeId === selectednodeid &&
                    isChangeCurrent)) execution();

            });
            return transition;
        }
    }

    async render(markdown: string, filename?: string): Promise<ITransformResult | null> {
        try {

            const result = this.transformer.transform(markdown);

            let rootNode: IPureNode = result.root;
            /*   if (filename) {
                   rootNode = {
                       content: filename,
                       children: result.root.children||[], payload:{nodeId:'filenode'}
                   } as typeof result.root;
               }*/

            this.currentRoot = rootNode;

            if (this.markmap) {
                this.assignNodeIds();
                this.markmap.setData(rootNode);
                //this.markmap.fit();
            } else {

                this.assignNodeIds();

                this.markmap = Markmap.create(this.svg!, {
                    /*autoFit: true,
                   fitRatio: 0.8,*/
                    duration: 400,
                    /* nodeMinHeight: 24,
                     spacingVertical: 12,
                     spacingHorizontal: 48,
                     paddingX: 12,*/
                    color: this.getColorFn(), maxWidth: this.container.innerWidth || 700
                }, rootNode);

                this.transitionTime = this.markmap.options.duration
                // Setup pan/zoom after Markmap is created (Bug 3 fix)
                if (this.settings.panZoom) {
                    this.setupPanZoom();
                }
            }
            /*    const waitTime = this.markmap.options.duration || 500;
                return new Promise((resolve) => {
                    setTimeout(() => {
                        // requestAnimationFrame ensures the browser has painted the final state
                        window.requestAnimationFrame(()=>(resolve({ ...result, root: rootNode })));
                    }, waitTime);
                });*/
            //this.svg?.focus({preventScroll: true});
            if (this.options.onUpdate) {
                this.options.onUpdate();
            }
            return { ...result, root: rootNode };
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
            this.isZoomedIn = false;
            this.markmap.fit();
        }
    }

    zoomIn(): Promise<void> {
        if (this.markmap && !this.isZoomedIn) {
            this.isZoomedIn = true;
            return this.markmap.rescale(1.3);
        }
        return Promise.resolve();
    }

    zoomOut(): void {
        if (this.markmap) {
            this.isZoomedIn = false;
            void this.markmap.rescale(0.8);
        }
    }

    resetZoom(): Promise<void> {
        if (this.markmap) {
            this.isZoomedIn = false;
            return this.markmap.rescale(1);//.then(() => this.markmap!.fit());
        }
        return Promise.resolve();
    }

    lockZoom(): void {
        this.zoomLocked = true;
    }

    unlockZoom(): void {
        this.zoomLocked = false;
    }

    focusNode(node: IPureNode): Promise<void> {
        if (!this.markmap) return Promise.resolve();
        return this.markmap.centerNode(node as any);
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
        this.svg.setCssStyles({
            width: '100%',
            height: '100%'
        });
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


    /**
     * On each zoom event, reset all node divs to their default (CSS-defined) width,
     * then find visible nodes whose content overflows the viewport and clamp their
     * width so they don't extend past the right edge of the viewport.
     */
    public adjustNodeWidthsOnZoom(selectedSvgNode: extendedSvgGEle): void {
        if (!this.svg || !this.container || !selectedSvgNode) return;

        const contentDiv = selectedSvgNode.querySelector('.markmap-foreign > div') as HTMLElement;
        if (!contentDiv) return;

        // 1. Reset width and max-width to allow the content to take its natural size
        // This is crucial for "expanding" back when space becomes available.
        //contentDiv.style.removeProperty('max-width');

        const containerRect = this.container.getBoundingClientRect();
        // Measure natural size after reset
        const nodeRect = contentDiv.getBoundingClientRect();

        /*  // 2. Check if the node is at least partially within the viewport
          const isInViewport =
              nodeRect.right > containerRect.left &&
              nodeRect.left < containerRect.right &&
              nodeRect.bottom > containerRect.top &&
              nodeRect.top < containerRect.bottom;*/

        contentDiv.setCssStyles({
            width: 'max-content'
        });

        if (containerRect.width >= nodeRect.width) return;

        // We want to clamp it to the viewport right edge.
        // If natural width is smaller than this, max-width won't affect it.
        // If natural width is larger, it will be clamped.
        /* const textLen=Number(contentDiv.getCssPropertyValue('font-size').replace('px',''))*(contentDiv.textContent?.length||0)
         const availableWidthInCss = Math.min(containerRect.width/1.4,Math.max(nodeRect.width,textLen))
 */
        contentDiv.setCssStyles({
            width: (containerRect.width / 2) + 'px'
        });
        //  contentDiv.style.setProperty('max-width', `${availableWidthInCss}px`, 'important');

    }

    private zoomScale = 1;
    private setupPanZoom(): void {
        if (!this.svg || !this.markmap) return;

        // Use capture phase so this fires before d3-zoom's target-phase listener,
        // which calls stopImmediatePropagation() and would otherwise swallow the event.
        // stopPropagation() here prevents d3-zoom from also zooming.
        /*  this.svg.addEventListener('wheel', (e) => {
             const target = e.target as HTMLElement;
             if (
                 target.closest(`.${CSS_CLASSES.inlineEditor}`)
                 || target.closest(`.${CSS_CLASSES.commentPopup}`)
                 || target.closest(`.${CSS_CLASSES.commentPopupLayer}`)
             ) {
                 return;
             }
             e.preventDefault();
             if (!this.markmap || this.zoomLocked) e.stopPropagation();
             if (this.options.onZoom) {
                 this.options.onZoom();
             }
   
         }, { capture: true, passive: false }); */

        this.markmap.zoom.on('zoom.renderer', (evt) => {
            /* if (evt.sourceEvent?.type === 'wheel') {
                 // 鼠标滚轮 → 缩放

             }*/
            this.options.onZoom?.();
        });
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

    public getNodeFromMouseEvt(e: MouseEvent) {

        const nodeEl = this.findNodeElementFromEvent(e);
        if (nodeEl) {
            return this.findNodeByElement(nodeEl);
        }
        return;
    }

    private setupInteractions(): void {
        if (!this.svg) return;

        /*      this.svg.addEventListener('keydown', (e) => {
                  //@ts-ignore
                  if (e.currentTarget?.nodeName.toLowerCase() === "svg" && e.key === ' ' && this.focusedNode && this.options.onNodeDblClick) {
                      e.preventDefault();
                      this.options.onNodeDblClick(this.focusedNode, e);
                  }
              });*/

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

