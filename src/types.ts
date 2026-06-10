import { IPureNode } from 'markmap-common';

export interface MarkmapSettings {
    openOnStartup: boolean;
    syncMode: 'realtime' | 'manual' | 'debounce';
    debounceMs: number;
    autoExpand: boolean;
    defaultExpandLevel: number;
    theme: 'auto' | 'light' | 'dark';
    colorFreezeLevel: number;
    panZoom: boolean;
    showToolbar: boolean;
    dragEnabled: boolean;
    editInMarkmap: boolean;
}

export const DEFAULT_SETTINGS: MarkmapSettings = {
    openOnStartup: false,
    syncMode: 'debounce',
    debounceMs: 300,
    autoExpand: true,
    defaultExpandLevel: 2,
    theme: 'auto',
    colorFreezeLevel: 5,
    panZoom: true,
    showToolbar: true,
    dragEnabled: true,
    editInMarkmap: true,
};

export interface NodeMappingInfo {
    nodeId: string;
    startLine: number;
    endLine: number;
    depth: number;
    content: string;
    parentId?: string;
}

export interface LineNodeMap {
    [lineNumber: number]: string;
}

export interface SyncState {
    isSyncing: boolean;
    lastSyncTime: number;
    source: 'editor' | 'markmap' | null;
}

export interface EditorNodeInfo {
    line: number;
    ch: number;
    content: string;
    level: number;
}

export interface MarkmapNodeEvent {
    node: IPureNode;
    type: 'click' | 'dblclick' | 'contextmenu' | 'dragstart' | 'dragend' | 'drop';
    originalEvent: Event;
}

export interface DragOperation {
    nodeId: string;
    fromParentId?: string;
    fromIndex: number;
    toParentId?: string;
    toIndex: number;
}
// think of ['# qq','## saa'], line one is '# qq' and ch is 4
export interface MarkdownEdit {
    fromLine: number; // it represents which line it starts
    fromCh?: number;// it represents character size in this start line
    toLine: number;// it represents which line it ends
    toCh?: number;// it represents character size in the end line
    newText: string;
    oldText?: string;
}

export interface ViewState {
    file: string;
    rootNode: IPureNode | null;
    collapsedNodes: Set<string>;
    transform: {
        x: number;
        y: number;
        k: number;
    };
}

export interface MarkmapToolbarState {
    zoomIn: () => void;
    zoomOut: () => void;
    fit: () => void;
    reset: () => void;
    expandAll: () => void;
    collapseAll: () => void;
    expandToLevel: (level: number) => void;
}

export type SyncDirection = 'markdown-to-markmap' | 'markmap-to-markdown';

export interface SyncEvent {
    direction: SyncDirection;
    timestamp: number;
    operations: MarkdownEdit[];
}
