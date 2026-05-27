export const VIEW_TYPE_MARKMAP = 'markmap-sync-view';

export const CSS_CLASSES = {
    markmapContainer: 'markmap-sync-container',
    markmapSvg: 'markmap-sync-svg',
    toolbar: 'markmap-sync-toolbar',
    toolbarButton: 'markmap-sync-toolbar-btn',
    loading: 'markmap-sync-loading',
    error: 'markmap-sync-error',
    highlightedNode: 'markmap-node-highlighted',
    selectedNode: 'markmap-node-selected',
    draggingNode: 'markmap-node-dragging',
    dropTarget: 'markmap-drop-target',
    inlineEditor: 'markmap-inline-editor',
    commentPopup: 'markmap-comment-popup',
    commentPopupLayer: 'markmap-comment-popup-layer',
};

export const EVENTS = {
    EDITOR_CHANGE: 'editor-change',
    CURSOR_ACTIVITY: 'cursor-activity',
    MARKMAP_CLICK: 'markmap-node-click',
    MARKMAP_DBLCLICK: 'markmap-node-dblclick',
    MARKMAP_DRAG: 'markmap-node-drag',
    SYNC_START: 'sync-start',
    SYNC_COMPLETE: 'sync-complete',
    SYNC_ERROR: 'sync-error',
};

export const DEBOUNCE_DEFAULT = 300;
export const MAX_EXPAND_LEVEL = 6;

export const MARKMAP_COLORS = [
    '#E74C3C',
    '#3498DB',
    '#2ECC71',
    '#F39C12',
    '#9B59B6',
    '#1ABC9C',
    '#E91E63',
    '#00BCD4',
];

export const ERROR_MESSAGES = {
    NO_FILE_OPEN: 'No file is currently open',
    NOT_MARKDOWN: 'Current file is not a Markdown file',
    PARSE_ERROR: 'Failed to parse Markdown content',
    SYNC_ERROR: 'Synchronization failed',
    RENDER_ERROR: 'Failed to render mindmap',
    NO_NODES_FOUND: 'No nodes found in the mindmap',
};
