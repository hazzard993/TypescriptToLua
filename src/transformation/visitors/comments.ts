import * as ts from "typescript";
import * as lua from "../../LuaAST";
import { TransformationContext } from "../context";

function transformComment(text: string): string {
    const innerText = text
        .replace(/^\/\*\*?\r?\n?/m, "") // remove "/**" line
        .replace(/\r?\n?^ ?\*\/$/m, "") // remove " */" line
        .replace(/\*\/$/, "") // remove " */"
        .replace(/^ ?\*/, "-") // replace first " *" with "-"
        .replace(/^ ?\*/gm, "--"); // replace rest of " *" with "--"

    if (text.includes("*/") && !text.includes("\n")) {
        return `[[${innerText}]]`;
    }

    return innerText.replace(/\/\//, ""); // remove first "//"
}

const extractComment = (context: TransformationContext, pos: number) => (range: ts.TextRange): [string, boolean] => {
    const commentLine = ts.getLineAndCharacterOfPosition(context.sourceFile, range.pos);
    const nodeLine = ts.getLineAndCharacterOfPosition(context.sourceFile, pos);
    const hasTrailingNewLine = commentLine.line < nodeLine.line;
    return [transformComment(context.sourceFile.getFullText().slice(range.pos, range.end)), hasTrailingNewLine];
};

export function addLeadingCommentsToNode(context: TransformationContext, node: lua.Node, original: ts.Node): void {
    if (ts.isSourceFile(original)) {
        return;
    }

    const text = context.sourceFile.getFullText();
    const comments = ts.getLeadingCommentRanges(text, original.getFullStart());
    (comments ?? []).map(extractComment(context, original.getStart())).forEach(([text, newline]) => {
        lua.addSyntheticLeadingComment(node, lua.SyntaxKind.SingleLineCommentTrivia, text, newline);
    });
}

export function addTrailingCommentsToNode(context: TransformationContext, node: lua.Node, original: ts.Node): void {
    if (ts.isSourceFile(original)) {
        return;
    }

    const text = context.sourceFile.getFullText();
    const comments = ts.getTrailingCommentRanges(text, original.getEnd());
    (comments ?? []).map(extractComment(context, original.getStart())).forEach(([text, newline]) => {
        lua.addSyntheticTrailingComment(node, lua.SyntaxKind.SingleLineCommentTrivia, text, newline);
    });
}
