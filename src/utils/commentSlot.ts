import {NodeMappingInfo} from '../types';

export interface CommentSlotInfo {
    nodeId: string;
    fromLine: number;
    toLine: number;
    text: string;
    contentHash: string;
}

export type HasOtherNodeStartInRange = (
    fromLine: number,
    toLine: number,
    excludeNodeId: string
) => boolean;

export function computeCommentSlot(
    mapping: NodeMappingInfo,
    lines: string[],
    hasOtherNodeStartInRange: HasOtherNodeStartInRange
): CommentSlotInfo | null {
    const fromLine = mapping.startLine + 1;
    let toLine = mapping.endLine;

    if (fromLine > toLine) return null;

    for (let line = fromLine; line <= toLine; line++) {
        if (hasOtherNodeStartInRange(line, line, mapping.nodeId)) {
            toLine = line - 1;
            break;
        }
    }

    if (fromLine > toLine) return null;

    const slice = lines.slice(fromLine, toLine + 1);
    const hasContent = slice.some((line) => line.trim() !== '');
    if (!hasContent) return null;

    const text = slice.join('\n');
    const contentHash = `${fromLine}:${toLine}:${text}`;

    return {
        nodeId: mapping.nodeId,
        fromLine,
        toLine,
        text,
        contentHash,
    };
}

/** Whether a comment can be placed after this node's title line (no child/sibling start in the gap). */
export function canAddCommentToNode(
    mapping: NodeMappingInfo,
    hasOtherNodeStartInRange: HasOtherNodeStartInRange
): boolean {
    const fromLine = mapping.startLine + 1;
    let toLine = mapping.endLine;
    for (let line = fromLine; line <= toLine; line++) {
        if (hasOtherNodeStartInRange(line, line, mapping.nodeId)) {
            toLine = line - 1;
            break;
        }
    }
    return fromLine <= toLine || !hasOtherNodeStartInRange(fromLine, fromLine, mapping.nodeId);
}

export function buildCommentIndex(
    mappings: NodeMappingInfo[],
    lines: string[],
    hasOtherNodeStartInRange: HasOtherNodeStartInRange
): Map<string, CommentSlotInfo> {
    const index = new Map<string, CommentSlotInfo>();

    for (const mapping of mappings) {
        const slot = computeCommentSlot(mapping, lines, hasOtherNodeStartInRange);
        if (slot) {
            index.set(mapping.nodeId, slot);
        }
    }

    return index;
}
