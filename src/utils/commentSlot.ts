import { NodeMappingInfo } from '../types';

export interface CommentSlotInfo {
    nodeId: string;
    fromLine: number;
    toLine: number;
    text: string;
    contentHash: string;
}

export type HasOtherNodeStartInRange = (
    fromLine: number,
    toLine: number
) => boolean;

export function computeCommentSlot(
    mapping: NodeMappingInfo,
    lines: string[],
    findNextNodeLine: (fromLine: number, toLine: number) => number | null
): CommentSlotInfo | null {
    let toLine = mapping.endLine;

    let nextNodeLine = findNextNodeLine(toLine, lines.length - 1);
    if (nextNodeLine == null) nextNodeLine = lines.length;


    const slice = lines.slice(toLine, nextNodeLine);
    const hasContent = slice.some((line) => line.trim() !== '');
    if (!hasContent) return null;

    const text = slice.join('\n');
    const contentHash = `${toLine}:${nextNodeLine}:${text}`;

    return {
        nodeId: mapping.nodeId,
        fromLine: toLine,
        toLine: nextNodeLine,
        text,
        contentHash,
    };
}

/** Whether a comment can be placed after this node's title line (no child/sibling start in the gap). */
/* export function canAddCommentToNode(
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
} */

export function buildCommentIndex(
    mappings: NodeMappingInfo[],
    lines: string[],
    findNextNodeLine: (fromLine: number, toLine: number) => number | null
): Map<string, CommentSlotInfo> {
    const index = new Map<string, CommentSlotInfo>();

    for (const mapping of mappings) {
        const slot = computeCommentSlot(mapping, lines, findNextNodeLine);
        if (slot) {
            index.set(mapping.nodeId, slot);
        }
    }

    return index;
}
