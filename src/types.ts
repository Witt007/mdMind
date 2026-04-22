import {IPureNode} from 'markmap-common';

export interface MarkmapSettings {
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
    syncMode: 'debounce',
    debounceMs: 300,
    autoExpand: true,
    defaultExpandLevel: 2,
    theme: 'auto',
    colorFreezeLevel: 2,
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
    [lineNumber: number]: string[];
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

export interface MarkdownEdit {
    fromLine: number;
    fromCh?: number;
    toLine: number;
    toCh?: number;
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
